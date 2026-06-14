// ================================================================
//  engine-camera.js
//  TV-director camera — alternates focus between Miss OG Tinz and
//  Lora every 8–15 s. Always locks to the speaker when talking.
//  Never orbits the midpoint (that puts the camera inside walls).
//
//  KEY CHANGE: orbit ONE avatar at a time, not the midpoint.
//  resolveWallCollision() from engine-scene keeps it out of walls.
// ================================================================

import { camera, getVrm, getVrmLora, HOUSE_BOUNDS, resolveWallCollision } from './engine-scene.js';
import { walk } from './engine-life.js';

// ── Wall-clamp margin ────────────────────────────────────────────
const CAM_WALL_MARGIN = 1.0;

// ── Interaction mode ─────────────────────────────────────────────
let camMode = 'IDLE';
export const CAM_LERP = 0.04;

export const STREAMER_CAM = {
  IDLE:  { dist: 2.00, height: 1.60, lookHeight: 1.15, sideShift: 0.0 },
  SPEAK: { dist: 1.25, height: 1.65, lookHeight: 1.42, sideShift: 0.0 },
  THINK: { dist: 1.60, height: 1.58, lookHeight: 1.30, sideShift: 0.22 },
  WALK:  { dist: 2.40, height: 1.65, lookHeight: 1.20, sideShift: 0.0 },
};

// ── Sims mode ────────────────────────────────────────────────────
const SIMS_CAM = { heightAbove: 4.5, distBack: 5.0, distSide: 2.5, lookAtHeight: 0.8 };
let _simsMode = false;
export function setSimsMode(on) { _simsMode = on; }
export function getSimsMode()   { return _simsMode; }

// ── Sleep mode — slow cinematic house sweep ───────────────────────
let _sleepMode       = false;
let _sleepAngle      = 0;
let _sleepSweepTimer = 0;
export function setSleepMode(on) { _sleepMode = on; if (!on) _sleepAngle = 0; }
export function getSleepMode()   { return _sleepMode; }

// ── TV-director focus state ───────────────────────────────────────
// 'miss' | 'lora'  — which avatar the camera orbits right now
let _focusTarget  = 'miss';
let _focusTimer   = 0;
const FOCUS_MIN   = 8;    // seconds on one avatar before possible switch
const FOCUS_MAX   = 15;
let _focusDwell   = FOCUS_MIN + Math.random() * (FOCUS_MAX - FOCUS_MIN);

// Force-lock: when Miss is speaking we never cut to Lora
let _speakLock    = false;

// ── Angle presets ─────────────────────────────────────────────────
const ANGLE_PRESETS = {
  FRONT:      { angleOffset:  0,           distMult: 1.0,  heightMult: 1.0,  lookOffset:  0.0  },
  FRONT_LOW:  { angleOffset:  0,           distMult: 1.1,  heightMult: 0.82, lookOffset: -0.08 },
  CLOSE:      { angleOffset:  0,           distMult: 0.70, heightMult: 1.06, lookOffset:  0.06 },
  SIDE_L:     { angleOffset: -Math.PI / 2, distMult: 1.05, heightMult: 1.0,  lookOffset:  0.0  },
  SIDE_R:     { angleOffset:  Math.PI / 2, distMult: 1.05, heightMult: 1.0,  lookOffset:  0.0  },
  WIDE:       { angleOffset:  0,           distMult: 1.80, heightMult: 1.20, lookOffset: -0.08 },
  QUARTER_L:  { angleOffset: -Math.PI / 4, distMult: 1.1,  heightMult: 1.0,  lookOffset:  0.0  },
  QUARTER_R:  { angleOffset:  Math.PI / 4, distMult: 1.1,  heightMult: 1.0,  lookOffset:  0.0  },
};

