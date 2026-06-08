// ================================================================
//  engine-bones.js
//  Bone cache, blendshape helpers, finger poses, expressions,
//  all activity animations (ACTIVITY switch), gesture system,
//  hype choreographies, lip sync, blink.
// ================================================================

import { getVrm, scene, monitorGlowLight, keyboardMesh } from './engine-scene.js';
import { setCamMode } from './engine-camera.js';

// ── Bone refs — populated by cacheBones() after VRM loads ────────
// vrm is accessed via getVrm() to avoid capturing the initial null binding.
// For convenience inside this file we use a local helper.
const _vrm = () => getVrm();
export let boneHead=null, boneNeck=null, boneSpine=null, boneChest=null;
export let boneJaw=null;
export let boneHips=null, boneHipL=null, boneHipR=null;
export let boneLUpperLeg=null, boneRUpperLeg=null;
export let boneLLowerLeg=null, boneRLowerLeg=null;
export let boneLFoot=null,     boneRFoot=null;
export let boneLToes=null,     boneRToes=null;
export let boneLUpperArm=null, boneRUpperArm=null;
export let boneLLowerArm=null, boneRLowerArm=null;
export let boneLHand=null,     boneRHand=null;

// Finger bones — left
export let boneL_ThumbPx=null, boneL_ThumbMd=null, boneL_ThumbDt=null;
export let boneL_IndexPx=null, boneL_IndexMd=null, boneL_IndexDt=null;
export let boneL_MidPx=null,   boneL_MidMd=null,   boneL_MidDt=null;
export let boneL_RingPx=null,  boneL_RingMd=null,  boneL_RingDt=null;
export let boneL_PinkyPx=null, boneL_PinkyMd=null, boneL_PinkyDt=null;
// Finger bones — right
export let boneR_ThumbPx=null, boneR_ThumbMd=null, boneR_ThumbDt=null;
export let boneR_IndexPx=null, boneR_IndexMd=null, boneR_IndexDt=null;
export let boneR_MidPx=null,   boneR_MidMd=null,   boneR_MidDt=null;
export let boneR_RingPx=null,  boneR_RingMd=null,  boneR_RingDt=null;
export let boneR_PinkyPx=null, boneR_PinkyMd=null, boneR_PinkyDt=null;

export let teethNode = null;

// ── Cache all bone refs from the loaded VRM ──────────────────────
export function cacheBones() {
  const vrm = _vrm();
  if (!vrm || !vrm.humanoid) return;
  const h       = vrm.humanoid;
  boneHead      = h.getNormalizedBoneNode('head');
  boneNeck      = h.getNormalizedBoneNode('neck');
  boneSpine     = h.getNormalizedBoneNode('spine');
  boneChest     = h.getNormalizedBoneNode('chest');
  boneHips      = h.getNormalizedBoneNode('hips');
  boneJaw       = h.getNormalizedBoneNode('jaw') || h.getNormalizedBoneNode('lowerJaw') || null;
  if (!boneJaw) vrm.scene.traverse(n => { if (!boneJaw && n.isBone && /jaw|lower.?jaw/i.test(n.name)) boneJaw = n; });
  boneHipL      = h.getNormalizedBoneNode('leftUpperLeg');
  boneHipR      = h.getNormalizedBoneNode('rightUpperLeg');
  boneLUpperLeg = h.getNormalizedBoneNode('leftUpperLeg');
  boneRUpperLeg = h.getNormalizedBoneNode('rightUpperLeg');
  boneLLowerLeg = h.getNormalizedBoneNode('leftLowerLeg');
  boneRLowerLeg = h.getNormalizedBoneNode('rightLowerLeg');
  boneLFoot     = h.getNormalizedBoneNode('leftFoot');
  boneRFoot     = h.getNormalizedBoneNode('rightFoot');
  boneLToes     = h.getNormalizedBoneNode('leftToes');
  boneRToes     = h.getNormalizedBoneNode('rightToes');
  boneLUpperArm = h.getNormalizedBoneNode('leftUpperArm');
  boneRUpperArm = h.getNormalizedBoneNode('rightUpperArm');
  boneLLowerArm = h.getNormalizedBoneNode('leftLowerArm');
  boneRLowerArm = h.getNormalizedBoneNode('rightLowerArm');
  boneLHand     = h.getNormalizedBoneNode('leftHand');
  boneRHand     = h.getNormalizedBoneNode('rightHand');

  boneL_ThumbPx = h.getNormalizedBoneNode('leftThumbProximal');
  boneL_ThumbMd = h.getNormalizedBoneNode('leftThumbIntermediate');
  boneL_ThumbDt = h.getNormalizedBoneNode('leftThumbDistal');
  boneL_IndexPx = h.getNormalizedBoneNode('leftIndexProximal');
  boneL_IndexMd = h.getNormalizedBoneNode('leftIndexIntermediate');
  boneL_IndexDt = h.getNormalizedBoneNode('leftIndexDistal');
  boneL_MidPx   = h.getNormalizedBoneNode('leftMiddleProximal');
  boneL_MidMd   = h.getNormalizedBoneNode('leftMiddleIntermediate');
  boneL_MidDt   = h.getNormalizedBoneNode('leftMiddleDistal');
  boneL_RingPx  = h.getNormalizedBoneNode('leftRingProximal');
  boneL_RingMd  = h.getNormalizedBoneNode('leftRingIntermediate');
  boneL_RingDt  = h.getNormalizedBoneNode('leftRingDistal');
  boneL_PinkyPx = h.getNormalizedBoneNode('leftLittleProximal');
  boneL_PinkyMd = h.getNormalizedBoneNode('leftLittleIntermediate');
  boneL_PinkyDt = h.getNormalizedBoneNode('leftLittleDistal');
  boneR_ThumbPx = h.getNormalizedBoneNode('rightThumbProximal');
  boneR_ThumbMd = h.getNormalizedBoneNode('rightThumbIntermediate');
  boneR_ThumbDt = h.getNormalizedBoneNode('rightThumbDistal');
  boneR_IndexPx = h.getNormalizedBoneNode('rightIndexProximal');
  boneR_IndexMd = h.getNormalizedBoneNode('rightIndexIntermediate');
  boneR_IndexDt = h.getNormalizedBoneNode('rightIndexDistal');
  boneR_MidPx   = h.getNormalizedBoneNode('rightMiddleProximal');
  boneR_MidMd   = h.getNormalizedBoneNode('rightMiddleIntermediate');
  boneR_MidDt   = h.getNormalizedBoneNode('rightMiddleDistal');
  boneR_RingPx  = h.getNormalizedBoneNode('rightRingProximal');
  boneR_RingMd  = h.getNormalizedBoneNode('rightRingIntermediate');
  boneR_RingDt  = h.getNormalizedBoneNode('rightRingDistal');
  boneR_PinkyPx = h.getNormalizedBoneNode('rightLittleProximal');
  boneR_PinkyMd = h.getNormalizedBoneNode('rightLittleIntermediate');
  boneR_PinkyDt = h.getNormalizedBoneNode('rightLittleDistal');

  vrm.scene.traverse(n => { if (n.name === 'Teeth') teethNode = n; });
  console.log('Bones cached:', { boneHead, boneSpine, boneLHand, boneRHand });
}

// ── Natural resting pose ──────────────────────────────────────────
export function setRestPose() {
  if (boneLUpperArm) { boneLUpperArm.rotation.z =  1.0; boneLUpperArm.rotation.x = 0.05; }
  if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0; boneRUpperArm.rotation.x = 0.05; }
  if (boneLLowerArm) { boneLLowerArm.rotation.z =  0.35; boneLLowerArm.rotation.x = 0.05; }
  if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.35; boneRLowerArm.rotation.x = 0.05; }
  if (boneLHand) { boneLHand.rotation.z =  0.18; boneLHand.rotation.x = 0.08; }
  if (boneRHand) { boneRHand.rotation.z = -0.18; boneRHand.rotation.x = 0.08; }
  if (boneHips)  { boneHips.rotation.z = 0.06; boneHips.rotation.x = 0.01; }
  if (boneLUpperLeg) boneLUpperLeg.rotation.z = -0.04;
  if (boneRUpperLeg) boneRUpperLeg.rotation.z =  0.06;
  if (boneLFoot) { boneLFoot.rotation.x = -0.05; boneLFoot.rotation.z = -0.03; }
  if (boneRFoot) { boneRFoot.rotation.x = -0.05; boneRFoot.rotation.z =  0.04; }
  if (boneLToes) boneLToes.rotation.x = 0.08;
  if (boneRToes) boneRToes.rotation.x = 0.08;
  if (boneSpine) { boneSpine.rotation.x = 0.02; boneSpine.rotation.z = -0.03; }
}

