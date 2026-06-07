// ================================================================
//  engine-camera.js
//  Streamer portrait orbital camera.
//  Reads vrm world position + _camFacingY, writes camera.position.
// ================================================================

import { camera, vrm } from './engine-scene.js';
import { walk } from './engine-life.js';

// ── Camera mode ──────────────────────────────────────────────────
let camMode = 'IDLE';
export const CAM_LERP = 0.04;

// Orbital presets: dist from avatar, height above feet, lookHeight, sideShift
export const STREAMER_CAM = {
  IDLE:  { dist: 1.80, height: 1.52, lookHeight: 1.12, sideShift: 0.0  },
  SPEAK: { dist: 0.95, height: 1.62, lookHeight: 1.44, sideShift: 0.0  },
  THINK: { dist: 1.40, height: 1.56, lookHeight: 1.30, sideShift: 0.22 },
  WALK:  { dist: 2.20, height: 1.60, lookHeight: 1.15, sideShift: 0.0  },
};

// Smoothed camera state
export const camCurrent = { x: 0, y: 1.50, z: 2.6, lookX: 0, lookY: 1.10, lookZ: 0 };

// Smoothed facing angle used by camera (separate from VRM rotation to avoid jitter)
export let _camFacingY = Math.PI; // starts facing +Z

export function setCamMode(mode) {
  if (!['IDLE','SPEAK','THINK','WALK'].includes(mode)) return;
  camMode = mode;
}

// Allow engine-scene to reset the facing angle when placing VRM
export function resetCamFacingY(angle = Math.PI) {
  _camFacingY = angle;
}

// Instantly snap camera to orbit in front of her face.
export function _snapCameraToVRM() {
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

// Called every frame from render loop
export function updateCamera(delta) {
  if (!vrm) return;
  const vx = vrm.scene.position.x;
  const vy = vrm.scene.position.y;
  const vz = vrm.scene.position.z;

  // Smooth facing angle to avoid camera jitter
  let rawFacing = vrm.scene.rotation.y;
  let df = rawFacing - _camFacingY;
  while (df >  Math.PI) df -= Math.PI * 2;
  while (df < -Math.PI) df += Math.PI * 2;
  const facingLerp = walk.active ? 0.025 : 0.035;
  _camFacingY += df * Math.min(1, delta / facingLerp);
  _camFacingY  = ((_camFacingY % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);

  const camPreset = walk.active ? STREAMER_CAM.WALK : (STREAMER_CAM[camMode] || STREAMER_CAM.IDLE);
  const fy = _camFacingY;

  // Camera opposite to facing direction → always shows her face
  const tx = vx - Math.sin(fy) * camPreset.dist + Math.cos(fy) * camPreset.sideShift;
  const ty = vy + camPreset.height;
  const tz = vz - Math.cos(fy) * camPreset.dist - Math.sin(fy) * camPreset.sideShift;

  const L = camMode === 'SPEAK' ? 0.09 : walk.active ? 0.03 : CAM_LERP;
  camCurrent.x     += (tx - camCurrent.x)     * Math.min(1, L * 60 * delta);
  camCurrent.y     += (ty - camCurrent.y)     * Math.min(1, L * 60 * delta);
  camCurrent.z     += (tz - camCurrent.z)     * Math.min(1, L * 60 * delta);
  camCurrent.lookX += (vx - camCurrent.lookX) * Math.min(1, L * 60 * delta * 1.5);
  camCurrent.lookY += (vy + camPreset.lookHeight - camCurrent.lookY) * Math.min(1, L * 60 * delta * 1.5);
  camCurrent.lookZ += (vz - camCurrent.lookZ) * Math.min(1, L * 60 * delta * 1.5);

  camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
  camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
}
