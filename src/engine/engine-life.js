// ================================================================
//  engine-life.js
//  Walk system, daily life scheduler, familiarity, outfits,
//  thought bubbles, topic polling, dead air, Twitch chat,
//  API messaging, UI events, render loop.
// ================================================================

import * as THREE from 'three';

import { getVrm, scene, camera, renderer, ambient,
         HOUSE_BOUNDS, AVATAR_RADIUS,
         canvas, monitorGlowLight,
         VRM_PATH, API_URL, PROACTIVE_URL, TOPIC_URL, TTS_URL,
         TWITCH_CHANNEL, USER_ID,
         setTVOn, getVrmDog,
       } from './engine-scene.js';

import { setCamMode, updateCamera, onActivityChanged, setSleepMode } from './engine-camera.js';
import { startMusic, setMusicVolume } from './engine-music.js';
import { handleCookCommand } from './kitchen/kitchen-behaviour.js';
// Memory — thin frontend stubs, real logic stays on backend
const BACKEND = 'https://impactgrid-dijo.onrender.com';
const learnNPCPosition = (who, room, spot) =>
  fetch(`${BACKEND}/memory/record`, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ event:'npc_position', payload:{ who, room, spot } }) }).catch(()=>{});
const learnDoorState = (doorId, state) =>
  fetch(`${BACKEND}/memory/record`, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ event:'door_state', payload:{ doorId, state } }) }).catch(()=>{});
const shouldSkipBackgroundCall = () => false; // token budget managed server-side
import {
  ACTIVITY, activityUpdate, activityPickNext,
  ACTIVITY_MR, activityUpdateMr,
  setExpression, setBS, doBlink,
  runLipSync, stopLipSync, lipSyncActive, _isSpeaking as _isSpeakingBones,
  doGesture, gestureActive, updateGesture,
  hyperUpdate, hyper,
  triggerRaidDance, triggerSubCelebration, triggerResubHype,
  triggerBitsDazzle, triggerGiftPop,
  setLeftFingerRelax, setRightFingerRelax,
  boneHead, boneNeck, boneSpine, boneChest, boneHips,
  boneLUpperLeg, boneRUpperLeg, boneLLowerLeg, boneRLowerLeg,
  boneLFoot, boneRFoot, boneLToes, boneRToes,
  boneLUpperArm, boneRUpperArm, boneLLowerArm, boneRLowerArm,
  boneLHand, boneRHand, boneJaw, teethNode,
  // ── Lora-specific ────────────────────────────────────────────────
  doBlinkMr, setBSMr, teethNodeMr,
  loraWalkUpdate, resetLoraWalkPhase,
} from './engine-bones.js';

// ── Alakurin (dog) — no AI, hand-authored bone animation only ────
import {
  ACTIVITY_DOG, activityUpdateDog, isDogAsleep,
  dogGaitUpdate, resetDogGaitPhase, applyDogHeadLook,
  boneHeadDog,
} from './engine-dog.js';

// ── Dead air ─────────────────────────────────────────────────────
// Fires /chat/proactive after silence. Has a busy-lock so only ONE
// call is ever in-flight, and exponential backoff after failures.

let _deadAirTimer    = null;
let _deadAirBusy     = false;   // true while fetch or speak is running
let _deadAirActive   = false;
let _deadAirBackoff  = 0;       // extra delay added after failures
const DEAD_AIR_MS    = 30_000;  // start checking after 30s
const DEAD_AIR_MIN   = 45_000;  // allow proactive comments every 45s
const DEAD_AIR_MAX   = 90_000;  // force activity after 90s

const deadAir = {
  start() {
    _deadAirActive = true;
    this._arm();
  },
  stop() {
    _deadAirActive = false;
    clearTimeout(_deadAirTimer);
  },
  reset() {
    clearTimeout(_deadAirTimer);
    _deadAirBackoff = 0; // conversation is active — clear backoff
    if (_deadAirActive && !_deadAirBusy) this._arm();
  },
  _arm() {
    clearTimeout(_deadAirTimer);
    const randomDelay = DEAD_AIR_MIN + Math.random() * (DEAD_AIR_MAX - DEAD_AIR_MIN);
    const delay = Math.min(randomDelay + _deadAirBackoff, DEAD_AIR_MAX + _deadAirBackoff);
    _deadAirTimer = setTimeout(() => _triggerProactive(), delay);
  },
};

// ── VRM accessor — getVrm() returns the live ref, never null after load ──
const _vrm = () => getVrm();

// ── UI elements — lazy getters so DOM is guaranteed to exist ─────
// engine-scene.js and engine-life.js are imported inside useEffect
// (after React mounts), but ES modules cache their evaluation result.
// Using getters means the getElementById call happens at first USE,
// not at module parse/evaluation time, safely after the DOM is ready.
export const loader_el  = { get classList() { return document.getElementById('loader')?.classList; } };
const _el = (id) => document.getElementById(id);
let   lastTopicTitle    = null;

export function setStatus(msg, cls = '') {
  const el = _el('status'); if (!el) return;
  el.textContent = msg;
  el.className   = cls;
}
export function setProgress(p) {
  const el = _el('bar-fill'); if (!el) return;
  el.style.width = p + '%';
}

// ── Stage light ──────────────────────────────────────────────────
function setStageLight(mood, durationMs = 4000) {
  const sl = _el('stage-light'); if (!sl) return;
  sl.className = mood;
  if (mood !== '') setTimeout(() => { sl.className = ''; }, durationMs);
}

// ── Chat bubble ──────────────────────────────────────────────────
let bubbleTimeout = null;
export function showBubble(text, speaker = 'Miss OG Tinz') {
  const bubbleTxt = _el('bubble-text');
  const bubble    = _el('chat-bubble');
  if (!bubbleTxt || !bubble) return;
  bubbleTxt.textContent = text;
  bubble.querySelector('.speaker').textContent = speaker;
  bubble.classList.add('visible');
  clearTimeout(bubbleTimeout);
  const displayTime = Math.max(4000, text.length * 60);
  bubbleTimeout = setTimeout(() => bubble.classList.remove('visible'), displayTime);
}

// ── Vision system ────────────────────────────────────────────────
const VISION = {
  COOLDOWN_MS: 12000,
  TRIGGERS: ['look','see','around','room','doing','house',
             'standing','wearing','outfit','where','what are you',
             'show me','describe','background','behind','floor',
             'sitting','dancing','moving'],
  _lastSentAt:   0,
  _lastRoomSent: null,

  shouldCapture(message, roomChanged) {
    const now = Date.now();
    if (now - this._lastSentAt < this.COOLDOWN_MS) return false;
    if (roomChanged) return true;
    const lower = (message || '').toLowerCase();
    return this.TRIGGERS.some(t => lower.includes(t));
  },

  capture() {
    try {
      renderer.render(scene, camera);
      const src   = canvas;
      const scale = Math.min(1, 512 / src.width);
      const w     = Math.round(src.width  * scale);
      const h     = Math.round(src.height * scale);
      const off   = document.createElement('canvas');
      off.width   = w; off.height = h;
      off.getContext('2d').drawImage(src, 0, 0, w, h);
      return off.toDataURL('image/jpeg', 0.72).split(',')[1];
    } catch (e) {
      console.warn('[Vision] Capture failed:', e.message);
      return null;
    }
  },

  markSent(room) {
    this._lastSentAt   = Date.now();
    this._lastRoomSent = room;
  }
};

// ================================================================
//  HOUSE ROOM DEFINITIONS
// ================================================================
export const HOUSE = {

  'living-room': {
    origin: { x: -3.0, z: -3.5 }, size: { w: 5.5, d: 5.5 },
    ambientColor: 0x0d0a05,
    spots: [
      // GLB sedacka seat surface is at y=0.430. VRM restPosY≈0.82. yOffset = 0.430 - 0.82 = -0.39
      // interactionPoint keeps her body clear of the armrest before snapping into seat
      { label: 'Sofa',         x: -4.159, z: -4.424, interactionPoint: { x: -3.95, z: -4.15 }, lookPoint: { x: -2.500, z: -5.000 }, facingY: 0, yOffset: -0.39, activities: ['sofaSit','sofaSit','phoneScroll','tvReact','readBook'], prop: 'sedacka' },
      { label: 'Sofa Side',    x: -3.200, z: -4.200, facingY: Math.PI * 0.15, yOffset: -0.39, activities: ['sofaSit','sofaSit','phoneScroll','readBook'], prop: 'sedacka' },
      { label: 'TV Wall',      x: -2.500, z: -5.000, lookPoint: { x: -2.500, z: -5.000 }, facingY: 0,              activities: ['tvReact','idle','dance','hiponhip'], prop: 'tv' },
      { label: 'Coffee Table', x: -3.040, z: -3.300, facingY: Math.PI,        activities: ['idle','phoneScroll','tasting','readBook'], prop: 'stolek konf' },
      { label: 'Fireplace',    x: -1.800, z: -1.700, facingY: Math.PI * 0.5,  activities: ['fireGaze','idle','stretch'], prop: 'krb' },
      { label: 'Centre',       x: -3.200, z: -2.800, facingY: Math.PI,        activities: ['dance','stretch','hairflick','hiponhip','idle'] },
      { label: 'Front Window', x: -3.800, z: -5.200, facingY: 0,              activities: ['windowLook','idle','hairflick','stretch'], prop: 'parapet.005' },
    ]
  },

  kitchen: {
    origin: { x: -3.8, z: 1.0 }, size: { w: 4.5, d: 4.5 },
    ambientColor: 0x0a1005,
    spots: [
      // GLB sporak (stove) is at (-4.180, 1.430, -0.031). Stand 0.43m to the right (+x), face the counter wall.
      { label: 'Hob',            x: -4.180, z: -0.031, interactionPoint: { x: -3.600, z: -0.031 }, lookPoint: { x: -4.180, z: -0.031 }, facingY: Math.PI * 0.5, activities: ['stirring','chopping','tasting','idle','noseCover'], prop: 'sporak' },
      { label: 'Second Hob',     x: -4.185, z: -0.031, interactionPoint: { x: -3.600, z: -0.031 }, facingY: Math.PI * 0.5, activities: ['stirring','idle','tasting'], prop: 'varna deska' },
      // GLB drez (sink) is at (-4.849, 1.257, -0.933). Stand to the right of it.
      { label: 'Sink',           x: -4.849, z: -0.933, interactionPoint: { x: -4.100, z: -0.933 }, lookPoint: { x: -4.849, z: -0.933 }, facingY: Math.PI * 0.5, activities: ['washingUp','idle','stretch'], prop: 'drez' },
      { label: 'Cabinets',       x: -4.000, z:  1.000, facingY: Math.PI * 0.5, activities: ['cabinetOpen','idle','noseCover','hairflick'], prop: 'linka' },
      { label: 'Island',         x: -1.004, z:  2.185, facingY: Math.PI,       activities: ['chopping','tasting','phoneScroll','idle','hiponhip','readBook'], prop: 'linka.001' },
      { label: 'Kitchen Centre', x: -2.800, z:  1.200, facingY: Math.PI,       activities: ['dance','stretch','idle','hairflick'] },
      { label: 'Kitchen Window', x: -5.000, z: -2.800, facingY: Math.PI * 0.5, activities: ['windowLook','idle','stretch'], prop: 'parapet.004' },
    ]
  },

  dining: {
    origin: { x: -2.0, z: 2.5 }, size: { w: 3.5, d: 4.0 },
    ambientColor: 0x0a0a05,
    spots: [
      // GLB zidle chairs: y=0.894 (seat top incl. chair frame). VRM restPosY≈0.82. yOffset = 0.894-0.82 = +0.07
      // 'Table Head' was wrongly pointing at the TABLE (jidelni stul z=1.579). Use chair zidle.002 instead.
      { label: 'Table Head',   x: -2.017, z:  1.026, facingY: 0,                yOffset:  0.07, activities: ['sofaSit','sofaSit','tasting','phoneScroll','readBook'], prop: 'zidle.002' },
      { label: 'Table Side',   x: -2.477, z:  2.369, facingY: -Math.PI * 0.5,   yOffset:  0.07, activities: ['sofaSit','sofaSit','readBook','phoneScroll','tasting'], prop: 'zidle' },
      { label: 'Table Side 2', x: -2.935, z:  1.943, facingY: Math.PI * 0.5,    yOffset:  0.07, activities: ['sofaSit','sofaSit','readBook','phoneScroll','tasting'], prop: 'zidle.001' },
      { label: 'Table End',    x: -1.608, z:  1.499, facingY: -Math.PI * 0.5,   yOffset:  0.07, activities: ['sofaSit','tasting','readBook','phoneScroll'],           prop: 'zidle.003' },
      { label: 'Table End',    x: -1.877, z:  3.636, facingY: Math.PI,           yOffset:  0.07, activities: ['sofaSit','tasting','phoneScroll'],                   prop: 'zidle.004' },
      { label: 'Dining Window',x: -1.200, z:  3.800, facingY: 0,                activities: ['windowLook','idle','hairflick','stretch'], prop: 'parapet' },
      { label: 'Dining Centre',x: -1.800, z:  2.200, facingY: Math.PI,           activities: ['dance','stretch','idle','hiponhip'] },
    ]
  },

  hallway: {
    origin: { x: 0.6, z: -2.5 }, size: { w: 2.2, d: 6.5 },
    ambientColor: 0x06060a,
    spots: [
      { label: 'Front Door',      x:  1.590, z: -5.300, facingY: Math.PI,          activities: ['idle','stretch','hiponhip'], prop: 'dvere' },
      { label: 'Corridor',        x:  0.600, z: -3.000, facingY: Math.PI,           activities: ['idle','hairflick','hiponhip','stretch'] },
      { label: 'Living Room Door',x:  0.200, z: -0.400, facingY: Math.PI,           activities: ['idle','stretch','noseCover'], prop: 'dvere.001' },
      { label: 'Kitchen Door',    x:  0.200, z:  0.900, facingY: Math.PI,           activities: ['idle','hairflick'], prop: 'dvere.002' },
      { label: 'Hallway Window',  x:  1.600, z: -2.200, facingY: -Math.PI * 0.5,   activities: ['windowLook','idle','stretch'], prop: 'parapet.002' },
    ]
  },

  bedroom: {
    origin: { x: 3.8, z: -2.0 }, size: { w: 4.5, d: 6.0 },
    ambientColor: 0x05050d,
    spots: [
      { label: 'Wardrobe Mirror', x:  2.755, z: -0.845, lookPoint: { x:  2.755, z: -0.845 }, facingY: -Math.PI * 0.5,  activities: ['mirrorPose','hairflick','idle','noseCover'], prop: 'closet.003' },
      { label: 'Wardrobe',        x:  4.356, z:  2.100, facingY: Math.PI,          activities: ['cabinetOpen','mirrorPose','idle','hairflick'], prop: 'closet.006' },
      // GLB Plane.054 is a floor rug at y=0.953 (used as bedroom chair/cushion spot)
      // yOffset = 0.953 - 0.82 = +0.133 so she sits ON the rug surface not through it
      { label: 'Bedroom Chair',   x:  3.214, z:  0.863, facingY: -Math.PI * 0.5,  yOffset:  0.13, activities: ['sofaSit','sofaSit','phoneScroll','readBook'], prop: 'Plane.054' },
      // GLB has no dedicated bed node — position estimated at right bedroom wall.
      // Mattress surface ≈ y=0.55. VRM restPosY≈0.82. yOffset = 0.55-0.82 = -0.27 (not -0.85 which went below floor)
      // facingY: Math.PI*0.5 = lies along bed length (not perpendicular to wall which made her face the door)
      { label: 'Bed',             x:  5.200, z: -4.200, facingY: Math.PI * 0.5,   yOffset: -0.27, activities: ['bedLie','bedLie','bedLiePhone','readBook'] },
      { label: 'Bedside',         x:  4.313, z: -1.125, facingY: Math.PI * 0.5,   activities: ['idle','phoneScroll','stretch'], prop: 'jidelni stul.003' },
      { label: 'Window 1',        x:  5.000, z: -2.091, facingY: -Math.PI * 0.5,  activities: ['windowLook','idle','hairflick','stretch'], prop: 'window.008' },
      { label: 'Window 2',        x:  5.000, z: -4.241, facingY: -Math.PI * 0.5,  activities: ['windowLook','idle','hairflick'], prop: 'window.010' },
      { label: 'Centre',          x:  3.800, z: -2.500, facingY: Math.PI,          activities: ['dance','stretch','idle','hiponhip','hairflick'] },
    ]
  },

  bathroom: {
    origin: { x: 3.8, z: 1.5 }, size: { w: 3.0, d: 3.0 },
    ambientColor: 0x050a0d,
    spots: [
      { label: 'Mirror',  x:  3.200, z:  1.200, facingY: -Math.PI * 0.5, activities: ['mirrorPose','hairflick','noseCover','idle'] },
      { label: 'Shower',  x:  4.500, z:  2.200, facingY: Math.PI,        activities: ['idle','stretch','hairflick'] },
      { label: 'Window',  x:  5.000, z:  0.600, facingY: -Math.PI * 0.5, activities: ['windowLook','idle','stretch'], prop: 'window.002' },
      { label: 'Centre',  x:  3.800, z:  1.800, facingY: Math.PI,        activities: ['idle','stretch','hairflick','dance'] },
    ]
  },

  studio: {
    origin: { x: -2.70, z: -4.00 }, size: { w: 2.5, d: 2.5 },
    ambientColor: 0x1a0a2e,
    spots: [
      { label: 'Desk', x: -2.700, z: -3.500, facingY: Math.PI,
        activities: ['typing','monitor','idle','dance','stretch','hairflick','hiponhip','phoneScroll'] },
    ]
  },
};

// ── Room waypoints ───────────────────────────────────────────────
const ACTIVITY_RULES = {
  sofaSit: ['Sofa', 'Sofa Side', 'Bedroom Chair', 'Table Head', 'Table Side'],
  tvReact: ['Sofa', 'Sofa Side', 'TV Wall'],
  phoneScroll: ['Sofa', 'Sofa Side', 'Coffee Table', 'Island', 'Bedroom Chair', 'Bedside'],
  readBook: ['Sofa', 'Sofa Side', 'Bedroom Chair', 'Bed', 'Table Side'],
  dance: ['Centre', 'Kitchen Centre', 'Dining Centre'],
};

const SOCIAL_DISTANCE = 2.5;

const SHARED_ACTIVITIES = {
  watchTV: ['tvReact', 'sofaSit'],
  tvReact: ['tvReact', 'sofaSit'],
  dance: ['dance'],
  stirring: ['chopping', 'tasting'],
  readBook: ['sofaSit']
};

const LOOK_TARGETS = {
  tvReact: 'tv',
  phoneScroll: 'phone',
  readBook: 'lap',
  stirring: 'counter',
  windowLook: 'window',
  mirrorPose: 'mirror',
};

let _lookTarget = null;
let _lastLookActivity = null;
let _lookYaw = 0;
let _lookNeckYaw = 0;
let _lookPitch = 0;
let _lookClampWarned = false;
let _lookBodyAssistActive = false;
let _lookBodyAssistLogged = false;
const SOCIAL_BLOCKED_ACTIVITIES = new Set(['bedLie', 'bedLiePhone', 'mirrorPose']);
let _socialCheckTimer = 5 + Math.random() * 5;
let _socialMissLookTimer = 0;
let _socialLoraLookTimer = 0;
let _socialMissLogged = false;
let _socialLoraLogged = false;
let _loraSocialHeadYaw = 0;
let _loraSocialNeckYaw = 0;

