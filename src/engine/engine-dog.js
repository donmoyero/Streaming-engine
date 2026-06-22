// ================================================================
//  engine-dog.js — ALAKURIN (the dog)
//  Pure hand-authored behaviour — no AI/LLM calls, nothing here ever
//  hits a backend. Every activity is a deterministic bone animation
//  picked by engine-life.js's dog scheduler.
//
//  RIG NOTE — read this before touching any rotation value below:
//  Alakurin.vrm is a real VRMC_vrm 1.0 humanoid file, but the mesh is
//  a dog skinned onto a Mixamo-style BIPED bone hierarchy (a common
//  trick so quadruped assets stay animation-tool compatible). That
//  means we reuse the standard VRM humanoid bone names, but they map
//  onto dog anatomy like this:
//
//    leftUpperArm / leftLowerArm / leftHand / leftIndexProximal...
//      → FRONT-LEFT leg (shoulder / elbow / paw / toes)
//    rightUpperArm / ...                      → FRONT-RIGHT leg
//    leftUpperLeg / leftLowerLeg / leftFoot / leftToes
//      → BACK-LEFT leg (hip / knee / paw / toes)
//    rightUpperLeg / ...                      → BACK-RIGHT leg
//    hips / spine / chest / upperChest / neck / head → body + head
//
//  There is NO tail bone and NO morph targets/blendshapes on this
//  particular export (checked the raw glTF — zero morph targets on
//  every mesh primitive). That means:
//    - no real tail wag (per your call: faked with a body wiggle —
//      see ACTIVITY_DOG 'happyWiggle' below)
//    - no ear movement, no jaw/mouth movement, no facial expressions
//  Everything Alakurin "says" has to come through body/leg/head
//  posing only. If you re-rig him later with a tail bone, search for
//  "TAIL HOOK" below — that's where real tail rotation would plug in.
//
//  VRM 1.0 also forces a literal T-pose at identity rotation for every
//  humanoid bone (front legs splayed out to the sides, spine upright).
//  setRestPoseDog() below is the corrective pose that brings him into
//  a natural standing stance. I could not preview the actual render
//  while writing this, so the two constants DOG_FRONT_LEG_DROP_Z and
//  DOG_BODY_PITCH_X are best-effort starting points, not measured
//  values — load him in the browser and nudge those two numbers
//  (and only those two, the rest of the system doesn't change) until
//  he looks right. Everything else (gait, sit, sleep, etc.) is built
//  as relative offsets on top of whatever those two end up being, so
//  tuning them won't break anything downstream.
// ================================================================

import { getVrmDog } from './engine-scene.js';

const _vrmDog = () => getVrmDog();

// ── Tuning zone — the only two values you should need to hand-adjust ──
export let DOG_FRONT_LEG_DROP_Z = 1.57; // π/2 — straight down from T-pose shoulder
export let DOG_BODY_PITCH_X     = -1.30; // tips the whole torso horizontal like a real dog
                                          // instead of lying along a horizontal back

// ── Bone refs — populated by cacheBonesDog() after the VRM loads ────
export let boneHipsDog = null, boneSpineDog = null, boneChestDog = null, boneUpperChestDog = null;
export let boneNeckDog = null, boneHeadDog = null;
// Front legs (riding on arm bones)
export let boneFLShoulderDog = null, boneFRShoulderDog = null;
export let boneFLUpperDog = null, boneFRUpperDog = null;   // upperArm  = upper front leg
export let boneFLLowerDog = null, boneFRLowerDog = null;   // lowerArm  = lower front leg
export let boneFLPawDog   = null, boneFRPawDog   = null;   // hand      = front paw
export let boneFLToeDog   = null, boneFRToeDog   = null;   // indexProximal = front toes
// Back legs (riding on leg bones)
export let boneBLUpperDog = null, boneBRUpperDog = null;   // upperLeg
export let boneBLLowerDog = null, boneBRLowerDog = null;   // lowerLeg
export let boneBLPawDog   = null, boneBRPawDog   = null;   // foot
export let boneBLToeDog   = null, boneBRToeDog   = null;   // toes