// ── Blendshape / morph helpers ───────────────────────────────────
const BS_MAP = {
  'A':'vrc.v_aa','I':'vrc.v_ih','U':'vrc.v_ou','E':'vrc.v_ee','O':'vrc.v_oh',
  'blink':'blink','Blink':'blink','blink_l':'blink_l','Blink_L':'blink_l',
  'blink_r':'blink_r','Blink_R':'blink_r',
  'joy':'joy','Joy':'joy','angry':'angry','Angry':'angry',
  'sorrow':'sorrow','Sorrow':'sorrow','fun':'fun','Fun':'fun',
};
const _morphCache = {};
function _getMorphIndex(mesh, targetName) {
  if (!mesh.morphTargetDictionary) return -1;
  const key = mesh.uuid;
  if (!_morphCache[key]) _morphCache[key] = mesh.morphTargetDictionary;
  return _morphCache[key][targetName] ?? -1;
}
let faceMesh = null;
function _findFaceMesh() {
  if (faceMesh) return faceMesh;
  const vrm = _vrm();
  if (!vrm) return null;
  vrm.scene.traverse(obj => {
    if (obj.isMesh && obj.morphTargetDictionary && 'vrc.v_aa' in obj.morphTargetDictionary)
      faceMesh = obj;
  });
  return faceMesh;
}
export function setBS(name, value) {
  const vrm = _vrm();
  if (!vrm) return;
  const v = Math.max(0, Math.min(1, value));
  try { vrm.expressionManager?.setValue(name, v); } catch(e) {}
  const morphName = BS_MAP[name] || name.toLowerCase();
  const mesh = _findFaceMesh();
  if (mesh) {
    const idx = _getMorphIndex(mesh, morphName);
    if (idx !== -1 && mesh.morphTargetInfluences) mesh.morphTargetInfluences[idx] = v;
  }
}

export function setExpression(mood) {
  ['happy','angry','sad','relaxed','surprised'].forEach(e => setBS(e, 0));
  ['joy','angry','sorrow','fun','neutral'].forEach(e => setBS(e, 0));
  const map = {
    happy:     () => { setBS('joy',0.8); setBS('happy',0.8); },
    excited:   () => { setBS('joy',1.0); setBS('fun',0.6); },
    angry:     () => { setBS('angry',0.7); },
    sad:       () => { setBS('sorrow',0.7); setBS('sad',0.6); },
    neutral:   () => { setBS('neutral',0.3); },
    surprised: () => { setBS('surprised',0.8); },
  };
  (map[mood] || map.neutral)();
}

// ── Finger helpers ───────────────────────────────────────────────
export function setLeftFingerCurl(curl, splay=0) {
  const c = curl * 1.4;
  if (boneL_IndexPx) { boneL_IndexPx.rotation.x = c; boneL_IndexPx.rotation.z = splay * 0.08; }
  if (boneL_IndexMd) boneL_IndexMd.rotation.x = c * 0.8;
  if (boneL_IndexDt) boneL_IndexDt.rotation.x = c * 0.6;
  if (boneL_MidPx)   boneL_MidPx.rotation.x = c;
  if (boneL_MidMd)   boneL_MidMd.rotation.x = c * 0.8;
  if (boneL_MidDt)   boneL_MidDt.rotation.x = c * 0.6;
  if (boneL_RingPx)  { boneL_RingPx.rotation.x = c; boneL_RingPx.rotation.z = -splay * 0.06; }
  if (boneL_RingMd)  boneL_RingMd.rotation.x = c * 0.8;
  if (boneL_RingDt)  boneL_RingDt.rotation.x = c * 0.6;
  if (boneL_PinkyPx) { boneL_PinkyPx.rotation.x = c; boneL_PinkyPx.rotation.z = -splay * 0.1; }
  if (boneL_PinkyMd) boneL_PinkyMd.rotation.x = c * 0.8;
  if (boneL_PinkyDt) boneL_PinkyDt.rotation.x = c * 0.6;
  if (boneL_ThumbPx) { boneL_ThumbPx.rotation.x = curl * 0.4; boneL_ThumbPx.rotation.z = -curl * 0.3; }
  if (boneL_ThumbMd) boneL_ThumbMd.rotation.x = curl * 0.5;
  if (boneL_ThumbDt) boneL_ThumbDt.rotation.x = curl * 0.3;
}
export function setRightFingerCurl(curl, splay=0) {
  const c = curl * 1.4;
  if (boneR_IndexPx) { boneR_IndexPx.rotation.x = c; boneR_IndexPx.rotation.z = -splay * 0.08; }
  if (boneR_IndexMd) boneR_IndexMd.rotation.x = c * 0.8;
  if (boneR_IndexDt) boneR_IndexDt.rotation.x = c * 0.6;
  if (boneR_MidPx)   boneR_MidPx.rotation.x = c;
  if (boneR_MidMd)   boneR_MidMd.rotation.x = c * 0.8;
  if (boneR_MidDt)   boneR_MidDt.rotation.x = c * 0.6;
  if (boneR_RingPx)  { boneR_RingPx.rotation.x = c; boneR_RingPx.rotation.z = splay * 0.06; }
  if (boneR_RingMd)  boneR_RingMd.rotation.x = c * 0.8;
  if (boneR_RingDt)  boneR_RingDt.rotation.x = c * 0.6;
  if (boneR_PinkyPx) { boneR_PinkyPx.rotation.x = c; boneR_PinkyPx.rotation.z = splay * 0.1; }
  if (boneR_PinkyMd) boneR_PinkyMd.rotation.x = c * 0.8;
  if (boneR_PinkyDt) boneR_PinkyDt.rotation.x = c * 0.6;
  if (boneR_ThumbPx) { boneR_ThumbPx.rotation.x = curl * 0.4; boneR_ThumbPx.rotation.z = curl * 0.3; }
  if (boneR_ThumbMd) boneR_ThumbMd.rotation.x = curl * 0.5;
  if (boneR_ThumbDt) boneR_ThumbDt.rotation.x = curl * 0.3;
}
export function setLeftFingerRelax()  { setLeftFingerCurl(0.12, 0.4);  if (boneL_ThumbPx) { boneL_ThumbPx.rotation.z =  0.18; boneL_ThumbPx.rotation.y =  0.1; } }
export function setRightFingerRelax() { setRightFingerCurl(0.12, 0.4); if (boneR_ThumbPx) { boneR_ThumbPx.rotation.z = -0.18; boneR_ThumbPx.rotation.y = -0.1; } }
export function setRightIndexPoint() {
  setRightFingerCurl(0.8);
  if (boneR_IndexPx) boneR_IndexPx.rotation.x = 0;
  if (boneR_IndexMd) boneR_IndexMd.rotation.x = 0;
  if (boneR_IndexDt) boneR_IndexDt.rotation.x = 0;
  if (boneR_ThumbPx) { boneR_ThumbPx.rotation.x = 0.2; boneR_ThumbPx.rotation.z = 0.3; }
}
export function setRightFingerWave(flutter) {
  const f = Math.sin(flutter * 8) * 0.1;
  if (boneR_IndexPx) { boneR_IndexPx.rotation.x = 0.05 + f;    boneR_IndexPx.rotation.z = -0.1; }
  if (boneR_MidPx)   boneR_MidPx.rotation.x = 0.05;
  if (boneR_RingPx)  { boneR_RingPx.rotation.x = 0.05 - f;    boneR_RingPx.rotation.z =  0.08; }
  if (boneR_PinkyPx) { boneR_PinkyPx.rotation.x = 0.08 + f * 0.5; boneR_PinkyPx.rotation.z = 0.12; }
  if (boneR_ThumbPx) { boneR_ThumbPx.rotation.z = -0.25;         boneR_ThumbPx.rotation.y = -0.1; }
}
export function setRightFingerCoverNose() {
  if (boneR_IndexPx) { boneR_IndexPx.rotation.x = 0.55; boneR_IndexPx.rotation.z = -0.05; }
  if (boneR_IndexMd) boneR_IndexMd.rotation.x = 0.45;
  if (boneR_IndexDt) boneR_IndexDt.rotation.x = 0.30;
  if (boneR_MidPx)   boneR_MidPx.rotation.x = 0.5;
  if (boneR_MidMd)   boneR_MidMd.rotation.x = 0.4;
  if (boneR_MidDt)   boneR_MidDt.rotation.x = 0.25;
  if (boneR_RingPx)  { boneR_RingPx.rotation.x = 0.6; boneR_RingPx.rotation.z = 0.05; }
  if (boneR_RingMd)  boneR_RingMd.rotation.x = 0.5;
  if (boneR_RingDt)  boneR_RingDt.rotation.x = 0.35;
  if (boneR_PinkyPx) { boneR_PinkyPx.rotation.x = 0.65; boneR_PinkyPx.rotation.z = 0.08; }
  if (boneR_PinkyMd) boneR_PinkyMd.rotation.x = 0.55;
  if (boneR_PinkyDt) boneR_PinkyDt.rotation.x = 0.4;
  if (boneR_ThumbPx) { boneR_ThumbPx.rotation.x = 0.3; boneR_ThumbPx.rotation.z = 0.35; boneR_ThumbPx.rotation.y = -0.2; }
  if (boneR_ThumbMd) boneR_ThumbMd.rotation.x = 0.2;
  if (boneR_ThumbDt) boneR_ThumbDt.rotation.x = 0.3;
}

// ── Activity system ──────────────────────────────────────────────
export const ACTIVITY = {
  current:  'idle',
  timer:    0,
  duration: 8,
  phase:    0,
};

export function activityPickNext() {
  // Handled by engine-life.js via getFamiliarActivityPool + goToSpot
}