function _lookTargetsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  return a.kind === b.kind && a.x === b.x && a.z === b.z && a.label === b.label;
}

function _describeLookTarget(target) {
  return typeof target === 'object'
    ? `${target.label || 'point'} (${target.x.toFixed(3)}, ${target.z.toFixed(3)})`
    : target;
}

function _pointLookTargetForSpot(spot) {
  if (!spot?.lookPoint) return null;
  return {
    kind: 'point',
    label: spot.label,
    x: spot.lookPoint.x,
    z: spot.lookPoint.z,
  };
}

function _applySpotLookTarget(spot) {
  const target = _pointLookTargetForSpot(spot);
  if (!target) return false;
  setLookTarget(target);
  _lastLookActivity = ACTIVITY.current;
  console.log(`[Interaction] Looking at ${spot.label} look point`);
  return true;
}

function _normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function _isMissSocialBlocked() {
  return walk.active || SOCIAL_BLOCKED_ACTIVITIES.has(ACTIVITY.current);
}

function _isLoraSocialBlocked() {
  return window._loraWalking || _loraWalkingToSpot || SOCIAL_BLOCKED_ACTIVITIES.has(ACTIVITY_MR.current);
}

function _startMissSocialLook(duration = 1 + Math.random() * 2) {
  if (_isMissSocialBlocked()) return;
  _socialMissLookTimer = Math.max(_socialMissLookTimer, duration);
  if (!_socialMissLogged) {
    console.log('[Social] Miss looking at Lora');
    _socialMissLogged = true;
  }
}

function _startLoraSocialLook(duration = 1 + Math.random() * 2) {
  if (_isLoraSocialBlocked()) return;
  _socialLoraLookTimer = Math.max(_socialLoraLookTimer, duration);
  if (!_socialLoraLogged) {
    console.log('[Social] Lora looking at Miss');
    _socialLoraLogged = true;
  }
}

function _clearSocialLookState() {
  _socialMissLookTimer = 0;
  _socialLoraLookTimer = 0;
  _socialMissLogged = false;
  _socialLoraLogged = false;
}

function _updateSocialAttention(delta) {
  const loraPos = _getLoraPosition();
  if (!loraPos) {
    _clearSocialLookState();
    return;
  }

  const distance = Math.hypot(vrmPos.x - loraPos.x, vrmPos.z - loraPos.z);
  if (distance > SOCIAL_DISTANCE) {
    _clearSocialLookState();
    return;
  }

  if (_socialMissLookTimer > 0) _socialMissLookTimer = Math.max(0, _socialMissLookTimer - delta);
  if (_socialLoraLookTimer > 0) _socialLoraLookTimer = Math.max(0, _socialLoraLookTimer - delta);
  if (_socialMissLookTimer === 0) _socialMissLogged = false;
  if (_socialLoraLookTimer === 0) _socialLoraLogged = false;

  if (window._loraIsSpeaking || _isSpeaking) {
    if (window._loraIsSpeaking) _startMissSocialLook(delta + 0.15);
    if (_isSpeaking) _startLoraSocialLook(delta + 0.15);
    return;
  }

  _socialCheckTimer -= delta;
  if (_socialCheckTimer > 0) return;
  _socialCheckTimer = 5 + Math.random() * 5;
  if (Math.random() >= 0.25) return;

  if (!_isMissSocialBlocked() && !_isLoraSocialBlocked()) {
    if (Math.random() < 0.5) _startMissSocialLook();
    else _startLoraSocialLook();
  } else if (!_isMissSocialBlocked()) {
    _startMissSocialLook();
  } else if (!_isLoraSocialBlocked()) {
    _startLoraSocialLook();
  }
}

function _getActiveMissLookTarget() {
  if (_socialMissLookTimer > 0 && !_isMissSocialBlocked()) {
    return { kind: 'avatar', label: 'Lora', getPosition: _getLoraPosition };
  }
  return _lookTarget;
}

export function setLookTarget(target) {
  if (!target) return clearLookTarget();
  if (_lookTargetsEqual(_lookTarget, target)) return;
  _lookTarget = target;
  console.log(`[Look] Miss -> ${_describeLookTarget(target)}`);
}

export function clearLookTarget() {
  if (_lookTarget) console.log('[Look] Cleared');
  _lookTarget = null;
  _lookYaw = 0;
  _lookNeckYaw = 0;
  _lookPitch = 0;
  _lookClampWarned = false;
  _lookBodyAssistActive = false;
  _lookBodyAssistLogged = false;
}

function _syncLookTarget() {
  if (walk.active) return;
  const spotTarget = _pointLookTargetForSpot(_currentSpot);
  if (spotTarget) {
    setLookTarget(spotTarget);
    _lastLookActivity = ACTIVITY.current;
    return;
  }
  if (ACTIVITY.current === _lastLookActivity) return;
  _lastLookActivity = ACTIVITY.current;
  const target = LOOK_TARGETS[ACTIVITY.current];
  if (target) setLookTarget(target);
  else clearLookTarget();
}

function _updateLookTarget(delta) {
  const activeLookTarget = _getActiveMissLookTarget();
  if (!activeLookTarget || walk.active || !boneHead || !boneNeck) return;
  const vrm = _vrm();
  if (!vrm) return;

  const facingX = -Math.sin(vrm.scene.rotation.y);
  const facingZ = -Math.cos(vrm.scene.rotation.y);
  let targetX = vrmPos.x + facingX;
  let targetZ = vrmPos.z + facingZ;
  let targetPitch = 0;

  if (typeof activeLookTarget === 'object' && activeLookTarget.kind === 'avatar') {
    const avatarPos = activeLookTarget.getPosition();
    if (!avatarPos) return;
    targetX = avatarPos.x;
    targetZ = avatarPos.z;
  } else if (typeof activeLookTarget === 'object' && activeLookTarget.kind === 'point') {
    targetX = activeLookTarget.x;
    targetZ = activeLookTarget.z;
  } else if (activeLookTarget === 'tv') {
    // GLB 'tv' node is at (-1.930, 1.933, -4.460) — use actual position not old hardcoded guess
    targetX = -1.930;
    targetZ = -4.460;
  } else if (activeLookTarget === 'window' || activeLookTarget === 'mirror') {
    targetX = _currentSpot?.x ?? targetX;
    targetZ = _currentSpot?.z ?? targetZ;
  } else if (activeLookTarget === 'phone') {
    targetX = vrmPos.x + facingX * 0.35;
    targetZ = vrmPos.z + facingZ * 0.35;
    targetPitch = 0.32;
  } else if (activeLookTarget === 'lap') {
    targetX = vrmPos.x + facingX * 0.45;
    targetZ = vrmPos.z + facingZ * 0.45;
    targetPitch = 0.42;
  } else if (activeLookTarget === 'counter') {
    targetX = vrmPos.x + facingX * 0.7;
    targetZ = vrmPos.z + facingZ * 0.7;
    targetPitch = 0.18;
  }

  const dx = targetX - vrmPos.x;
  const dz = targetZ - vrmPos.z;
  const targetAngle = Math.hypot(dx, dz) < 0.01
    ? vrm.scene.rotation.y
    : Math.atan2(targetX - vrmPos.x, targetZ - vrmPos.z);
  let relativeAngle = targetAngle - vrm.scene.rotation.y;

  relativeAngle = _normalizeAngle(relativeAngle);

  if (Math.abs(relativeAngle) > 0.8) {
    _targetFacing = targetAngle;
    _lookBodyAssistActive = true;
    if (!_lookBodyAssistLogged) {
      console.log('[Look] Body assist active');
      _lookBodyAssistLogged = true;
    }
  } else {
    _lookBodyAssistActive = false;
    _lookBodyAssistLogged = false;
  }

  const unclampedHeadYaw = relativeAngle * 0.6;
  const unclampedNeckYaw = relativeAngle * 0.4;
  const headYaw = Math.max(-0.7, Math.min(0.7, unclampedHeadYaw));
  const neckYaw = Math.max(-0.5, Math.min(0.5, unclampedNeckYaw));
  const blend = Math.min(1, delta * 4.5);
  _lookYaw += (headYaw - _lookYaw) * blend;
  _lookNeckYaw += (neckYaw - _lookNeckYaw) * blend;
  _lookPitch += (targetPitch - _lookPitch) * blend;
  const nextHeadYaw = boneHead.rotation.y + _lookYaw;
  const nextNeckYaw = boneNeck.rotation.y + _lookNeckYaw;
  const clampedHeadYaw = Math.max(-0.7, Math.min(0.7, nextHeadYaw));
  const clampedNeckYaw = Math.max(-0.5, Math.min(0.5, nextNeckYaw));
  const clamped = headYaw !== unclampedHeadYaw ||
    neckYaw !== unclampedNeckYaw ||
    clampedHeadYaw !== nextHeadYaw ||
    clampedNeckYaw !== nextNeckYaw;

  if (clamped && !_lookClampWarned) {
    console.warn('[Look] Head angle clamped');
  }
  _lookClampWarned = clamped;

  boneHead.rotation.y = clampedHeadYaw;
  boneHead.rotation.x += _lookPitch * 0.65;
  boneNeck.rotation.y = clampedNeckYaw;
  boneNeck.rotation.x += _lookPitch * 0.35;
}

function _updateLoraSocialLook(delta, lora) {
  const loraHead = window._loraHead;
  const loraNeck = window._loraNeck;
  if (!lora || !loraHead || !loraNeck) return;

  const active = _socialLoraLookTimer > 0 && !_isLoraSocialBlocked();
  const blend = Math.min(1, delta * 4.5);

  if (!active) {
    _loraSocialHeadYaw += (0 - _loraSocialHeadYaw) * blend;
    _loraSocialNeckYaw += (0 - _loraSocialNeckYaw) * blend;
    if (Math.abs(_loraSocialHeadYaw) < 0.001 && Math.abs(_loraSocialNeckYaw) < 0.001) return;
  } else {
    const dx = vrmPos.x - lora.scene.position.x;
    const dz = vrmPos.z - lora.scene.position.z;
    if (Math.hypot(dx, dz) < 0.01) return;

    const targetAngle = Math.atan2(dx, dz);
    let relativeAngle = _normalizeAngle(targetAngle - lora.scene.rotation.y);

    if (Math.abs(relativeAngle) > 0.8) {
      const maxTurn = 1.2 * delta;
      lora.scene.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, relativeAngle));
      relativeAngle = _normalizeAngle(targetAngle - lora.scene.rotation.y);
    }

    const headYaw = Math.max(-0.7, Math.min(0.7, relativeAngle * 0.6));
    const neckYaw = Math.max(-0.5, Math.min(0.5, relativeAngle * 0.4));
    _loraSocialHeadYaw += (headYaw - _loraSocialHeadYaw) * blend;
    _loraSocialNeckYaw += (neckYaw - _loraSocialNeckYaw) * blend;
  }

  loraHead.rotation.y = Math.max(-0.7, Math.min(0.7, loraHead.rotation.y + _loraSocialHeadYaw));
  loraNeck.rotation.y = Math.max(-0.5, Math.min(0.5, loraNeck.rotation.y + _loraSocialNeckYaw));
}

function _getValidActivities(spot, fallbackActivities) {
  const activities = spot.activities?.length ? spot.activities : fallbackActivities;
  const valid = activities.filter(activity =>
    !ACTIVITY_RULES[activity] || ACTIVITY_RULES[activity].includes(spot.label)
  );
  const result = valid.length ? valid : ['idle'];

  if (import.meta.env?.DEV) {
    console.log(`[Activity Filter] ${spot.label} → ${[...new Set(result)].join(', ')}`);
  }

  return result;
}

export const ROOM_WAYPOINT_DEFS = {
  studio:        { x:  0.6, z: -1.2, facingY: Math.PI    },
  'living-room': { x:  2.0, z: -3.5, facingY: 0.3        },
  kitchen:       { x: -3.0, z: -3.5, facingY: 0          },
  bedroom:       { x:  4.5, z:  3.5, facingY: Math.PI/4  },
  bathroom:      { x: -3.5, z:  4.5, facingY: 0          },
};

// ── Walk state ───────────────────────────────────────────────────
export const walk = {
  active: false,
  fromX: 0, fromZ: 0,
  toX:   0, toZ:   0,
  progress: 0, duration: 2.0,
  targetFacing: 0, onArrive: null,
};

export const vrmPos = { x: 0, z: 0 };
const AVATAR_SEPARATION = 0.9;
let _avoidancePausedAvatar = null;
let _loraPausedForAvoidance = false;

function _getLoraPosition() {
  const lora = window.getVrmLora ? window.getVrmLora() : null;
  return lora?.scene?.position || null;
}

