// ================================================================
//  engine-life.js
//  Walk system, daily life scheduler, familiarity, outfits,
//  thought bubbles, topic polling, dead air, Twitch chat,
//  API messaging, UI events, render loop.
// ================================================================

import * as THREE from 'three';

import { getVrm, scene, camera, renderer, ambient,
         HOUSE_BOUNDS, AVATAR_RADIUS,
         canvas, bubble, bubbleTxt, bar_fill, status_el, stageLight,
         chatInput, sendBtn,
         monitorGlowLight,
         VRM_PATH, API_URL, PROACTIVE_URL, TOPIC_URL, TTS_URL,
         TWITCH_CHANNEL, USER_ID,
       } from './engine-scene.js';

import { setCamMode, updateCamera, onActivityChanged } from './engine-camera.js';
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
} from './engine-bones.js';

// ── Dead air ─────────────────────────────────────────────────────
// Fires /chat/proactive after silence. Has a busy-lock so only ONE
// call is ever in-flight, and exponential backoff after failures.

let _deadAirTimer    = null;
let _deadAirBusy     = false;   // true while fetch or speak is running
let _deadAirActive   = false;
let _deadAirBackoff  = 0;       // extra delay added after failures
const DEAD_AIR_MS    = 120_000; // 2 min silence threshold
const DEAD_AIR_MIN   = 180_000; // minimum 3 min between proactive calls

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
    const delay = Math.max(DEAD_AIR_MS, DEAD_AIR_MIN) + _deadAirBackoff;
    _deadAirTimer = setTimeout(() => _triggerProactive(), delay);
  },
};

// ── VRM accessor — getVrm() returns the live ref, never null after load ──
const _vrm = () => getVrm();

// ── UI elements ──────────────────────────────────────────────────
export const loader_el  = document.getElementById('loader');
const topicBox          = document.getElementById('topic-box');
const topicTitleEl      = document.getElementById('topic-title-text');
const topicSourceEl     = document.getElementById('topic-source-tag');
let   lastTopicTitle    = null;
const panelToggle       = document.getElementById('panel-toggle');
const controlPanel      = document.getElementById('control-panel');

export function setStatus(msg, cls = '') {
  status_el.textContent = msg;
  status_el.className   = cls;
}
export function setProgress(p) { bar_fill.style.width = p + '%'; }

// ── Stage light ──────────────────────────────────────────────────
function setStageLight(mood, durationMs = 4000) {
  stageLight.className = mood;
  if (mood !== '') setTimeout(() => { stageLight.className = ''; }, durationMs);
}