export function activityUpdate(delta) {
  const vrm = _vrm();
  if (!vrm) return;
  ACTIVITY.timer += delta;
  const t = ACTIVITY.timer;

  switch (ACTIVITY.current) {

    // ── SOFA SIT ───────────────────────────────────────────────
    // Full couch-seated pose with subtle micro-animations:
    // - Hips rotated into seat, slight lean back
    // - Thighs horizontal (upper leg ~90°), calves hanging down
    // - Feet resting flat, slight outward splay
    // - Arms resting on thighs / armrest naturally
    // - Head turns and glances around like a real person relaxing
    // - Occasional crossing/uncrossing idle shifts every ~12s
    case 'sofaSit': {
      const breathe  = Math.sin(t * 0.55) * 0.012;
      const microZ   = Math.sin(t * 0.38) * 0.018;
      const headNod  = Math.sin(t * 0.28) * 0.022;
      const headTurn = Math.sin(t * 0.19) * 0.07;

      // Hips — rotated back into seat, slight right lean
      if (boneHips) {
        boneHips.rotation.x =  0.58;
        boneHips.rotation.z =  0.055 + microZ;
        boneHips.rotation.y =  Math.sin(t * 0.22) * 0.02;
      }

      // Spine — slight lean back, natural breathing
      if (boneSpine) {
        boneSpine.rotation.x = -0.06 + breathe;
        boneSpine.rotation.z = -microZ * 0.5;
        boneSpine.rotation.y =  Math.sin(t * 0.18) * 0.015;
      }

      // Chest — follows spine, slight breath rise
      if (boneChest) {
        boneChest.rotation.x =  0.04 + breathe * 0.6;
        boneChest.rotation.z = -microZ * 0.3;
      }

      // ── Legs — thighs out horizontally, calves drop ──────────
      // Left leg: parallel to floor, slight outward splay
      if (boneLUpperLeg) {
        boneLUpperLeg.rotation.x =  1.48;
        boneLUpperLeg.rotation.z = -0.08;
        boneLUpperLeg.rotation.y =  0.06;
      }
      // Right leg: parallel to floor, slight outward splay
      if (boneRUpperLeg) {
        boneRUpperLeg.rotation.x =  1.48;
        boneRUpperLeg.rotation.z =  0.10;
        boneRUpperLeg.rotation.y = -0.06;
      }
      // Calves hang naturally below seat
      if (boneLLowerLeg) {
        boneLLowerLeg.rotation.x = -1.32;
        boneLLowerLeg.rotation.z =  0.0;
      }
      if (boneRLowerLeg) {
        boneRLowerLeg.rotation.x = -1.32;
        boneRLowerLeg.rotation.z =  0.0;
      }
      // Feet rest flat on floor, slight toe-up
      if (boneLFoot) {
        boneLFoot.rotation.x = -0.18;
        boneLFoot.rotation.z = -0.04;
      }
      if (boneRFoot) {
        boneRFoot.rotation.x = -0.18;
        boneRFoot.rotation.z =  0.05;
      }
      if (boneLToes) boneLToes.rotation.x =  0.06;
      if (boneRToes) boneRToes.rotation.x =  0.06;

      // ── Arms — resting relaxed on thighs / armrest ───────────
      // Left arm: rests on left thigh, slightly inward
      if (boneLUpperArm) {
        boneLUpperArm.rotation.z =  0.68 + Math.sin(t * 0.6) * 0.02;
        boneLUpperArm.rotation.x =  0.45;
        boneLUpperArm.rotation.y = -0.08;
      }
      if (boneLLowerArm) {
        boneLLowerArm.rotation.z =  0.55;
        boneLLowerArm.rotation.x =  0.12;
      }
      if (boneLHand) {
        boneLHand.rotation.z     =  0.22 + Math.sin(t * 1.4) * 0.04;
        boneLHand.rotation.x     =  0.06 + Math.sin(t * 2.0) * 0.03;
        boneLHand.rotation.y     =  Math.sin(t * 1.1) * 0.04;
      }

      // Right arm: rests on right thigh, slightly crossed
      if (boneRUpperArm) {
        boneRUpperArm.rotation.z = -0.68 - Math.sin(t * 0.6 + 1.0) * 0.02;
        boneRUpperArm.rotation.x =  0.45;
        boneRUpperArm.rotation.y =  0.08;
      }
      if (boneRLowerArm) {
        boneRLowerArm.rotation.z = -0.55;
        boneRLowerArm.rotation.x =  0.12;
      }
      if (boneRHand) {
        boneRHand.rotation.z     = -0.22 - Math.sin(t * 1.4 + 1.0) * 0.04;
        boneRHand.rotation.x     =  0.06 + Math.sin(t * 2.0 + 1.0) * 0.03;
        boneRHand.rotation.y     =  Math.sin(t * 1.1 + 0.8) * 0.04;
      }

      // ── Head — relaxed, occasional glance + slow nod ─────────
      if (boneHead) {
        boneHead.rotation.x =  0.06 + headNod;
        boneHead.rotation.z =  Math.sin(t * 0.42) * 0.025;
        boneHead.rotation.y =  headTurn;
      }
      if (boneNeck) {
        boneNeck.rotation.x =  0.03 + headNod * 0.4;
        boneNeck.rotation.y =  headTurn * 0.4;
      }

      // Expression: neutral with occasional soft smile
      const exprCycle = t % 14.0;
      if (exprCycle > 10.0 && exprCycle < 12.5) {
        setExpression('happy');
        setBS('U', Math.sin((exprCycle - 10.0) / 2.5 * Math.PI) * 0.12);
      } else {
        setExpression('neutral');
        setBS('U', 0);
      }

      setLeftFingerRelax();
      setRightFingerRelax();
      break;
    }

    // ── PHONE SCROLL ───────────────────────────────────────────
    case 'phoneScroll': {
      const scrollCycle = t % 8.0;
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.55; boneRUpperArm.rotation.x = 0.65; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.3; boneRLowerArm.rotation.x = 0.25; }
      if (boneRHand)     { boneRHand.rotation.z = -0.12; boneRHand.rotation.x = -0.15 + Math.sin(t*2)*0.04; }
      if (boneRHand)     boneRHand.rotation.y = Math.sin(t * 1.2) * 0.04;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.6; boneLUpperArm.rotation.x = 0.4; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.4; boneLLowerArm.rotation.x = 0.2; }
      if (boneHead)      { boneHead.rotation.x = 0.22 + Math.sin(t*0.4)*0.03; }
      if (boneSpine)     boneSpine.rotation.x = 0.06;
      if (scrollCycle > 6.5) {
        setExpression('happy');
        setBS('I', Math.sin((scrollCycle-6.5)/1.5*Math.PI)*0.15);
      } else {
        setExpression('neutral');
      }
      setRightFingerCurl(0.35);
      setLeftFingerRelax();
      break;
    }

    // ── TV REACT ───────────────────────────────────────────────
    case 'tvReact': {
      const reactCycle = t % 10.0;
      if (boneHead) { boneHead.rotation.y = Math.sin(t*0.2)*0.12; boneHead.rotation.x = 0.04 + Math.sin(t*0.15)*0.03; }
      if (boneSpine) boneSpine.rotation.z = Math.sin(t*0.3)*0.03;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.8; boneLUpperArm.rotation.x = 0.1; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.8; boneRUpperArm.rotation.x = 0.1; }
      if (reactCycle > 7.5 && reactCycle < 8.5) {
        setExpression('surprised');
        setBS('O', Math.sin((reactCycle-7.5)/1.0*Math.PI)*0.35);
      } else if (reactCycle > 4.0 && reactCycle < 5.5) {
        setExpression('happy');
        setBS('A', Math.sin((reactCycle-4.0)/1.5*Math.PI)*0.18);
      } else {
        setExpression('neutral');
      }
      setLeftFingerRelax(); setRightFingerRelax();
      break;
    }

    // ── READ BOOK ──────────────────────────────────────────────
    case 'readBook': {
      if (boneSpine)     { boneSpine.rotation.x = 0.06; boneSpine.rotation.z = Math.sin(t*0.3)*0.01; }
      if (boneHead)      { boneHead.rotation.x = 0.14 + Math.sin(t*0.25)*0.03; boneHead.rotation.z = Math.sin(t*0.4)*0.02; }
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.55; boneLUpperArm.rotation.x = 0.5; boneLUpperArm.rotation.y = -0.12; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.55; boneRUpperArm.rotation.x = 0.5; boneRUpperArm.rotation.y = 0.12; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.35; boneLLowerArm.rotation.x = 0.2; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.35; boneRLowerArm.rotation.x = 0.2; }
      if (boneLHand)     { boneLHand.rotation.z = 0.15; boneLHand.rotation.x = -0.05; }
      if (boneRHand)     { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = -0.05; }
      if (boneHips)      boneHips.rotation.z = 0.06;
      const pageCycle = t % 12.0;
      if (pageCycle > 8.0 && pageCycle < 11.0) {
        setExpression('happy'); setBS('U', 0.08 + Math.sin(t*0.6)*0.04);
      } else {
        setExpression('neutral'); setBS('U', 0.04);
      }
      break;
    }

    // ── DANCE ──────────────────────────────────────────────────
    case 'dance': {
      const shimmy  = Math.sin(t * 6.5);
      const bob     = Math.abs(Math.sin(t * 6.5)) * 0.055;
      const armSwing = Math.sin(t * 3.25);
      if (boneHips)  { boneHips.rotation.z = shimmy*0.16; boneHips.rotation.y = shimmy*0.09; boneHips.rotation.x = bob*0.4; }
      if (boneSpine) { boneSpine.rotation.z = -shimmy*0.09; boneSpine.rotation.x = bob*0.8; boneSpine.rotation.y = shimmy*0.03; }
      if (boneChest) { boneChest.rotation.z = shimmy*0.06; boneChest.rotation.x = bob*0.5; }
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.65+Math.sin(t*6.5+1.5)*0.28; boneLUpperArm.rotation.x = 0.18+bob*0.5; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.65+Math.sin(t*6.5)*0.28); boneRUpperArm.rotation.x = 0.18+bob*0.5; }
      if (boneLLowerArm) boneLLowerArm.rotation.z =  0.5+Math.sin(t*6.5+0.8)*0.2;
      if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.5+Math.sin(t*6.5-0.8)*0.2);
      if (boneLHand) { boneLHand.rotation.z = 0.25+Math.sin(t*9)*0.18; boneLHand.rotation.x = 0.08+Math.sin(t*7)*0.06; boneLHand.rotation.y = Math.sin(t*5)*0.08; }
      if (boneRHand) { boneRHand.rotation.z = -(0.25+Math.sin(t*9+1)*0.18); boneRHand.rotation.x = 0.08+Math.sin(t*7+1)*0.06; boneRHand.rotation.y = Math.sin(t*5+1)*0.08; }
      if (boneLUpperLeg) { boneLUpperLeg.rotation.z = shimmy*0.08; boneLUpperLeg.rotation.x = bob*0.3; }
      if (boneRUpperLeg) { boneRUpperLeg.rotation.z = -shimmy*0.08; boneRUpperLeg.rotation.x = bob*0.3; }
      if (boneLFoot) boneLFoot.rotation.x = -0.04+Math.max(0,shimmy)*0.12;
      if (boneRFoot) boneRFoot.rotation.x = -0.04+Math.max(0,-shimmy)*0.12;
      if (boneLToes) boneLToes.rotation.x = 0.08+Math.max(0,shimmy)*0.08;
      if (boneRToes) boneRToes.rotation.x = 0.08+Math.max(0,-shimmy)*0.08;
      if (boneHead)  { boneHead.rotation.z = Math.sin(t*3.25)*0.06; boneHead.rotation.y = shimmy*0.05; }
      setExpression('happy');
      setBS('A', Math.max(0, Math.sin(t*6.5))*0.22);
      break;
    }

    // ── STRETCH ────────────────────────────────────────────────
    case 'stretch': {
      const cycle = t % 6.0;
      if (cycle < 1.2) {
        const p = Math.min(cycle/1.0, 1);
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 1.0-p*1.08; boneLUpperArm.rotation.x = p*0.18; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.0-p*1.08); boneRUpperArm.rotation.x = p*0.18; }
        if (boneLLowerArm) boneLLowerArm.rotation.z =  0.35-p*0.3;
        if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.35-p*0.3);
        if (boneLHand) { boneLHand.rotation.z = 0.2-p*0.3; boneLHand.rotation.x = -p*0.12; }
        if (boneRHand) { boneRHand.rotation.z = -(0.2-p*0.3); boneRHand.rotation.x = -p*0.12; }
        if (boneSpine) { boneSpine.rotation.x = -p*0.08; boneSpine.rotation.z = Math.sin(p*2)*0.02; }
        if (boneHips)  boneHips.rotation.z = Math.sin(p*3)*0.04;
        if (boneLFoot) boneLFoot.rotation.x = -0.05-p*0.15;
        if (boneRFoot) boneRFoot.rotation.x = -0.05-p*0.15;
        if (boneLToes) boneLToes.rotation.x = 0.08+p*0.1;
        if (boneRToes) boneRToes.rotation.x = 0.08+p*0.1;
        setExpression('neutral'); setBS('O', p*0.15);
      } else if (cycle < 4.0) {
        const sway = Math.sin(t*1.2)*0.04;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = -0.08+sway; boneLUpperArm.rotation.x = 0.18; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(-0.08+sway); boneRUpperArm.rotation.x = 0.18; }
        if (boneLHand) { boneLHand.rotation.z = -0.1+Math.sin(t*1.8)*0.05; boneLHand.rotation.x = -0.12; }
        if (boneRHand) { boneRHand.rotation.z = 0.1-Math.sin(t*1.8)*0.05; boneRHand.rotation.x = -0.12; }
        if (boneSpine) { boneSpine.rotation.x = -0.08+Math.sin(t*0.7)*0.02; boneSpine.rotation.z = sway*0.5; }
        if (boneHips)  boneHips.rotation.z = Math.sin(t*0.9)*0.05;
        if (boneLFoot) boneLFoot.rotation.x = -0.2;
        if (boneRFoot) boneRFoot.rotation.x = -0.2;
        if (boneLToes) boneLToes.rotation.x = 0.18;
        if (boneRToes) boneRToes.rotation.x = 0.18;
        setBS('O', 0.12);
      } else {
        const p = (cycle-4.0)/2.0;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = -0.08+p*1.08; boneLUpperArm.rotation.x = 0.18-p*0.13; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(-0.08+p*1.08); boneRUpperArm.rotation.x = 0.18-p*0.13; }
        if (boneLHand) { boneLHand.rotation.z = -0.1+p*0.3; boneLHand.rotation.x = -0.12+p*0.2; }
        if (boneRHand) { boneRHand.rotation.z = 0.1-p*0.3; boneRHand.rotation.x = -0.12+p*0.2; }
        if (boneSpine) boneSpine.rotation.x = -0.08+p*0.1;
        if (boneHips)  boneHips.rotation.z = 0.06*Math.sin(p*Math.PI);
        if (boneLFoot) boneLFoot.rotation.x = -0.2+p*0.15;
        if (boneRFoot) boneRFoot.rotation.x = -0.2+p*0.15;
        if (boneLToes) boneLToes.rotation.x = 0.18-p*0.1;
        if (boneRToes) boneRToes.rotation.x = 0.18-p*0.1;
        setExpression('neutral'); setBS('O', 0.12-p*0.12);
      }
      break;
    }

    // ── HAIR FLICK ─────────────────────────────────────────────
    case 'hairflick': {
      const cycle = t % 5.0;
      if (cycle < 0.6) {
        const p = cycle/0.6;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0+p*0.55; boneRUpperArm.rotation.x = p*0.65; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.35-p*0.2); boneRLowerArm.rotation.x = p*0.3; }
        if (boneRHand)     { boneRHand.rotation.z = -(0.18+p*0.15); boneRHand.rotation.x = -p*0.1; }
        if (boneHips)      boneHips.rotation.z = 0.08;
        if (boneHead)      boneHead.rotation.z = -p*0.06;
      } else if (cycle < 2.5) {
        const flick = Math.sin((cycle-0.6)*6)*0.12;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.45; boneRUpperArm.rotation.x = 0.65+flick*0.2; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.15; boneRLowerArm.rotation.x = 0.3+Math.abs(flick)*0.15; }
        if (boneRHand)     { boneRHand.rotation.z = -0.33+flick; boneRHand.rotation.y = flick*0.5; }
        if (boneHead)      boneHead.rotation.z = -0.06+Math.sin((cycle-0.6)*3)*0.03;
        if (boneHips)      boneHips.rotation.z = 0.1;
        setExpression('happy'); setBS('I', 0.1);
      } else if (cycle < 3.2) {
        const p = (cycle-2.5)/0.7;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.45-p*0.55; boneRUpperArm.rotation.x = 0.65-p*0.6; }
        if (boneRLowerArm) boneRLowerArm.rotation.z = -0.15-p*0.2;
        if (boneRHand)     boneRHand.rotation.z = -0.33+p*0.15;
        if (boneHead)      boneHead.rotation.z = -0.06+p*0.06;
        if (boneHips)      boneHips.rotation.z = 0.1+Math.sin(p*Math.PI)*0.06;
        setExpression('happy'); setBS('I', 0.1-p*0.1);
      } else {
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.65; boneLUpperArm.rotation.x = 0.15; }
        if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.8; boneLLowerArm.rotation.x = 0.3; }
        if (boneLHand)     { boneLHand.rotation.z = 0.3; boneLHand.rotation.x = 0.1; }
        if (boneHips)      boneHips.rotation.z = 0.1;
        setExpression('neutral'); setBS('I', 0);
      }
      break;
    }

    // ── HIP ON HIP ─────────────────────────────────────────────
    case 'hiponhip': {
      const bob  = Math.sin(t*2.2)*0.06;
      const sway = Math.sin(t*1.1)*0.05;
      if (boneHips)      { boneHips.rotation.z = 0.12+bob; boneHips.rotation.y = sway*0.3; }
      if (boneSpine)     { boneSpine.rotation.z = -0.06-bob*0.4; boneSpine.rotation.x = 0.02; }
      if (boneChest)     boneChest.rotation.z = -0.03;
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.75; boneRUpperArm.rotation.x = 0.35; boneRUpperArm.rotation.y = 0.3; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.6; boneRLowerArm.rotation.x = 0.1; }
      if (boneRHand)     { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = 0.3; boneRHand.rotation.y = -0.2; }
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.72+Math.sin(t*1.8)*0.06; boneLUpperArm.rotation.x = 0.1; }
      if (boneLLowerArm) boneLLowerArm.rotation.z = 0.45+Math.sin(t*1.8)*0.04;
      if (boneLHand)     { boneLHand.rotation.z = 0.28+Math.sin(t*2.5)*0.08; boneLHand.rotation.y = Math.sin(t*2)*0.06; boneLHand.rotation.x = 0.08; }
      if (boneHead)      { boneHead.rotation.z = Math.sin(t*1.1)*0.04; boneHead.rotation.y = Math.sin(t*0.7)*0.06; }
      if (boneLUpperLeg) boneLUpperLeg.rotation.z = -0.06+sway*0.5;
      if (boneRUpperLeg) boneRUpperLeg.rotation.z = 0.08;
      if (boneLFoot)     { boneLFoot.rotation.z = -0.06; boneLFoot.rotation.x = -0.04; }
      if (boneRFoot)     boneRFoot.rotation.x = -0.03;
      setExpression('neutral');
      setBS('U', (Math.sin(t*0.8)*0.5+0.5)*0.1);
      break;
    }

    // ── TYPING ─────────────────────────────────────────────────
    case 'typing': {
      const tapL = Math.sin(t*12.5)>0 ? Math.abs(Math.sin(t*12.5))*0.08 : 0;
      const tapR = Math.sin(t*12.5+Math.PI)>0 ? Math.abs(Math.sin(t*12.5+Math.PI))*0.08 : 0;
      if (boneSpine)     { boneSpine.rotation.x = 0.12+Math.sin(t*0.6)*0.02; boneSpine.rotation.z = Math.sin(t*0.4)*0.02; }
      if (boneChest)     boneChest.rotation.x = 0.08;
      if (boneHead)      { boneHead.rotation.x = 0.18; boneHead.rotation.z = Math.sin(t*0.5)*0.03; }
      if (boneHips)      boneHips.rotation.z = Math.sin(t*0.9)*0.04;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.72; boneLUpperArm.rotation.x = 0.35+Math.sin(t*0.7)*0.03; boneLUpperArm.rotation.y = -0.15; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.72; boneRUpperArm.rotation.x = 0.35+Math.sin(t*0.7+0.5)*0.03; boneRUpperArm.rotation.y = 0.15; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.4; boneLLowerArm.rotation.x = 0.35; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.4; boneRLowerArm.rotation.x = 0.35; }
      if (boneLHand)     { boneLHand.rotation.z = 0.08+tapL; boneLHand.rotation.x = -0.12+tapL*0.5; }
      if (boneRHand)     { boneRHand.rotation.z = -(0.08+tapR); boneRHand.rotation.x = -0.12+tapR*0.5; }
      if (t%4.5 < 0.8) {
        const glance = Math.min(t%4.5/0.4,1)*(1-Math.max(0,(t%4.5-0.5)/0.3));
        if (boneHead) boneHead.rotation.x = 0.18-glance*0.2;
      }
      setBS('I', Math.sin(t*0.4)*0.06+0.04);
      break;
    }

    // ── MONITOR LOOK ───────────────────────────────────────────
    case 'monitor': {
      const cycle = t % 7.0;
      if (cycle < 1.0) {
        const p = cycle/1.0;
        if (boneSpine)     { boneSpine.rotation.y = -p*0.12; boneSpine.rotation.x = p*0.06; }
        if (boneHead)      { boneHead.rotation.y = -p*0.2; boneHead.rotation.x = p*0.08; }
        if (boneHips)      boneHips.rotation.z = p*0.07;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.8-p*0.35; boneLUpperArm.rotation.x = p*0.2; boneLUpperArm.rotation.y = -p*0.18; }
        if (boneLLowerArm) boneLLowerArm.rotation.z = 0.5-p*0.1;
        if (boneLHand)     { boneLHand.rotation.z = 0.25; boneLHand.rotation.x = 0.08; }
        setExpression('neutral');
      } else if (cycle < 5.0) {
        const reading = cycle-1.0;
        if (boneSpine)     { boneSpine.rotation.y = -0.12; boneSpine.rotation.x = 0.06+Math.sin(reading*0.4)*0.01; }
        if (boneHead)      { boneHead.rotation.y = -0.2+Math.sin(reading*0.35)*0.04; boneHead.rotation.x = 0.08+Math.sin(reading*0.6)*0.02; }
        if (boneHips)      boneHips.rotation.z = 0.07+Math.sin(reading*0.5)*0.02;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.45; boneLUpperArm.rotation.x = 0.2; }
        if (boneLLowerArm) boneLLowerArm.rotation.z = 0.4;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.85+Math.sin(reading*0.8)*0.05; boneRUpperArm.rotation.x = 0.08; }
        if (reading > 2.5 && reading < 3.2) {
          setExpression('surprised'); setBS('O', Math.sin((reading-2.5)/0.7*Math.PI)*0.3);
        } else { setExpression('neutral'); setBS('O', 0); }
        if (monitorGlowLight) monitorGlowLight.intensity = 1.2+Math.sin(reading*2)*0.3;
      } else {
        const p = (cycle-5.0)/2.0;
        if (boneSpine)     { boneSpine.rotation.y = -0.12+p*0.12; boneSpine.rotation.x = 0.06-p*0.06; }
        if (boneHead)      { boneHead.rotation.y = -0.2+p*0.2; boneHead.rotation.x = 0.08-p*0.08; }
        if (boneHips)      boneHips.rotation.z = 0.07-p*0.07;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.45+p*0.45; boneLUpperArm.rotation.x = 0.2-p*0.12; }
        if (monitorGlowLight) monitorGlowLight.intensity = 1.2-p*0.4;
        setExpression('happy');
      }
      break;
    }

    // ── NOSE COVER ─────────────────────────────────────────────
    case 'noseCover': {
      const cycle = t % 5.5;
      if (cycle < 0.5) {
        const p = cycle/0.5; const ep = 3*p*p-2*p*p*p;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0+ep*0.52; boneRUpperArm.rotation.x = ep*0.55; boneRUpperArm.rotation.y = ep*0.12; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.35-ep*0.1); boneRLowerArm.rotation.x = ep*0.35; }
        if (boneRHand)     { boneRHand.rotation.x = -ep*0.45; boneRHand.rotation.z = -(0.18-ep*0.12); boneRHand.rotation.y = ep*0.25; }
        setRightFingerCoverNose();
        if (boneHips)  boneHips.rotation.z = ep*0.06;
        if (boneSpine) boneSpine.rotation.x = -ep*0.04;
        if (boneHead)  { boneHead.rotation.x = ep*0.06; boneHead.rotation.z = -ep*0.04; }
        setExpression('neutral');
      } else if (cycle < 1.8) {
        const hold = cycle-0.5;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.48+Math.sin(hold*2)*0.015; boneRUpperArm.rotation.x = 0.55; boneRUpperArm.rotation.y = 0.12; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.25; boneRLowerArm.rotation.x = 0.35+Math.sin(hold*1.5)*0.01; }
        if (boneRHand)     { boneRHand.rotation.x = -0.45; boneRHand.rotation.z = -0.06; boneRHand.rotation.y = 0.25; }
        setRightFingerCoverNose();
        if (boneHips)  boneHips.rotation.z = 0.06+Math.sin(hold*1.2)*0.02;
        if (boneSpine) boneSpine.rotation.x = -0.04;
        if (boneHead)  { boneHead.rotation.x = 0.06; boneHead.rotation.y = Math.sin(hold*0.8)*0.05; boneHead.rotation.z = -0.04; }
        setExpression('neutral');
      } else if (cycle < 3.0) {
        // Sweep outward
        const sweep = (cycle-1.8)/1.2;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.48-sweep*0.55; boneRUpperArm.rotation.x = 0.55-sweep*0.1; boneRUpperArm.rotation.y = 0.12+sweep*0.3; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.25-sweep*0.08; boneRLowerArm.rotation.x = 0.35; }
        if (boneRHand)     { boneRHand.rotation.x = -0.45+sweep*0.35; boneRHand.rotation.z = -0.06-sweep*0.1; boneRHand.rotation.y = 0.25+sweep*0.4; }
        setRightFingerRelax();
        if (boneHips) boneHips.rotation.z = 0.06+sweep*0.06;
        setExpression('happy'); setBS('I', sweep*0.15);
      } else {
        // Settle
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.03+Math.sin(t*0.6)*0.02; boneRUpperArm.rotation.x = 0.45-Math.sin(t*0.4)*0.02; }
        if (boneRLowerArm) boneRLowerArm.rotation.z = -0.33;
        if (boneRHand)     { boneRHand.rotation.z = -0.16; boneRHand.rotation.x = -0.1; boneRHand.rotation.y = 0.65; }
        setRightFingerRelax();
        if (boneHips) boneHips.rotation.z = 0.12;
        setExpression('neutral'); setBS('I', 0);
      }
      break;
    }

    // ── FIRE GAZE ──────────────────────────────────────────────
    case 'fireGaze': {
      const flicker = Math.sin(t*3.1)*0.5+0.5+Math.sin(t*7.3)*0.3;
      if (boneHead)  { boneHead.rotation.x = 0.08+Math.sin(t*0.3)*0.03; boneHead.rotation.z = Math.sin(t*0.2)*0.02; }
      if (boneSpine) { boneSpine.rotation.x = 0.04; boneSpine.rotation.z = Math.sin(t*0.25)*0.02; }
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.8+Math.sin(t*0.4)*0.04; boneLUpperArm.rotation.x = 0.05; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.8; boneRUpperArm.rotation.x = 0.05; }
      if (boneLLowerArm) boneLLowerArm.rotation.z = 0.5;
      if (boneRLowerArm) boneRLowerArm.rotation.z = -0.5;
      if (boneLHand) { boneLHand.rotation.z = 0.22; boneLHand.rotation.x = 0.08; }
      if (boneRHand) { boneRHand.rotation.z = -0.22; boneRHand.rotation.x = 0.08; }
      setExpression(flicker > 0.7 ? 'neutral' : 'neutral');
      setBS('O', flicker*0.04);
      setLeftFingerRelax(); setRightFingerRelax();
      break;
    }

    // ── WINDOW LOOK ────────────────────────────────────────────
    case 'windowLook': {
      if (boneHead)  { boneHead.rotation.y = Math.sin(t*0.2)*0.1; boneHead.rotation.x = 0.04+Math.sin(t*0.15)*0.02; }
      if (boneSpine) { boneSpine.rotation.z = Math.sin(t*0.3)*0.02; }
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.85; boneLUpperArm.rotation.x = 0.06; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.85; boneRUpperArm.rotation.x = 0.06; }
      setExpression('neutral');
      setLeftFingerRelax(); setRightFingerRelax();
      break;
    }

    // ── MIRROR POSE ────────────────────────────────────────────
    case 'mirrorPose': {
      const cycle = t % 7.0;
      if (cycle < 1.0) {
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.7-Math.min(cycle/0.8,1)*0.3; boneLUpperArm.rotation.x = Math.min(cycle/0.8,1)*0.4; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.7-Math.min(cycle/0.8,1)*0.3); boneRUpperArm.rotation.x = Math.min(cycle/0.8,1)*0.4; }
        if (boneHips)      boneHips.rotation.z = Math.min(cycle/0.8,1)*0.1;
        setExpression('neutral');
      } else if (cycle < 4.0) {
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.4+Math.sin((cycle-1)*1.5)*0.08; boneLUpperArm.rotation.x = 0.4; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.4+Math.sin((cycle-1)*1.5+0.5)*0.08); boneRUpperArm.rotation.x = 0.4; }
        if (boneHips)      boneHips.rotation.z = 0.1+Math.sin((cycle-1)*0.8)*0.04;
        if (boneHead)      { boneHead.rotation.x = 0.06; boneHead.rotation.z = Math.sin((cycle-1)*0.5)*0.04; }
        setExpression('happy'); setBS('I', Math.sin((cycle-1)*1.2)*0.1+0.05);
      } else {
        const p = (cycle-4.0)/3.0;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.4+p*0.5; boneLUpperArm.rotation.x = 0.4-p*0.35; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.4+p*0.5); boneRUpperArm.rotation.x = 0.4-p*0.35; }
        if (boneHips)      boneHips.rotation.z = 0.1-p*0.04;
        setExpression('neutral'); setBS('I', 0);
      }
      break;
    }

    // ── STIRRING ───────────────────────────────────────────────
    case 'stirring': {
      const stir = t * 3.0;
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.65; boneRUpperArm.rotation.x = 0.45; boneRUpperArm.rotation.y = 0.1; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.4+Math.sin(stir)*0.12; boneRLowerArm.rotation.x = 0.4+Math.cos(stir)*0.08; }
      if (boneRHand)     { boneRHand.rotation.z = -0.15+Math.sin(stir*0.7)*0.06; boneRHand.rotation.y = Math.cos(stir)*0.1; }
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.7; boneLUpperArm.rotation.x = 0.12; }
      if (boneLLowerArm) boneLLowerArm.rotation.z = 0.5;
      if (boneLHand)     { boneLHand.rotation.z = 0.2; boneLHand.rotation.x = 0.08; }
      if (boneSpine)     { boneSpine.rotation.x = 0.05; boneSpine.rotation.z = Math.sin(stir*0.5)*0.02; }
      if (boneHead)      boneHead.rotation.x = 0.12;
      if (boneHips)      boneHips.rotation.z = Math.sin(t*0.8)*0.04;
      setExpression('neutral');
      setRightFingerCurl(0.5); setLeftFingerRelax();
      break;
    }

    // ── CHOPPING ───────────────────────────────────────────────
    case 'chopping': {
      const chopCycle = t % 1.0;
      const chopDown  = chopCycle < 0.4 ? Math.sin(chopCycle/0.4*Math.PI)*0.25 : 0;
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.6; boneRUpperArm.rotation.x = 0.5-chopDown*0.5; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.35; boneRLowerArm.rotation.x = 0.5+chopDown; }
      if (boneRHand)     boneRHand.rotation.z = -0.12;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.6; boneLUpperArm.rotation.x = 0.55; }
      if (boneLLowerArm) boneLLowerArm.rotation.z = 0.35;
      if (boneLHand)     boneRHand.rotation.z = 0.18;
      if (boneSpine)     { boneSpine.rotation.x = 0.08; }
      if (boneHead)      boneHead.rotation.x = 0.14;
      setExpression('neutral');
      setRightFingerCurl(0.6); setLeftFingerCurl(0.4);
      break;
    }

    // ── TASTING ────────────────────────────────────────────────
    case 'tasting': {
      const cycle = t % 6.0;
      if (cycle < 0.5) {
        const p = cycle/0.5;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0+p*0.55; boneRUpperArm.rotation.x = p*0.7; }
        if (boneRLowerArm) boneRLowerArm.rotation.x = p*0.5;
        if (boneRHand)     boneRHand.rotation.x = -p*0.2;
        setExpression('neutral');
      } else if (cycle < 1.5) {
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.45; boneRUpperArm.rotation.x = 0.7; }
        if (boneRLowerArm) boneRLowerArm.rotation.x = 0.5;
        if (boneRHand)     { boneRHand.rotation.x = -0.2+Math.sin(t*4)*0.05; boneRHand.rotation.z = -0.12; }
        if (boneHead)      boneHead.rotation.x = 0.04;
        setExpression('happy'); setBS('A', 0.2);
      } else if (cycle < 2.5) {
        setExpression('happy'); setBS('A', 0);
        setBS('I', 0.12);
      } else if (cycle < 3.0) {
        const p = (cycle-2.5)/0.5;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.45-p*0.55; boneRUpperArm.rotation.x = 0.7-p*0.7; }
        if (boneRLowerArm) boneRLowerArm.rotation.x = 0.5-p*0.5;
        setExpression('neutral'); setBS('I', 0.12-p*0.12);
      } else {
        setExpression('neutral');
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.7; boneLUpperArm.rotation.x = 0.08; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.9; boneRUpperArm.rotation.x = 0.06; }
      }
      setRightFingerCurl(0.3); setLeftFingerRelax();
      break;
    }

    // ── BED LIE ────────────────────────────────────────────────
    // Full lying pose — use with yOffset: -0.85 on the Bed spot.
    // VRM hips rotate ~-1.45 rad to lay the spine horizontal.
    case 'bedLie': {
      if (boneHips)      { boneHips.rotation.x = -1.45; boneHips.rotation.z = Math.sin(t*0.3)*0.02; }
      if (boneSpine)     { boneSpine.rotation.x = -0.08 + Math.sin(t*0.25)*0.02; }
      if (boneChest)     boneChest.rotation.x = -0.04;
      // Head propped on pillow — tilted up from horizontal
      if (boneHead)      { boneHead.rotation.x = 0.35; boneHead.rotation.z = Math.sin(t*0.4)*0.03; }
      // Legs flat with gentle knee bend
      if (boneLUpperLeg) boneLUpperLeg.rotation.x = -0.12;
      if (boneRUpperLeg) boneRUpperLeg.rotation.x = -0.12;
      if (boneLLowerLeg) boneLLowerLeg.rotation.x =  0.18;
      if (boneRLowerLeg) boneRLowerLeg.rotation.x =  0.18;
      if (boneLFoot)     boneLFoot.rotation.x = 0.05;
      if (boneRFoot)     boneRFoot.rotation.x = 0.05;
      // Arms resting at sides, slightly out, relaxed
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.6; boneLUpperArm.rotation.x = -0.05; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.6; boneRUpperArm.rotation.x = -0.05; }
      if (boneLLowerArm) boneLLowerArm.rotation.z = 0.3;
      if (boneRLowerArm) boneRLowerArm.rotation.z = -0.3;
      if (boneLHand)     { boneLHand.rotation.z = 0.15; boneLHand.rotation.x = 0.05; }
      if (boneRHand)     { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = 0.05; }
      setExpression('neutral');
      setLeftFingerRelax(); setRightFingerRelax();
      break;
    }

    // ── BED LIE PHONE ──────────────────────────────────────────
    // Lying down scrolling phone above face — common bedroom pose
    case 'bedLiePhone': {
      if (boneHips)      { boneHips.rotation.x = -1.45; boneHips.rotation.z = Math.sin(t*0.3)*0.02; }
      if (boneSpine)     boneSpine.rotation.x = -0.06;
      if (boneChest)     boneChest.rotation.x = -0.04;
      if (boneHead)      { boneHead.rotation.x = 0.45; boneHead.rotation.z = Math.sin(t*0.3)*0.02; }
      if (boneLUpperLeg) boneLUpperLeg.rotation.x = -0.1;
      if (boneRUpperLeg) boneRUpperLeg.rotation.x = -0.1;
      if (boneLLowerLeg) boneLLowerLeg.rotation.x =  0.15;
      if (boneRLowerLeg) boneRLowerLeg.rotation.x =  0.15;
      // Right arm raised, phone above face
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.3; boneRUpperArm.rotation.x = -0.8; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.2; boneRLowerArm.rotation.x = 0.15; }
      if (boneRHand)     { boneRHand.rotation.z = -0.1; boneRHand.rotation.x = -0.1 + Math.sin(t*1.5)*0.04; }
      // Left arm resting
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.55; boneLUpperArm.rotation.x = -0.05; }
      if (boneLLowerArm) boneLLowerArm.rotation.z = 0.28;
      if (boneLHand)     { boneLHand.rotation.z = 0.15; boneLHand.rotation.x = 0.05; }
      const scrollCycle = t % 8.0;
      if (scrollCycle > 6.5) {
        setExpression('happy');
        setBS('I', Math.sin((scrollCycle-6.5)/1.5*Math.PI)*0.15);
      } else { setExpression('neutral'); }
      setRightFingerCurl(0.3); setLeftFingerRelax();
      break;
    }

    // Default: idle hands
    default:
      break;
  }
}