export function cacheBonesDog() {
  const vrm = _vrmDog();
  if (!vrm || !vrm.humanoid) return;
  const h = vrm.humanoid;

  boneHipsDog       = h.getNormalizedBoneNode('hips');
  boneSpineDog      = h.getNormalizedBoneNode('spine');
  boneChestDog      = h.getNormalizedBoneNode('chest');
  boneUpperChestDog = h.getNormalizedBoneNode('upperChest');
  boneNeckDog       = h.getNormalizedBoneNode('neck');
  boneHeadDog       = h.getNormalizedBoneNode('head');

  boneFLShoulderDog = h.getNormalizedBoneNode('leftShoulder');
  boneFRShoulderDog = h.getNormalizedBoneNode('rightShoulder');
  boneFLUpperDog    = h.getNormalizedBoneNode('leftUpperArm');
  boneFRUpperDog    = h.getNormalizedBoneNode('rightUpperArm');
  boneFLLowerDog    = h.getNormalizedBoneNode('leftLowerArm');
  boneFRLowerDog    = h.getNormalizedBoneNode('rightLowerArm');
  boneFLPawDog      = h.getNormalizedBoneNode('leftHand');
  boneFRPawDog      = h.getNormalizedBoneNode('rightHand');
  boneFLToeDog      = h.getNormalizedBoneNode('leftIndexProximal');
  boneFRToeDog      = h.getNormalizedBoneNode('rightIndexProximal');

  boneBLUpperDog    = h.getNormalizedBoneNode('leftUpperLeg');
  boneBRUpperDog    = h.getNormalizedBoneNode('rightUpperLeg');
  boneBLLowerDog    = h.getNormalizedBoneNode('leftLowerLeg');
  boneBRLowerDog    = h.getNormalizedBoneNode('rightLowerLeg');
  boneBLPawDog      = h.getNormalizedBoneNode('leftFoot');
  boneBRPawDog      = h.getNormalizedBoneNode('rightFoot');
  boneBLToeDog      = h.getNormalizedBoneNode('leftToes');
  boneBRToeDog      = h.getNormalizedBoneNode('rightToes');

  console.log('[Dog] Bones cached:', { boneHipsDog, boneFLUpperDog, boneBLUpperDog, boneHeadDog });
}

// ── Natural standing pose (corrective fix for VRM's mandatory T-pose) ──
export function setRestPoseDog() {
  if (boneFLUpperDog) { boneFLUpperDog.rotation.z =  DOG_FRONT_LEG_DROP_Z; boneFLUpperDog.rotation.x = 0.10; }
  if (boneFRUpperDog) { boneFRUpperDog.rotation.z = -DOG_FRONT_LEG_DROP_Z; boneFRUpperDog.rotation.x = 0.10; }
  if (boneFLLowerDog) boneFLLowerDog.rotation.x = 0.12;
  if (boneFRLowerDog) boneFRLowerDog.rotation.x = 0.12;
  if (boneFLPawDog)   boneFLPawDog.rotation.x   = -0.05;
  if (boneFRPawDog)   boneFRPawDog.rotation.x   = -0.05;
  if (boneFLToeDog)   boneFLToeDog.rotation.x   = 0.06;
  if (boneFRToeDog)   boneFRToeDog.rotation.x   = 0.06;

  if (boneBLUpperDog) boneBLUpperDog.rotation.z = -0.02;
  if (boneBRUpperDog) boneBRUpperDog.rotation.z =  0.02;
  if (boneBLLowerDog) boneBLLowerDog.rotation.x = 0.10;
  if (boneBRLowerDog) boneBRLowerDog.rotation.x = 0.10;
  if (boneBLPawDog)   boneBLPawDog.rotation.x   = -0.05;
  if (boneBRPawDog)   boneBRPawDog.rotation.x   = -0.05;
  if (boneBLToeDog)   boneBLToeDog.rotation.x   = 0.08;
  if (boneBRToeDog)   boneBRToeDog.rotation.x   = 0.08;

  if (boneHipsDog)  boneHipsDog.rotation.x  = DOG_BODY_PITCH_X;
  if (boneSpineDog) boneSpineDog.rotation.x = DOG_BODY_PITCH_X * 0.3;
  if (boneChestDog) boneChestDog.rotation.x = DOG_BODY_PITCH_X * 0.15;
  if (boneNeckDog)  boneNeckDog.rotation.x  = Math.abs(DOG_BODY_PITCH_X) * 0.55; // lift head back to level
  if (boneHeadDog)  boneHeadDog.rotation.x  = Math.abs(DOG_BODY_PITCH_X) * 0.25; // fine-tune head angle
}