function _getLoraWalkTarget() {
  const target = window._loraTarget;
  if (!target) return null;
  const x = target.x ?? target.toX ?? target[0];
  const z = target.z ?? target.toZ ?? target[1];
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function _getMissRemainingWalkDistance() {
  if (!walk.active) return 0;
  return Math.hypot(walk.toX - vrmPos.x, walk.toZ - vrmPos.z);
}

function _getLoraRemainingWalkDistance(loraPos = _getLoraPosition()) {
  if (!loraPos || !(window._loraWalking || _loraWalkingToSpot)) return 0;
  const target = _getLoraWalkTarget();
  if (!target) return 0;
  return Math.hypot(target.x - loraPos.x, target.z - loraPos.z);
}

function _setAvoidancePausedAvatar(next) {
  if (_avoidancePausedAvatar === next) return;
  if (_avoidancePausedAvatar === 'miss' && next !== 'miss') {
    console.log('[Avoidance] Miss resumed');
  }
  _avoidancePausedAvatar = next;
  if (next === 'miss') {
    console.log('[Avoidance] Miss waiting for Lora');
  }
}

function _updateAvatarAvoidance() {
  const loraPos = _getLoraPosition();
  if (!loraPos) {
    _setAvoidancePausedAvatar(null);
    return;
  }

  const missWalking = walk.active;
  const loraWalking = window._loraWalking || _loraWalkingToSpot;
  if (!missWalking && !loraWalking) {
    _setAvoidancePausedAvatar(null);
    return;
  }

  const distance = Math.hypot(vrmPos.x - loraPos.x, vrmPos.z - loraPos.z);
  if (distance >= AVATAR_SEPARATION) {
    _setAvoidancePausedAvatar(null);
    return;
  }

  if (_avoidancePausedAvatar) return;

  const missRemaining = _getMissRemainingWalkDistance();
  const loraRemaining = _getLoraRemainingWalkDistance(loraPos);
  _setAvoidancePausedAvatar(missRemaining >= loraRemaining ? 'miss' : 'lora');
}

function _applyLoraAvoidancePause() {
  if (_avoidancePausedAvatar === 'lora') {
    _loraPausedForAvoidance = true;
    window._loraWalking = false;
  } else if (_loraPausedForAvoidance) {
    _loraPausedForAvoidance = false;
    if (_loraWalkingToSpot) window._loraWalking = true;
  }
}

// _targetFacing — render loop smoothly rotates VRM toward this each frame
export let _targetFacing = Math.PI;
export function setTargetFacing(angle) { _targetFacing = angle; }

// ── Walk waypoints (legacy + life-dest slot) ─────────────────────
const WAYPOINTS = {
  centre:     { x:  0.0, z:  0.0 },
  desk:       { x:  0.6, z: -1.2 },
  dartboard:  { x: -4.5, z: -1.0 },
  basketball: { x:  4.0, z: -0.8 },
};

export function walkTo(waypointName, onArrive = null) {
  const wp  = WAYPOINTS[waypointName];
  const vrm = _vrm();
  if (!wp || !vrm) return;
  clearLookTarget();
  _lastLookActivity = null;
  walk.fromX    = vrmPos.x;
  walk.fromZ    = vrmPos.z;
  walk.toX      = wp.x;
  walk.toZ      = wp.z;
  walk.progress = 0;
  walk.active   = true;
  walk.onArrive = onArrive;
  const dx = wp.x - vrmPos.x;
  const dz = wp.z - vrmPos.z;
  const dist = Math.sqrt(dx*dx + dz*dz);
  walk.duration     = Math.max(0.8, dist / 1.5);
  walk.targetFacing = Math.atan2(dx, dz) + Math.PI; // +PI: VRM forward is +Z after rotateVRM0
  _targetFacing     = walk.targetFacing;
}

let _walkPhase = 0;

export function updateWalk(delta) {
  const vrm = _vrm();
  if (!walk.active || !vrm) return;
  if (_avoidancePausedAvatar === 'miss') return;

  // Restore standing height at the very first frame of each walk
  // so she stands up from seated/lying position before moving.
  if (walk.progress === 0) {
    vrm.scene.position.y = vrm._restPosY || 0;
  }

  walk.progress += delta / walk.duration;
  if (walk.progress >= 1) {
    walk.progress = 1;
    walk.active   = false;
    vrmPos.x = walk.toX;
    vrmPos.z = walk.toZ;
    _walkPhase = 0;
    if (boneHips)      boneHips.rotation.set(0,0,0);
    if (boneSpine)     boneSpine.rotation.set(0,0,0);
    if (boneLUpperLeg) boneLUpperLeg.rotation.set(0,0,-0.04);
    if (boneRUpperLeg) boneRUpperLeg.rotation.set(0,0, 0.06);
    if (boneLLowerLeg) boneLLowerLeg.rotation.set(0.04,0,0);
    if (boneRLowerLeg) boneRLowerLeg.rotation.set(0.04,0,0);
    if (boneLFoot)     boneLFoot.rotation.set(-0.05,0,-0.03);
    if (boneRFoot)     boneRFoot.rotation.set(-0.05,0, 0.04);
    if (boneLUpperArm) boneLUpperArm.rotation.set(0.07,0.04, 0.9);
    if (boneRUpperArm) boneRUpperArm.rotation.set(0.07,-0.04,-0.9);
    if (boneLLowerArm) boneLLowerArm.rotation.set(-0.04,0, 0.52);
    if (boneRLowerArm) boneRLowerArm.rotation.set(-0.04,0,-0.52);
    if (walk.onArrive) walk.onArrive();
    return;
  }

  const t    = walk.progress;
  const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
  vrmPos.x = walk.fromX + (walk.toX - walk.fromX) * ease;
  vrmPos.z = walk.fromZ + (walk.toZ - walk.fromZ) * ease;

  // Tighter clamp during walk — extra margin prevents camera clipping walls
  const walkMargin = AVATAR_RADIUS + 0.4;
  vrmPos.x = Math.max(HOUSE_BOUNDS.minX + walkMargin, Math.min(HOUSE_BOUNDS.maxX - walkMargin, vrmPos.x));
  vrmPos.z = Math.max(HOUSE_BOUNDS.minZ + walkMargin, Math.min(HOUSE_BOUNDS.maxZ - walkMargin, vrmPos.z));

  vrm.scene.position.x = vrmPos.x;
  vrm.scene.position.z = vrmPos.z;

  // ── Walk animation — 8-phase cycle per guide ────────────────
  // Phase: heel strike → weight acceptance → midstance → terminal stance → push off → repeat
  const STEP_FREQ = 2.2;  // slightly slower = more natural human gait
  _walkPhase += delta * STEP_FREQ * Math.PI * 2;
  const p = _walkPhase;

  // ── Legs — full gait cycle ───────────────────────────────────
  // Left and right legs are 180° out of phase
  const leftLegFwd  =  Math.sin(p);          // positive = leg forward (heel strike)
  const rightLegFwd = -Math.sin(p);          // opposite phase

  // Knee bend: peaks during swing phase (foot off ground)
  // Guide: knee bends 0–150° — use ~0.55 rad (31°) for natural walk
  const leftKnee  = Math.max(0, -Math.sin(p + 0.4)) * 0.58;   // bend during swing
  const rightKnee = Math.max(0,  Math.sin(p + 0.4)) * 0.58;

  // Foot: heel strike at front, toe-off at back
  const leftFootAngle  =  Math.sin(p) * 0.22;    // heel strikes: foot angled down
  const rightFootAngle = -Math.sin(p) * 0.22;

  // Ankle dorsiflexion on heel strike — toe pulls up
  const leftHeelStrike  = Math.max(0,  Math.sin(p)) * 0.18;
  const rightHeelStrike = Math.max(0, -Math.sin(p)) * 0.18;

  if (boneLUpperLeg) { boneLUpperLeg.rotation.x =  leftLegFwd * 0.44; boneLUpperLeg.rotation.z = -0.04; }
  if (boneRUpperLeg) { boneRUpperLeg.rotation.x =  rightLegFwd * 0.44; boneRUpperLeg.rotation.z =  0.04; }
  if (boneLLowerLeg) boneLLowerLeg.rotation.x =  leftKnee + 0.03;
  if (boneRLowerLeg) boneRLowerLeg.rotation.x =  rightKnee + 0.03;
  if (boneLFoot)     { boneLFoot.rotation.x = -0.04 + leftFootAngle + leftHeelStrike * 0.4; boneLFoot.rotation.z = -0.03; }
  if (boneRFoot)     { boneRFoot.rotation.x = -0.04 + rightFootAngle + rightHeelStrike * 0.4; boneRFoot.rotation.z =  0.04; }
  if (boneLToes)     boneLToes.rotation.x =  0.07 + leftHeelStrike * 0.25;
  if (boneRToes)     boneRToes.rotation.x =  0.07 + rightHeelStrike * 0.25;

  // ── Hips — guide: sway left/right, slight tilt, minimal twist ─
  // Hip sway: shifts laterally with weight transfer
  const hipSway  = Math.sin(p) * 0.12;        // lateral sway
  const hipTilt  = Math.cos(p) * 0.055;       // tilt toward stance leg
  const hipTwist = Math.sin(p) * 0.06;        // forward rotation of stance hip

  if (boneHips) {
    boneHips.rotation.z = hipSway;
    boneHips.rotation.x = hipTilt;
    boneHips.rotation.y = hipTwist;
  }

  // ── Spine + chest — counter-rotate to hips for balance ────────
  // Guide: shoulders relaxed, back straight during walk
  if (boneSpine) {
    boneSpine.rotation.z = -hipSway * 0.55;
    boneSpine.rotation.x =  0.02 + Math.abs(Math.cos(p)) * 0.012;
    boneSpine.rotation.y = -hipTwist * 0.6;
  }
  if (boneChest) {
    boneChest.rotation.z = -hipSway * 0.28;
    boneChest.rotation.y = -hipTwist * 0.8;  // shoulders swing opposite to hips
  }

  // ── Head — slight bob, looks forward, relaxed ─────────────────
  // Guide: head straight, eyes level, slight natural movement
  if (boneHead) {
    boneHead.rotation.x =  0.03 + Math.abs(Math.sin(p)) * 0.015;
    boneHead.rotation.z =  Math.sin(p) * 0.015;
    boneHead.rotation.y =  Math.sin(p) * 0.03;
  }

  // ── Arms — oppose legs, elbows bent naturally ──────────────────
  // Guide: arms swing forward/back opposing leg, elbows 90–150° flex
  // Left arm swings forward when right leg swings forward (and vice versa)
  const armSwing = 0.30;
  const elbowFlex = 0.38 + Math.abs(Math.sin(p)) * 0.08;

  if (boneLUpperArm) {
    boneLUpperArm.rotation.x =  rightLegFwd * armSwing;  // opposes right leg
    boneLUpperArm.rotation.z =  0.78;
    boneLUpperArm.rotation.y =  0.03;
  }
  if (boneRUpperArm) {
    boneRUpperArm.rotation.x =  leftLegFwd * armSwing;   // opposes left leg
    boneRUpperArm.rotation.z = -0.78;
    boneRUpperArm.rotation.y = -0.03;
  }
  if (boneLLowerArm) { boneLLowerArm.rotation.z =  elbowFlex; boneLLowerArm.rotation.x =  0.02; }
  if (boneRLowerArm) { boneRLowerArm.rotation.z = -elbowFlex; boneRLowerArm.rotation.x =  0.02; }
  if (boneLHand) { boneLHand.rotation.z =  0.12; boneLHand.rotation.x = 0.04; }
  if (boneRHand) { boneRHand.rotation.z = -0.12; boneRHand.rotation.x = 0.04; }
  setLeftFingerRelax();
  setRightFingerRelax();

  // ── Vertical bob — step from heel to toe produces natural up/down
  // Guide: step from heel to toe, weight shifts up on midstance
  const bobY = Math.abs(Math.sin(p)) * 0.016;
  vrm.scene.position.y = (vrm._restPosY || 0) + bobY;
}

// ================================================================
//  DAILY LIFE SCHEDULER
// ================================================================
let _lifeTimer    = 0;
let _lifeMinDwell = 8;
let _lifeMaxDwell = 25;
let _nextDwell    = _lifeMinDwell + Math.random() * (_lifeMaxDwell - _lifeMinDwell);
let _apiOverride      = false;
let _apiOverrideTimer = 0;
const API_OVERRIDE_DURATION = 60;
const transitionState = {
  active: false,
  timer: 0,
};

let _currentRoom = 'studio';
let _currentSpot = null;
const occupiedSpots = new Map();

function _pickAvailableSpot(spot) {
  if (spot.yOffset === undefined || !occupiedSpots.has(spot.label)) return spot;

  const candidates = Object.entries(HOUSE).flatMap(([roomKey, roomDef]) =>
    (roomDef?.spots || [])
      .filter(candidate => candidate.yOffset === undefined || !occupiedSpots.has(candidate.label))
      .map(candidate => ({ ...candidate, room: roomKey }))
  );
  return candidates[Math.floor(Math.random() * candidates.length)] || null;
}

function _reserveSpot(spot, avatar) {
  if (spot?.yOffset === undefined) return;
  occupiedSpots.set(spot.label, avatar);
  console.log(`[Seat Reserved] ${spot.label} → ${avatar}`);
}

function _releaseSpot(spot, avatar) {
  if (spot?.yOffset === undefined || occupiedSpots.get(spot.label) !== avatar) return;
  occupiedSpots.delete(spot.label);
  console.log(`[Seat Released] ${spot.label}`);
}

// ── Familiarity ──────────────────────────────────────────────────
function _avatarDisplayName(avatar) {
  return avatar === 'miss' ? 'Miss' : 'Lora';
}

function _getAvatarPosition(avatar) {
  if (avatar === 'miss') return vrmPos;
  return _getLoraPosition();
}

function _isAvatarWalking(avatar) {
  return avatar === 'miss'
    ? walk.active
    : Boolean(window._loraWalking || _loraWalkingToSpot);
}

function _isAvatarSpeaking(avatar) {
  return avatar === 'miss' ? _isSpeaking : Boolean(window._loraIsSpeaking);
}

function _isAvatarSleeping(avatar) {
  const activity = avatar === 'miss' ? ACTIVITY.current : ACTIVITY_MR.current;
  return activity === 'bedLie' || activity === 'bedLiePhone';
}

function _isSharedActivityProtected(avatar) {
  const activity = avatar === 'miss' ? ACTIVITY.current : ACTIVITY_MR.current;
  if (activity === 'bedLie' || activity === 'mirrorPose') return true;
  return avatar === 'miss' && _twitchResponseActive;
}

function _canJoinSharedActivity(avatar, leaderPos) {
  const joinerPos = _getAvatarPosition(avatar);
  if (!leaderPos || !joinerPos) return false;
  if (_isAvatarWalking(avatar)) return false;
  if (_isAvatarSpeaking(avatar)) return false;
  if (_isAvatarSleeping(avatar)) return false;
  if (_isSharedActivityProtected(avatar)) return false;
  return Math.hypot(joinerPos.x - leaderPos.x, joinerPos.z - leaderPos.z) <= 4;
}

function _findSharedActivitySpot(leaderSpot, compatibleActivities, joinerAvatar) {
  if (!leaderSpot || !compatibleActivities?.length) return null;
  const leaderX = leaderSpot.x;
  const leaderZ = leaderSpot.z;
  const currentSpot = joinerAvatar === 'miss' ? _currentSpot : _loraCurrentSpot;

  const candidates = Object.entries(HOUSE).flatMap(([roomKey, roomDef]) =>
    (roomDef?.spots || []).flatMap(spot => {
      if (spot.yOffset !== undefined && occupiedSpots.has(spot.label)) return [];
      const validActivities = _getValidActivities(spot, compatibleActivities);
      return compatibleActivities
        .filter(activity => validActivities.includes(activity))
        .map(activity => ({ ...spot, room: roomKey, sharedActivity: activity }));
    })
  ).filter(spot => {
    if (spot.label === currentSpot?.label && spot.room === currentSpot?.room) return false;
    return Math.hypot(spot.x - leaderX, spot.z - leaderZ) <= 4;
  });

  return candidates.sort((a, b) => {
    const distanceA = Math.hypot(a.x - leaderX, a.z - leaderZ);
    const distanceB = Math.hypot(b.x - leaderX, b.z - leaderZ);
    if (distanceA !== distanceB) return distanceA - distanceB;
    return `${a.room}:${a.label}:${a.sharedActivity}`.localeCompare(`${b.room}:${b.label}:${b.sharedActivity}`);
  })[0] || null;
}

function _trySharedActivity(leaderAvatar, activity, leaderSpot) {
  const compatibleActivities = SHARED_ACTIVITIES[activity];
  if (!compatibleActivities) return;
  if (_twitchResponseActive) return;

  const joinerAvatar = leaderAvatar === 'miss' ? 'lora' : 'miss';
  const leaderPos = leaderAvatar === 'miss' ? vrmPos : _getLoraPosition();
  if (!_canJoinSharedActivity(joinerAvatar, leaderPos)) return;
  if (Math.random() >= 0.4) return;

  const sharedSpot = _findSharedActivitySpot(leaderSpot, compatibleActivities, joinerAvatar);
  if (!sharedSpot) return;

  const joinActivity = sharedSpot.sharedActivity;
  const spot = { ...sharedSpot, activities: [joinActivity] };
  console.log(`[Shared] ${_avatarDisplayName(joinerAvatar)} joined ${_avatarDisplayName(leaderAvatar)} for ${activity}`);

  if (joinerAvatar === 'miss') {
    goToSpot(spot, { sharedJoin: true, forceActivity: joinActivity });
  } else {
    _loraGoToSpot(spot, { sharedJoin: true, forceActivity: joinActivity });
  }
}

const _familiarity = {
  studio:        { room: 0, activities: {} },
  kitchen:       { room: 0, activities: {} },
  'living-room': { room: 0, activities: {} },
  bedroom:       { room: 0, activities: {} },
  bathroom:      { room: 0, activities: {} },
  dining:        { room: 0, activities: {} },
  hallway:       { room: 0, activities: {} },
};
const FAM_THRESHOLD_BASIC   = 60;
const FAM_THRESHOLD_SETTLED = 300;
const FAM_THRESHOLD_HOME    = 900;

function famUpdate(delta) {
  if (_currentRoom && _familiarity[_currentRoom]) {
    _familiarity[_currentRoom].room += delta;
    const act = ACTIVITY.current;
    if (act && act !== 'idle') {
      _familiarity[_currentRoom].activities[act] =
        (_familiarity[_currentRoom].activities[act] || 0) + delta;
    }
  }
}

function famScore(roomName) {
  const f = _familiarity[roomName];
  if (!f) return 0;
  return Math.min(1, f.room / FAM_THRESHOLD_HOME);
}

function pickNextSpotFamiliar() {
  const allSpots = Object.entries(HOUSE).flatMap(([roomKey, roomDef]) => {
    if (!roomDef || !roomDef.spots) return [];
    return roomDef.spots.map(spot => ({ ...spot, room: roomKey }));
  });
  const weighted = [];
  for (const spot of allSpots) {
    if (spot === _currentSpot) continue;
    const w = _familiarity[spot.room]?.room > FAM_THRESHOLD_HOME    ? 5
            : _familiarity[spot.room]?.room > FAM_THRESHOLD_SETTLED  ? 3
            : _familiarity[spot.room]?.room > FAM_THRESHOLD_BASIC    ? 2
            : 1;
    for (let i = 0; i < w; i++) weighted.push(spot);
  }
  return weighted[Math.floor(Math.random() * weighted.length)];
}

export function getFamiliarActivityPool(roomName) {
  const base = {
    studio:        ['idle','dance','stretch','hairflick','hiponhip','typing','monitor','noseCover'],
    kitchen:       ['idle','hairflick','hiponhip','noseCover','stirring','chopping','tasting','drinkCoffee'],
    'living-room': ['idle','hairflick','hiponhip','stretch','phoneScroll','tvReact','watchTV','dance','readBook','fireGaze','windowLook','drinkCoffee'],
    bedroom:       ['idle','hairflick','noseCover','phoneScroll','stretch','mirrorPose','bedLie','bedLiePhone'],
    bathroom:      ['idle','hairflick','noseCover','mirrorPose','stretch'],
    dining:        ['idle','eatAtTable','eatAtTable','tasting','phoneScroll','readBook','hairflick','hiponhip','windowLook'],
    hallway:       ['idle','hairflick','stretch'],
  };
  const advanced = {
    studio:        ['dance','typing','monitor'],
    kitchen:       ['stirring','chopping','tasting','cookDance','drinkCoffee'],
    'living-room': ['tvReact','watchTV','sofaSit','phoneScroll','dance','readBook'],
    bedroom:       ['sofaSit','phoneScroll','bedLie','bedLiePhone'],
    bathroom:      ['mirrorPose'],
    dining:        ['eatAtTable','eatAtTable','tasting'],
  };
  const fam  = _familiarity[roomName]?.room || 0;
  const pool = [...(base[roomName] || base.studio)];
  if (fam > FAM_THRESHOLD_BASIC) {
    const adv = advanced[roomName] || [];
    pool.push(...adv, ...adv);
  }
  return pool;
}

// ── Room helpers ─────────────────────────────────────────────────
function setRoomVisible(roomName, visible) {
  if (visible) {
    const h = HOUSE[roomName];
    if (h && ambient) ambient.color.setHex(h.ambientColor);
  }
}

function moveToRoom(roomName) {
  if (!roomName) return;
  _currentRoom = roomName;
  const hDef = HOUSE[roomName];
  if (hDef && ambient) ambient.color.setHex(hDef.ambientColor);
  const pool = getFamiliarActivityPool(roomName);
  ACTIVITY.current  = pool[Math.floor(Math.random() * pool.length)];
  ACTIVITY.timer    = 0; ACTIVITY.phase = 0;
  ACTIVITY.duration = _lifeMinDwell + Math.random() * (_lifeMaxDwell - _lifeMinDwell);
  maybeChangeOutfit(roomName);
}

// ── Pathfinding: room-to-room door connection graph ──────────────
// Each room lists directly reachable rooms; DOORS stores the model-space
// door-threshold waypoint (world-space x/z) to pass through first.
// NOTE: engine-scene.js scales these by hScale on house load via
//       window.ROOM_CONNECTIONS_REF — do not hardcode scaled values.
export const HOUSE_GRAPH = {
  'living-room': { id: 'living-room', connectedRooms: ['hallway'] },
  kitchen:       { id: 'kitchen', connectedRooms: ['hallway', 'dining'] },
  dining:        { id: 'dining', connectedRooms: ['kitchen', 'hallway'] },
  hallway:       { id: 'hallway', connectedRooms: ['living-room', 'kitchen', 'dining', 'bathroom', 'bedroom', 'studio'] },
  bathroom:      { id: 'bathroom', connectedRooms: ['hallway', 'bedroom'] },
  bedroom:       { id: 'bedroom', connectedRooms: ['hallway', 'bathroom'] },
  studio:        { id: 'studio', connectedRooms: ['hallway'] },
};

export const DOORS = [
  { fromRoom: 'hallway',     toRoom: 'living-room', x: -0.920, z: -0.021 },
  { fromRoom: 'hallway',     toRoom: 'kitchen',     x: -0.920, z:  1.222 },
  { fromRoom: 'kitchen',     toRoom: 'dining',      x:  0.382, z:  1.579 },
  { fromRoom: 'hallway',     toRoom: 'dining',      x:  2.475, z:  2.040 },
  { fromRoom: 'hallway',     toRoom: 'bathroom',    x:  1.925, z:  0.731 },
  { fromRoom: 'bedroom',     toRoom: 'bathroom',    x:  1.925, z: -1.732 },
  { fromRoom: 'hallway',     toRoom: 'bedroom',     x:  1.925, z: -3.870 },
  { fromRoom: 'hallway',     toRoom: 'studio',      x:  0.477, z: -2.327 },
  { fromRoom: 'hallway',     toRoom: 'outside',     x:  1.590, z: -5.636 },
];

const ROOM_CONNECTIONS = DOORS.reduce((connections, door) => {
  const waypoint = { x: door.x, z: door.z };
  connections[door.fromRoom] ||= {};
  connections[door.fromRoom][door.toRoom] = waypoint;
  if (HOUSE_GRAPH[door.toRoom]) {
    connections[door.toRoom] ||= {};
    connections[door.toRoom][door.fromRoom] = waypoint;
  }
  return connections;
}, {});
// Register reference so engine-scene.js can scale waypoints after hScale is known
window.ROOM_CONNECTIONS_REF = ROOM_CONNECTIONS;

// BFS — returns ordered array of { throughRoom, waypoint } steps,
// or [] if already in same room / no path found (fallback: direct walk).
export function getRoomPath(startRoom, endRoom) {
  if (!startRoom || !endRoom || !HOUSE_GRAPH[startRoom] || !HOUSE_GRAPH[endRoom]) return [];
  if (startRoom === endRoom) return [startRoom];
  const visited = new Set([startRoom]);
  const queue = [[startRoom, [startRoom]]];
  while (queue.length) {
    const [room, path] = queue.shift();
    for (const nextRoom of HOUSE_GRAPH[room]?.connectedRooms || []) {
      if (visited.has(nextRoom) || !HOUSE_GRAPH[nextRoom]) continue;
      const nextPath = [...path, nextRoom];
      if (nextRoom === endRoom) {
        console.log(`[Navigation] ${nextPath.map(_formatRoomForLog).join(' → ')}`);
        return nextPath;
      }
      visited.add(nextRoom);
      queue.push([nextRoom, nextPath]);
    }
  }
  return [];
}

function _formatRoomForLog(roomName) {
  return String(roomName)
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function _doorForRooms(fromRoom, toRoom) {
  return DOORS.find(door =>
    (door.fromRoom === fromRoom && door.toRoom === toRoom) ||
    (door.fromRoom === toRoom && door.toRoom === fromRoom)
  );
}

function _buildDoorWaypoints(roomPath, actorName = 'Miss') {
  if (!Array.isArray(roomPath) || roomPath.length <= 1) return [];
  return roomPath.slice(1).map((room, index) => {
    const previousRoom = roomPath[index];
    const waypoint = ROOM_CONNECTIONS[previousRoom]?.[room];
    const door = _doorForRooms(previousRoom, room);
    if (!waypoint || !door) return null;
    return {
      throughRoom: room,
      waypoint,
      onPass: index === 0
        ? () => console.log(`[Navigation] ${actorName} passing ${_formatRoomForLog(previousRoom).toLowerCase()} door`)
        : null,
      onEnter: () => console.log(`[Navigation] ${actorName} entering ${_formatRoomForLog(room).toLowerCase()}`),
    };
  }).filter(Boolean);
}

function findRoomPath(fromRoom, toRoom) {
  return _buildDoorWaypoints(getRoomPath(fromRoom, toRoom));
}

// ── Door-queue navigation adapter ───────────────────────────────
// Wraps findRoomPath with:
//   • same-room short-circuit (returns [] immediately, no BFS)
//   • per-door entry log with door id and direction
//   • records each door passage to the memory backend
// Only Miss uses this path; Lora routes via engine-scene's _loraSetTarget.
function _buildNavQueue(fromRoom, toRoom, actorName = 'Miss') {
  if (!fromRoom || !toRoom || fromRoom === toRoom) return [];
  const waypoints = findRoomPath(fromRoom, toRoom);
  if (!waypoints.length) return [];

  // Annotate each waypoint with enriched per-door logging + memory record
  return waypoints.map((wp, index) => {
    const prevRoom = index === 0 ? fromRoom : waypoints[index - 1].throughRoom;
    const door     = _doorForRooms(prevRoom, wp.throughRoom);
    const doorId   = door
      ? `${door.fromRoom}↔${door.toRoom}`
      : `${prevRoom}→${wp.throughRoom}`;

    return {
      ...wp,
      onPass: () => {
        console.log(`[NavQueue] ${actorName} at door [${doorId}] leg ${index + 1}/${waypoints.length}`);
        wp.onPass?.();
      },
      onEnter: () => {
        console.log(`[NavQueue] ${actorName} entered ${_formatRoomForLog(wp.throughRoom)} via [${doorId}]`);
        learnDoorState(doorId, 'passed');
        wp.onEnter?.();
      },
    };
  });
}

// Walk through an ordered list of door waypoints, then arrive at
// finalX/finalZ and call onArrive. Recurses for each leg.
function walkThroughWaypoints(waypoints, finalX, finalZ, onArrive) {
  const vrm = _vrm();
  if (!vrm) return;

  if (!waypoints.length) {
    // Final leg — walk straight to destination
    const dx   = finalX - vrmPos.x;
    const dz   = finalZ - vrmPos.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    walk.fromX    = vrmPos.x;
    walk.fromZ    = vrmPos.z;
    walk.toX      = finalX;
    walk.toZ      = finalZ;
    walk.progress = 0;
    walk.active   = true;
    walk.onArrive = onArrive;
    walk.duration     = Math.max(0.6, dist / 1.5);
    walk.targetFacing = Math.atan2(dx, dz) + Math.PI;
    _targetFacing     = walk.targetFacing;
    return;
  }

  // Walk to the next door threshold, then continue recursively
  const [first, ...rest] = waypoints;
  first.onPass?.();
  const dx   = first.waypoint.x - vrmPos.x;
  const dz   = first.waypoint.z - vrmPos.z;
  const dist = Math.sqrt(dx*dx + dz*dz);
  walk.fromX    = vrmPos.x;
  walk.fromZ    = vrmPos.z;
  walk.toX      = first.waypoint.x;
  walk.toZ      = first.waypoint.z;
  walk.progress = 0;
  walk.active   = true;
  walk.duration     = Math.max(0.5, dist / 1.5);
  walk.targetFacing = Math.atan2(dx, dz) + Math.PI;
  _targetFacing     = walk.targetFacing;
  walk.onArrive = () => {
    vrmPos.x     = first.waypoint.x;
    vrmPos.z     = first.waypoint.z;
    _currentRoom = first.throughRoom;
    first.onEnter?.();
    setRoomVisible(_currentRoom, true);
    walkThroughWaypoints(rest, finalX, finalZ, onArrive);
  };
}

function goToSpot(spot, options = {}) {
  const vrm = _vrm();
  if (!spot || !vrm) return;
  spot = _pickAvailableSpot(spot);
  if (!spot) return;
  clearLookTarget();
  _lastLookActivity = null;
  _releaseSpot(_currentSpot, 'miss');
  _currentSpot = spot;
  setCamMode('WALK');
  _setMissTV(false);   // leaving current spot — TV off until she arrives somewhere new

  const targetRoom = spot.room;
  // Same room → _buildNavQueue returns [] immediately, walkThroughWaypoints
  // skips the door layer and goes straight to the final leg. Cross-room →
  // each door passage is logged and recorded via the adapter.
  const doorPath   = _buildNavQueue(_currentRoom, targetRoom, 'Miss');

  const walkTarget = spot.interactionPoint || spot;
  if (spot.interactionPoint) {
    console.log(`[Interaction] Walking to ${spot.label} interaction point`);
  }
  walkThroughWaypoints(doorPath, walkTarget.x, walkTarget.z, () => {
    _currentRoom = targetRoom;
    setRoomVisible(_currentRoom, true);
    if (spot.facingY !== undefined) _targetFacing = spot.facingY;
    const spotActivities = _getValidActivities(spot, getFamiliarActivityPool(_currentRoom));
    const next = options.forceActivity && spotActivities.includes(options.forceActivity)
      ? options.forceActivity
      : spotActivities[Math.floor(Math.random() * spotActivities.length)];

    _reserveSpot(spot, 'miss');

    if (next === 'sofaSit') {
      vrmPos.x = spot.x;
      vrmPos.z = spot.z;
      vrm.scene.position.x = spot.x;
      vrm.scene.position.z = spot.z;
      _missYOffsetTarget = spot.yOffset || 0;
      _missYOffsetCurrent = _missYOffsetTarget;
      vrm.scene.position.y = (vrm._restPosY || 0) + _missYOffsetTarget;
      if (spot.facingY !== undefined) {
        _targetFacing = spot.facingY;
        vrm.scene.rotation.y = spot.facingY;
      }
    }

    ACTIVITY.current  = next;
    ACTIVITY.timer    = 0; ACTIVITY.phase = 0;
    ACTIVITY.duration = _lifeMinDwell + Math.random() * (_lifeMaxDwell - _lifeMinDwell);
    _applySpotLookTarget(spot);
    _updateSleepMode();

    // ── TV on/off based on activity ───────────────────────────────
    _setMissTV(TV_ACTIVITIES.has(next));

    // ── Drop Y for seated/lying spots — lerped to avoid snapping ──
    if (vrm) {
      _missYOffsetTarget = (SEATED_ACTIVITIES.has(next) && spot.yOffset) ? spot.yOffset : 0;
    }

    maybeChangeOutfit(_currentRoom);
    setCamMode('IDLE');
    onActivityChanged(next);
    learnNPCPosition('miss', _currentRoom, spot.label || spot.id || 'spot');
    if (!options.sharedJoin) _trySharedActivity('miss', next, spot);
  });
}

// ── Public room teleport — routes through doors automatically ────
export function goToRoom(roomName) {
  const hDef = HOUSE[roomName];
  if (!hDef || !hDef.spots?.length) return;
  const spot = { ...hDef.spots[Math.floor(Math.random() * hDef.spots.length)], room: roomName };
  goToSpot(spot);
  _lifeTimer = 0;
  _nextDwell = _lifeMinDwell + Math.random() * (_lifeMaxDwell - _lifeMinDwell);
}

// ── Public activity override — sets activity immediately, life resumes after dwell ──
export function doActivity(actName) {
  if (!_vrm()) return;
  ACTIVITY.current  = actName;
  ACTIVITY.timer    = 0;
  ACTIVITY.phase    = 0;
  ACTIVITY.duration = _lifeMinDwell + Math.random() * (_lifeMaxDwell - _lifeMinDwell);
  _apiOverride      = true;
  _apiOverrideTimer = 12;
  onActivityChanged(actName);
  _trySharedActivity('miss', actName, _currentSpot);
}

function lifeUpdate() {
  if (!_vrm() || walk.active) return;
  const delta = 1/60;
  famUpdate(delta);
  if (_apiOverride) {
    _apiOverrideTimer -= delta;
    if (_apiOverrideTimer <= 0) { _apiOverride = false; _targetFacing = Math.PI; }
    return;
  }

  if (transitionState.active) {
    transitionState.timer -= delta;
    if (transitionState.timer > 0) return;
    transitionState.active = false;
    transitionState.timer = 0;
    console.log('[Transition] Complete');
  } else {
    _lifeTimer += delta;
    if (_lifeTimer >= _nextDwell - 3 && _lifeTimer < _nextDwell) _targetFacing = Math.PI;
    if (_lifeTimer < _nextDwell) return;

    transitionState.active = true;
    transitionState.timer = 2 + Math.random() * 4;
    ACTIVITY.current = 'idle';
    ACTIVITY.timer = 0;
    ACTIVITY.phase = 0;
    ACTIVITY.duration = Number.POSITIVE_INFINITY;
    onActivityChanged('idle');

    const facingRoll = Math.random();
    if (facingRoll < 0.3) {
      _targetFacing -= Math.random() * 0.4;
    } else if (facingRoll < 0.6) {
      _targetFacing += Math.random() * 0.4;
    }

    console.log(`[Transition] Waiting ${transitionState.timer.toFixed(1)}s`);
    return;
  }

  _lifeTimer = 0;
  _nextDwell = _lifeMinDwell + Math.random() * (_lifeMaxDwell - _lifeMinDwell);
  const spot = pickNextSpotFamiliar();
  if (spot) goToSpot(spot);
}

// ================================================================
//  LORA LIFE SCHEDULER
//  Independent of Miss — picks HOUSE spots, walks Lora there via
//  engine-scene's _updateLoraWalk system, then sets ACTIVITY_MR.
// ================================================================

// Activity pools mirroring Miss's but Lora-flavoured
const _loraActivityPool = {
  studio:        ['idle','dance','stretch','hairflick','hiponhip','typing','monitor','noseCover','drinkCoffee'],
  kitchen:       ['idle','hairflick','hiponhip','noseCover','stirring','chopping','tasting','drinkCoffee','cookDance','washingUp'],
  'living-room': ['idle','hairflick','hiponhip','stretch','phoneScroll','tvReact','watchTV','dance','readBook','fireGaze','windowLook'],
  bedroom:       ['idle','hairflick','noseCover','phoneScroll','stretch','mirrorPose','bedLie','bedLiePhone','cabinetOpen'],
  bathroom:      ['idle','hairflick','noseCover','mirrorPose','stretch'],
  dining:        ['idle','eatAtTable','eatAtTable','tasting','phoneScroll','readBook','hairflick','hiponhip'],
  hallway:       ['idle','hairflick','stretch','hiponhip'],
};

// ── TV watcher tracking ──────────────────────────────────────────
// Both avatars can independently turn the TV on by sitting to watch.
// Music volume rises when anyone is watching, drops when both leave.
const TV_ACTIVITIES = new Set(['watchTV', 'tvReact']);
const SEATED_ACTIVITIES = new Set(['sofaSit','phoneScroll','readBook','tvReact','watchTV','eatAtTable','tasting','bedLie','bedLiePhone']);
let _missWatchingTV = false;
let _loraWatchingTV = false;

function _updateTVVolume() {
  const anyone = _missWatchingTV || _loraWatchingTV;
  // Smooth ramp: loud when watching, quiet ambient when nobody is
  setMusicVolume(anyone ? 0.26 : 0.08);
}

function _setMissTV(on) {
  _missWatchingTV = on;
  _updateTVVolume();
  // Update the TV mesh emissive — glows when anyone is watching
  setTVOn(_missWatchingTV || _loraWatchingTV);
}
function _setLoraTV(on) {
  _loraWatchingTV = on;
  _updateTVVolume();
  setTVOn(_missWatchingTV || _loraWatchingTV);
}

let _loraLifeTimer    = 0;
let _loraLifeDwell    = 12 + Math.random() * 20;
let _loraCurrentRoom  = 'studio';
let _loraCurrentSpot  = null;
let _loraWalkingToSpot = false;

// Pick a random HOUSE spot for Lora, avoiding her current spot
function _loraPickSpot() {
  const allSpots = Object.entries(HOUSE).flatMap(([roomKey, roomDef]) => {
    if (!roomDef?.spots) return [];
    return roomDef.spots.map(s => ({ ...s, room: roomKey }));
  });
  const candidates = allSpots.filter(s => s !== _loraCurrentSpot);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Safety watchdog — clears _loraWalkingToSpot if arrival callback never fires.
// Max walk distance across the house is ~15 units at speed 1.5 = ~10s.
// We add a generous buffer: 18 seconds before forcing idle.
let _loraWalkWatchdog = null;
function _loraWalkSafetyReset() {
  clearTimeout(_loraWalkWatchdog);
  _loraWalkWatchdog = setTimeout(() => {
    if (_loraWalkingToSpot) {
      console.warn('[Lora] Walk watchdog fired — forcing idle (arrival callback never ran)');
      _loraWalkingToSpot       = false;
      window._loraWalking      = false;
      ACTIVITY_MR.current      = 'idle';
      ACTIVITY_MR.timer        = 0;
      ACTIVITY_MR.phase        = 0;
      ACTIVITY_MR.duration     = 10 + Math.random() * 15;
    }
  }, 18000);
}

// Send Lora to a spot — sets ACTIVITY_MR on arrival
function _loraGoToSpot(spot, options = {}) {
  if (!spot) return;
  spot = _pickAvailableSpot(spot);
  if (!spot) return;
  _releaseSpot(_loraCurrentSpot, 'lora');
  _loraCurrentSpot   = spot;
  _loraWalkingToSpot = true;
  _loraWalkSafetyReset(); // ← watchdog: auto-clears if she gets stuck
  _setLoraTV(false);   // leaving — TV off until she arrives

  // Tell engine-scene's walk system where to go
  // It exposes _loraTarget and _loraWalking via window for cross-module comms
  if (window._loraSetTarget) {
    const _loraFromRoom = _loraCurrentRoom;   // capture BEFORE updating room
    _loraCurrentRoom    = spot.room;           // update now so room lights switch early

    // Restore standing Y before walking (mirrors Miss's updateWalk behaviour)
    const loraVrm = window.getVrmLora ? window.getVrmLora() : null;
    if (loraVrm) loraVrm.scene.position.y = loraVrm._restPosY || 0;

    // Pass fromRoom + toRoom so engine-scene BFS routes through door waypoints
    const walkTarget = spot.interactionPoint || spot;
    if (spot.interactionPoint) {
      console.log(`[Interaction] Walking to ${spot.label} interaction point`);
    }
    window._loraSetTarget(walkTarget.x, walkTarget.z, () => {
      // On arrival
      clearTimeout(_loraWalkWatchdog); // ← she made it — cancel the safety timer
      _loraWalkingToSpot = false;
      _loraCurrentRoom   = spot.room;   // confirm room on arrival (may already match)

      // Pick activity from spot's list or room pool
      const pool = _getValidActivities(
        spot,
        _loraActivityPool[spot.room] || _loraActivityPool.studio
      );
      const next = options.forceActivity && pool.includes(options.forceActivity)
        ? options.forceActivity
        : pool[Math.floor(Math.random() * pool.length)];

      _reserveSpot(spot, 'lora');

      if (next === 'sofaSit' && loraVrm) {
        loraVrm.scene.position.x = spot.x;
        loraVrm.scene.position.z = spot.z;
        _loraYOffsetTarget = spot.yOffset || 0;
        _loraYOffsetCurrent = _loraYOffsetTarget;
        loraVrm.scene.position.y = (loraVrm._restPosY || 0) + _loraYOffsetTarget;
        if (spot.facingY !== undefined) {
          loraVrm.scene.rotation.y = spot.facingY;
          if (window._loraSetFacing) window._loraSetFacing(spot.facingY);
        }
      }

      ACTIVITY_MR.current  = next;
      ACTIVITY_MR.timer    = 0;
      ACTIVITY_MR.phase    = 0;
      ACTIVITY_MR.duration = 10 + Math.random() * 20;
      _updateSleepMode();

      // ── TV on/off for Lora ─────────────────────────────────────
      _setLoraTV(TV_ACTIVITIES.has(next));

      // Apply yOffset for seated/lying activities — lerped for smooth transition
      _loraYOffsetTarget = (SEATED_ACTIVITIES.has(next) && spot.yOffset) ? spot.yOffset : 0;

      // Face the spot's designated direction
      if (spot.facingY !== undefined && window._loraSetFacing) {
        window._loraSetFacing(spot.facingY);
      }
      learnNPCPosition('lora', _loraCurrentRoom, spot.label || spot.id || 'spot');
      if (!options.sharedJoin) _trySharedActivity('lora', next, spot);
    }, _loraFromRoom, spot.room);   // ← BFS args: tells engine-scene to route through doors
  } else {
    // Fallback: no callback bridge — just set activity immediately
    _loraWalkingToSpot = false;
    const pool = _getValidActivities(
      spot,
      _loraActivityPool[spot.room] || _loraActivityPool.studio
    );
    const next = options.forceActivity && pool.includes(options.forceActivity)
      ? options.forceActivity
      : pool[Math.floor(Math.random() * pool.length)];
    _reserveSpot(spot, 'lora');
    ACTIVITY_MR.current  = next;
    ACTIVITY_MR.timer    = 0;
    ACTIVITY_MR.phase    = 0;
    ACTIVITY_MR.duration = 10 + Math.random() * 20;
    if (!options.sharedJoin) _trySharedActivity('lora', next, spot);
  }

  _loraLifeTimer = 0;
  _loraLifeDwell = 10 + Math.random() * 22;
}

function _loraLifeUpdate() {
  if (_loraWalkingToSpot) return;
  _loraLifeTimer += 1/60;
  if (_loraLifeTimer < _loraLifeDwell) return;
  _loraLifeTimer = 0;
  _loraLifeDwell = 10 + Math.random() * 22;
  const spot = _loraPickSpot();
  if (spot) _loraGoToSpot(spot);
}

// ================================================================
//  ALAKURIN (DOG) LIFE SCHEDULER
//  Deterministic, hand-authored, no AI/LLM calls of any kind. Just
//  picks HOUSE spots and dog-flavoured activities on timers, plus a
//  few reactive triggers wired in from the Twitch chat handler below
//  (search "DOG TRIGGER" to find each one).
// ================================================================
const _dogActivityPool = {
  studio:        ['idle', 'idle', 'sniff', 'sit'],
  kitchen:       ['sniff', 'sniff', 'idle', 'sit'],
  'living-room': ['idle', 'sit', 'lieDown', 'sniff'],
  bedroom:       ['lieDown', 'lieDown', 'sleep', 'idle'],
  bathroom:      ['sniff', 'idle'],
  dining:        ['sniff', 'sit', 'idle'],
  hallway:       ['idle', 'sniff'],
};

let _dogLifeTimer     = 0;
let _dogLifeDwell     = 8 + Math.random() * 18;
let _dogCurrentRoom   = 'studio';
let _dogCurrentSpot   = null;
let _dogWalkingToSpot = false;

// Updated at every chat message / new-viewer event (see "DOG TRIGGER"
// comments in _connectTwitchIRC below). Drives the "no chat for a
// while → he naturally settles down to sleep" behaviour.
let _dogLastChatAt       = Date.now();
const DOG_SLEEP_AFTER_MS = 2 * 60 * 1000; // 2 minutes of silence
let _dogForcedAsleep     = false;

function _dogPickSpot() {
  const allSpots = Object.entries(HOUSE).flatMap(([roomKey, roomDef]) => {
    if (!roomDef?.spots) return [];
    return roomDef.spots.map(s => ({ ...s, room: roomKey }));
  });
  const candidates = allSpots.filter(s => s !== _dogCurrentSpot);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

let _dogWalkWatchdog = null;
function _dogWalkSafetyReset() {
  clearTimeout(_dogWalkWatchdog);
  _dogWalkWatchdog = setTimeout(() => {
    if (_dogWalkingToSpot) {
      console.warn('[Dog] Walk watchdog fired — forcing idle');
      _dogWalkingToSpot  = false;
      window._dogWalking = false;
      ACTIVITY_DOG.current  = 'idle';
      ACTIVITY_DOG.timer    = 0;
      ACTIVITY_DOG.phase    = 0;
      ACTIVITY_DOG.duration = 8;
    }
  }, 18000);
}

function _dogGoToSpot(spot, options = {}) {
  if (!spot) return;
  _dogCurrentSpot    = spot;
  _dogWalkingToSpot  = true;
  _dogWalkSafetyReset();

  if (window._dogSetTarget) {
    const _dogFromRoom = _dogCurrentRoom;
    _dogCurrentRoom     = spot.room;

    const dogVrm = window.getVrmDog ? window.getVrmDog() : null;
    if (dogVrm) dogVrm.scene.position.y = dogVrm._restPosY || 0;

    const walkTarget = spot.interactionPoint || spot;
    // Mostly trots between spots; sometimes ambles, occasionally bolts —
    // purely cosmetic variety, no behavioural meaning.
    const speedRoll  = Math.random();
    const speedMode  = speedRoll < 0.15 ? 'run' : speedRoll < 0.55 ? 'trot' : 'walk';

    window._dogSetTarget(walkTarget.x, walkTarget.z, () => {
      clearTimeout(_dogWalkWatchdog);
      _dogWalkingToSpot = false;
      _dogCurrentRoom    = spot.room;

      const pool = _dogActivityPool[spot.room] || _dogActivityPool.studio;
      const next = options.forceActivity && pool.includes(options.forceActivity)
        ? options.forceActivity
        : pool[Math.floor(Math.random() * pool.length)];

      ACTIVITY_DOG.current  = next;
      ACTIVITY_DOG.timer    = 0;
      ACTIVITY_DOG.phase    = 0;
      ACTIVITY_DOG.duration = 8 + Math.random() * 16;
    }, _dogFromRoom, spot.room, speedMode);
  } else {
    _dogWalkingToSpot = false;
    const pool = _dogActivityPool[spot.room] || _dogActivityPool.studio;
    const next = pool[Math.floor(Math.random() * pool.length)];
    ACTIVITY_DOG.current  = next;
    ACTIVITY_DOG.timer    = 0;
    ACTIVITY_DOG.phase    = 0;
    ACTIVITY_DOG.duration = 8 + Math.random() * 16;
  }

  _dogLifeTimer = 0;
  _dogLifeDwell = 8 + Math.random() * 18;
}

function _dogLifeUpdate() {
  if (!window.getVrmDog || !window.getVrmDog()) return; // not loaded yet (or failed to load)

  // ── DOG TRIGGER: no chat for a while → settle down and sleep ────
  const silentFor = Date.now() - _dogLastChatAt;
  if (silentFor > DOG_SLEEP_AFTER_MS) {
    if (!_dogForcedAsleep && !_dogWalkingToSpot) {
      _dogForcedAsleep = true;
      ACTIVITY_DOG.current  = 'sleep';
      ACTIVITY_DOG.timer    = 0;
      ACTIVITY_DOG.phase    = 0;
      ACTIVITY_DOG.duration = 9999; // stays asleep until chat wakes him
    }
    return; // skip normal wandering while asleep
  } else if (_dogForcedAsleep) {
    // Chat resumed — wake him into idle, normal scheduling takes over next tick
    _dogForcedAsleep = false;
    ACTIVITY_DOG.current  = 'idle';
    ACTIVITY_DOG.timer    = 0;
    ACTIVITY_DOG.duration = 4;
  }

  if (_dogWalkingToSpot) return;
  _dogLifeTimer += 1/60;
  if (_dogLifeTimer < _dogLifeDwell) return;
  _dogLifeTimer = 0;
  _dogLifeDwell = 8 + Math.random() * 18;
  const spot = _dogPickSpot();
  if (spot) _dogGoToSpot(spot);
}

// ── DOG TRIGGER: occasional spontaneous chase-tail / scratch, just
// for character — small chance each scheduling tick, only when idle
// and not walking, so it never interrupts a deliberate spot visit.
function _dogMaybeFidget() {
  if (_dogWalkingToSpot || _dogForcedAsleep) return;
  if (ACTIVITY_DOG.current !== 'idle') return;
  if (Math.random() < 0.002) {
    ACTIVITY_DOG.current  = Math.random() < 0.5 ? 'chaseTail' : 'scratch';
    ACTIVITY_DOG.timer    = 0;
    ACTIVITY_DOG.phase    = 0;
    ACTIVITY_DOG.duration = 3 + Math.random() * 2;
  }
}

// ================================================================
//  ZZZ SLEEP INDICATOR
//  A floating "Zzz" sprite parented to each character's head bone.
//  Created lazily on first use, toggled by sleep state each frame.
//  Gentle vertical float + alpha pulse so it reads on any background.
// ================================================================
function _makeZzzSprite() {
  const canvas = document.createElement('canvas');
  canvas.width  = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font         = 'bold 58px sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle  = 'rgba(30,20,60,0.55)';
  ctx.lineWidth    = 5;
  ctx.strokeText('Zzz', 64, 64);
  ctx.fillStyle = 'rgba(220,210,255,0.95)';
  ctx.fillText('Zzz', 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.28, 0.28, 1);
  sprite.visible = false;
  sprite.renderOrder = 999;
  return sprite;
}

// Per-character ZZZ state
const _zzz = {
  miss: { sprite: null, headBone: null, attached: false, t: 0 },
  lora: { sprite: null, headBone: null, attached: false, t: 0 },
  dog:  { sprite: null, headBone: null, attached: false, t: 0 },
};

// headOffsetY: how far above the head bone origin the sprite floats
// (dogs sit lower so their head bone is closer to the floor)
const _ZZZ_BASE_Y = { miss: 0.38, lora: 0.38, dog: 0.22 };

function _updateZzzFor(key, headBone, asleep, delta) {
  const z = _zzz[key];
  if (!headBone) return;

  // Lazy create
  if (!z.sprite) z.sprite = _makeZzzSprite();

  // Lazy attach to head bone so it follows automatically
  if (!z.attached || z.headBone !== headBone) {
    if (z.headBone && z.sprite.parent === z.headBone) z.headBone.remove(z.sprite);
    headBone.add(z.sprite);
    z.sprite.position.set(0.12, _ZZZ_BASE_Y[key], 0.05);
    z.headBone  = headBone;
    z.attached  = true;
  }

  if (!asleep) {
    z.sprite.visible = false;
    z.t = 0;
    return;
  }

  z.sprite.visible = true;
  z.t += delta;

  // Gentle float — small sine bob on top of base offset
  const bob   = Math.sin(z.t * 0.9) * 0.025;
  z.sprite.position.y = _ZZZ_BASE_Y[key] + bob;

  // Slow alpha pulse (0.55 → 1.0)
  z.sprite.material.opacity = 0.55 + Math.abs(Math.sin(z.t * 0.6)) * 0.45;
}

// ── Room light pulse ─────────────────────────────────────────────
let _roomTime = 0;
function animateRoomLights(delta) {
  _roomTime += delta;
  if (monitorGlowLight && ACTIVITY.current !== 'monitor')
    monitorGlowLight.intensity = 0.6 + Math.sin(_roomTime * 0.12) * 0.08;
}

// ================================================================
//  OUTFIT SYSTEM
// ================================================================
// ================================================================
//  OUTFIT SYSTEM — DUAL CHARACTER
//  Both Miss OG Tinz and Lora change outfits when moving between
//  rooms. They always pick DIFFERENT outfits from the same pool.
//
//  Each outfit key has a `miss` block (Miss OG Tinz colours) and
//  a `lora` block (Lora colours) — same vibe, distinct palette.
// ================================================================
// Keys are NODE names (Three.js obj.name): Top, Bottom, Shoe_R, Shoe_L
const OUTFITS = {
  streaming: {
    label: 'Streaming Look',
    miss: { Top: { color: 0xff69b4, emissive: 0x330011, emissiveIntensity: 0.1  }, Bottom: { color: 0xff1493, emissive: 0x330011, emissiveIntensity: 0.1  }, Shoe_R: { color: 0x222222, emissive: 0x000000, emissiveIntensity: 0 }, Shoe_L: { color: 0x222222, emissive: 0x000000, emissiveIntensity: 0 } },
    lora: { Top: { color: 0x9b59b6, emissive: 0x200030, emissiveIntensity: 0.12 }, Bottom: { color: 0x6c3483, emissive: 0x180028, emissiveIntensity: 0.1  }, Shoe_R: { color: 0xf5f5dc, emissive: 0x111100, emissiveIntensity: 0.04 }, Shoe_L: { color: 0xf5f5dc, emissive: 0x111100, emissiveIntensity: 0.04 } },
  },
  loungewear: {
    label: 'Loungewear',
    miss: { Top: { color: 0x8b4513, emissive: 0x1a0a00, emissiveIntensity: 0.05 }, Bottom: { color: 0x6b3410, emissive: 0x1a0a00, emissiveIntensity: 0.05 }, Shoe_R: { color: 0x5c3317, emissive: 0x000000, emissiveIntensity: 0 }, Shoe_L: { color: 0x5c3317, emissive: 0x000000, emissiveIntensity: 0 } },
    lora: { Top: { color: 0x2c3e50, emissive: 0x050a10, emissiveIntensity: 0.05 }, Bottom: { color: 0x1a252f, emissive: 0x050a10, emissiveIntensity: 0.05 }, Shoe_R: { color: 0x7f8c8d, emissive: 0x000000, emissiveIntensity: 0 }, Shoe_L: { color: 0x7f8c8d, emissive: 0x000000, emissiveIntensity: 0 } },
  },
  streetwear: {
    label: 'Streetwear',
    miss: { Top: { color: 0x111111, emissive: 0x000000, emissiveIntensity: 0    }, Bottom: { color: 0x1a1a2e, emissive: 0x000022, emissiveIntensity: 0.08 }, Shoe_R: { color: 0xffffff, emissive: 0x111111, emissiveIntensity: 0.05 }, Shoe_L: { color: 0xffffff, emissive: 0x111111, emissiveIntensity: 0.05 } },
    lora: { Top: { color: 0x1a5276, emissive: 0x001020, emissiveIntensity: 0.08 }, Bottom: { color: 0x0d0d0d, emissive: 0x000000, emissiveIntensity: 0    }, Shoe_R: { color: 0xe8daef, emissive: 0x0a0010, emissiveIntensity: 0.04 }, Shoe_L: { color: 0xe8daef, emissive: 0x0a0010, emissiveIntensity: 0.04 } },
  },
  pyjamas: {
    label: 'Pyjamas',
    miss: { Top: { color: 0x6a0dad, emissive: 0x200020, emissiveIntensity: 0.06 }, Bottom: { color: 0x7b1fa2, emissive: 0x200020, emissiveIntensity: 0.06 }, Shoe_R: { color: 0x9c4dcc, emissive: 0x100010, emissiveIntensity: 0.04 }, Shoe_L: { color: 0x9c4dcc, emissive: 0x100010, emissiveIntensity: 0.04 } },
    lora: { Top: { color: 0x117a65, emissive: 0x001a10, emissiveIntensity: 0.06 }, Bottom: { color: 0x0e6655, emissive: 0x001a10, emissiveIntensity: 0.06 }, Shoe_R: { color: 0x48c9b0, emissive: 0x001510, emissiveIntensity: 0.04 }, Shoe_L: { color: 0x48c9b0, emissive: 0x001510, emissiveIntensity: 0.04 } },
  },
  afrobeats: {
    label: 'Afrobeats Night',
    miss: { Top: { color: 0xFFB830, emissive: 0x331a00, emissiveIntensity: 0.15 }, Bottom: { color: 0xff6600, emissive: 0x331100, emissiveIntensity: 0.12 }, Shoe_R: { color: 0xFFB830, emissive: 0x221100, emissiveIntensity: 0.1  }, Shoe_L: { color: 0xFFB830, emissive: 0x221100, emissiveIntensity: 0.1  } },
    lora: { Top: { color: 0xe74c3c, emissive: 0x2d0000, emissiveIntensity: 0.15 }, Bottom: { color: 0x922b21, emissive: 0x1a0000, emissiveIntensity: 0.12 }, Shoe_R: { color: 0xf1948a, emissive: 0x200000, emissiveIntensity: 0.08 }, Shoe_L: { color: 0xf1948a, emissive: 0x200000, emissiveIntensity: 0.08 } },
  },
  nightout: {
    label: 'Night Out',
    // Miss keeps her streaming look when this fires — nightout is Lora's moment
    miss: { Top: { color: 0xff69b4, emissive: 0x330011, emissiveIntensity: 0.1  }, Bottom: { color: 0xff1493, emissive: 0x330011, emissiveIntensity: 0.1  }, Shoe_R: { color: 0x222222, emissive: 0x000000, emissiveIntensity: 0 }, Shoe_L: { color: 0x222222, emissive: 0x000000, emissiveIntensity: 0 } },
    // Lora: deep cobalt blue top, sleek black trousers, metallic silver shoes
    lora: { Top: { color: 0x1a237e, emissive: 0x000520, emissiveIntensity: 0.18 }, Bottom: { color: 0x0d0d0d, emissive: 0x000000, emissiveIntensity: 0    }, Shoe_R: { color: 0xc0c0c0, emissive: 0x111118, emissiveIntensity: 0.12 }, Shoe_L: { color: 0xc0c0c0, emissive: 0x111118, emissiveIntensity: 0.12 } },
  },
};
const OUTFIT_CONTEXT = {
  bedroom:       ['pyjamas','loungewear'],
  bathroom:      ['pyjamas','loungewear'],
  'living-room': ['loungewear','streetwear','afrobeats','nightout'],
  kitchen:       ['loungewear','pyjamas'],
  studio:        ['streaming','afrobeats','streetwear','nightout'],
};
let _currentOutfit     = 'streaming';
let _currentOutfitLora = 'nightout'; // Lora debuts in her Night Out look
let _lastOutfitRoom    = null;

// Apply a named outfit to a single VRM using its `miss` or `lora` colour block
function _applyOutfitToVrm(vrmObj, outfitName, slot) {
  if (!vrmObj || !OUTFITS[outfitName]) return;
  const colours = OUTFITS[outfitName][slot];
  if (!colours) return;
  vrmObj.scene.traverse(obj => {
    if (!obj.isMesh) return;
    const def = colours[obj.name]; if (!def) return;
    const m = obj.material; if (!m) return;
    m.color.setHex(def.color);
    m.emissive.setHex(def.emissive);
    m.emissiveIntensity = def.emissiveIntensity;
    m.needsUpdate = true;
  });
}

function applyOutfit(outfitName) {
  const vrm = _vrm();
  if (!vrm || !OUTFITS[outfitName]) return;
  _currentOutfit = outfitName;
  _applyOutfitToVrm(vrm, outfitName, 'miss');
  console.log(`[Outfit] Miss → ${OUTFITS[outfitName].label}`);
}

function applyOutfitLora(outfitName) {
  // Import lazily to avoid circular dep — getVrmLora is exported from engine-scene
  import('./engine-scene.js').then(({ getVrmLora }) => {
    const lora = getVrmLora();
    if (!lora || !OUTFITS[outfitName]) return;
    _currentOutfitLora = outfitName;
    _applyOutfitToVrm(lora, outfitName, 'lora');
    console.log(`[Outfit] Lora → ${OUTFITS[outfitName].label}`);
  });
}

function maybeChangeOutfit(roomName) {
  if (roomName === _lastOutfitRoom) return;
  _lastOutfitRoom = roomName;
  const options = OUTFIT_CONTEXT[roomName];
  if (!options || Math.random() > 0.4) return;

  // Pick Miss's outfit
  const missOptions = options.filter(o => o !== _currentOutfit);
  const missPick    = missOptions.length
    ? missOptions[Math.floor(Math.random() * missOptions.length)]
    : options[0];

  // Pick Lora's outfit — guaranteed different from Miss's pick
  const loraOptions = options.filter(o => o !== missPick && o !== _currentOutfitLora);
  const loraPick    = loraOptions.length
    ? loraOptions[Math.floor(Math.random() * loraOptions.length)]
    : options.find(o => o !== missPick) || missPick; // last resort: same vibe, different colours

  setTimeout(() => {
    applyOutfit(missPick);
    applyOutfitLora(loraPick);
  }, 1500);
}

// ── Thought bubbles ──────────────────────────────────────────────
const THOUGHT_BUBBLES = {
  'living-room': [
    "*stares at the TV* wait did they just—",
    "ugh why is this rug never straight",
    "I need to water that plant. I keep forgetting.",
    "...is that a mark on the sofa?? when did that happen",
    "my phone is at 12% and the charger is allll the way over there",
    "I wonder if chat is watching me right now lol",
    "okay one more episode and then I'm being productive",
    "Lora said she'd be right back ten minutes ago... 👀",
  ],
  kitchen: [
    "this pot is NOT going to stir itself",
    "abeg who used the last of the palm oil and didn't replace it",
    "I should call my mum. I've been saying that for three days.",
    "*sniffs* okay something smells amazing though",
    "plantain is ready. plantain is ALWAYS ready in this house.",
    "Lora keeps eating my snacks and I keep letting her get away with it",
  ],
  bedroom: [
    "okay but this outfit is actually giving",
    "I have too many pillows and I refuse to apologise",
    "the diffuser is doing its thing, I'm at peace",
    "*checks mirror* yeah we're going out tonight",
    "need to tell Lora what we're wearing before she steals my look again",
  ],
  studio: [
    "chat is so quiet rn... hello?? is anyone there??",
    "okay what should I talk about next",
    "the ring light is giving me a headache ngl",
    "okay one of these monitors has been flickering. noted.",
    "Lora always knows what to say when I'm blanking on stream lol",
  ],
};
let _thoughtTimer    = 0;
let _thoughtInterval = 45 + Math.random() * 60;

const LORA_THOUGHTS = {
  'living-room': [
    "omg this sofa is so comfy I might never leave",
    "Miss keeps flipping channels... just pick something babes",
    "*squints at TV* wait is that the same rerun from last week??",
    "I should text back. I will. In a minute.",
    "the lighting in this room is actually really nice though",
    "Lora.exe is running. barely.",
  ],
  kitchen: [
    "I'm hungry but I don't want to cook. classic.",
    "*stares at fridge* nothing. again.",
    "Miss's seasoning game is not a joke, I'll give her that",
    "if I make tea will Miss want some too... probably yes",
    "abeg this kitchen smells amazing rn",
  ],
  bedroom: [
    "okay I need to redecorate. not today but... soon.",
    "whose perfume is that? oh wait, it's mine. nice.",
    "I've been meaning to sort this wardrobe for like three weeks",
    "*checks phone* no new messages. just as I suspected.",
    "Miss has better shoes than me and I refuse to accept it",
  ],
  studio: [
    "chat is so unserious right now lol",
    "okay what should I say next...",
    "I need to start my own stream. I'm just saying.",
    "Miss always knows what to talk about. annoying.",
    "the ring light is making me look amazing ngl",
  ],
};
let _loraThoughtTimer    = 55 + Math.random() * 45;  // offset from Miss
let _loraThoughtInterval = 50 + Math.random() * 70;

function maybeShowThought(delta) {
  if (_isSpeaking) { _thoughtTimer = 0; return; }
  _thoughtTimer += delta;
  if (_thoughtTimer < _thoughtInterval) return;
  _thoughtTimer    = 0;
  _thoughtInterval = 45 + Math.random() * 60;
  const pool    = THOUGHT_BUBBLES[_currentRoom] || THOUGHT_BUBBLES['studio'];
  const thought = pool[Math.floor(Math.random() * pool.length)];
  showBubble(thought, 'Miss OG Tinz', 4000);
}

function _maybeShowLoraThought(delta) {
  if (window._loraIsSpeaking || _isSpeaking) return;
  _loraThoughtTimer -= delta;
  if (_loraThoughtTimer > 0) return;
  _loraThoughtTimer    = _loraThoughtInterval;
  _loraThoughtInterval = 50 + Math.random() * 70;
  const pool    = LORA_THOUGHTS[_loraCurrentRoom] || LORA_THOUGHTS['studio'];
  const thought = pool[Math.floor(Math.random() * pool.length)];
  showBubble(thought, 'Lora', 3500);
}

// ── Audio unlock ─────────────────────────────────────────────────
let _audioUnlocked = false;
let _sharedAudioCtx = null;

function _unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  try {
    _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = _sharedAudioCtx.createBuffer(1, 1, 22050);
    const src = _sharedAudioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_sharedAudioCtx.destination);
    src.start(0);
    _sharedAudioCtx.resume();
  } catch(e) {}
  try { window.speechSynthesis.cancel(); } catch(e) {}
  // Start background music now that audio is unlocked
  startMusic();
}
document.addEventListener('click',      _unlockAudio, { once: true });
document.addEventListener('keydown',    _unlockAudio, { once: true });
document.addEventListener('touchstart', _unlockAudio, { once: true });

// ── Voice list — loaded once, refreshed on change ─────────────────
let _voices = [];
function _loadVoices() { _voices = window.speechSynthesis.getVoices(); }
_loadVoices();
window.speechSynthesis.onvoiceschanged = _loadVoices;

function _pickVoice() {
  if (!_voices.length) _loadVoices();
  // Preference order: Nigerian → British female → any British → any English
  return _voices.find(v => v.name.includes('Ezinne'))
    || _voices.find(v => v.name.includes('Sonia'))
    || _voices.find(v => v.name.includes('Zira'))
    || _voices.find(v => v.name.includes('Hazel'))
    || _voices.find(v => v.name.includes('Libby'))
    || _voices.find(v => v.lang === 'en-GB')
    || _voices.find(v => v.lang === 'en-NG')
    || _voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
    || _voices.find(v => v.lang.startsWith('en'))
    || _voices[0]
    || null;
}

// ── Mood detection — infer emotion from text keywords ────────────
// Used for proactive messages and Lora reactions (no backend mood field here)
function detectMood(text) {
  const t = text.toLowerCase();
  if (/laugh|lol|haha|funny|hilarious|joke|😂|💀|dead|screaming/.test(t))    return 'happy';
  if (/omg|wait|what|no way|seriously|really\?|ehn\?|omo|shocked|wow/.test(t)) return 'surprised';
  if (/ugh|annoyed|frustrated|tired|abeg|why|stress|headache/.test(t))         return 'angry';
  if (/miss|alone|quiet|sad|wish|feel|lonely|forgot/.test(t))                  return 'sad';
  if (/yes|love|amazing|beautiful|cute|happy|excited|yay|let's go|fire|🔥/.test(t)) return 'happy';
  return 'neutral';
}

// ── Miss reaction — makes Miss respond when Lora speaks ──────────
let _missReactionTimer = null;
function _triggerMissReaction(mood) {
  const vrm = _vrm();
  if (!vrm || _isSpeaking || walk.active) return;
  // Turn Miss slightly toward Lora
  _targetFacing = Math.PI * 0.85;
  setExpression(mood === 'laugh' ? 'happy' : mood === 'react' ? 'surprised' : 'happy');
  clearTimeout(_missReactionTimer);
  _missReactionTimer = setTimeout(() => {
    setExpression('neutral');
    _targetFacing = Math.PI;
  }, 5000);
}
window._triggerMissReaction = _triggerMissReaction;

// ── Lora reaction — makes Lora respond when Miss speaks ──────────
// Turns Lora toward Miss, changes her expression, does a subtle head nod
let _loraReactionTimer = null;
function _triggerLoraReaction(mood) {
  const lora = window.getVrmLora ? window.getVrmLora() : null;
  if (!lora) return;

  // Don't interrupt Lora if she's mid-walk
  if (window._loraWalking || _loraWalkingToSpot) return;

  // Turn Lora to face Miss (Miss faces ~Math.PI, Lora faces her back)
  if (window._loraSetFacing) {
    window._loraSetFacing(0); // face toward Miss's side of the space
  }

  // Set Lora's expression to match the mood Miss is feeling
  if (window._loraSetExpression) {
    window._loraSetExpression(mood);
  } else if (typeof setBSMr === 'function') {
    // Fallback: map mood to blendshapes directly
    setBSMr('O', 0); setBSMr('U', 0); setBSMr('I', 0);
    if (mood === 'happy' || mood === 'excited')   { setBSMr('Joy',  0.7); }
    if (mood === 'surprised')                     { setBSMr('Surprised', 0.6); }
    if (mood === 'sad')                           { setBSMr('Sad', 0.5); }
  }

  // Clear after Miss finishes speaking
  clearTimeout(_loraReactionTimer);
  _loraReactionTimer = setTimeout(() => {
    if (window._loraSetExpression) window._loraSetExpression('neutral');
  }, 6000);
}

// ── TTS + lip sync ───────────────────────────────────────────────
export let _isSpeaking = false;

export async function speak(text, mood = 'neutral') {
  // Resume shared AudioContext if it exists — never create here
  if (_sharedAudioCtx && _sharedAudioCtx.state === 'suspended') {
    _sharedAudioCtx.resume().catch(() => {});
  }
  window.speechSynthesis.cancel();

  _isSpeaking = true;
  setExpression(mood);
  setStageLight('speak', text.length * 65 + 2000);
  runLipSync(text);

  // ── Lora reacts to Miss speaking ────────────────────────────────
  // Small delay so Lora's reaction starts just after Miss opens her mouth
  setTimeout(() => _triggerLoraReaction(mood), 300);

  await new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(text);
    const voice = _pickVoice();
    if (voice) utter.voice = voice;
    utter.rate   = 1.05;
    utter.pitch  = 1.1;
    utter.volume = 1.0;
    utter.onend   = resolve;
    utter.onerror = resolve;

    // Chromium bug: long utterances silently stall after ~15s.
    // Fix: watchdog timer that cancels + resolves if she goes quiet too long.
    const watchdog = setTimeout(() => {
      window.speechSynthesis.cancel();
      resolve();
    }, Math.max(15000, text.length * 80));

    const _origResolve = resolve;
    utter.onend = () => { clearTimeout(watchdog); _origResolve(); };
    utter.onerror = () => { clearTimeout(watchdog); _origResolve(); };

    window.speechSynthesis.speak(utter);
  });

  stopLipSync();
  setExpression('neutral');
  _isSpeaking = false;
  deadAir.reset(); // TTS finished — restart silence clock
}

// ── Topic box ────────────────────────────────────────────────────
function updateTopicBox(data) {
  const topicBox     = _el('topic-box');
  const topicTitleEl = _el('topic-title-text');
  const topicSourceEl= _el('topic-source-tag');
  if (!topicBox || !topicTitleEl || !topicSourceEl) return;
  if (!data.active) { topicBox.classList.remove('visible'); lastTopicTitle = null; return; }
  const isNew = data.title !== lastTopicTitle;
  topicTitleEl.textContent  = data.title  || '';
  topicSourceEl.textContent = data.source || '';
  topicBox.classList.add('visible');
  if (isNew) {
    lastTopicTitle = data.title;
    topicBox.classList.remove('new-topic');
    void topicBox.offsetWidth;
    topicBox.classList.add('new-topic');
    setTimeout(() => topicBox.classList.remove('new-topic'), 900);
  }
}

export function startTopicPolling() {
  async function poll() {
    try { const res = await fetch(TOPIC_URL); const data = await res.json(); updateTopicBox(data); } catch (_) {}
  }
  poll();
  setInterval(poll, 6000);
}

// ── Dead air trigger ─────────────────────────────────────────────
// Only ONE call ever in-flight. Backs off after 429s / errors.

// Weighted proactive message types — micro fires most often
const PROACTIVE_TYPES = ['micro', 'micro', 'micro', 'question', 'question', 'story', 'observation'];

function _pickProactiveType() {
  return PROACTIVE_TYPES[Math.floor(Math.random() * PROACTIVE_TYPES.length)];
}

// Conversation memory — last 8 topics, prevents repetition
const recentTopics = [];

function _rememberTopic(topic) {
  if (!topic) return;
  recentTopics.push({ topic, at: Date.now() });
  if (recentTopics.length > 8) recentTopics.shift();
}

// Non-verbal action chance (35%) — phone check, stretch, window look, etc.
const NON_VERBAL_CHANCE = 0.35;

async function _triggerProactive() {
  if (_deadAirBusy || _isSpeaking || shouldSkipBackgroundCall()) {
    deadAir._arm(); // re-arm and wait longer
    return;
  }

  // ── Human micro-pause before reacting (1–4 s) ──────────────────
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 3000));

  // ── Non-verbal action (35% chance) — no dialogue needed ─────────
  if (Math.random() < NON_VERBAL_CHANCE) {
    const actions = ['stretch', 'phoneScroll', 'windowLook', 'hairflick', 'dance'];
    ACTIVITY.current = actions[Math.floor(Math.random() * actions.length)];
    deadAir.reset();
    return;
  }

  _deadAirBusy = true;

  try {
    const res = await fetch(PROACTIVE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        current_room: _currentRoom,
        type:         _pickProactiveType(),
        recentTopics: recentTopics.map(r => r.topic),
      }),
    });

    if (res.status === 429) {
      _deadAirBackoff = 5 * 60_000; // back off 5 min
      console.warn('[DeadAir] 429 — backing off 5 min');
      _deadAirBusy = false;
      deadAir._arm();
      return;
    }

    if (!res.ok) throw new Error('status ' + res.status);

    const data = await res.json();
    const text = data?.response || '';
    if (text && !_isSpeaking) {
      _deadAirBackoff = 0;
      _rememberTopic(data?.topic || text.slice(0, 60));
      const proactiveMood = data?.mood || detectMood(text);
      setCamMode('SPEAK');
      showBubble(text, 'Miss OG Tinz');
      setStatus('Live ✦', 'ready');
      doGesture('talk', text.length * 65);
      await speak(text, proactiveMood);
      setCamMode('IDLE');
    }
  } catch(err) {
    console.warn('[DeadAir] fetch error:', err.message);
    _deadAirBackoff = Math.min((_deadAirBackoff || 0) + 60_000, 10 * 60_000);
  }

  _deadAirBusy = false;
  if (_deadAirActive) deadAir._arm();
}