// ── Gesture system ───────────────────────────────────────────────
let gesture         = null;
let gestureTime     = 0;
let gestureDuration = 0;

export const GESTURES = {
  think: (t) => {
    if (!boneRUpperArm) return;
    boneRUpperArm.rotation.z = -0.55 + Math.sin(t*1.2)*0.05;
    boneRUpperArm.rotation.x =  0.65;
    if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.3; boneRLowerArm.rotation.x = 0.15; }
    if (boneRHand)     { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = 0.1; }
    if (boneLHand)     { boneLHand.rotation.z =  0.22; boneLHand.rotation.x = 0.08; }
    setBS('I', Math.abs(Math.sin(t*0.7))*0.08);
  },
  talk: (t) => {
    if (!boneLUpperArm || !boneRUpperArm) return;
    const wave = Math.sin(t*5.5)*0.14;
    boneLUpperArm.rotation.z =  0.75 + wave;
    boneRUpperArm.rotation.z = -(0.75 + wave*0.7);
    boneLUpperArm.rotation.x = 0.18 + Math.sin(t*4)*0.08;
    boneRUpperArm.rotation.x = 0.18 + Math.sin(t*4+1)*0.08;
    if (boneLLowerArm) boneLLowerArm.rotation.z =  0.48 + Math.sin(t*5)*0.1;
    if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.48 + Math.sin(t*5+0.5)*0.1);
    if (boneLHand) { boneLHand.rotation.z = 0.22+Math.sin(t*7)*0.12; boneLHand.rotation.y = Math.sin(t*5)*0.08; }
    if (boneRHand) { boneRHand.rotation.z = -(0.22+Math.sin(t*7+1)*0.12); boneRHand.rotation.y = Math.sin(t*5+1)*0.08; }
  },
  wave: (t) => {
    if (!boneRUpperArm) return;
    boneRUpperArm.rotation.z = -(0.28 + Math.sin(t*8)*0.28);
    boneRUpperArm.rotation.x =  0.35;
    if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.18+Math.sin(t*8+0.5)*0.22);
    if (boneRHand) { boneRHand.rotation.z = -(0.1+Math.sin(t*10)*0.15); boneRHand.rotation.y = Math.sin(t*8)*0.1; }
    setRightFingerWave(t);
    if (boneLUpperArm) boneLUpperArm.rotation.z = 1.0;
    if (boneLHand) { boneLHand.rotation.z = 0.2; boneLHand.rotation.x = 0.08; }
    setLeftFingerRelax();
  },
  excited: (t) => {
    if (!boneLUpperArm || !boneRUpperArm) return;
    boneLUpperArm.rotation.z =  0.38 + Math.sin(t*7)*0.17;
    boneRUpperArm.rotation.z = -(0.38 + Math.sin(t*7+0.3)*0.17);
    boneLUpperArm.rotation.x = 0.22; boneRUpperArm.rotation.x = 0.22;
    if (boneSpine) boneSpine.rotation.y = Math.sin(t*7)*0.06;
    if (boneHips)  boneHips.rotation.z  = Math.sin(t*7)*0.07;
    if (boneLHand) { boneLHand.rotation.z = 0.2+Math.sin(t*9)*0.15; boneLHand.rotation.x = 0.08; }
    if (boneRHand) { boneRHand.rotation.z = -(0.2+Math.sin(t*9+0.5)*0.15); boneRHand.rotation.x = 0.08; }
    setLeftFingerCurl(0.05, 0.6); setRightFingerCurl(0.05, 0.6);
    setBS('O', Math.abs(Math.sin(t*7))*0.25);
    if (teethNode) teethNode.position.y = -Math.abs(Math.sin(t*7))*0.006;
  },
};

