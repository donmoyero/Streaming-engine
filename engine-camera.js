// ================================================================
//  engine-camera.js
//  Dual-avatar portrait camera — Miss OG Tinz + Lora.
//
//  FIXES in this version:
//  ─ Camera orbits the MIDPOINT between both avatars, not Miss alone.
//    This prevents wall shots when presets swing behind/side.
//  ─ Angle presets that reliably hit walls (BACK, BACK_HIGH,
//    OVER_SHOULDER, WIDE_SIDE) removed from activity pools or
//    replaced with safe alternatives.
//  ─ HOUSE_BOUNDS clamp tightened by an extra 0.4 m inside the
//    existing margin so the camera never clips a wall.
//  ─ All original modes (IDLE/SPEAK/THINK/WALK) preserved exactly.
//  ─ SIMS MODE preserved.
// ================================================================

import { camera, getVrm, getVrmLora, HOUSE_BOUNDS } from './engine-scene.js';
import { walk } from './engine-life.js';

// ── Wall-clamp margin — extra buffer to keep away from walls ────
const CAM_WALL_MARGIN = 1.2;   // was 0.5 — tighter = no more wall shots

// ── Interaction mode ─────────────────────────────────────────────
let camMode = 'IDLE';
export const CAM_LERP = 0.04;

export const STREAMER_CAM = {
  IDLE:  { dist: 2.20, height: 1.60, lookHeight: 1.15, sideShift: 0.0  },
  SPEAK: { dist: 1.30, height: 1.65, lookHeight: 1.42, sideShift: 0.0  },
  THINK: { dist: 1.70, height: 1.58, lookHeight: 1.30, sideShift: 0.22 },
  WALK:  { dist: 2.60, height: 1.65, lookHeight: 1.20, sideShift: 0.0  },
};
// Note: dist values increased slightly from single-avatar version
// so both characters fit comfortably in frame.

// ── Sims-style isometric camera ──────────────────────────────────
const SIMS_CAM = {
  heightAbove:  4.5,
  distBack:     5.0,
  distSide:     2.5,
  lookAtHeight: 0.8,
};

let _simsMode = false;
export function setSimsMode(on) { _simsMode = on; }
export function getSimsMode()   { return _simsMode; }

// ── Angle presets — BACK/BACK_HIGH/OVER_SHOULDER removed from
//    activity pools; they reliably point into walls in a dual-
//    avatar setup where the house is behind them. ──────────────────
const ANGLE_PRESETS = {
  FRONT:     { angleOffset:  0,              distMult: 1.0,  heightMult: 1.0,  lookOffset:  0.0  },
  FRONT_LOW: { angleOffset:  0,              distMult: 1.1,  heightMult: 0.82, lookOffset: -0.08 },
  CLOSE:     { angleOffset:  0,              distMult: 0.70, heightMult: 1.06, lookOffset:  0.06 },
  SIDE_L:    { angleOffset: -Math.PI / 2,    distMult: 1.05, heightMult: 1.0,  lookOffset:  0.0  },
  SIDE_R:    { angleOffset:  Math.PI / 2,    distMult: 1.05, heightMult: 1.0,  lookOffset:  0.0  },
  SIDE_L_LOW:{ angleOffset: -Math.PI / 2,    distMult: 1.1,  heightMult: 0.85, lookOffset: -0.05 },
  SIDE_R_LOW:{ angleOffset:  Math.PI / 2,    distMult: 1.1,  heightMult: 0.85, lookOffset: -0.05 },
  WIDE:      { angleOffset:  0,              distMult: 2.0,  heightMult: 1.20, lookOffset: -0.08 },
  QUARTER_L: { angleOffset: -Math.PI / 4,    distMult: 1.1,  heightMult: 1.0,  lookOffset:  0.0  },
  QUARTER_R: { angleOffset:  Math.PI / 4,    distMult: 1.1,  heightMult: 1.0,  lookOffset:  0.0  },
  // BACK / BACK_HIGH / OVER_SHOULDER / WIDE_SIDE intentionally omitted —
  // they face into the house wall with the current spawn layout.
};

// ── Activity → angle pool — safe presets only ────────────────────
const ACTIVITY_ANGLES = {
  idle:        ['FRONT', 'FRONT', 'QUARTER_L', 'QUARTER_R', 'WIDE'],
  dance:       ['WIDE', 'WIDE', 'SIDE_L', 'SIDE_R', 'FRONT_LOW'],
  stretch:     ['SIDE_L', 'SIDE_R', 'WIDE', 'FRONT'],
  hairflick:   ['SIDE_L', 'SIDE_R', 'QUARTER_R', 'CLOSE'],
  hiponhip:    ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'QUARTER_R'],
  sofaSit:     ['FRONT', 'FRONT', 'SIDE_L', 'SIDE_R', 'QUARTER_L'],
  phoneScroll: ['SIDE_R', 'QUARTER_R', 'FRONT'],
  tvReact:     ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'WIDE'],
  readBook:    ['SIDE_L', 'SIDE_R', 'FRONT'],
  typing:      ['SIDE_L', 'SIDE_R', 'QUARTER_L'],
  monitor:     ['SIDE_R', 'SIDE_L', 'QUARTER_R'],
  stirring:    ['SIDE_L', 'QUARTER_L', 'FRONT'],
  chopping:    ['SIDE_R', 'SIDE_L'],
  tasting:     ['FRONT', 'CLOSE', 'QUARTER_R'],
  mirrorPose:  ['SIDE_L', 'SIDE_R', 'FRONT'],
  noseCover:   ['CLOSE', 'FRONT', 'QUARTER_R'],
  windowLook:  ['SIDE_L', 'SIDE_R', 'WIDE'],
  fireGaze:    ['SIDE_L', 'SIDE_R', 'FRONT_LOW'],
  washingUp:   ['SIDE_L', 'QUARTER_L'],
  cabinetOpen: ['SIDE_R', 'QUARTER_R'],
};