// ── Chat bubble ──────────────────────────────────────────────────
let bubbleTimeout = null;
export function showBubble(text, speaker = 'Miss OG Tinz') {
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
      { label: 'Sofa',         x: -4.159, z: -4.424, facingY: 0,              yOffset: -0.52, activities: ['sofaSit','sofaSit','phoneScroll','tvReact','readBook'], prop: 'sedacka' },
      { label: 'Sofa Side',    x: -3.200, z: -4.200, facingY: Math.PI * 0.15, yOffset: -0.52, activities: ['sofaSit','sofaSit','phoneScroll','readBook'], prop: 'sedacka' },
      { label: 'TV Wall',      x: -2.500, z: -5.000, facingY: 0,              activities: ['tvReact','idle','dance','hiponhip'], prop: 'tv' },
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
      { label: 'Hob',            x: -4.180, z:  0.300, facingY: Math.PI * 0.5, activities: ['stirring','chopping','tasting','idle','noseCover'], prop: 'sporak' },
      { label: 'Second Hob',     x: -4.185, z: -0.300, facingY: Math.PI * 0.5, activities: ['stirring','idle','tasting'], prop: 'varna deska' },
      { label: 'Sink',           x: -4.849, z: -0.650, facingY: Math.PI * 0.5, activities: ['washingUp','idle','stretch'], prop: 'drez' },
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
      { label: 'Table Head',   x: -2.286, z:  1.300, facingY: Math.PI,          yOffset: -0.42, activities: ['sofaSit','sofaSit','tasting','phoneScroll','readBook'], prop: 'jidelni stul' },
      { label: 'Table Side',   x: -2.477, z:  2.369, facingY: -Math.PI * 0.5,   yOffset: -0.42, activities: ['sofaSit','sofaSit','readBook','phoneScroll','tasting'], prop: 'zidle' },
      { label: 'Table End',    x: -2.132, z:  3.500, facingY: 0,                activities: ['idle','dance','hairflick','hiponhip'], prop: 'jidelni stul.001' },
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
      { label: 'Wardrobe Mirror', x:  2.755, z: -0.845, facingY: -Math.PI * 0.5,  activities: ['mirrorPose','hairflick','idle','noseCover'], prop: 'closet.003' },
      { label: 'Wardrobe',        x:  4.356, z:  2.100, facingY: Math.PI,          activities: ['cabinetOpen','mirrorPose','idle','hairflick'], prop: 'closet.006' },
      { label: 'Bedroom Chair',   x:  3.214, z:  0.863, facingY: -Math.PI * 0.5,  yOffset: -0.44, activities: ['sofaSit','sofaSit','phoneScroll','readBook'], prop: 'Plane.054' },
      { label: 'Bed',             x:  5.200, z: -4.200, facingY: 0,               yOffset: -0.85, activities: ['bedLie','bedLie','bedLiePhone','readBook'] },
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

  // ── Walk animation ───────────────────────────────────────────
  const STEP_FREQ = 2.4;
  _walkPhase += delta * STEP_FREQ * Math.PI * 2;
  const p = _walkPhase;

  const legSwing  = Math.sin(p) * 0.42;
  const kneeBend  = Math.max(0, -Math.sin(p)) * 0.55;
  const kneeSwing = Math.max(0,  Math.sin(p)) * 0.35;
  const footLift  = Math.max(0,  Math.sin(p)) * 0.18;

  if (boneLUpperLeg) boneLUpperLeg.rotation.x =  legSwing;
  if (boneRUpperLeg) boneRUpperLeg.rotation.x = -legSwing;
  if (boneLLowerLeg) boneLLowerLeg.rotation.x =  kneeBend  + 0.04;
  if (boneRLowerLeg) boneRLowerLeg.rotation.x =  kneeSwing + 0.04;
  if (boneLFoot)     { boneLFoot.rotation.x = -0.05 + footLift * 0.5; boneLFoot.rotation.z = -0.03; }
  if (boneRFoot)     { boneRFoot.rotation.x = -0.05;                  boneRFoot.rotation.z =  0.04; }
  if (boneLToes)     boneLToes.rotation.x =  0.08 + footLift * 0.3;
  if (boneRToes)     boneRToes.rotation.x =  0.08;

  const hipSway = Math.sin(p) * 0.1;
  const hipTilt = Math.cos(p) * 0.04;
  if (boneHips) { boneHips.rotation.z = hipSway; boneHips.rotation.x = hipTilt; boneHips.rotation.y = Math.sin(p) * 0.05; }
  if (boneSpine) { boneSpine.rotation.z = -hipSway * 0.6; boneSpine.rotation.x = 0.02 + Math.abs(Math.cos(p)) * 0.015; boneSpine.rotation.y = -Math.sin(p) * 0.04; }
  if (boneChest) { boneChest.rotation.z = -hipSway * 0.3; boneChest.rotation.y = -Math.sin(p) * 0.06; }
  if (boneHead)  { boneHead.rotation.x = 0.04 + Math.abs(Math.sin(p)) * 0.02; boneHead.rotation.z = Math.sin(p) * 0.018; boneHead.rotation.y = Math.sin(p) * 0.04; }

  const armSwing  = -Math.sin(p) * 0.28;
  const elbowBend =  0.35 + Math.abs(Math.sin(p)) * 0.1;
  if (boneLUpperArm) { boneLUpperArm.rotation.x =  armSwing; boneLUpperArm.rotation.z =  0.8; boneLUpperArm.rotation.y =  0.04; }
  if (boneRUpperArm) { boneRUpperArm.rotation.x = -armSwing; boneRUpperArm.rotation.z = -0.8; boneRUpperArm.rotation.y = -0.04; }
  if (boneLLowerArm) { boneLLowerArm.rotation.x = 0; boneLLowerArm.rotation.z =  elbowBend; }
  if (boneRLowerArm) { boneRLowerArm.rotation.x = 0; boneRLowerArm.rotation.z = -elbowBend; }
  if (boneLHand) { boneLHand.rotation.z =  0.15; boneLHand.rotation.x = 0.05; }
  if (boneRHand) { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = 0.05; }
  setLeftFingerRelax();
  setRightFingerRelax();

  const bobY = Math.abs(Math.sin(p)) * 0.018;
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

let _currentRoom = 'studio';
let _currentSpot = null;

// ── Familiarity ──────────────────────────────────────────────────
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
// Each key = a room; values = rooms directly reachable and the
// door-threshold waypoint (world-space x/z) to pass through first.
// Coords match the existing HOUSE.hallway door spot positions.
// NOTE: engine-scene.js scales these by hScale on house load via
//       window.ROOM_CONNECTIONS_REF — do not hardcode scaled values.
const ROOM_CONNECTIONS = {
  'studio':      { 'hallway':   { x:  0.6,  z: -1.2  } },
  'living-room': { 'hallway':   { x:  0.2,  z: -0.4  } },
  'kitchen':     { 'hallway':   { x:  0.2,  z:  0.9  } },
  'dining':      { 'kitchen':   { x: -1.0,  z:  2.2  } },
  'bedroom': {
    'hallway':   { x:  1.59, z: -5.3  },   // front of bedroom door into hallway
    'bathroom':  { x:  2.75, z:  0.85 },   // bedroom → bathroom direct (shared wall)
  },
  'bathroom': {
    'bedroom':   { x:  2.75, z:  0.85 },   // bathroom → bedroom direct
  },
  'hallway': {
    'studio':      { x:  0.6,  z: -1.2  },
    'living-room': { x:  0.2,  z: -0.4  },
    'kitchen':     { x:  0.2,  z:  0.9  },
    'bedroom':     { x:  1.59, z: -5.3  },
  },
};
// Register reference so engine-scene.js can scale waypoints after hScale is known
window.ROOM_CONNECTIONS_REF = ROOM_CONNECTIONS;

// BFS — returns ordered array of { throughRoom, waypoint } steps,
// or [] if already in same room / no path found (fallback: direct walk).
function findRoomPath(fromRoom, toRoom) {
  if (fromRoom === toRoom) return [];
  const visited = new Set([fromRoom]);
  const queue   = [[fromRoom, []]];
  while (queue.length) {
    const [room, path] = queue.shift();
    const connections  = ROOM_CONNECTIONS[room] || {};
    for (const [nextRoom, doorWp] of Object.entries(connections)) {
      if (visited.has(nextRoom)) continue;
      const newPath = [...path, { throughRoom: nextRoom, waypoint: doorWp }];
      if (nextRoom === toRoom) return newPath;
      visited.add(nextRoom);
      queue.push([nextRoom, newPath]);
    }
  }
  return [];
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
    setRoomVisible(_currentRoom, true);
    walkThroughWaypoints(rest, finalX, finalZ, onArrive);
  };
}