export function doGesture(name, durationMs = 3000) {
  if (hyper.active) return;
  gesture = name; gestureTime = 0; gestureDuration = durationMs / 1000;
}
export function gestureActive() { return gesture !== null || hyper.active; }

// Exposed for render loop
export function updateGesture(delta) {
  if (!gesture) return;
  gestureTime += delta;
  if (gestureTime < gestureDuration && GESTURES[gesture]) {
    GESTURES[gesture](gestureTime);
  } else {
    gesture = null;
    const vrm = _vrm(); if (vrm) vrm.scene.position.z = 0;
  }
}

// ── Hype engine ──────────────────────────────────────────────────
export const hyper = { active: false, stages: [], stageIdx: 0, stageTimer: 0, onDone: null };

export function playHype(stages, onDone) {
  hyper.active = true; hyper.stages = stages;
  hyper.stageIdx = 0; hyper.stageTimer = 0; hyper.onDone = onDone || null;
  setCamMode('SPEAK');
}
export function hyperUpdate(delta) {
  if (!hyper.active) return;
  const stage = hyper.stages[hyper.stageIdx];
  if (!stage) { _hyperFinish(); return; }
  hyper.stageTimer += delta;
  stage.fn(hyper.stageTimer, Math.min(hyper.stageTimer / stage.dur, 1));
  if (hyper.stageTimer >= stage.dur) {
    hyper.stageIdx++;
    hyper.stageTimer = 0;
    if (hyper.stageIdx >= hyper.stages.length) _hyperFinish();
  }
}
function _hyperFinish() {
  hyper.active = false; hyper.stages = []; hyper.stageIdx = 0;
  setCamMode('IDLE');
  if (hyper.onDone) hyper.onDone();
}
export function easeInOut(p) { return p < 0.5 ? 2*p*p : -1+(4-2*p)*p; }