export function _initDeadAir() {
  deadAir.start();
}

// ── Twitch chat ──────────────────────────────────────────────────
// Uses anonymous IRC over WebSocket — works in OBS browser source
// without needing tmi.js or auth tokens. Pure WebSocket connection
// to irc-ws.chat.twitch.tv which OBS allows through its security model.
const _seenViewers = new Set();
let _twitchWs      = null;
let _twitchReconTimer = null;

export function initTwitchChat() {
  _connectTwitchIRC(1);
}

function _connectTwitchIRC(attempt = 1) {
  if (_twitchWs) { try { _twitchWs.close(); } catch(_) {} }
  clearTimeout(_twitchReconTimer);

  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  _twitchWs = ws;

  ws.onopen = () => {
    // Anonymous login — no oauth needed for read-only
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    ws.send('PASS oauth:justinfan' + Math.floor(Math.random() * 90000 + 10000));
    ws.send('NICK justinfan' + Math.floor(Math.random() * 90000 + 10000));
    ws.send(`JOIN #${TWITCH_CHANNEL.toLowerCase()}`);
    console.log(`[Twitch IRC] Connected → #${TWITCH_CHANNEL}`);
    setStatus('Live ✦', 'ready');
  };

  ws.onmessage = (event) => {
    const raw = event.data;

    // Keep-alive PING → PONG
    if (raw.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); return; }

    // Parse PRIVMSG (chat messages)
    if (raw.includes('PRIVMSG')) {
      const tagStr    = raw.startsWith('@') ? raw.slice(1, raw.indexOf(' ')) : '';
      const tags      = _parseTags(tagStr);
      const username  = tags['display-name'] || tags['login'] ||
                        (raw.match(/:([^!]+)!/) || [])[1] || 'Someone';
      const msgMatch  = raw.match(/PRIVMSG #\S+ :(.+)/);
      const message   = msgMatch ? msgMatch[1].trim() : '';
      if (!message) return;

      const isNew = !_seenViewers.has(username.toLowerCase());
      if (isNew) _seenViewers.add(username.toLowerCase());
      const prefixed = isNew ? `[NEW VIEWER] ${username}: ${message}` : message;

      // ── DOG TRIGGER: any chat activity resets his "alone" timer ────
      _dogLastChatAt = Date.now();

      // ── DOG TRIGGER: brand new viewer → bark, then look at camera ──
      if (isNew && window.getVrmDog?.() && !_dogWalkingToSpot && !isDogAsleep()) {
        ACTIVITY_DOG.current  = 'bark';
        ACTIVITY_DOG.timer    = 0;
        ACTIVITY_DOG.phase    = 0;
        ACTIVITY_DOG.duration = 1.4;
        setTimeout(() => {
          if (ACTIVITY_DOG.current === 'bark') {
            ACTIVITY_DOG.current  = 'lookAtCamera';
            ACTIVITY_DOG.timer    = 0;
            ACTIVITY_DOG.duration = 2.5;
          }
        }, 1400);
      }

      // ── !cook command — hand off to kitchen-behaviour.js ─────
      if (message.trim().toLowerCase().startsWith('!cook')) {
        if (window._handleCookCommand) {
          window._handleCookCommand(message.trim());
        }
        deadAir?.reset();
        return;
      }

      // ── DOG TRIGGER: a chat message makes him happy (tail-wag
      // substitute — see ACTIVITY_DOG 'happyWiggle' in engine-dog.js) ──
      if (window.getVrmDog?.() && !_dogWalkingToSpot && !isDogAsleep() && ACTIVITY_DOG.current !== 'bark') {
        ACTIVITY_DOG.current  = 'happyWiggle';
        ACTIVITY_DOG.timer    = 0;
        ACTIVITY_DOG.phase    = 0;
        ACTIVITY_DOG.duration = 2.2;
      }

      queueTwitchMessage(username, prefixed);
      deadAir?.reset();
    }

    // USERNOTICE — subs, resubs, raids, gifts
    if (raw.includes('USERNOTICE')) {
      const tagStr = raw.startsWith('@') ? raw.slice(1, raw.indexOf(' ')) : '';
      const tags   = _parseTags(tagStr);
      const type   = tags['msg-id'];
      const name   = tags['display-name'] || tags['login'] || 'Someone';

      if (type === 'sub' || type === 'subgift') {
        setStageLight('sub', 6000); triggerSubCelebration();
        queueTwitchMessage('StreamEvent', `${name} just subscribed! Omo thank you so much! Welcome to the family!`);
      } else if (type === 'resub') {
        const months = tags['msg-param-cumulative-months'] || '?';
        setStageLight('sub', 5000); triggerResubHype();
        queueTwitchMessage('StreamEvent', `${name} has been here for ${months} months! ${Number(months) >= 6 ? 'A real OG!' : 'Thank you!'} We see you!`);
      } else if (type === 'raid') {
        const viewers = tags['msg-param-viewerCount'] || '?';
        setStageLight('raid', 8000); triggerRaidDance();
        queueTwitchMessage('StreamEvent', `We are being raided by ${name} with ${viewers} viewers! Welcome welcome welcome! Come in, come in!`);
      } else if (type === 'subgift') {
        const recipient = tags['msg-param-recipient-display-name'] || 'someone';
        setStageLight('sub', 4000); triggerGiftPop();
        queueTwitchMessage('StreamEvent', `${name} just gifted a sub to ${recipient}! Omo that is so generous! Big love!`);
      }
    }
  };

  ws.onerror = (e) => console.warn('[Twitch IRC] WebSocket error:', e);

  ws.onclose = () => {
    console.warn(`[Twitch IRC] Disconnected — reconnecting in ${attempt * 5}s`);
    _twitchReconTimer = setTimeout(
      () => _connectTwitchIRC(Math.min(attempt + 1, 10)),
      attempt * 5000
    );
  };
}