const ACTIVITY_ANGLES = {
  idle:        ['FRONT', 'FRONT', 'FRONT', 'QUARTER_L', 'QUARTER_R', 'WIDE'],
  dance:       ['WIDE', 'WIDE', 'SIDE_L', 'SIDE_R', 'FRONT', 'FRONT_LOW'],
  listenDance: ['WIDE', 'WIDE', 'SIDE_L', 'SIDE_R', 'FRONT', 'FRONT_LOW'],
  stretch:     ['SIDE_L', 'SIDE_R', 'WIDE', 'FRONT', 'FRONT'],
  hairflick:   ['SIDE_L', 'SIDE_R', 'QUARTER_R', 'CLOSE', 'FRONT'],
  hiponhip:    ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'QUARTER_R', 'FRONT'],
  sofaSit:     ['FRONT', 'FRONT', 'FRONT', 'SIDE_L', 'SIDE_R', 'QUARTER_L'],
  phoneScroll: ['SIDE_R', 'QUARTER_R', 'FRONT', 'FRONT'],
  tvReact:     ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'WIDE', 'FRONT'],
  watchTV:     ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'WIDE', 'FRONT'],
  readBook:    ['SIDE_L', 'SIDE_R', 'FRONT', 'FRONT'],
  typing:      ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'FRONT'],
  monitor:     ['SIDE_R', 'SIDE_L', 'QUARTER_R', 'FRONT'],
  stirring:    ['SIDE_L', 'QUARTER_L', 'FRONT', 'FRONT'],
  chopping:    ['SIDE_R', 'SIDE_L', 'FRONT'],
  tasting:     ['FRONT', 'FRONT', 'CLOSE', 'QUARTER_R'],
  mirrorPose:  ['SIDE_L', 'SIDE_R', 'FRONT', 'FRONT'],
  noseCover:   ['CLOSE', 'FRONT', 'FRONT', 'QUARTER_R'],
  windowLook:  ['SIDE_L', 'SIDE_R', 'WIDE'],
  fireGaze:    ['SIDE_L', 'SIDE_R', 'FRONT_LOW', 'FRONT'],
  washingUp:   ['SIDE_L', 'QUARTER_L', 'FRONT'],
  cabinetOpen: ['SIDE_R', 'QUARTER_R', 'FRONT'],
  eatAtTable:  ['FRONT', 'FRONT', 'SIDE_L', 'SIDE_R'],
  drinkCoffee: ['FRONT', 'CLOSE', 'QUARTER_R'],
  cookDance:   ['SIDE_L', 'WIDE', 'FRONT', 'FRONT'],
  bedLie:      ['SIDE_L', 'SIDE_R', 'FRONT'],
  bedLiePhone: ['SIDE_R', 'FRONT'],
};

const ANGLE_DWELL_MIN_MS = 4000;
const ANGLE_DWELL_MAX_MS = 9000;

let _currentAnglePreset = 'FRONT';
let _angleDwellTimer    = 0;
let _angleDwellDuration = ANGLE_DWELL_MIN_MS;
let _currentActivity    = 'idle';

export const camCurrent = { x: 0, y: 1.55, z: 3.8, lookX: 0, lookY: 1.15, lookZ: 0 };

export let _camFacingY = Math.PI;
export function setCamFacingY(y) { _camFacingY = y; }

// ── Public API ───────────────────────────────────────────────────
export function setCamMode(mode) {
  if (!['IDLE','SPEAK','THINK','WALK'].includes(mode)) return;
  camMode     = mode;
  _speakLock  = (mode === 'SPEAK');
  if (_speakLock) _focusTarget = 'miss';   // always cut to Miss when she speaks
}

export function onActivityChanged(activityName) {
  _currentActivity    = activityName || 'idle';
  _angleDwellTimer    = 0;
  _angleDwellDuration = ANGLE_DWELL_MIN_MS + Math.random() * (ANGLE_DWELL_MAX_MS - ANGLE_DWELL_MIN_MS);
  _pickAngleForActivity(_currentActivity);
}

export function setCamAngle(presetName) {
  if (ANGLE_PRESETS[presetName]) _currentAnglePreset = presetName;
}

// ── Snap on first load — orbit Miss ─────────────────────────────
export function _snapCameraToVRM() {
  const vrm = getVrm();
  if (!vrm) return;
  const p  = STREAMER_CAM.IDLE;
  const fy = vrm.scene.rotation.y;
  _camFacingY = fy;
  const mx = vrm.scene.position.x;
  const my = vrm.scene.position.y;
  const mz = vrm.scene.position.z;
  const cx = mx + Math.sin(fy) * p.dist;
  const cy = my + p.height;
  const cz = mz + Math.cos(fy) * p.dist;
  camCurrent.x = cx; camCurrent.y = cy; camCurrent.z = cz;
  camCurrent.lookX = mx; camCurrent.lookY = my + p.lookHeight; camCurrent.lookZ = mz;
  camera.position.set(cx, cy, cz);
  camera.lookAt(mx, my + p.lookHeight, mz);
}

