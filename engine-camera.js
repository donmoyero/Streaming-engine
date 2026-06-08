// ================================================================
//  engine-camera.js
//  Streamer portrait orbital camera — upgraded.
//  
//  NEW in this version:
//  ─ Angle presets: FRONT, BACK, SIDE_L, SIDE_R, WIDE, CLOSE,
//    OVER_SHOULDER — camera orbits around the avatar at any angle
//  ─ Activity-aware auto-switching: dance → wide/side, mirror →
//    back, typing → side, speaking → front close-up, etc.
//  ─ Dwell timer: camera holds an angle for a natural duration
//    then picks the next creative angle from the activity pool
//  ─ All original modes (IDLE/SPEAK/THINK/WALK) preserved exactly
//  ─ Wall-clamp preserved — camera never clips through house walls
//  ─ SIMS MODE: elevated isometric-style camera that floats above
//    and behind the avatar at a fixed world angle (not orbit-based)
// ================================================================

import { camera, getVrm, HOUSE_BOUNDS } from './engine-scene.js';
import { walk } from './engine-life.js';

// ── Wall-clamp margin ────────────────────────────────────────────
const CAM_WALL_MARGIN = 0.5;

// ── Interaction mode (IDLE / SPEAK / THINK / WALK) ───────────────
let camMode = 'IDLE';
export const CAM_LERP = 0.04;

export const STREAMER_CAM = {
  IDLE:  { dist: 1.80, height: 1.52, lookHeight: 1.12, sideShift: 0.0  },
  SPEAK: { dist: 0.95, height: 1.62, lookHeight: 1.44, sideShift: 0.0  },
  THINK: { dist: 1.40, height: 1.56, lookHeight: 1.30, sideShift: 0.22 },
  WALK:  { dist: 2.20, height: 1.60, lookHeight: 1.15, sideShift: 0.0  },
};

// ── Sims-style isometric camera preset ───────────────────────────
// Fixed world-angle elevated camera — does not orbit with her facing.
// heightAbove: how far above the avatar the camera sits
// distBack:    horizontal distance behind the avatar (world Z)
// distSide:    horizontal offset to the side (world X)
// lookAtHeight: Y on the avatar to look at (hips feel more natural than face)
const SIMS_CAM = {
  heightAbove:  4.5,
  distBack:     5.0,
  distSide:     2.5,
  lookAtHeight: 0.8,
};

// Sims mode flag + public toggle
let _simsMode = false;
export function setSimsMode(on) { _simsMode = on; }
export function getSimsMode()   { return _simsMode; }

// ── Angle presets ────────────────────────────────────────────────
const ANGLE_PRESETS = {
  FRONT:          { angleOffset:  0,              distMult: 1.0,  heightMult: 1.0,  lookOffset:  0.0  },
  FRONT_LOW:      { angleOffset:  0,              distMult: 1.1,  heightMult: 0.82, lookOffset: -0.08 },
  CLOSE:          { angleOffset:  0,              distMult: 0.58, heightMult: 1.08, lookOffset:  0.08 },
  BACK:           { angleOffset:  Math.PI,        distMult: 1.05, heightMult: 1.0,  lookOffset:  0.0  },
  BACK_HIGH:      { angleOffset:  Math.PI,        distMult: 1.2,  heightMult: 1.35, lookOffset:  0.05 },
  SIDE_L:         { angleOffset: -Math.PI / 2,    distMult: 1.0,  heightMult: 1.0,  lookOffset:  0.0  },
  SIDE_R:         { angleOffset:  Math.PI / 2,    distMult: 1.0,  heightMult: 1.0,  lookOffset:  0.0  },
  SIDE_L_LOW:     { angleOffset: -Math.PI / 2,    distMult: 1.1,  heightMult: 0.85, lookOffset: -0.05 },
  SIDE_R_LOW:     { angleOffset:  Math.PI / 2,    distMult: 1.1,  heightMult: 0.85, lookOffset: -0.05 },
  WIDE:           { angleOffset:  0,              distMult: 2.2,  heightMult: 1.25, lookOffset: -0.1  },
  WIDE_SIDE:      { angleOffset: -Math.PI / 3,    distMult: 2.0,  heightMult: 1.2,  lookOffset: -0.08 },
  OVER_SHOULDER:  { angleOffset:  Math.PI * 0.75, distMult: 0.9,  heightMult: 1.15, lookOffset:  0.12 },
  QUARTER_L:      { angleOffset: -Math.PI / 4,    distMult: 1.1,  heightMult: 1.0,  lookOffset:  0.0  },
  QUARTER_R:      { angleOffset:  Math.PI / 4,    distMult: 1.1,  heightMult: 1.0,  lookOffset:  0.0  },
};