// ── Hype choreographies ──────────────────────────────────────────
export function triggerRaidDance() {
  setCamMode('IDLE');
  playHype([
    { dur: 0.8, fn: (t, p) => {
      const snap = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 1.1-snap*0.7; boneLUpperArm.rotation.x = snap*0.5; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.1-snap*0.7); boneRUpperArm.rotation.x = snap*0.5; }
      if (boneHead)  boneHead.rotation.x  = snap*0.12;
      if (boneSpine) boneSpine.rotation.x = snap*0.06;
      setExpression('surprised');
    }},
    { dur: 2.2, fn: (t) => {
      const pump = Math.sin(t*10)*0.28; const bounce = Math.abs(Math.sin(t*10))*0.04;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.35+pump; boneLUpperArm.rotation.x = 0.45+bounce; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.35+pump); boneRUpperArm.rotation.x = 0.45+bounce; }
      if (boneLLowerArm) boneLLowerArm.rotation.z =  0.6+Math.abs(pump)*0.5;
      if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.6+Math.abs(pump)*0.5);
      if (boneSpine) { boneSpine.rotation.x = bounce*1.5; boneSpine.rotation.z = Math.sin(t*5)*0.04; }
      if (boneHips)  boneHips.rotation.z = Math.sin(t*5)*0.09;
      if (boneLUpperLeg) boneLUpperLeg.rotation.x =  Math.sin(t*10)*0.08;
      if (boneRUpperLeg) boneRUpperLeg.rotation.x = -Math.sin(t*10)*0.08;
      setExpression('excited');
    }},
    { dur: 2.2, fn: (t) => {
      const sway = Math.sin(t*7)*0.18; const bob = Math.abs(Math.sin(t*7))*0.05;
      if (boneHips)      { boneHips.rotation.z = sway; boneHips.rotation.y = sway*0.4; }
      if (boneSpine)     { boneSpine.rotation.z = -sway*0.5; boneSpine.rotation.x = bob; }
      if (boneChest)     boneChest.rotation.z = sway*0.3;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.5+Math.sin(t*7+1)*0.2; boneLUpperArm.rotation.x = 0.3+bob; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.5+Math.sin(t*7)*0.2); boneRUpperArm.rotation.x = 0.3+bob; }
      if (boneLUpperLeg) boneLUpperLeg.rotation.z =  sway*0.35;
      if (boneRUpperLeg) boneRUpperLeg.rotation.z = -sway*0.35;
    }},
    { dur: 2.0, fn: (t, p) => {
      const vrm = _vrm();
      const ep = easeInOut(Math.min(p*2,1)); const retract = p > 0.5 ? easeInOut((p-0.5)*2) : 0;
      if (vrm) vrm.scene.position.z = ep*0.18-retract*0.18;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.3-ep*0.25; boneLUpperArm.rotation.x = ep*0.35; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.3-ep*0.25); boneRUpperArm.rotation.x = ep*0.35; }
      if (boneLLowerArm) boneLLowerArm.rotation.z =  0.2+ep*0.15;
      if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.2+ep*0.15);
      if (boneHead)      boneHead.rotation.y = Math.sin(t*2)*0.04;
    }},
    { dur: 1.0, fn: (t) => {
      const vrm = _vrm();
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.6+Math.sin(t*8)*0.12; boneLUpperArm.rotation.x = 0.2; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.6+Math.sin(t*8+0.5)*0.12); boneRUpperArm.rotation.x = 0.2; }
      if (vrm) vrm.scene.position.z = 0;
      setExpression('happy');
    }},
  ]);
}