// Parse IRC tag string into key/value object
function _parseTags(tagStr) {
  const out = {};
  if (!tagStr) return out;
  for (const part of tagStr.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

// ── Message queue ────────────────────────────────────────────────
let _msgQueue = [];
let _msgBusy  = false;
let _twitchResponseActive = false;

// Spam patterns — she won't waste tokens on these
const _spamPatterns = [
  /^(lol|lmao|lmfao|haha|hehe|xd|😂|💀|🔥|👀|😭|❤️|🫶|gg|ggs|w|l|f|oof|rip|omg|wow|yep|nope|yes|no|ok|okay|k|hi|hey|hello|ayo|yo|sup|np|ily|ty|thx|thanks|pog|poggers|kappa|5head|pepehands|lulw|monkas)\s*[!?.]*$/i,
  /^(.)\1{4,}$/, // "aaaaa" / "!!!!!!!"
];

function _isSpam(message) {
  const clean = message.trim();
  if (clean.split(/\s+/).length < 4 && !clean.includes('?')) return true;
  return _spamPatterns.some(p => p.test(clean));
}

function queueTwitchMessage(username, message) {
  if (_isSpam(message)) return;
  _msgQueue.push({ username, message });
  if (_msgQueue.length > 5) _msgQueue.shift();
  if (!_msgBusy) processNextMessage();
}

function _findPhoneScrollSpot() {
  const phoneSpots = Object.entries(HOUSE).flatMap(([roomKey, roomDef]) =>
    (roomDef?.spots || [])
      .filter(spot => spot.activities?.includes('phoneScroll'))
      .filter(spot => ACTIVITY_RULES.phoneScroll.includes(spot.label))
      .filter(spot => spot.yOffset === undefined || !occupiedSpots.has(spot.label))
      .map(spot => ({ ...spot, room: roomKey }))
  );

  return phoneSpots.sort((a, b) => {
    const distanceA = Math.hypot(a.x - vrmPos.x, a.z - vrmPos.z);
    const distanceB = Math.hypot(b.x - vrmPos.x, b.z - vrmPos.z);
    return distanceA - distanceB;
  })[0] || null;
}

function _waitUntil(predicate, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for activity transition'));
      }
    }, 50);
  });
}