function goToSpot(spot) {
  const vrm = _vrm();
  if (!spot || !vrm) return;
  _currentSpot = spot;
  setCamMode('WALK');

  const targetRoom = spot.room;
  const doorPath   = findRoomPath(_currentRoom, targetRoom);

  walkThroughWaypoints(doorPath, spot.x, spot.z, () => {
    _currentRoom = targetRoom;
    setRoomVisible(_currentRoom, true);
    if (spot.facingY !== undefined) _targetFacing = spot.facingY;
    const spotActivities = spot.activities?.length
      ? spot.activities : getFamiliarActivityPool(_currentRoom);
    const next = spotActivities[Math.floor(Math.random() * spotActivities.length)];
    ACTIVITY.current  = next;
    ACTIVITY.timer    = 0; ACTIVITY.phase = 0;
    ACTIVITY.duration = _lifeMinDwell + Math.random() * (_lifeMaxDwell - _lifeMinDwell);

    // ── Drop Y for seated/lying spots, restore for standing ───
    const vrm = _vrm();
    if (vrm) {
      const SEATED_ACTIVITIES = new Set(['sofaSit','phoneScroll','readBook','tvReact','watchTV','eatAtTable','tasting','bedLie','bedLiePhone']);
      const yOff = (SEATED_ACTIVITIES.has(next) && spot.yOffset) ? spot.yOffset : 0;
      vrm.scene.position.y = (vrm._restPosY || 0) + yOff;
    }

    maybeChangeOutfit(_currentRoom);
    setCamMode('IDLE');
    onActivityChanged(next);
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
  _lifeTimer += delta;
  if (_lifeTimer >= _nextDwell - 3 && _lifeTimer < _nextDwell) _targetFacing = Math.PI;
  if (_lifeTimer < _nextDwell) return;
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

// Seated activities for Lora — yOffset applied on arrival
const _LORA_SEATED = new Set(['sofaSit','phoneScroll','readBook','tvReact','watchTV','eatAtTable','tasting','bedLie','bedLiePhone']);

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

// Send Lora to a spot — sets ACTIVITY_MR on arrival
function _loraGoToSpot(spot) {
  if (!spot) return;
  _loraCurrentSpot   = spot;
  _loraCurrentRoom   = spot.room;
  _loraWalkingToSpot = true;

  // Tell engine-scene's walk system where to go
  // It exposes _loraTarget and _loraWalking via window for cross-module comms
  if (window._loraSetTarget) {
    window._loraSetTarget(spot.x, spot.z, () => {
      // On arrival
      _loraWalkingToSpot = false;

      // Pick activity from spot's list or room pool
      const pool = spot.activities?.length
        ? spot.activities
        : (_loraActivityPool[spot.room] || _loraActivityPool.studio);
      const next = pool[Math.floor(Math.random() * pool.length)];

      ACTIVITY_MR.current  = next;
      ACTIVITY_MR.timer    = 0;
      ACTIVITY_MR.phase    = 0;
      ACTIVITY_MR.duration = 10 + Math.random() * 20;

      // Apply yOffset for seated/lying activities
      const lora = window.getVrmLora ? window.getVrmLora() : null;
      if (lora) {
        const yOff = (_LORA_SEATED.has(next) && spot.yOffset) ? spot.yOffset : 0;
        lora.scene.position.y = (lora._restPosY || 0) + yOff;
      }

      // Face the spot's designated direction
      if (spot.facingY !== undefined && window._loraSetFacing) {
        window._loraSetFacing(spot.facingY);
      }
    });
  } else {
    // Fallback: no callback bridge — just set activity immediately
    _loraWalkingToSpot = false;
    const pool = spot.activities?.length
      ? spot.activities
      : (_loraActivityPool[spot.room] || _loraActivityPool.studio);
    const next = pool[Math.floor(Math.random() * pool.length)];
    ACTIVITY_MR.current  = next;
    ACTIVITY_MR.timer    = 0;
    ACTIVITY_MR.phase    = 0;
    ACTIVITY_MR.duration = 10 + Math.random() * 20;
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

// ── Audio unlock ─────────────────────────────────────────────────
let _audioUnlocked = false;
function _unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1,1,22050);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.start(0); ctx.resume();
  } catch(e) {}
  // Also wake speech synthesis
  try { window.speechSynthesis.cancel(); } catch(e) {}
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

// ── TTS + lip sync ───────────────────────────────────────────────
export let _isSpeaking = false;

export async function speak(text, mood = 'neutral') {
  // Wake speech synthesis — essential when running as OBS/Streamlabs browser source
  // where no user interaction ever fires to unlock audio normally.
  if (!_audioUnlocked) _unlockAudio();
  window.speechSynthesis.cancel();

  _isSpeaking = true;
  setExpression(mood);
  setStageLight('speak', text.length * 65 + 2000);
  runLipSync(text);

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
}

// ── Topic box ────────────────────────────────────────────────────
function updateTopicBox(data) {
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
async function _triggerProactive() {
  if (_deadAirBusy || _isSpeaking) {
    deadAir._arm(); // re-arm and wait longer
    return;
  }
  _deadAirBusy = true;

  try {
    const res = await fetch(PROACTIVE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ current_room: _currentRoom }),
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
      setCamMode('SPEAK');
      showBubble(text, 'Miss OG Tinz');
      setStatus('Live ✦', 'ready');
      doGesture('talk', text.length * 65);
      await speak(text, 'neutral');
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

async function processNextMessage() {
  if (_msgQueue.length === 0) { _msgBusy = false; return; }
  _msgBusy = true;
  const { username, message } = _msgQueue.shift();
  await sendMessage(message, username);
  setTimeout(processNextMessage, 15000);
}

// ── API call ─────────────────────────────────────────────────────
const chatHistory = [];

async function sendMessage(message, displayName = 'Viewer') {
  if (!message.trim()) return;
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

// ── UI events ────────────────────────────────────────────────────
sendBtn.addEventListener('click', () => {
  const msg = chatInput.value.trim();
  if (!msg) return;
  chatInput.value = '';
  sendMessage(msg, 'You');
});
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn.click(); });

// ── Control panel ────────────────────────────────────────────────
panelToggle?.addEventListener('click', () => {
  const isOpen = !controlPanel.classList.contains('hidden');
  controlPanel.classList.toggle('hidden', isOpen);
  panelToggle.classList.toggle('open', !isOpen);
});

function bindSlider(id, onChange) {
  const el  = document.getElementById(id);
  const val = document.getElementById(id + '-val');
  if (!el) return;
  el.addEventListener('input', () => { if (val) val.textContent = el.value; onChange(parseFloat(el.value)); });
}
bindSlider('posX',  v => { const vrm = _vrm(); if (vrm) vrm.scene.position.x = v; });
bindSlider('posY',  v => { const vrm = _vrm(); if (vrm) { vrm.scene.position.y = v; vrm._restPosY = v; } });
bindSlider('posZ',  v => { const vrm = _vrm(); if (vrm) vrm.scene.position.z = v; });
bindSlider('scale', v => { const vrm = _vrm(); if (vrm) vrm.scene.scale.set(v,v,v); });

function bindColour(id, meshNames) {
  const el = document.getElementById(id); if (!el) return;
  el.addEventListener('input', () => {
    const col = new THREE.Color(el.value);
    // Apply to BOTH Miss and Lora — their mesh names differ, both lists covered in the callers below
    const targets = [_vrm(), window.getVrmLora ? window.getVrmLora() : null].filter(Boolean);
    for (const vrmObj of targets) {
      vrmObj.scene.traverse(obj => {
        if (!obj.isMesh || !meshNames.includes(obj.name)) return;
        const m = obj.material;
        if (!m) return;
        // Eye meshes use a canvas map — replace with plain colour so the picker takes effect
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
// ── Colour pickers — NODE names (Three.js obj.name in traverse) ──────────
// Both avatars share the same node names: Top, Bottom, Hair_Block, Brow, Lashes etc.
bindColour('col-skin',   ['Julie_Figure', 'Mr_OgTinz_Figure', 'Teargum']);
bindColour('col-hair',   ['Hair_Block', 'Brow', 'Lashes']);
bindColour('col-top',    ['Top']);
bindColour('col-bottom', ['Bottom']);
bindColour('col-gold',   ['Ear_Jewel', 'Necklece']);

document.getElementById('btn-log')?.addEventListener('click', () => {
  const vrm = _vrm(); if (!vrm) return;
  const p = vrm.scene.position, s = vrm.scene.scale;
  console.log(`vrm pos (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})  scale ${s.x.toFixed(3)}`);
  console.log(`camera pos (${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)})`);
});
document.getElementById('btn-reset')?.addEventListener('click', () => location.reload());

// ── Room buttons ─────────────────────────────────────────────────
(function initRoomButtons() {
  const panel = document.getElementById('control-panel');
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
      // Highlight active room button
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

  // Re-render activity buttons whenever current room changes
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
        // Clear highlight after override expires
        setTimeout(() => btn.style.outline = '', 13000);
      });
      g.appendChild(btn);
    });
    actWrap.appendChild(g);
  }

  // Poll for room changes to refresh activity list
  setInterval(refreshActivityButtons, 1000);
  refreshActivityButtons();
})();

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

// ================================================================
//  RENDER LOOP
// ================================================================
const clock    = new THREE.Clock();
let idleTime   = 0;
let blinkTimer = 0;
let nextBlink  = 3;

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
    updateWalk(delta);
    lifeUpdate();
    _loraLifeUpdate();

    // ── Facing — smoothly rotate toward _targetFacing ─────────
    const cur  = vrm.scene.rotation.y;
    let   diff = _targetFacing - cur;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    vrm.scene.rotation.y += diff * Math.min(1, delta * (walk.active ? 6.0 : 3.5));

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
      activityUpdateMr(delta);
      lora.update(delta);
    }
  }

  updateCamera(delta);
  renderer.render(scene, camera);
}

// ── Visibility-aware render loop ────────────────────────────────
// requestAnimationFrame pauses when the browser tab loses focus —
// which happens every time OBS/Streamlabs captures the window.
// Fix: keep a setInterval heartbeat running at ~30fps as fallback,
// and let rAF handle the high-fps rendering when tab is visible.

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

// Heartbeat: fires even when tab is hidden / captured by OBS
// 33ms ≈ 30fps — enough to keep avatar moving on stream
_forceTick = setInterval(() => {
  if (document.hidden) {
    // Tab is hidden — drive render directly from interval
    render();
  } else {
    // Tab is visible — let rAF handle it (avoids double-rendering)
    _scheduleRender();
  }
}, 33);

// Initial render
_scheduleRender();
console.log('Miss OG Tinz & Lora ready ✦');