export function triggerSubCelebration() {
  playHype([
    { dur: 0.5, fn: (t, p) => {
      const g = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 1.1-g*0.4; boneLUpperArm.rotation.x = g*0.3; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.1-g*0.4); boneRUpperArm.rotation.x = g*0.3; }
      if (boneHead)      boneHead.rotation.x = g*0.1;
      setExpression('surprised');
    }},
    { dur: 1.8, fn: (t) => {
      const clap = Math.abs(Math.sin(t*9));
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.7-clap*0.5; boneLUpperArm.rotation.x = 0.25+clap*0.1; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.7-clap*0.5); boneRUpperArm.rotation.x = 0.25+clap*0.1; }
      if (boneLLowerArm) boneLLowerArm.rotation.z =  0.3+clap*0.4;
      if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.3+clap*0.4);
      if (boneSpine)     boneSpine.rotation.x = clap*0.05;
      setExpression('excited');
    }},
    { dur: 2.0, fn: (t) => {
      const vrm = _vrm();
      const jump = Math.abs(Math.sin(t*8))*0.12;
      if (vrm) vrm.scene.position.y = (vrm.scene.position.y||0)+(jump-(vrm._lastJump||0));
      if (vrm) vrm._lastJump = jump;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.4+Math.sin(t*7)*0.18; boneLUpperArm.rotation.x = 0.3; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.4+Math.sin(t*7+0.4)*0.18); boneRUpperArm.rotation.x = 0.3; }
      if (boneSpine)     boneSpine.rotation.x = Math.sin(t*8)*0.03;
      if (boneHips)      boneHips.rotation.z  = Math.sin(t*8)*0.06;
    }},
    { dur: 2.0, fn: (t, p) => {
      const vrm = _vrm();
      if (vrm) { vrm.scene.position.y = vrm._restPosY||0; vrm._lastJump = 0; }
      const ep = easeInOut(Math.min(p*2,1)); const ret = p > 0.5 ? easeInOut((p-0.5)*2) : 0;
      if (vrm) vrm.scene.position.z = ep*0.14-ret*0.14;
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.15; boneRUpperArm.rotation.x = 0.55+Math.sin(t*3)*0.04; }
      if (boneRLowerArm) boneRLowerArm.rotation.x = 0.15;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.6+Math.sin(t*4)*0.08; boneLUpperArm.rotation.x = 0.2; }
      if (boneHead)      boneHead.rotation.y = -0.08;
      setExpression('happy');
    }},
    { dur: 1.2, fn: (t) => {
      const vrm = _vrm(); if (vrm) vrm.scene.position.z = 0;
      const kiss = Math.sin(t*5)*0.1;
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.3+kiss); boneRUpperArm.rotation.x = 0.6; }
      if (boneRLowerArm) boneRLowerArm.rotation.z = -0.6;
      if (boneLUpperArm) boneLUpperArm.rotation.z = 1.0;
      if (boneHead)      boneHead.rotation.y = -0.06;
      setExpression('happy');
    }},
  ]);
}