// ================================================================
//  ACTIVITY SYSTEM — every state Alakurin can be in.
//  engine-life.js's dog scheduler sets ACTIVITY_DOG.current; this
//  file only ever reads it and poses bones. No network calls.
// ================================================================
export const ACTIVITY_DOG = {
  current:  'idle',
  timer:    0,
  duration: 6,
  phase:    0,
};

// States where he's "down" — used by the ZZZ sleep-indicator system
// in engine-life.js and the safety-radius/spot-blocking logic.
export const DOG_SLEEP_ACTS = new Set(['sleep']);
export const DOG_DOWN_ACTS  = new Set(['sit', 'lieDown', 'sleep', 'scratch']);

export function isDogAsleep() { return DOG_SLEEP_ACTS.has(ACTIVITY_DOG.current); }

export function activityUpdateDog(delta) {
  const vrm = _vrmDog();
  if (!vrm) return;
  ACTIVITY_DOG.timer += delta;
  const t = ACTIVITY_DOG.timer;

  switch (ACTIVITY_DOG.current) {

    // ── IDLE — standing, breathing, occasional head turn ─────────
    case 'idle': {
      const breathe = Math.sin(t * 1.1) * 0.02;
      if (boneChestDog) boneChestDog.rotation.x = DOG_BODY_PITCH_X * 0.15 + breathe;
      if (boneSpineDog) boneSpineDog.rotation.x = DOG_BODY_PITCH_X * 0.3 + breathe * 0.6;
      if (boneHeadDog) {
        boneHeadDog.rotation.y = Math.sin(t * 0.35) * 0.18;
        boneHeadDog.rotation.x = -0.10 + Math.sin(t * 0.5) * 0.03;
      }
      if (boneNeckDog) boneNeckDog.rotation.y = Math.sin(t * 0.35) * 0.08;
      // subtle weight-shift between front paws
      if (boneFLUpperDog) boneFLUpperDog.rotation.x = 0.10 + Math.sin(t * 0.6) * 0.015;
      if (boneFRUpperDog) boneFRUpperDog.rotation.x = 0.10 - Math.sin(t * 0.6) * 0.015;
      break;
    }

    // ── SIT — haunches down, front legs straight, looks around ───
    case 'sit': {
      if (boneBLUpperDog) boneBLUpperDog.rotation.x =  1.3;
      if (boneBRUpperDog) boneBRUpperDog.rotation.x =  1.3;
      if (boneBLLowerDog) boneBLLowerDog.rotation.x =  1.7;
      if (boneBRLowerDog) boneBRLowerDog.rotation.x =  1.7;
      if (boneBLPawDog)   boneBLPawDog.rotation.x   = -0.3;
      if (boneBRPawDog)   boneBRPawDog.rotation.x   = -0.3;
      if (boneHipsDog)    boneHipsDog.rotation.x    = DOG_BODY_PITCH_X - 0.35;
      if (boneSpineDog)   boneSpineDog.rotation.x   = DOG_BODY_PITCH_X * 0.3 + 0.15;
      if (boneHeadDog) {
        boneHeadDog.rotation.y = Math.sin(t * 0.3) * 0.25;
        boneHeadDog.rotation.x = -0.05 + Math.sin(t * 0.4) * 0.04;
      }
      break;
    }

    // ── LIE DOWN — flopped, head resting forward ──────────────────
    case 'lieDown': {
      if (boneBLUpperDog) boneBLUpperDog.rotation.x =  1.5;
      if (boneBRUpperDog) boneBRUpperDog.rotation.x =  1.5;
      if (boneBLLowerDog) boneBLLowerDog.rotation.x =  1.9;
      if (boneBRLowerDog) boneBRLowerDog.rotation.x =  1.9;
      if (boneFLUpperDog) boneFLUpperDog.rotation.x =  0.55;
      if (boneFRUpperDog) boneFRUpperDog.rotation.x =  0.55;
      if (boneFLLowerDog) boneFLLowerDog.rotation.x =  1.3;
      if (boneFRLowerDog) boneFRLowerDog.rotation.x =  1.3;
      if (boneHipsDog)    boneHipsDog.rotation.x    = DOG_BODY_PITCH_X - 0.55;
      if (boneSpineDog)   boneSpineDog.rotation.x   = DOG_BODY_PITCH_X * 0.3 + 0.25;
      if (boneHeadDog) {
        boneHeadDog.rotation.x = 0.25 + Math.sin(t * 0.5) * 0.03;
        boneHeadDog.rotation.y = Math.sin(t * 0.25) * 0.12;
      }
      break;
    }

    // ── SLEEP — same flop as lieDown, slower breathing, eyes shut ─
    // (no eyelid morph target on this export, so "eyes closing" is
    // skipped — the ZZZ sprite in engine-life.js carries the read.)
    case 'sleep': {
      const breathe = Math.sin(t * 0.5) * 0.025;
      if (boneBLUpperDog) boneBLUpperDog.rotation.x =  1.5;
      if (boneBRUpperDog) boneBRUpperDog.rotation.x =  1.5;
      if (boneBLLowerDog) boneBLLowerDog.rotation.x =  1.9;
      if (boneBRLowerDog) boneBRLowerDog.rotation.x =  1.9;
      if (boneFLUpperDog) boneFLUpperDog.rotation.x =  0.6;
      if (boneFRUpperDog) boneFRUpperDog.rotation.x =  0.6;
      if (boneFLLowerDog) boneFLLowerDog.rotation.x =  1.35;
      if (boneFRLowerDog) boneFRLowerDog.rotation.x =  1.35;
      if (boneHipsDog)    boneHipsDog.rotation.x    = DOG_BODY_PITCH_X - 0.55;
      if (boneSpineDog)   boneSpineDog.rotation.x   = DOG_BODY_PITCH_X * 0.3 + 0.25 + breathe;
      if (boneChestDog)   boneChestDog.rotation.x   = DOG_BODY_PITCH_X * 0.15 + breathe * 0.7;
      if (boneHeadDog)    boneHeadDog.rotation.x    = 0.3;
      if (boneNeckDog)    boneNeckDog.rotation.x    = 0.1;
      break;
    }

    // ── SNIFF — head down, slow forward creep, occasional pause ──
    case 'sniff': {
      if (boneHeadDog) {
        boneHeadDog.rotation.x = 0.45 + Math.sin(t * 3.5) * 0.06;
        boneHeadDog.rotation.y = Math.sin(t * 1.8) * 0.3;
      }
      if (boneNeckDog) boneNeckDog.rotation.x = 0.25;
      if (boneSpineDog) boneSpineDog.rotation.x = DOG_BODY_PITCH_X * 0.3 + 0.06;
      // tiny stepping shuffle while sniffing — handled by the slow
      // gait call the scheduler layers underneath this state
      break;
    }

    // ── BARK — quick head-up jolt + chest pop, no mouth (no morph) ─
    case 'bark': {
      const cycle = (t * 5) % 1;
      const jolt = cycle < 0.25 ? Math.sin(cycle / 0.25 * Math.PI) : 0;
      if (boneHeadDog)  boneHeadDog.rotation.x  = -0.10 - jolt * 0.35;
      if (boneNeckDog)  boneNeckDog.rotation.x  = -jolt * 0.15;
      if (boneChestDog) boneChestDog.rotation.x = DOG_BODY_PITCH_X * 0.15 - jolt * 0.08;
      if (boneFLUpperDog) boneFLUpperDog.rotation.x = 0.10 + jolt * 0.05;
      if (boneFRUpperDog) boneFRUpperDog.rotation.x = 0.10 + jolt * 0.05;
      break;
    }

    // ── WHINE — head droops and tilts, body sinks slightly ───────
    case 'whine': {
      if (boneHeadDog) {
        boneHeadDog.rotation.x = 0.30;
        boneHeadDog.rotation.z = Math.sin(t * 0.8) * 0.12;
      }
      if (boneNeckDog)  boneNeckDog.rotation.x = 0.15;
      if (boneHipsDog)  boneHipsDog.rotation.x = DOG_BODY_PITCH_X - 0.08;
      if (boneSpineDog) boneSpineDog.rotation.x = DOG_BODY_PITCH_X * 0.3 + 0.04;
      break;
    }

    // ── SCRATCH — sits, one back leg lifts to "scratch" ───────────
    case 'scratch': {
      const cycle = Math.sin(t * 9) * 0.5 + 0.5; // fast scratch rhythm
      if (boneBLUpperDog) boneBLUpperDog.rotation.x =  1.3;
      if (boneBRUpperDog) { boneBRUpperDog.rotation.x = 0.5; boneBRUpperDog.rotation.z = 0.5; }
      if (boneBLLowerDog) boneBLLowerDog.rotation.x =  1.7;
      if (boneBRLowerDog) boneBRLowerDog.rotation.x =  1.2 + cycle * 0.4;
      if (boneHipsDog)    boneHipsDog.rotation.x    = DOG_BODY_PITCH_X - 0.35;
      if (boneHipsDog)    boneHipsDog.rotation.z    = Math.sin(t * 9) * 0.06;
      if (boneHeadDog)    boneHeadDog.rotation.z    = -0.2;
      if (boneNeckDog)    boneNeckDog.rotation.z    = -0.15;
      break;
    }

    // ── CHASE TAIL — spins in a tight circle ──────────────────────
    case 'chaseTail': {
      if (vrm.scene) vrm.scene.rotation.y += delta * 5.5;
      if (boneSpineDog) boneSpineDog.rotation.y = Math.sin(t * 5.5) * 0.3;
      if (boneHeadDog)  boneHeadDog.rotation.y  = Math.sin(t * 5.5) * 0.4;
      if (boneNeckDog)  boneNeckDog.rotation.y  = Math.sin(t * 5.5) * 0.25;
      break;
    }

    // ── LOOK AT CAMERA — perks head toward the viewer ─────────────
    case 'lookAtCamera': {
      const ease = Math.min(1, t * 3);
      if (boneHeadDog) {
        boneHeadDog.rotation.x = -0.10 - ease * 0.12;
        boneHeadDog.rotation.y *= (1 - ease);
      }
      if (boneNeckDog) boneNeckDog.rotation.y *= (1 - ease);
      break;
    }

    // ── HAPPY WIGGLE — tail-wag substitute (no tail bone present) ─
    // Whole-rear wiggle reads as "happy dog" even without a tail.
    // TAIL HOOK: if you re-rig with a real tail bone, drive it here
    // with something like  boneTailDog.rotation.y = Math.sin(t*10)*0.6
    // and you can drop the hip/spine wiggle below if it's too much.
    case 'happyWiggle': {
      const wiggle = Math.sin(t * 10);
      if (boneHipsDog)  boneHipsDog.rotation.z  = wiggle * 0.22;
      if (boneSpineDog) boneSpineDog.rotation.y = wiggle * 0.10;
      if (boneHeadDog)  boneHeadDog.rotation.y  = Math.sin(t * 6) * 0.15;
      // little front-paw bounce
      if (boneFLUpperDog) boneFLUpperDog.rotation.x = 0.10 + Math.max(0, wiggle) * 0.12;
      if (boneFRUpperDog) boneFRUpperDog.rotation.x = 0.10 + Math.max(0, -wiggle) * 0.12;
      break;
    }
  }
}