// ── Internal: pick angle ─────────────────────────────────────────
function _pickAngleForActivity(activityName) {
  const pool = ACTIVITY_ANGLES[activityName] || ACTIVITY_ANGLES.idle;
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick === _currentAnglePreset && pool.length > 1) {
    pick = pool[Math.floor(Math.random() * pool.length)];
  }
  _currentAnglePreset = pick;
}

// ── TV-director switch — interest-scored, not coin-flip ──────────
function _maybeSwitch(delta, lora) {
  if (_speakLock || !lora) return;
  _focusTimer += delta;
  if (_focusTimer < _focusDwell) return;

  const missScore = _scoreTarget('miss');
  const loraScore = _scoreTarget('lora');
  _focusTarget = loraScore > missScore ? 'lora' : 'miss';
  _focusTimer  = 0;
  _focusDwell  = FOCUS_MIN + Math.random() * (FOCUS_MAX - FOCUS_MIN);
  _pickAngleForActivity(_currentActivity);
  console.log(`[Cam] cut to ${_focusTarget} (miss ${missScore.toFixed(2)} / lora ${loraScore.toFixed(2)})`);
}

function _scoreTarget(who) {
  let score = 0;
  const act = who === 'miss'
    ? (window._missCurrentActivity || 'idle')
    : (window._loraCurrentActivity || 'idle');
  // Active beats idle
  if (['stirring','chopping','dance','cookDance','tasting','flip_food','fry_egg'].includes(act)) score += 3;
  else if (act !== 'idle') score += 1;
  // Slight bias toward whoever we're NOT already watching (avoids static lock)
  if ((who === 'miss') !== (_focusTarget === 'miss')) score += 0.5;
  // Small random factor so it never locks permanently
  score += Math.random() * 0.8;
  return score;
}