// ── Activity → angle pool mapping ────────────────────────────────
const ACTIVITY_ANGLES = {
  idle:        ['FRONT', 'FRONT', 'QUARTER_L', 'QUARTER_R', 'SIDE_L', 'SIDE_R'],
  dance:       ['WIDE', 'WIDE', 'WIDE_SIDE', 'SIDE_L', 'SIDE_R', 'FRONT_LOW'],
  stretch:     ['SIDE_L', 'SIDE_R', 'WIDE', 'FRONT'],
  hairflick:   ['SIDE_L', 'SIDE_R', 'QUARTER_R', 'CLOSE'],
  hiponhip:    ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'QUARTER_R', 'WIDE_SIDE'],
  sofaSit:     ['FRONT', 'FRONT', 'SIDE_L', 'SIDE_R', 'QUARTER_L'],
  phoneScroll: ['SIDE_R', 'QUARTER_R', 'FRONT', 'OVER_SHOULDER'],
  tvReact:     ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'WIDE'],
  readBook:    ['SIDE_L', 'SIDE_R', 'OVER_SHOULDER', 'FRONT'],
  typing:      ['SIDE_L', 'SIDE_R', 'OVER_SHOULDER', 'QUARTER_L'],
  monitor:     ['SIDE_R', 'OVER_SHOULDER', 'SIDE_L', 'BACK_HIGH'],
  stirring:    ['SIDE_L', 'QUARTER_L', 'FRONT', 'OVER_SHOULDER'],
  chopping:    ['SIDE_R', 'OVER_SHOULDER', 'SIDE_L'],
  tasting:     ['FRONT', 'CLOSE', 'QUARTER_R'],
  mirrorPose:  ['BACK', 'BACK_HIGH', 'BACK', 'SIDE_L'],
  noseCover:   ['CLOSE', 'FRONT', 'QUARTER_R'],
  windowLook:  ['SIDE_L', 'SIDE_R', 'BACK_HIGH', 'OVER_SHOULDER'],
  fireGaze:    ['SIDE_L', 'SIDE_R', 'FRONT_LOW', 'WIDE'],
  washingUp:   ['SIDE_L', 'OVER_SHOULDER', 'QUARTER_L'],
  cabinetOpen: ['SIDE_R', 'OVER_SHOULDER', 'BACK_HIGH'],
};

// How long (ms) the camera holds an angle before switching
const ANGLE_DWELL_MIN_MS = 6000;
const ANGLE_DWELL_MAX_MS = 14000;

// ── Active angle state ───────────────────────────────────────────
let _currentAnglePreset = 'FRONT';
let _angleDwellTimer    = 0;
let _angleDwellDuration = ANGLE_DWELL_MIN_MS;
let _currentActivity    = 'idle';

// ── Smoothed camera state ────────────────────────────────────────
export const camCurrent = { x: 0, y: 1.50, z: 2.6, lookX: 0, lookY: 1.10, lookZ: 0 };

// ── Smoothed facing angle ────────────────────────────────────────
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