export async function respondToTwitchMessage(message, displayName = 'Viewer') {
  console.log('[Twitch] Message received');

  const previousActivity = ACTIVITY.current;
  const previousSpot = _currentSpot ? { ..._currentSpot } : null;
  _twitchResponseActive = true;
  _apiOverride = true;
  _apiOverrideTimer = API_OVERRIDE_DURATION;

  try {
    const phoneSpot = _findPhoneScrollSpot();
    if (!phoneSpot) throw new Error('No available phoneScroll spot');

    console.log('[Twitch] Walking to phone');
    goToSpot({ ...phoneSpot, activities: ['phoneScroll'] });
    const activePhoneSpot = _currentSpot;
    await _waitUntil(() =>
      !walk.active &&
      ACTIVITY.current === 'phoneScroll' &&
      _currentSpot === activePhoneSpot
    );

    console.log('[Twitch] Replying');
    await sendMessage(message, displayName);
  } catch (error) {
    console.warn('[Twitch] Phone response workflow failed:', error);
  } finally {
    console.log('[Twitch] Returning to normal behaviour');

    if (previousSpot) {
      goToSpot({ ...previousSpot, activities: [previousActivity] });
      const returnSpot = _currentSpot;
      try {
        await _waitUntil(() =>
          !walk.active &&
          ACTIVITY.current === previousActivity &&
          _currentSpot === returnSpot
        );
      } catch (error) {
        console.warn('[Twitch] Could not restore previous spot:', error);
      }
    }

    _apiOverride = false;
    _apiOverrideTimer = 0;
    _twitchResponseActive = false;
    _lifeTimer = 0;
  }
}

