// ================================================================
//  engine-camera.js  — PODCAST TWO-SHOT
//  Fixed camera on Miss OG Tinz + Lora seated at the desk. No house,
//  no rooms, no walls, no drone paths. Two states only:
//   - IDLE:  wide two-shot, both hosts framed, centered
//   - SPEAK: gentle push + pan toward whichever host is talking,
//            driven by window._currentSpeaker ('miss' | 'lora' | null)
//            set from engine-life.js and engine-bff.js.
// ================================================================

import { camera, MISS_SEAT_X, LORA_SEAT_X } from './engine-scene.js';

// ── Public camera-mode API (kept so engine-life.js call sites don't
// need to change: setCamMode('IDLE' | 'SPEAK' | 'THINK' | 'WALK')) ──
let camMode = 'IDLE';
export function setCamMode(mode) { camMode = mode; }
export function getCamMode()     { return camMode; }

// Kept as no-ops so existing calls elsewhere don't break — neither
// concept applies to a static seated desk scene anymore.
export function onActivityChanged(_activityName) {}
export function setSleepMode(_on) {}

// ── Shot definitions ──────────────────────────────────────────────
const WIDE = { x: 0, y: 1.50, z: 3.35, lookX: 0, lookY: 1.25, lookZ: 0 };

// How far the camera dollies in + pans toward the active speaker.
// Kept gentle — this should read as "leaning in", not a hard cut.
const PUSH_IN_Z   = 0.55;  // move this much closer on SPEAK/THINK
const PAN_TOWARD  = 0.42;  // fraction of the speaker's seat-X to pan toward
const LOOK_TOWARD = 0.55;  // fraction of the speaker's seat-X the look-at leans

function _speakerSeatX() {
  const who = (typeof window !== 'undefined') ? window._currentSpeaker : null;
  if (who === 'miss') return MISS_SEAT_X;
  if (who === 'lora') return LORA_SEAT_X;
  return 0; // nobody speaking (or banter/exchange not yet wired) — stay centered
}

function _targetShot() {
  if (camMode === 'SPEAK' || camMode === 'THINK') {
    const seatX = _speakerSeatX();
    return {
      x: WIDE.x + seatX * PAN_TOWARD,
      y: WIDE.y,
      z: WIDE.z - PUSH_IN_Z,
      lookX: seatX * LOOK_TOWARD,
      lookY: WIDE.lookY,
      lookZ: WIDE.lookZ,
    };
  }
  // IDLE / WALK (WALK is unused now — no one walks — but mapped safely to WIDE)
  return WIDE;
}

// ── Smoothed current camera state ─────────────────────────────────
export const camCurrent = { x: WIDE.x, y: WIDE.y, z: WIDE.z, lookX: WIDE.lookX, lookY: WIDE.lookY, lookZ: WIDE.lookZ };

export function updateCamera(delta) {
  if (!camera) return;
  const target = _targetShot();

  // Faster lerp while pushing in on a speaker so it reads as a deliberate
  // lean-in, slower drift back out to the wide shot on IDLE.
  const L  = (camMode === 'SPEAK' || camMode === 'THINK') ? 0.08 : 0.035;
  const lf = Math.min(1, L * 60 * delta);

  camCurrent.x     += (target.x     - camCurrent.x)     * lf;
  camCurrent.y     += (target.y     - camCurrent.y)     * lf;
  camCurrent.z     += (target.z     - camCurrent.z)     * lf;
  camCurrent.lookX += (target.lookX - camCurrent.lookX) * lf;
  camCurrent.lookY += (target.lookY - camCurrent.lookY) * lf;
  camCurrent.lookZ += (target.lookZ - camCurrent.lookZ) * lf;

  camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
  camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
}