// ── Main update ──────────────────────────────────────────────────
export function updateCamera(delta) {
  const vrm  = getVrm();
  if (!vrm) return;
  const lora = (typeof getVrmLora === 'function') ? getVrmLora() : null;

  // ── TV-director switch ────────────────────────────────────────
  _maybeSwitch(delta, lora);

  // ── SLEEP MODE — slow cinematic house sweep ───────────────────
  if (_sleepMode) {
    _sleepSweepTimer += delta;
    const speed = 0.04; // very slow pan
    _sleepAngle += delta * speed;
    const radius = 4.5, height = 2.8;
    const tx = Math.sin(_sleepAngle) * radius;
    const tz = Math.cos(_sleepAngle) * radius;
    const L  = 0.008; // extremely slow lerp — cinematic
    camCurrent.x += (tx     - camCurrent.x)    * Math.min(1, L * 60 * delta);
    camCurrent.y += (height - camCurrent.y)     * Math.min(1, L * 60 * delta);
    camCurrent.z += (tz     - camCurrent.z)     * Math.min(1, L * 60 * delta);
    camCurrent.lookX += (0   - camCurrent.lookX) * Math.min(1, L * 60 * delta * 1.5);
    camCurrent.lookY += (1.0 - camCurrent.lookY) * Math.min(1, L * 60 * delta * 1.5);
    camCurrent.lookZ += (0   - camCurrent.lookZ) * Math.min(1, L * 60 * delta * 1.5);
    camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
    camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
    return;
  }

  // ── Pick the avatar we're focused on right now ────────────────
  const focusVrm = (_focusTarget === 'lora' && lora) ? lora : vrm;
  const fx = focusVrm.scene.position.x;
  const fy_ = focusVrm.scene.position.y;   // height
  const fz = focusVrm.scene.position.z;

  // ── SIMS MODE ─────────────────────────────────────────────────
  if (_simsMode) {
    // Sims orbits midpoint — fine because camera is high and angled down
    const mx = lora ? (vrm.scene.position.x + lora.scene.position.x) / 2 : vrm.scene.position.x;
    const my = vrm.scene.position.y;
    const mz = lora ? (vrm.scene.position.z + lora.scene.position.z) / 2 : vrm.scene.position.z;
    const tx = mx + SIMS_CAM.distSide;
    const ty = my + SIMS_CAM.heightAbove;
    const tz = mz + SIMS_CAM.distBack;
    const L  = 0.025;
    camCurrent.x += (tx - camCurrent.x) * Math.min(1, L * 60 * delta);
    camCurrent.y += (ty - camCurrent.y) * Math.min(1, L * 60 * delta);
    camCurrent.z += (tz - camCurrent.z) * Math.min(1, L * 60 * delta);
    camCurrent.lookX += (mx - camCurrent.lookX) * Math.min(1, L * 60 * delta * 2);
    camCurrent.lookY += (my + SIMS_CAM.lookAtHeight - camCurrent.lookY) * Math.min(1, L * 60 * delta * 2);
    camCurrent.lookZ += (mz - camCurrent.lookZ) * Math.min(1, L * 60 * delta * 2);
    camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
    camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
    return;
  }

  // ── Smooth facing — track the focused avatar ──────────────────
  const rawFacing = focusVrm.scene.rotation.y;
  let df = rawFacing - _camFacingY;
  while (df >  Math.PI) df -= Math.PI * 2;
  while (df < -Math.PI) df += Math.PI * 2;
  const facingLerp = walk.active ? 0.025 : 0.035;
  _camFacingY += df * Math.min(1, delta / facingLerp);
  _camFacingY  = ((_camFacingY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // ── Angle dwell timer ─────────────────────────────────────────
  if (camMode === 'IDLE' && !walk.active) {
    _angleDwellTimer += delta * 1000;
    if (_angleDwellTimer >= _angleDwellDuration) {
      _angleDwellTimer    = 0;
      _angleDwellDuration = ANGLE_DWELL_MIN_MS + Math.random() * (ANGLE_DWELL_MAX_MS - ANGLE_DWELL_MIN_MS);
      _pickAngleForActivity(_currentActivity);
    }
  }

  // ── Resolve preset & angle ────────────────────────────────────
  let interactionPreset;
  let effectiveAngle;

  if (walk.active) {
    interactionPreset = STREAMER_CAM.WALK;
    effectiveAngle    = ANGLE_PRESETS.WIDE;
  } else if (camMode === 'SPEAK') {
    interactionPreset = STREAMER_CAM.SPEAK;
    effectiveAngle    = ANGLE_PRESETS.FRONT;
  } else if (camMode === 'THINK') {
    interactionPreset = STREAMER_CAM.THINK;
    effectiveAngle    = ANGLE_PRESETS.QUARTER_R;
  } else {
    interactionPreset = STREAMER_CAM.IDLE;
    effectiveAngle    = ANGLE_PRESETS[_currentAnglePreset] || ANGLE_PRESETS.FRONT;
  }

  // ── Compute target — orbit the FOCUSED avatar only ────────────
  const orbitAngle = _camFacingY + effectiveAngle.angleOffset;
  const dist       = interactionPreset.dist * effectiveAngle.distMult;
  const height     = interactionPreset.height * effectiveAngle.heightMult;
  const lookHeight = interactionPreset.lookHeight + effectiveAngle.lookOffset;

  let tx = fx + Math.sin(orbitAngle) * dist;
  const ty = fy_ + height;
  let tz = fz + Math.cos(orbitAngle) * dist;

  // ── Wall push-out ─────────────────────────────────────────────
  const safe = resolveWallCollision(tx, tz, CAM_WALL_MARGIN);
  tx = safe.x;
  tz = safe.z;

  // ── Lerp ──────────────────────────────────────────────────────
  const L = camMode === 'SPEAK' ? 0.09 : walk.active ? 0.03 : 0.018;
  const lf = Math.min(1, L * 60 * delta);

  camCurrent.x     += (tx         - camCurrent.x)    * lf;
  camCurrent.y     += (ty         - camCurrent.y)     * lf;
  camCurrent.z     += (tz         - camCurrent.z)     * lf;
  camCurrent.lookX += (fx         - camCurrent.lookX) * Math.min(1, lf * 1.5);
  camCurrent.lookY += (fy_ + lookHeight - camCurrent.lookY) * Math.min(1, lf * 1.5);
  camCurrent.lookZ += (fz         - camCurrent.lookZ) * Math.min(1, lf * 1.5);

  camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
  camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
}