export function triggerResubHype() {
  playHype([
    { dur: 2.5, fn: (t) => {
      const shimmy = Math.sin(t*9);
      if (boneChest)     boneChest.rotation.z  =  shimmy*0.1;
      if (boneSpine)     boneSpine.rotation.z  = -shimmy*0.07;
      if (boneLUpperArm) boneLUpperArm.rotation.z =  1.0+shimmy*0.18;
      if (boneRUpperArm) boneRUpperArm.rotation.z = -(1.0+shimmy*0.18);
      if (boneLUpperArm) boneLUpperArm.rotation.x = 0.1+Math.abs(shimmy)*0.08;
      if (boneRUpperArm) boneRUpperArm.rotation.x = 0.1+Math.abs(shimmy)*0.08;
      setExpression('happy');
    }},
    { dur: 1.5, fn: (t) => {
      const nod = Math.sin(t*6)*0.06;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.2; boneLUpperArm.rotation.x = 0.5+nod; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.2; boneRUpperArm.rotation.x = 0.5+nod; }
      if (boneLLowerArm) boneLLowerArm.rotation.x = 0.15;
      if (boneRLowerArm) boneRLowerArm.rotation.x = 0.15;
      if (boneHead)      boneHead.rotation.x = nod;
    }},
    { dur: 1.0, fn: (t, p) => {
      const s = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.2+s*0.9; boneLUpperArm.rotation.x = 0.5-s*0.5; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.2+s*0.9); boneRUpperArm.rotation.x = 0.5-s*0.5; }
      setExpression('happy');
    }},
  ]);
}

export function triggerBitsDazzle(bits = 100) {
  const scale  = Math.min(1, bits/500);
  const spinAmt = 0.18 + scale*0.25;
  playHype([
    { dur: 0.6, fn: (t, p) => {
      const g = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 1.1-g*0.9; boneLUpperArm.rotation.x = g*(0.3+scale*0.2); }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.1-g*0.9); boneRUpperArm.rotation.x = g*(0.3+scale*0.2); }
      if (boneHead) boneHead.rotation.x = g*0.15;
      setExpression('surprised');
    }},
    { dur: 2.0+scale, fn: (t) => {
      const spin = Math.sin(t*(6+scale*3))*spinAmt;
      if (boneHips)      boneHips.rotation.z  = spin;
      if (boneSpine)     boneSpine.rotation.z = -spin*0.6;
      if (boneChest)     boneChest.rotation.z = spin*0.3;
      if (boneLUpperArm) boneLUpperArm.rotation.z =  0.45+spin*0.5;
      if (boneRUpperArm) boneRUpperArm.rotation.z = -(0.45+spin*0.5);
      if (boneLUpperArm) boneLUpperArm.rotation.x = 0.15;
      if (boneRUpperArm) boneRUpperArm.rotation.x = 0.15;
      if (boneHead)      boneHead.rotation.z = spin*0.2;
      setExpression('excited');
    }},
    { dur: 1.2, fn: (t, p) => {
      const dip = Math.abs(Math.sin(t*8))*0.08; const down = easeInOut(p)*0.06;
      if (boneSpine)     boneSpine.rotation.x = dip-down;
      if (boneLUpperArm) boneLUpperArm.rotation.z =  0.7+dip;
      if (boneRUpperArm) boneRUpperArm.rotation.z = -(0.7+dip);
      if (boneHips)      boneHips.rotation.z = 0;
    }},
    { dur: 1.2, fn: (t) => {
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.25+Math.sin(t*5)*0.08); boneRUpperArm.rotation.x = 0.65; }
      if (boneRLowerArm) boneRLowerArm.rotation.z = -0.55;
      if (boneLUpperArm) boneLUpperArm.rotation.z = 1.0;
      if (boneSpine)     boneSpine.rotation.x = 0;
      setExpression('happy');
    }},
  ]);
}

export function triggerGiftPop() {
  playHype([
    { dur: 0.4, fn: (t, p) => {
      const g = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 1.1-g; boneLUpperArm.rotation.x = g*0.4; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.1-g); boneRUpperArm.rotation.x = g*0.4; }
      setExpression('excited');
    }},
    { dur: 2.0, fn: (t) => {
      const shake = Math.sin(t*12)*0.06;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.1+shake; boneLUpperArm.rotation.x = 0.4; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.1+shake); boneRUpperArm.rotation.x = 0.4; }
      if (boneLLowerArm) boneLLowerArm.rotation.z =  0.1+Math.abs(shake);
      if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.1+Math.abs(shake));
      const bob = Math.abs(Math.sin(t*8))*0.04;
      if (boneSpine) boneSpine.rotation.x = bob;
      if (boneHips)  boneHips.rotation.z  = Math.sin(t*8)*0.05;
    }},
    { dur: 1.6, fn: (t) => {
      const wv = Math.sin(t*9)*0.2;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.5+wv; boneLUpperArm.rotation.x = 0.25; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.5+wv); boneRUpperArm.rotation.x = 0.25; }
      setExpression('happy');
    }},
    { dur: 1.0, fn: (t, p) => {
      const s = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.5+s*0.6; boneLUpperArm.rotation.x = 0.25-s*0.25; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.5+s*0.6); boneRUpperArm.rotation.x = 0.25-s*0.25; }
    }},
  ]);
}

// ── Lip sync ─────────────────────────────────────────────────────
export let lipSyncActive = false;
export let _isSpeaking   = false;
let lipRafId = null;
const MOUTH_BS = ['A','I','U','E','O'];

export function stopLipSync() {
  lipSyncActive = false;
  cancelAnimationFrame(lipRafId);
  MOUTH_BS.forEach(s => setBS(s, 0));
  if (boneJaw) boneJaw.rotation.x = 0;
  if (teethNode) teethNode.position.y = 0;
}

export function runLipSync(text) {
  return new Promise((resolve) => {
    stopLipSync();
    lipSyncActive = true;
    const startTime = Date.now();
    const words     = text.split(' ');
    const msPerWord = (text.length * 62) / Math.max(words.length, 1);
    const totalMs   = words.length * msPerWord;
    const VOWELS    = new Set(['a','e','i','o','u']);
    function tick() {
      if (!lipSyncActive) return;
      lipRafId = requestAnimationFrame(tick);
      const elapsed = Date.now() - startTime;
      if (elapsed >= totalMs) { stopLipSync(); setExpression('neutral'); resolve(); return; }
      const wordIndex = Math.floor(elapsed / msPerWord);
      const word      = (words[wordIndex] || '').toLowerCase();
      const charPos   = Math.floor((elapsed % msPerWord) / msPerWord * word.length);
      const char      = word[charPos] || '';
      const isVowel   = VOWELS.has(char);
      const isSilence = char === '' || char === ' ';
      const rhythm    = Math.abs(Math.sin(elapsed*0.018))*0.4+0.3;
      const base      = isSilence ? 0 : rhythm + (isVowel ? 0.5 : 0);
      const openness  = Math.min(1, base);
      const spread    = isVowel && (char==='i'||char==='e') ? 0.6 : 0.1;
      const round     = isVowel && (char==='o'||char==='u') ? 0.5 : 0.1;
      setBS('A', openness*0.9); setBS('O', openness*round);
      setBS('I', openness*spread); setBS('E', openness*spread*0.7);
      setBS('U', openness*round*0.6);
      if (boneJaw)    boneJaw.rotation.x = openness*0.22;
      if (teethNode)  teethNode.position.y = -openness*0.008;
    }
    tick();
  });
}

// ── Blink ─────────────────────────────────────────────────────────
export function doBlink() {
  setBS('blink', 1);
  setTimeout(() => setBS('blink', 0), 120);
}