const ANGLE_DWELL_MIN_MS = 6000;
const ANGLE_DWELL_MAX_MS = 14000;

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
  camMode = mode;
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

// ── Snap camera to midpoint of both avatars on first load ────────
export function _snapCameraToVRM() {
  const vrm  = getVrm();
  if (!vrm) return;
  const lora = getVrmLora ? getVrmLora() : null;

  const mx = lora ? (vrm.scene.position.x + lora.scene.position.x) / 2 : vrm.scene.position.x;
  const my = vrm.scene.position.y;
  const mz = lora ? (vrm.scene.position.z + lora.scene.position.z) / 2 : vrm.scene.position.z;

  const p  = STREAMER_CAM.IDLE;
  const fy = vrm.scene.rotation.y;
  _camFacingY = fy;

  const cx = mx - Math.sin(fy) * p.dist + Math.cos(fy) * p.sideShift;
  const cy = my + p.height;
  const cz = mz - Math.cos(fy) * p.dist - Math.sin(fy) * p.sideShift;

  camCurrent.x = cx; camCurrent.y = cy; camCurrent.z = cz;
  camCurrent.lookX = mx; camCurrent.lookY = my + p.lookHeight; camCurrent.lookZ = mz;
  camera.position.set(cx, cy, cz);
  camera.lookAt(mx, my + p.lookHeight, mz);
}

// ── Internal: pick angle from activity pool ──────────────────────
function _pickAngleForActivity(activityName) {
  const pool = ACTIVITY_ANGLES[activityName] || ACTIVITY_ANGLES.idle;
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick === _currentAnglePreset && pool.length > 1) {
    pick = pool[Math.floor(Math.random() * pool.length)];
  }
  _currentAnglePreset = pick;
}

// ── Main update — called every frame ────────────────────────────
export function updateCamera(delta) {
  const vrm  = getVrm();
  if (!vrm) return;
  const lora = getVrmLora ? getVrmLora() : null;

  // ── Midpoint — orbit around the centre of both avatars ────────
  const mx = lora ? (vrm.scene.position.x + lora.scene.position.x) / 2 : vrm.scene.position.x;
  const my = vrm.scene.position.y;
  const mz = lora ? (vrm.scene.position.z + lora.scene.position.z) / 2 : vrm.scene.position.z;

  // ── SIMS MODE ─────────────────────────────────────────────────
  if (_simsMode) {
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

  // ── Smooth facing angle (use Miss's facing as the reference) ──
  const rawFacing = vrm.scene.rotation.y;
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

  // ── Resolve interaction preset & angle ────────────────────────
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

  // ── Compute target position around the midpoint ───────────────
  const orbitAngle = _camFacingY + effectiveAngle.angleOffset;
  const dist       = interactionPreset.dist      * effectiveAngle.distMult;
  const height     = interactionPreset.height     * effectiveAngle.heightMult;
  const lookHeight = interactionPreset.lookHeight + effectiveAngle.lookOffset;

  const tx = mx + Math.sin(orbitAngle) * dist;
  const ty = my + height;
  const tz = mz + Math.cos(orbitAngle) * dist;

  // ── Wall clamp ────────────────────────────────────────────────
  const clampedX = Math.max(
    HOUSE_BOUNDS.minX + CAM_WALL_MARGIN,
    Math.min(HOUSE_BOUNDS.maxX - CAM_WALL_MARGIN, tx)
  );
  const clampedZ = Math.max(
    HOUSE_BOUNDS.minZ + CAM_WALL_MARGIN,
    Math.min(HOUSE_BOUNDS.maxZ - CAM_WALL_MARGIN, tz)
  );

  // ── Lerp ─────────────────────────────────────────────────────
  const L = camMode === 'SPEAK' ? 0.09
          : walk.active          ? 0.03
          : 0.018;

  const lerpFactor = Math.min(1, L * 60 * delta);
  camCurrent.x     += (clampedX        - camCurrent.x)    * lerpFactor;
  camCurrent.y     += (ty              - camCurrent.y)     * lerpFactor;
  camCurrent.z     += (clampedZ        - camCurrent.z)     * lerpFactor;
  camCurrent.lookX += (mx              - camCurrent.lookX) * Math.min(1, lerpFactor * 1.5);
  camCurrent.lookY += (my + lookHeight - camCurrent.lookY) * Math.min(1, lerpFactor * 1.5);
  camCurrent.lookZ += (mz              - camCurrent.lookZ) * Math.min(1, lerpFactor * 1.5);

  camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
  camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
}