export function _snapCameraToVRM() {
  const vrm = getVrm();
  if (!vrm) return;
  const vx = vrm.scene.position.x;
  const vy = vrm.scene.position.y;
  const vz = vrm.scene.position.z;
  const p  = STREAMER_CAM.IDLE;
  const fy = vrm.scene.rotation.y;
  _camFacingY = fy;
  const cx = vx - Math.sin(fy) * p.dist + Math.cos(fy) * p.sideShift;
  const cy = vy + p.height;
  const cz = vz - Math.cos(fy) * p.dist - Math.sin(fy) * p.sideShift;
  camCurrent.x = cx; camCurrent.y = cy; camCurrent.z = cz;
  camCurrent.lookX = vx; camCurrent.lookY = vy + p.lookHeight; camCurrent.lookZ = vz;
  camera.position.set(cx, cy, cz);
  camera.lookAt(vx, vy + p.lookHeight, vz);
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

// ── Main update — called every frame from render loop ────────────
export function updateCamera(delta) {
  const vrm = getVrm();
  if (!vrm) return;

  const vx = vrm.scene.position.x;
  const vy = vrm.scene.position.y;
  const vz = vrm.scene.position.z;

  // ── SIMS MODE — fixed elevated world-angle camera ─────────────
  // Ignores her facing direction entirely. Camera sits up high at
  // a fixed offset (distSide, heightAbove, distBack) in world space
  // and slowly drifts to follow her as she moves around the house.
  if (_simsMode) {
    const tx = vx + SIMS_CAM.distSide;
    const ty = vy + SIMS_CAM.heightAbove;
    const tz = vz + SIMS_CAM.distBack;

    // Slow cinematic follow — feels like the Sims camera drifting
    const L = 0.025;
    camCurrent.x += (tx - camCurrent.x) * Math.min(1, L * 60 * delta);
    camCurrent.y += (ty - camCurrent.y) * Math.min(1, L * 60 * delta);
    camCurrent.z += (tz - camCurrent.z) * Math.min(1, L * 60 * delta);

    // Look-at tracks her a little faster so she stays centred
    camCurrent.lookX += (vx - camCurrent.lookX) * Math.min(1, L * 60 * delta * 2);
    camCurrent.lookY += (vy + SIMS_CAM.lookAtHeight - camCurrent.lookY) * Math.min(1, L * 60 * delta * 2);
    camCurrent.lookZ += (vz - camCurrent.lookZ) * Math.min(1, L * 60 * delta * 2);

    camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
    camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
    return; // skip all normal orbital camera logic
  }

  // ── Smooth facing angle (prevents camera jitter on fast turns) ─
  const rawFacing = vrm.scene.rotation.y;
  let df = rawFacing - _camFacingY;
  while (df >  Math.PI) df -= Math.PI * 2;
  while (df < -Math.PI) df += Math.PI * 2;
  const facingLerp = walk.active ? 0.025 : 0.035;
  _camFacingY += df * Math.min(1, delta / facingLerp);
  _camFacingY  = ((_camFacingY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // ── Angle dwell timer — auto-switch while activity is active ───
  if (camMode === 'IDLE' && !walk.active) {
    _angleDwellTimer += delta * 1000;
    if (_angleDwellTimer >= _angleDwellDuration) {
      _angleDwellTimer    = 0;
      _angleDwellDuration = ANGLE_DWELL_MIN_MS + Math.random() * (ANGLE_DWELL_MAX_MS - ANGLE_DWELL_MIN_MS);
      _pickAngleForActivity(_currentActivity);
    }
  }

  // ── Resolve which distance/height preset to use ────────────────
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

  // ── Compute target camera position ────────────────────────────
  const orbitAngle = _camFacingY + effectiveAngle.angleOffset;
  const dist       = interactionPreset.dist       * effectiveAngle.distMult;
  const height     = interactionPreset.height      * effectiveAngle.heightMult;
  const lookHeight = interactionPreset.lookHeight  + effectiveAngle.lookOffset;

  const tx = vx + Math.sin(orbitAngle) * dist;
  const ty = vy + height;
  const tz = vz + Math.cos(orbitAngle) * dist;

  // ── Wall clamp ────────────────────────────────────────────────
  const clampedX = Math.max(HOUSE_BOUNDS.minX + CAM_WALL_MARGIN, Math.min(HOUSE_BOUNDS.maxX - CAM_WALL_MARGIN, tx));
  const clampedZ = Math.max(HOUSE_BOUNDS.minZ + CAM_WALL_MARGIN, Math.min(HOUSE_BOUNDS.maxZ - CAM_WALL_MARGIN, tz));

  // ── Lerp speed ────────────────────────────────────────────────
  const L = camMode === 'SPEAK' ? 0.09
          : walk.active          ? 0.03
          : 0.018;

  const lerpFactor = Math.min(1, L * 60 * delta);
  camCurrent.x     += (clampedX    - camCurrent.x)     * lerpFactor;
  camCurrent.y     += (ty          - camCurrent.y)      * lerpFactor;
  camCurrent.z     += (clampedZ    - camCurrent.z)      * lerpFactor;
  camCurrent.lookX += (vx          - camCurrent.lookX)  * Math.min(1, lerpFactor * 1.5);
  camCurrent.lookY += (vy + lookHeight - camCurrent.lookY) * Math.min(1, lerpFactor * 1.5);
  camCurrent.lookZ += (vz          - camCurrent.lookZ)  * Math.min(1, lerpFactor * 1.5);

  camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
  camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
}