async function processNextMessage() {
  if (_msgQueue.length === 0) { _msgBusy = false; return; }
  _msgBusy = true;
  const { username, message } = _msgQueue.shift();
  await respondToTwitchMessage(message, username);
  setTimeout(processNextMessage, 15000);
}

// ── API call ─────────────────────────────────────────────────────
const chatHistory = [];

async function sendMessage(message, displayName = 'Viewer') {
  if (!message.trim()) return;
  const sendBtn = _el('send-btn');
  deadAir?.reset();
  setStatus('Thinking...', 'thinking');
  // Only disable the send button if it exists (not in Streamlabs browser source)
  if (sendBtn) sendBtn.disabled = true;
  _apiOverride      = true;
  _apiOverrideTimer = API_OVERRIDE_DURATION;
  _targetFacing     = Math.PI;
  setCamMode('THINK');
  doGesture('think', 4000);
  chatHistory.push({ role: 'user', content: message });

  try {
    const roomChanged   = VISION._lastRoomSent !== _currentRoom;
    let   sceneSnapshot = null;
    if (VISION.shouldCapture(message, roomChanged)) {
      sceneSnapshot = VISION.capture();
      if (sceneSnapshot) VISION.markSent(_currentRoom);
    }

    const body = {
      user_id:      USER_ID,
      message,
      display_name: displayName,
      history:      chatHistory.slice(-6),
      system_hint:  'Reply in 1-2 SHORT punchy sentences max. You are a live streamer — keep it quick, witty and real.',
      current_room: _currentRoom,
    };
    if (sceneSnapshot) {
      body.scene_image    = sceneSnapshot;
      body.vision_context = `This is a screenshot of Miss OG Tinz's live 3D avatar standing in her ${_currentRoom.replace('-', ' ')}. Use what you see to make your reply feel grounded and self-aware.`;
    }

    const res = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });

    if (res.status === 429) {
      let retryMs = 5000;
      try { const d = await res.json(); if (d?.retry_after_ms) retryMs = d.retry_after_ms; } catch(_) {}
      const fallback = `Hold on, I'm getting too many messages! Try again in ${Math.ceil(retryMs/1000)} seconds.`;
      showBubble(fallback, 'Miss OG Tinz'); await speak(fallback, 'neutral');
      setStatus('Ready ✦', 'ready'); setCamMode('IDLE');
      if (sendBtn) sendBtn.disabled = false;
      await new Promise(r => setTimeout(r, retryMs)); return;
    }
    if (!res.ok) throw new Error('API error ' + res.status);

    const data = await res.json();
    let reply = data.reply || "Ehn ehn, I heard you!";
    const sentences = reply.match(/[^.!?]+[.!?]+/g) || [reply];
    if (sentences.length > 2) reply = sentences.slice(0,2).join(' ').trim();
    const mood = data.viewer?.mood || 'neutral';

    if (data.location) moveToRoom(data.location);

    chatHistory.push({ role: 'assistant', content: reply });
    if (chatHistory.length > 20) chatHistory.splice(0,2);

    setCamMode('SPEAK');
    showBubble(reply, 'Miss OG Tinz');
    setStatus('Live ✦', 'ready');

    const moodGesture = { happy:'excited', excited:'excited', surprised:'excited', neutral:'talk', sad:'think', angry:'talk' };
    doGesture(moodGesture[mood] || 'talk', reply.length * 65);
    const moodLight = { happy:'speak', excited:'sub', sad:'chill', angry:'raid', neutral:'speak' };
    setStageLight(moodLight[mood] || 'speak', reply.length * 65 + 2000);

    await speak(reply, mood);
    setCamMode('IDLE');
    deadAir?.reset();

  } catch(err) {
    console.error(err);
    const fallback = "Oya wait, my brain is loading... try again!";
    showBubble(fallback, 'Miss OG Tinz');
    await speak(fallback, 'neutral');
    setStatus('Ready ✦', 'ready');
    setCamMode('IDLE');
  }
  if (sendBtn) sendBtn.disabled = false;
}

// ── UI helper functions (used inside initUI) ─────────────────────
function bindSlider(id, onChange) {
  const el  = document.getElementById(id);
  const val = document.getElementById(id + '-val');
  if (!el) return;
  el.addEventListener('input', () => { if (val) val.textContent = el.value; onChange(parseFloat(el.value)); });
}

// ── UI events ────────────────────────────────────────────────────
// Called from engine-scene._onBothLoaded() after avatars are loaded
// (by which point the DOM is guaranteed to exist).
export function initUI() {
  const sendBtn     = _el('send-btn');
  const chatInput   = _el('chat-input');
  const panelToggle = _el('panel-toggle');
  const controlPanel= _el('control-panel');

  if (sendBtn) sendBtn.addEventListener('click', () => {
    const msg = chatInput?.value.trim();
    if (!msg) return;
    if (chatInput) chatInput.value = '';
    sendMessage(msg, 'You');
  });
  if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn?.click(); });

  // ── Control panel ──────────────────────────────────────────────
  if (panelToggle) panelToggle.addEventListener('click', () => {
    const isOpen = !controlPanel.classList.contains('hidden');
    controlPanel.classList.toggle('hidden', isOpen);
    panelToggle.classList.toggle('open', !isOpen);
  });

  bindSlider('posX',  v => { const vrm = _vrm(); if (vrm) vrm.scene.position.x = v; });
  bindSlider('posY',  v => { const vrm = _vrm(); if (vrm) { vrm.scene.position.y = v; vrm._restPosY = v; } });
  bindSlider('posZ',  v => { const vrm = _vrm(); if (vrm) vrm.scene.position.z = v; });
  bindSlider('scale', v => { const vrm = _vrm(); if (vrm) vrm.scene.scale.set(v,v,v); });

  bindColour('col-skin',   ['Julie_Figure', 'Mr_OgTinz_Figure', 'Teargum']);
  bindColour('col-hair',   ['Hair_Block', 'Brow', 'Lashes']);
  bindColour('col-top',    ['Top']);
  bindColour('col-bottom', ['Bottom']);
  bindColour('col-gold',   ['Ear_Jewel', 'Necklece']);

  _el('btn-log')?.addEventListener('click', () => {
    const vrm = _vrm(); if (!vrm) return;
    const p = vrm.scene.position, s = vrm.scene.scale;
    console.log(`vrm pos (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})  scale ${s.x.toFixed(3)}`);
    console.log(`camera pos (${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)})`);
  });
  _el('btn-reset')?.addEventListener('click', () => location.reload());

  // ── Room buttons ────────────────────────────────────────────────
  (function initRoomButtons() {
    const panel = _el('control-panel');
    if (!panel) return;

    const sep = document.createElement('hr');
    sep.className = 'ctrl-sep';
    panel.appendChild(sep);

    const label = document.createElement('div');
    label.className = 'ctrl-label';
    label.textContent = 'Send to Room';
    panel.appendChild(label);

    const ROOMS = [
      { key: 'studio',        icon: '🎙', name: 'Studio'      },
      { key: 'living-room',   icon: '📺', name: 'Living Room' },
      { key: 'kitchen',       icon: '🍳', name: 'Kitchen'     },
      { key: 'dining',        icon: '🍽', name: 'Dining'      },
      { key: 'hallway',       icon: '🚪', name: 'Hallway'     },
      { key: 'bedroom',       icon: '🛏', name: 'Bedroom'     },
      { key: 'bathroom',      icon: '🚿', name: 'Bathroom'    },
    ];

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px;';
    ROOMS.forEach(({ key, icon, name }) => {
      const btn = document.createElement('button');
      btn.className = 'ctrl-btn';
      btn.textContent = `${icon} ${name}`;
      btn.style.fontSize = '11px';
      btn.addEventListener('click', () => {
        goToRoom(key);
        grid.querySelectorAll('button').forEach(b => b.style.outline = '');
        btn.style.outline = '2px solid #FFB830';
      });
      grid.appendChild(btn);
    });
    panel.appendChild(grid);

    // ── Activity buttons ──────────────────────────────────────────
    const sep2 = document.createElement('hr');
    sep2.className = 'ctrl-sep';
    panel.appendChild(sep2);

    const label2 = document.createElement('div');
    label2.className = 'ctrl-label';
    label2.textContent = 'Force Activity';
    panel.appendChild(label2);

    const actWrap = document.createElement('div');
    actWrap.id = 'act-btn-wrap';
    panel.appendChild(actWrap);

    const ACTIVITY_ICONS = {
      idle: '🧍', dance: '💃', stretch: '🤸', hairflick: '💁',
      hiponhip: '😏', phoneScroll: '📱', tvReact: '😲', sofaSit: '🛋',
      readBook: '📖', typing: '⌨️', monitor: '🖥', stirring: '🥄',
      chopping: '🔪', tasting: '😋', washingUp: '🧼', cabinetOpen: '🗄',
      mirrorPose: '🪞', noseCover: '🤭', windowLook: '🪟', fireGaze: '🔥',
      bedLie: '😴', bedLiePhone: '📱😴',
    };

    let _lastRenderedRoom = null;
    function refreshActivityButtons() {
      if (_currentRoom === _lastRenderedRoom) return;
      _lastRenderedRoom = _currentRoom;
      const pool = [...new Set(getFamiliarActivityPool(_currentRoom))];
      actWrap.innerHTML = '';
      const g = document.createElement('div');
      g.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;';
      pool.forEach(act => {
        const btn = document.createElement('button');
        btn.className = 'ctrl-btn';
        const icon = ACTIVITY_ICONS[act] || '▶';
        btn.textContent = `${icon} ${act}`;
        btn.style.fontSize = '10px';
        btn.addEventListener('click', () => {
          doActivity(act);
          g.querySelectorAll('button').forEach(b => b.style.outline = '');
          btn.style.outline = '2px solid #FFB830';
          setTimeout(() => btn.style.outline = '', 13000);
        });
        g.appendChild(btn);
      });
      actWrap.appendChild(g);
    }

    setInterval(refreshActivityButtons, 1000);
    refreshActivityButtons();
  })();
} // end initUI

function bindColour(id, meshNames) {
  const el = _el(id); if (!el) return;
  el.addEventListener('input', () => {
    const col = new THREE.Color(el.value);
    const targets = [_vrm(), window.getVrmLora ? window.getVrmLora() : null].filter(Boolean);
    for (const vrmObj of targets) {
      vrmObj.scene.traverse(obj => {
        if (!obj.isMesh || !meshNames.includes(obj.name)) return;
        const m = obj.material;
        if (!m) return;
        if (m.map) {
          obj.material = new THREE.MeshStandardMaterial({
            color: col, roughness: m.roughness ?? 0.5, metalness: m.metalness ?? 0,
            envMapIntensity: 0, side: THREE.FrontSide, depthWrite: true,
          });
        } else {
          m.color.set(col);
          if (m.emissive) m.emissive.set(col).multiplyScalar(0.12);
          m.needsUpdate = true;
        }
      });
    }
  });
}

// ── Public API ───────────────────────────────────────────────────
window.missOgTinz = {
  receive:        (username, message) => sendMessage(message, username),
  express:        setExpression,
  gesture:        doGesture,
  speak,
  showBubble,
  wave:           () => doGesture('wave', 2500),
  camMode:        setCamMode,
  stageLight:     setStageLight,
  pauseActivity:  () => { ACTIVITY.current = 'idle'; ACTIVITY.timer = 0; },
  resumeActivity: () => activityPickNext(),
  logPos: () => {
    const vrm = _vrm(); if (!vrm) return console.warn('VRM not loaded');
    console.log(`%c[Room Mapper] x: ${vrm.scene.position.x.toFixed(3)}, z: ${vrm.scene.position.z.toFixed(3)}, facingY: ${vrm.scene.rotation.y.toFixed(3)}`, 'color:#FFB830;font-weight:bold');
  },
  teleport: (x, z) => {
    const vrm = _vrm(); if (!vrm) return;
    vrmPos.x = x; vrmPos.z = z;
    vrm.scene.position.x = x; vrm.scene.position.z = z;
    console.log(`[Teleport] → (${x}, ${z})`);
  },
};

// ── Activity bridges for music/BFF engine ───────────────────────
Object.defineProperty(window, '_missCurrentActivity', { get: () => ACTIVITY.current,    configurable: true });
Object.defineProperty(window, '_loraCurrentActivity', { get: () => ACTIVITY_MR.current, configurable: true });
window._onActivityChanged = onActivityChanged;const _SLEEP_ACTS = new Set(['bedLie', 'bedLiePhone']);

function _updateSleepMode() {
  const missAsleep = _SLEEP_ACTS.has(ACTIVITY.current);
  const loraAsleep = _SLEEP_ACTS.has(ACTIVITY_MR.current);
  setSleepMode(missAsleep && loraAsleep);
}

window._setMissActivity = (actName, duration) => {
  ACTIVITY.current  = actName;
  ACTIVITY.timer    = 0;
  ACTIVITY.phase    = 0;
  if (duration) ACTIVITY.duration = duration;
  onActivityChanged(actName);
  _updateSleepMode();
  _trySharedActivity('miss', actName, _currentSpot);
};
window._setLoraActivity = (actName, duration) => {
  ACTIVITY_MR.current  = actName;
  ACTIVITY_MR.timer    = 0;
  ACTIVITY_MR.phase    = 0;
  if (duration) ACTIVITY_MR.duration = duration;
  _updateSleepMode();
  _trySharedActivity('lora', actName, _loraCurrentSpot);
};

// ── Kitchen system bridges ───────────────────────────────────────
// speakMr: Lora speaks with her own TTS voice (distinct from Miss).
// Used by kitchen-behaviour.js and engine-bff.js.
function _pickLoraVoice() {
  if (!_voices.length) _loadVoices();
  const missVoice = _pickVoice();
  // Prefer a different en-GB voice from Miss, or any en voice not used by Miss
  return _voices.find(v => v.name.includes('Libby') && v !== missVoice)
    || _voices.find(v => v.name.includes('Hazel') && v !== missVoice)
    || _voices.find(v => v.name.includes('Susan') && v !== missVoice)
    || _voices.find(v => v.lang === 'en-GB' && v !== missVoice)
    || _voices.find(v => v.lang.startsWith('en') && v !== missVoice)
    || missVoice;
}
window.speakMr = (text) => {
  if (!text) return;
  showBubble(text, 'Lora');
  // Skip if Miss is already speaking — don't clash
  if (_isSpeaking) return;
  try {
    const utter = new SpeechSynthesisUtterance(text);
    const voice = _pickLoraVoice();
    if (voice) utter.voice = voice;
    utter.rate   = 1.08;   // slightly quicker than Miss's 1.05
    utter.pitch  = 1.18;   // slightly higher than Miss's 1.1
    utter.volume = 1.0;
    window._loraIsSpeaking = true;
    const watchdog = setTimeout(() => {
      window.speechSynthesis.cancel();
      window._loraIsSpeaking = false;
    }, Math.max(12000, text.length * 75));
    utter.onend   = () => { clearTimeout(watchdog); window._loraIsSpeaking = false; };
    utter.onerror = () => { clearTimeout(watchdog); window._loraIsSpeaking = false; };
    window.speechSynthesis.speak(utter);
  } catch(e) { window._loraIsSpeaking = false; }
};

// Dead-air pause/resume — called by KitchenBehaviour.start() / stop()
// so the proactive timer doesn't fire mid-recipe.
window._pauseDeadAir  = () => deadAir.stop();
window._resumeDeadAir = () => { if (_deadAirActive) deadAir.start(); };
window._handleCookCommand = handleCookCommand;

// _sendTwitchMessage — lets kitchen-behaviour.js post status lines
// back into the Twitch chat queue as StreamEvent messages.
window._sendTwitchMessage = (msg) => {
  queueTwitchMessage('StreamEvent', msg);
};

// ================================================================
//  RENDER LOOP
// ================================================================
const clock    = new THREE.Clock();
let idleTime   = 0;
let blinkTimer = 0;
let nextBlink  = 3;
// ── Lora parallel timers ─────────────────────────────────────────
let loraIdleTime  = 0;
let loraBlinkTimer = 0;
let loraNextBlink  = 2.2 + Math.random() * 3; // offset from Miss so they don't blink in sync

// ── Randomised eye saccade state — Miss ──────────────────────────
let _missEyeTarget = { yaw: 0, pitch: -2 };
let _missEyeDwell  = 2 + Math.random() * 3;
// ── Randomised eye saccade state — Lora ──────────────────────────
let _loraEyeTarget = { yaw: 0, pitch: -2 };
let _loraEyeDwell  = 2.5 + Math.random() * 3;

// ── Y-offset lerp — smooth sit/lie transitions ───────────────────
let _missYOffsetTarget  = 0;
let _missYOffsetCurrent = 0;
let _loraYOffsetTarget  = 0;
let _loraYOffsetCurrent = 0;