// ================================================================
//  QUADRUPED GAIT — walk / trot / run
//  Called each frame from engine-scene's dog walk system while he's
//  moving. Uses a 2-beat trot timing (diagonal leg pairs) for all
//  three speeds — a real walk is a 4-beat lateral sequence, but the
//  2-beat version reads convincingly at a small dog's screen size
//  and keeps the math identical to Lora's existing biped gait, just
//  applied to two diagonal pairs instead of one left/right pair.
// ================================================================
let _dogGaitPhase = 0;

const DOG_GAIT_SPEED = { walk: 5.0, trot: 8.0,  run: 12.0 };
const DOG_GAIT_AMP   = { walk: 0.40, trot: 0.55, run: 0.78 };
const DOG_GAIT_BEND  = { walk: 0.45, trot: 0.60, run: 0.85 };

export function dogGaitUpdate(delta, mode = 'walk') {
  const spd  = DOG_GAIT_SPEED[mode] || DOG_GAIT_SPEED.walk;
  const amp  = DOG_GAIT_AMP[mode]   || DOG_GAIT_AMP.walk;
  const bend = DOG_GAIT_BEND[mode]  || DOG_GAIT_BEND.walk;

  _dogGaitPhase += delta * spd;
  const p = _dogGaitPhase;

  // Diagonal pair A: front-right + back-left swing forward together
  const swingA =  Math.sin(p);
  // Diagonal pair B: front-left + back-right — opposite phase
  const swingB =  Math.sin(p + Math.PI);

  const bendA = Math.max(0, -Math.sin(p + 0.4)) * bend;
  const bendB = Math.max(0,  Math.sin(p + 0.4)) * bend;

  // ── Front-right leg (pair A) ──
  if (boneFRUpperDog) boneFRUpperDog.rotation.x = 0.10 + swingA * amp;
  if (boneFRLowerDog) boneFRLowerDog.rotation.x = 0.12 + bendA;
  if (boneFRPawDog)   boneFRPawDog.rotation.x   = -0.05 + swingA * 0.18;

  // ── Back-left leg (pair A) ──
  if (boneBLUpperDog) boneBLUpperDog.rotation.x = swingA * amp;
  if (boneBLLowerDog) boneBLLowerDog.rotation.x = 0.10 + bendA;
  if (boneBLPawDog)   boneBLPawDog.rotation.x   = -0.05 + swingA * 0.18;
  if (boneBLToeDog)   boneBLToeDog.rotation.x   = 0.08;

  // ── Front-left leg (pair B) ──
  if (boneFLUpperDog) boneFLUpperDog.rotation.x = 0.10 + swingB * amp;
  if (boneFLLowerDog) boneFLLowerDog.rotation.x = 0.12 + bendB;
  if (boneFLPawDog)   boneFLPawDog.rotation.x   = -0.05 + swingB * 0.18;

  // ── Back-right leg (pair B) ──
  if (boneBRUpperDog) boneBRUpperDog.rotation.x = swingB * amp;
  if (boneBRLowerDog) boneBRLowerDog.rotation.x = 0.10 + bendB;
  if (boneBRPawDog)   boneBRPawDog.rotation.x   = -0.05 + swingB * 0.18;
  if (boneBRToeDog)   boneBRToeDog.rotation.x   = 0.08;

  // ── Body bob + slight spine undulation ────────────────────────
  const bob = Math.abs(Math.sin(p)) * (mode === 'run' ? 0.06 : 0.025);
  if (boneSpineDog) boneSpineDog.rotation.x = DOG_BODY_PITCH_X * 0.3 + bob;
  if (boneChestDog) boneChestDog.rotation.x = DOG_BODY_PITCH_X * 0.15 + bob * 0.6;
  if (boneHipsDog)  boneHipsDog.rotation.z  = Math.sin(p) * 0.04;

  // ── Head — forward-focused, bobs a bit more at a run ──────────
  if (boneHeadDog) {
    boneHeadDog.rotation.x = -0.10 + Math.sin(p * 2) * (mode === 'run' ? 0.06 : 0.02);
  }
}

export function resetDogGaitPhase() { _dogGaitPhase = 0; }

// ── Lightweight head-look bias — layered on top of whatever activity
// is currently posing the head (idle sway, gait bob, etc). Used by
// engine-life.js for "look at camera" / "look at Miss when she talks"
// without needing a full look-target state machine.
export function applyDogHeadLook(yawBias, pitchBias, strength = 1) {
  if (boneHeadDog) {
    boneHeadDog.rotation.y += yawBias * strength;
    boneHeadDog.rotation.x += pitchBias * strength;
  }
  if (boneNeckDog) {
    boneNeckDog.rotation.y += yawBias * 0.5 * strength;
  }
}