// ── Lora micro-movement state ────────────────────────────────────
// Random head tilts, glances and weight shifts between responses.
// Each fires on a random timer so she never looks mechanical.
let _loraMicroTimer     = 3 + Math.random() * 5; // seconds until next micro-move
let _loraMicroActive    = false;                  // true while a micro-move is playing
let _loraMicroTime      = 0;                      // elapsed time in current micro-move
let _loraMicroDuration  = 0;
let _loraMicroType      = 0;                      // which micro-move is playing (0–4)

function _loraPickNextMicro() {
  _loraMicroTimer    = 4 + Math.random() * 7;
  _loraMicroActive   = false;
  _loraMicroTime     = 0;
}

function _updateLoraMicro(delta) {
  // Only fire when Lora is idle and not walking or speaking
  if (window._loraWalking || _loraWalkingToSpot || window._loraIsSpeaking) {
    _loraMicroTimer = 3 + Math.random() * 5; // reset so she doesn't burst on arrival
    return;
  }
  // Allow subtle head/shoulder micro-moves in non-walk activities; just smaller amplitude
  const _loraIsIdle = ACTIVITY_MR.current === 'idle';

  if (!_loraMicroActive) {
    _loraMicroTimer -= delta;
    if (_loraMicroTimer > 0) return;
    // Fire a new micro-move
    _loraMicroActive   = true;
    _loraMicroTime     = 0;
    _loraMicroDuration = 1.0 + Math.random() * 1.2;
    _loraMicroType     = Math.floor(Math.random() * 5);
  } else {
    _loraMicroTime += delta;
    if (_loraMicroTime >= _loraMicroDuration) { _loraPickNextMicro(); return; }

    const lora = window.getVrmLora ? window.getVrmLora() : null;
    if (!lora) return;

    const t  = _loraMicroTime / _loraMicroDuration;
    const p  = Math.sin(t * Math.PI); // smooth in-out envelope 0→1→0

    // Import Lora bones lazily via window bridge set by engine-bones
    const loraHead  = window._loraHead;
    const loraNeck  = window._loraNeck;
    const loraSpine = window._loraSpine;
    const loraHips  = window._loraHips;
    const loraRArmU = window._loraRUpperArm;
    const loraLArmU = window._loraLUpperArm;

    const _amp = _loraIsIdle ? 1.0 : 0.45; // smaller fidgets during active poses
    switch (_loraMicroType) {
      case 0: // Head tilt — curiosity
        if (loraHead) { loraHead.rotation.z += p * 0.12 * _amp; loraHead.rotation.x += p * 0.03 * _amp; }
        break;
      case 1: // Look-over — glances toward Miss
        if (loraHead) loraHead.rotation.y += p * 0.25 * _amp;
        if (loraNeck) loraNeck.rotation.y += p * 0.10 * _amp;
        break;
      case 2: // Weight shift — hip sway (only meaningful when idle/standing)
        if (_loraIsIdle) {
          if (loraHips)  loraHips.rotation.z  += p * 0.10;
          if (loraSpine) loraSpine.rotation.z  -= p * 0.06;
        }
        break;
      case 3: // Small shoulder roll — impatient / relaxed
        if (loraRArmU && _loraIsIdle) loraRArmU.rotation.y += p * 0.08;
        if (loraLArmU && _loraIsIdle) loraLArmU.rotation.y -= p * 0.08;
        if (loraSpine) loraSpine.rotation.y += p * 0.04 * _amp;
        break;
      case 4: // Head nod — she's engaged / listening
        const nod = Math.sin(t * Math.PI * 2.5) * 0.06 * _amp;
        if (loraHead) loraHead.rotation.x += nod;
        if (loraNeck) loraNeck.rotation.x += nod * 0.4;
        break;
    }
  }
}

function render() {
  const delta = clock.getDelta();

  animateRoomLights(delta);

  const vrm = _vrm();
  if (vrm) {
    idleTime   += delta;
    blinkTimer += delta;
    maybeShowThought(delta);

    // ── Activity system ────────────────────────────────────────
    if (!walk.active) activityUpdate(delta);
    hyperUpdate(delta);

    // ── Walk / life scheduler ──────────────────────────────────
    _updateAvatarAvoidance();
    _applyLoraAvoidancePause();
    updateWalk(delta);
    lifeUpdate();
    _loraLifeUpdate();
    _updateSocialAttention(delta);

    // ── Facing — smoothly rotate toward _targetFacing ─────────
    const cur  = vrm.scene.rotation.y;
    let   diff = _targetFacing - cur;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (walk.active) {
      vrm.scene.rotation.y += diff * Math.min(1, delta * 6.0);
    } else if (_lookBodyAssistActive) {
      const maxTurn = 1.2 * delta;
      vrm.scene.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, diff));
    } else {
      vrm.scene.rotation.y += diff * Math.min(1, delta * 3.5);
    }

    // ── Idle body sway — ONLY when truly idle ─────────────────
    // This block must NOT run during dance, sofaSit, typing, etc.
    // activityUpdate() sets those bone rotations and this would
    // overwrite them every frame, causing the "stiff" appearance.
    if (!gestureActive() && !walk.active && ACTIVITY.current === 'idle') {
      const hipSway      = Math.sin(idleTime * 1.05) * 0.09;
      const hipBob       = Math.abs(Math.sin(idleTime * 1.05)) * 0.035;
      const breathe      = Math.sin(idleTime * 0.72) * 0.014;
      const chestOpp     = Math.sin(idleTime * 1.05 + 0.6) * 0.04;
      const shoulderRoll = Math.sin(idleTime * 0.52) * 0.022;

      if (boneHips)  { boneHips.rotation.z = hipSway; boneHips.rotation.x = hipBob * 0.5; boneHips.rotation.y = Math.sin(idleTime * 0.5) * 0.05; }
      if (boneSpine) { boneSpine.rotation.z = -hipSway * 0.65; boneSpine.rotation.x = breathe + Math.sin(idleTime * 1.2) * 0.01; boneSpine.rotation.y = Math.sin(idleTime * 0.5) * 0.025; }
      if (boneChest) { boneChest.rotation.z = chestOpp; boneChest.rotation.x = breathe * 0.9; boneChest.rotation.y = shoulderRoll; }
      if (boneHead)  { boneHead.rotation.z = Math.sin(idleTime * 0.45) * 0.045; boneHead.rotation.x = Math.sin(idleTime * 0.7) * 0.03 + 0.02; boneHead.rotation.y = Math.sin(idleTime * 0.32) * 0.08; }
      if (boneNeck)  { boneNeck.rotation.z = Math.sin(idleTime * 0.45) * 0.02; boneNeck.rotation.y = Math.sin(idleTime * 0.32) * 0.04; }

      if (boneLUpperLeg) { boneLUpperLeg.rotation.z = -0.04; boneLUpperLeg.rotation.x = 0; }
      if (boneRUpperLeg) { boneRUpperLeg.rotation.z =  0.06; boneRUpperLeg.rotation.x = 0; }
      if (boneLLowerLeg) boneLLowerLeg.rotation.x = 0.04;
      if (boneRLowerLeg) boneRLowerLeg.rotation.x = 0.04;
      if (boneLFoot)     { boneLFoot.rotation.x = -0.05; boneLFoot.rotation.z = -0.03; }
      if (boneRFoot)     { boneRFoot.rotation.x = -0.05; boneRFoot.rotation.z =  0.04; }
      if (boneLToes) boneLToes.rotation.x = 0.08;
      if (boneRToes) boneRToes.rotation.x = 0.08;

      if (ACTIVITY.current === 'idle') {
        if (boneLUpperArm) { boneLUpperArm.rotation.z =  0.9 + Math.sin(idleTime*0.85)*0.07 + chestOpp*0.4; boneLUpperArm.rotation.x =  0.07 + Math.sin(idleTime*0.55)*0.04; boneLUpperArm.rotation.y =  0.04 + shoulderRoll*0.5; }
        if (boneLLowerArm) { boneLLowerArm.rotation.z =  0.52 + Math.sin(idleTime*1.0)*0.045; boneLLowerArm.rotation.x = -0.04; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.9 - Math.sin(idleTime*0.85+0.5)*0.07 - chestOpp*0.4; boneRUpperArm.rotation.x =  0.07 + Math.sin(idleTime*0.55+0.5)*0.04; boneRUpperArm.rotation.y = -0.04 - shoulderRoll*0.5; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.52 - Math.sin(idleTime*1.0+0.5)*0.045; boneRLowerArm.rotation.x = -0.04; }
        if (boneLHand)     { boneLHand.rotation.z =  0.26 + Math.sin(idleTime*2.1)*0.08; boneLHand.rotation.x =  0.12 + Math.sin(idleTime*2.6)*0.05; boneLHand.rotation.y =  Math.sin(idleTime*1.6)*0.07; }
        if (boneRHand)     { boneRHand.rotation.z = -0.26 - Math.sin(idleTime*2.1+1.0)*0.08; boneRHand.rotation.x =  0.12 + Math.sin(idleTime*2.6+1.0)*0.05; boneRHand.rotation.y =  Math.sin(idleTime*1.6+0.9)*0.07; }
        setLeftFingerRelax(); setRightFingerRelax();
      }

      // Idle mouth micro-expressions
      const mouthCycle = idleTime % 6.5;
      if (mouthCycle > 5.5) {
        const p = (mouthCycle - 5.5) / 1.0;
        const pout = Math.sin(p * Math.PI) * 0.18;
        setBS('O', pout); setBS('U', pout * 0.5);
        if (teethNode) teethNode.position.y = -pout * 0.004;
      } else if (mouthCycle > 3.8 && mouthCycle < 4.4) {
        setBS('I', Math.sin((mouthCycle - 3.8) / 0.6 * Math.PI) * 0.12);
        if (teethNode) teethNode.position.y = 0;
      } else {
        setBS('O', 0); setBS('U', 0); setBS('I', 0);
        if (teethNode) teethNode.position.y = 0;
      }
    }

    // ── Gesture override ───────────────────────────────────────
    updateGesture(delta);
    _syncLookTarget();
    _updateLookTarget(delta);

    vrm.update(delta);

    // ── Eye look-at ───────────────────────────────────────────
    if (vrm.lookAt) {
      if (_isSpeaking) {
        vrm.lookAt.yaw   = Math.sin(idleTime * 0.3) * 8 + Math.sin(idleTime * 0.9) * 3;
        vrm.lookAt.pitch = Math.sin(idleTime * 0.2) * 4 - 2;
      } else {
        const lookCycle = idleTime % 12.0;
        if (lookCycle < 3.0)       { vrm.lookAt.yaw = -18 + Math.sin(idleTime*0.4)*3;  vrm.lookAt.pitch = -2  + Math.sin(idleTime*0.3)*2; }
        else if (lookCycle < 5.0)  { vrm.lookAt.yaw =  Math.sin(idleTime*0.3)*5;       vrm.lookAt.pitch = -12 + Math.sin(idleTime*0.4)*2; }
        else if (lookCycle < 7.5)  { vrm.lookAt.yaw =  15 + Math.sin(idleTime*0.5)*4;  vrm.lookAt.pitch = -1  + Math.sin(idleTime*0.3)*2; }
        else if (lookCycle < 9.0)  { vrm.lookAt.yaw =  Math.sin(idleTime*0.2)*4;       vrm.lookAt.pitch =  Math.sin(idleTime*0.15)*2 - 1; }
        else                        { vrm.lookAt.yaw =  Math.sin(idleTime*0.6)*10;      vrm.lookAt.pitch =  4 + Math.sin(idleTime*0.4)*3; }
      }
    }

    // ── Blink ──────────────────────────────────────────────────
    if (blinkTimer > nextBlink) {
      blinkTimer = 0; nextBlink = 2.5 + Math.random() * 3; doBlink();
    }
  }

  // ── Lora activity + VRM update ────────────────────────────────
  // activityUpdateMr() drives all Lora bone animations — idle sway,
  // seated poses, cooking, dancing, etc. It reads ACTIVITY_MR.current
  // which is set by _loraLifeUpdate / _loraGoToSpot above.
  {
    const lora = window.getVrmLora ? window.getVrmLora() : null;
    if (lora) {
      loraIdleTime   += delta;
      loraBlinkTimer += delta;

      // ── Cache Lora bones once into window refs for micro-movement system ──
      if (!window._loraBonesReady) {
        const hm = lora.humanoid;
        if (hm) {
          window._loraHead      = hm.getNormalizedBoneNode?.('head')       || hm.getBoneNode?.('head');
          window._loraNeck      = hm.getNormalizedBoneNode?.('neck')       || hm.getBoneNode?.('neck');
          window._loraSpine     = hm.getNormalizedBoneNode?.('spine')      || hm.getBoneNode?.('spine');
          window._loraHips      = hm.getNormalizedBoneNode?.('hips')       || hm.getBoneNode?.('hips');
          window._loraRUpperArm = hm.getNormalizedBoneNode?.('rightUpperArm') || hm.getBoneNode?.('rightUpperArm');
          window._loraLUpperArm = hm.getNormalizedBoneNode?.('leftUpperArm')  || hm.getBoneNode?.('leftUpperArm');
          window._loraBonesReady = true;
        }
      }

      activityUpdateMr(delta);

      // ── Lora micro-movements — subtle idle fidgets so she looks alive ──
      _updateLoraMicro(delta);
      _updateLoraSocialLook(delta, lora);

      // ── Lora walk bones — driven here, position driven by engine-scene ──
      // Use both the local flag and engine-scene's window bridge
      if ((window._loraWalking || _loraWalkingToSpot) && _avoidancePausedAvatar !== 'lora') {
        loraWalkUpdate(delta);
      } else {
        resetLoraWalkPhase();
      }

      // ── Lora blink ──────────────────────────────────────────────
      if (loraBlinkTimer > loraNextBlink) {
        loraBlinkTimer = 0;
        loraNextBlink  = 2.5 + Math.random() * 3.5;
        doBlinkMr();
      }

      // ── Lora eye look-at — randomised saccades ────────────────
      if (lora.lookAt) {
        const loraSpeaking = window._loraIsSpeaking || false;
        if (loraSpeaking) {
          _loraEyeDwell -= delta;
          if (_loraEyeDwell <= 0) {
            _loraEyeDwell    = 0.4 + Math.random() * 1.1;
            _loraEyeTarget.yaw   = (Math.random() - 0.5) * 20;
            _loraEyeTarget.pitch = -3 + (Math.random() - 0.4) * 10;
          }
          lora.lookAt.yaw   += (_loraEyeTarget.yaw   - lora.lookAt.yaw)   * Math.min(1, delta * 14);
          lora.lookAt.pitch += (_loraEyeTarget.pitch - lora.lookAt.pitch) * Math.min(1, delta * 14);
        } else {
          _loraEyeDwell -= delta;
          if (_loraEyeDwell <= 0) {
            _loraEyeDwell    = 1.5 + Math.random() * 5.0;
            _loraEyeTarget.yaw   = (Math.random() - 0.5) * 28;
            _loraEyeTarget.pitch = -2 + (Math.random() - 0.35) * 14;
          }
          lora.lookAt.yaw   += (_loraEyeTarget.yaw   - lora.lookAt.yaw)   * Math.min(1, delta * 10);
          lora.lookAt.pitch += (_loraEyeTarget.pitch - lora.lookAt.pitch) * Math.min(1, delta * 10);
        }
      }

      // ── Lora idle mouth micro-expressions (only when not lip-syncing) ──
      if (!window._loraIsSpeaking && ACTIVITY_MR.current === 'idle') {
        const loraMouthCycle = loraIdleTime % 7.2;
        if (loraMouthCycle > 6.0) {
          const p = (loraMouthCycle - 6.0) / 1.2;
          const pout = Math.sin(p * Math.PI) * 0.16;
          setBSMr('O', pout); setBSMr('U', pout * 0.5);
          if (teethNodeMr) teethNodeMr.position.y = -pout * 0.004;
        } else if (loraMouthCycle > 4.0 && loraMouthCycle < 4.7) {
          setBSMr('I', Math.sin((loraMouthCycle - 4.0) / 0.7 * Math.PI) * 0.10);
          if (teethNodeMr) teethNodeMr.position.y = 0;
        } else {
          setBSMr('O', 0); setBSMr('U', 0); setBSMr('I', 0);
          if (teethNodeMr) teethNodeMr.position.y = 0;
        }
      }

      // ── Smooth Y-offset lerp for Lora ────────────────────────
      if (Math.abs(_loraYOffsetCurrent - _loraYOffsetTarget) > 0.001) {
        _loraYOffsetCurrent += (_loraYOffsetTarget - _loraYOffsetCurrent) * Math.min(1, delta * 5);
        if (!window._loraWalking) lora.scene.position.y = (lora._restPosY || 0) + _loraYOffsetCurrent;
      }

      // ── Lora thought bubbles ─────────────────────────────────
      _maybeShowLoraThought(delta);

      lora.update(delta);

      // ── ZZZ for Lora ──────────────────────────────────────────
      const loraHead = lora.humanoid?.getNormalizedBoneNode?.('head') || lora.humanoid?.getBoneNode?.('head');
      _updateZzzFor('lora', loraHead, ACTIVITY_MR.current === 'sleep', delta);
    }
  }

  // ── Alakurin (dog) activity + VRM update ──────────────────────
  {
    const dog = window.getVrmDog ? window.getVrmDog() : null;
    if (dog) {
      // ── Life scheduler (wandering, sleep, wake) ──────────────
      _dogLifeUpdate();
      _dogMaybeFidget();

      // ── Bone animation ───────────────────────────────────────
      activityUpdateDog(delta);

      // ── Gait — only drives bones when actually walking ───────
      if (window._dogWalking) {
        dogGaitUpdate(delta, window._dogSpeedMode || 'trot');
      } else {
        resetDogGaitPhase();
      }

      // ── Head-look bias: when Miss is speaking, dog glances her way ──
      if (_isSpeakingBones && !window._dogWalking) {
        applyDogHeadLook(0.18, -0.05, 0.35);
      }

      // ── ZZZ for dog ──────────────────────────────────────────
      const dogHead = dog.humanoid?.getNormalizedBoneNode?.('head') || dog.humanoid?.getBoneNode?.('head');
      _updateZzzFor('dog', dogHead, isDogAsleep(), delta);

      dog.update(delta);
    }
  }

  // ── ZZZ for Miss ─────────────────────────────────────────────
  {
    const vrm = _vrm();
    if (vrm) {
      const missHead = vrm.humanoid?.getNormalizedBoneNode?.('head') || vrm.humanoid?.getBoneNode?.('head');
      const missAsleep = ACTIVITY.current === 'bedLie' || ACTIVITY.current === 'bedLiePhone';
      _updateZzzFor('miss', missHead, missAsleep, delta);
    }
  }

  updateCamera(delta);
  renderer.render(scene, camera);
}

// ── Visibility-aware render loop ────────────────────────────────
let _rafPending = false;
let _forceTick  = null;

function _tick() {
  _rafPending = false;
  render();
}

function _scheduleRender() {
  if (!_rafPending) {
    _rafPending = true;
    requestAnimationFrame(_tick);
  }
}

// startRenderLoop() is called by engine-scene.startEngine() once
// initScene() has created the renderer. Calling it before that
// would crash because renderer is null.
export function startRenderLoop() {
  _forceTick = setInterval(() => {
    if (!renderer) return; // safety guard
    if (document.hidden) {
      render();
    } else {
      _scheduleRender();
    }
  }, 33);
  _scheduleRender();
  console.log('Miss OG Tinz, Lora & Alakurin ready ✦');
}
