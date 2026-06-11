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
      const headNod  = Math.sin(t * 0.28) * 0.018;
      const headTurn = Math.sin(t * 0.19) * 0.06;

      // Hips — 90–110° hip angle per guide. rotation.x ≈ 1.65 (94°)
      // Slight right lean, subtle sway
      if (boneHips) {
        boneHips.rotation.x =  1.65;
        boneHips.rotation.z =  0.04 + microZ;
        boneHips.rotation.y =  Math.sin(t * 0.22) * 0.015;
      }

      // Spine — 100–110° back angle = leaning back slightly past vertical
      // rotation.x negative = lean back
      if (boneSpine) {
        boneSpine.rotation.x = -0.18 + breathe;
        boneSpine.rotation.z = -microZ * 0.4;
        boneSpine.rotation.y =  Math.sin(t * 0.18) * 0.012;
      }

      // Chest — follows spine lean, subtle breath rise
      if (boneChest) {
        boneChest.rotation.x = -0.08 + breathe * 0.6;
        boneChest.rotation.z = -microZ * 0.25;
      }

      // ── Legs — hip angle 90°, knee angle 90–100° ─────────────
      // Upper leg: thigh parallel to floor (rotation.x ≈ 1.57 = 90°)
      if (boneLUpperLeg) {
        boneLUpperLeg.rotation.x =  1.55;
        boneLUpperLeg.rotation.z = -0.10;
        boneLUpperLeg.rotation.y =  0.04;
      }
      if (boneRUpperLeg) {
        boneRUpperLeg.rotation.x =  1.55;
        boneRUpperLeg.rotation.z =  0.12;
        boneRUpperLeg.rotation.y = -0.04;
      }
      // Lower leg: knee at ~95° — calf drops naturally behind knee
      if (boneLLowerLeg) {
        boneLLowerLeg.rotation.x = -1.58;
        boneLLowerLeg.rotation.z =  0.0;
      }
      if (boneRLowerLeg) {
        boneRLowerLeg.rotation.x = -1.58;
        boneRLowerLeg.rotation.z =  0.0;
      }
      // Feet flat on floor — ankle dorsiflexion per guide
      if (boneLFoot) {
        boneLFoot.rotation.x = -0.12;
        boneLFoot.rotation.z = -0.04;
      }
      if (boneRFoot) {
        boneRFoot.rotation.x = -0.12;
        boneRFoot.rotation.z =  0.05;
      }
      if (boneLToes) boneLToes.rotation.x =  0.04;
      if (boneRToes) boneRToes.rotation.x =  0.04;

      // ── Arms — resting on thighs, elbows 90–110° per guide ───
      // Elbow angle 90–110° = lower arm roughly horizontal
      if (boneLUpperArm) {
        boneLUpperArm.rotation.z =  0.72 + Math.sin(t * 0.6) * 0.015;
        boneLUpperArm.rotation.x =  0.38;
        boneLUpperArm.rotation.y = -0.06;
      }
      if (boneLLowerArm) {
        boneLLowerArm.rotation.z =  0.48;
        boneLLowerArm.rotation.x =  0.10;
      }
      if (boneLHand) {
        boneLHand.rotation.z     =  0.18 + Math.sin(t * 1.4) * 0.03;
        boneLHand.rotation.x     =  0.05 + Math.sin(t * 2.0) * 0.025;
        boneLHand.rotation.y     =  Math.sin(t * 1.1) * 0.03;
      }
      if (boneRUpperArm) {
        boneRUpperArm.rotation.z = -0.72 - Math.sin(t * 0.6 + 1.0) * 0.015;
        boneRUpperArm.rotation.x =  0.38;
        boneRUpperArm.rotation.y =  0.06;
      }
      if (boneRLowerArm) {
        boneRLowerArm.rotation.z = -0.48;
        boneRLowerArm.rotation.x =  0.10;
      }
      if (boneRHand) {
        boneRHand.rotation.z     = -0.18 - Math.sin(t * 1.4 + 1.0) * 0.03;
        boneRHand.rotation.x     =  0.05 + Math.sin(t * 2.0 + 1.0) * 0.025;
        boneRHand.rotation.y     =  Math.sin(t * 1.1 + 0.8) * 0.03;
      }

      // ── Head — straight, slight natural movement ──────────────
      // Head neutral per guide — not pitched forward
      if (boneHead) {
        boneHead.rotation.x =  0.04 + headNod;
        boneHead.rotation.z =  Math.sin(t * 0.42) * 0.022;
        boneHead.rotation.y =  headTurn;
      }
      if (boneNeck) {
        boneNeck.rotation.x =  0.02 + headNod * 0.4;
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
      const thumbScroll = Math.sin(t * 2.2) * 0.04;

      // Right arm holds phone — elbow close to body, forearm up
      // Phone at eye level: upper arm down close to side, forearm raised
      if (boneRUpperArm) {
        boneRUpperArm.rotation.z = -0.28;   // close to body, not splayed out
        boneRUpperArm.rotation.x =  0.45;   // forward lift
        boneRUpperArm.rotation.y =  0.08;
      }
      if (boneRLowerArm) {
        boneRLowerArm.rotation.z = -0.18;
        boneRLowerArm.rotation.x =  0.55;   // forearm raised toward face
        boneRLowerArm.rotation.y = -0.05;
      }
      if (boneRHand) {
        boneRHand.rotation.z = -0.10;
        boneRHand.rotation.x = -0.20 + thumbScroll;  // thumb scrolling micro-motion
        boneRHand.rotation.y =  0.05;
      }

      // Left arm — supports elbow or rests on lap
      if (boneLUpperArm) {
        boneLUpperArm.rotation.z =  0.55;
        boneLUpperArm.rotation.x =  0.30;
        boneLUpperArm.rotation.y = -0.05;
      }
      if (boneLLowerArm) {
        boneLLowerArm.rotation.z =  0.35;
        boneLLowerArm.rotation.x =  0.15;
      }
      if (boneLHand) {
        boneLHand.rotation.z =  0.12;
        boneLHand.rotation.x =  0.05;
      }

      // Head — neck angle 15–30° down looking at screen per guide
      if (boneHead) {
        boneHead.rotation.x =  0.30 + Math.sin(t * 0.4) * 0.025;  // looking down at phone
        boneHead.rotation.z =  Math.sin(t * 0.35) * 0.018;
        boneHead.rotation.y =  Math.sin(t * 0.2) * 0.03;
      }
      if (boneNeck) {
        boneNeck.rotation.x =  0.15;  // supports the 15-30deg neck angle
      }

      // Slight forward lean in spine — natural when looking at phone
      if (boneSpine) {
        boneSpine.rotation.x =  0.08;
        boneSpine.rotation.z =  Math.sin(t * 0.3) * 0.01;
      }

      // Expression — occasional smile/react when scrolling
      if (scrollCycle > 6.5) {
        setExpression('happy');
        setBS('I', Math.sin((scrollCycle - 6.5) / 1.5 * Math.PI) * 0.15);
      } else {
        setExpression('neutral');
        setBS('I', 0);
      }
      setRightFingerCurl(0.30);
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

    // ── CABINET OPEN ───────────────────────────────────────────
    // Standing facing cabinet/wardrobe. Right hand reaches for handle,
    // pauses, then both hands browse inside with head tilt to look in.
    // Phase 0–0.6s: reach forward. 0.6–2.5s: hold/browse. 2.5–4s: step back.
    // 4–6s: settle idle, then loop.
    case 'cabinetOpen': {
      const cycle = t % 6.0;
      if (cycle < 0.6) {
        // Reach forward
        const p = cycle / 0.6;
        const ep = 3*p*p - 2*p*p*p;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0 + ep*0.52; boneRUpperArm.rotation.x = ep*0.45; boneRUpperArm.rotation.y = ep*0.1; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.35 - ep*0.1); boneRLowerArm.rotation.x = ep*0.55; }
        if (boneRHand)     { boneRHand.rotation.x = -ep*0.2; boneRHand.rotation.z = -(0.18 - ep*0.05); }
        if (boneSpine)     { boneSpine.rotation.x = ep*0.06; }
        if (boneHead)      { boneHead.rotation.x = ep*0.08; }
        setRightFingerCurl(0.3);
        setExpression('neutral');
      } else if (cycle < 2.5) {
        // Hold handle + browse — head tilts to look inside
        const browse = cycle - 0.6;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.48 + Math.sin(browse*1.2)*0.03; boneRUpperArm.rotation.x = 0.45; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.25; boneRLowerArm.rotation.x = 0.55 + Math.sin(browse*0.8)*0.04; }
        if (boneRHand)     { boneRHand.rotation.x = -0.2 + Math.sin(browse*2)*0.04; }
        // Left arm hangs, slightly out — natural standing
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.9 + Math.sin(browse*0.7)*0.03; boneLUpperArm.rotation.x = 0.06; }
        if (boneLLowerArm) boneLLowerArm.rotation.z = 0.45;
        if (boneLHand)     { boneLHand.rotation.z = 0.2; boneLHand.rotation.x = 0.06; }
        if (boneHead)      { boneHead.rotation.x = 0.08 + Math.sin(browse*0.5)*0.05; boneHead.rotation.z = Math.sin(browse*0.4)*0.03; }
        if (boneSpine)     boneSpine.rotation.x = 0.06 + Math.sin(browse*0.6)*0.01;
        if (boneHips)      boneHips.rotation.z = Math.sin(browse*0.5)*0.03;
        setRightFingerCurl(0.3);
        setExpression(browse > 1.0 ? 'happy' : 'neutral');
        if (browse > 1.0) setBS('I', Math.sin((browse-1.0)*1.5)*0.08);
      } else if (cycle < 4.0) {
        // Step back — arm retracts
        const p = (cycle - 2.5) / 1.5;
        const ep = 3*p*p - 2*p*p*p;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.48 - ep*0.52; boneRUpperArm.rotation.x = 0.45 - ep*0.4; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.25 - ep*0.1; boneRLowerArm.rotation.x = 0.55 - ep*0.5; }
        if (boneRHand)     { boneRHand.rotation.x = -0.2 + ep*0.2; boneRHand.rotation.z = -(0.13 + ep*0.05); }
        if (boneHead)      { boneHead.rotation.x = 0.08 - ep*0.06; boneHead.rotation.z = 0; }
        if (boneSpine)     boneSpine.rotation.x = 0.06 - ep*0.04;
        setRightFingerRelax();
        setExpression('neutral'); setBS('I', 0);
      } else {
        // Settled idle
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0 + Math.sin(t*0.6)*0.02; boneRUpperArm.rotation.x = 0.05; }
        if (boneRLowerArm) boneRLowerArm.rotation.z = -0.35;
        if (boneHips)      boneHips.rotation.z = Math.sin(t*0.8)*0.04;
        setRightFingerRelax(); setLeftFingerRelax();
        setExpression('neutral');
      }
      break;
    }

    // ── WASHING UP ─────────────────────────────────────────────
    // Both hands over sink, circular scrub motion. Occasional
    // rinse lift (one hand rises, then lowers). End: shake dry.
    // Spot: x:-4.849, z:-0.650, facingY: Math.PI*0.5 (facing +X toward sink)
    case 'washingUp': {
      const scrub = t * 4.0;
      // Both arms extended down-forward at sink level
      if (boneSpine)     { boneSpine.rotation.x = 0.10 + Math.sin(t*0.5)*0.01; boneSpine.rotation.z = Math.sin(t*0.4)*0.015; }
      if (boneHead)      { boneHead.rotation.x = 0.14; boneHead.rotation.z = Math.sin(t*0.3)*0.02; }
      if (boneHips)      boneHips.rotation.z = Math.sin(t*0.7)*0.03;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.55; boneLUpperArm.rotation.x = 0.55; boneLUpperArm.rotation.y = -0.1; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.55; boneRUpperArm.rotation.x = 0.55; boneRUpperArm.rotation.y = 0.1; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.3; boneLLowerArm.rotation.x = 0.3 + Math.sin(scrub)*0.04; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.3; boneRLowerArm.rotation.x = 0.3 + Math.cos(scrub)*0.04; }
      // Circular wrist scrub — left and right offset by half cycle
      if (boneLHand) {
        boneLHand.rotation.z =  0.12 + Math.sin(scrub)*0.12;
        boneLHand.rotation.y =  Math.cos(scrub)*0.10;
        boneLHand.rotation.x = -0.05 + Math.sin(scrub*0.5)*0.04;
      }
      if (boneRHand) {
        boneRHand.rotation.z = -0.12 + Math.sin(scrub + Math.PI)*0.12;
        boneRHand.rotation.y =  Math.cos(scrub + Math.PI)*0.10;
        boneRHand.rotation.x = -0.05 + Math.sin(scrub*0.5 + Math.PI)*0.04;
      }
      // Rinse phase — right hand lifts briefly every 7s
      const rinseCycle = t % 7.0;
      if (rinseCycle > 5.5 && rinseCycle < 6.8) {
        const rp = Math.sin((rinseCycle - 5.5) / 1.3 * Math.PI);
        if (boneRUpperArm) boneRUpperArm.rotation.x = 0.55 - rp*0.3;
        if (boneRLowerArm) boneRLowerArm.rotation.x = 0.3 + rp*0.25;
        setExpression('neutral');
      }
      // Shake dry at the very end of each 7s loop
      if (rinseCycle > 6.5) {
        const shake = Math.sin(t * 18) * (1 - (rinseCycle - 6.5) / 0.5) * 0.08;
        if (boneLHand) boneLHand.rotation.z =  0.12 + shake;
        if (boneRHand) boneRHand.rotation.z = -0.12 - shake;
        setExpression('happy'); setBS('I', 0.08);
      } else {
        setExpression('neutral'); setBS('I', 0);
      }
      setLeftFingerCurl(0.2); setRightFingerCurl(0.2);
      break;
    }

    // ── WATCH TV ───────────────────────────────────────────────
    // Seated on sofa (use yOffset: -0.52), head pitched up toward
    // TV at Y=1.93. More expressive than tvReact — proper sit pose
    // with couch lean, head tracking, periodic reactions.
    // Spot: x:-4.159, z:-4.424, facingY:0 (toward TV wall)
    case 'watchTV': {
      const breathe  = Math.sin(t * 0.52) * 0.011;
      const headNod  = Math.sin(t * 0.25) * 0.018;
      const reactCycle = t % 14.0;

      // Seated hips — full couch sit
      if (boneHips) { boneHips.rotation.x = 0.55; boneHips.rotation.z = 0.04 + Math.sin(t*0.28)*0.015; }
      if (boneSpine) { boneSpine.rotation.x = -0.04 + breathe; boneSpine.rotation.z = Math.sin(t*0.2)*0.01; }
      if (boneChest) { boneChest.rotation.x = 0.03 + breathe*0.5; }

      // Legs — thighs horizontal, calves down
      if (boneLUpperLeg) { boneLUpperLeg.rotation.x = 1.48; boneLUpperLeg.rotation.z = -0.08; }
      if (boneRUpperLeg) { boneRUpperLeg.rotation.x = 1.48; boneRUpperLeg.rotation.z =  0.10; }
      if (boneLLowerLeg) boneLLowerLeg.rotation.x = -1.32;
      if (boneRLowerLeg) boneRLowerLeg.rotation.x = -1.32;
      if (boneLFoot) { boneLFoot.rotation.x = -0.18; boneLFoot.rotation.z = -0.04; }
      if (boneRFoot) { boneRFoot.rotation.x = -0.18; boneRFoot.rotation.z =  0.05; }

      // Arms resting on thighs
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.65; boneLUpperArm.rotation.x = 0.45; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.65; boneRUpperArm.rotation.x = 0.45; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.52; boneLLowerArm.rotation.x = 0.12; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.52; boneRLowerArm.rotation.x = 0.12; }
      if (boneLHand)     { boneLHand.rotation.z = 0.20; boneLHand.rotation.x = 0.06; }
      if (boneRHand)     { boneRHand.rotation.z = -0.20; boneRHand.rotation.x = 0.06; }

      // Head pitched up toward TV screen (Y≈1.93, ~0.5m above eye level when seated)
      // and slowly tracking left/right as if following on-screen action
      if (boneHead) {
        boneHead.rotation.x =  0.18 + headNod;
        boneHead.rotation.y =  Math.sin(t * 0.18) * 0.12;
        boneHead.rotation.z =  Math.sin(t * 0.35) * 0.02;
      }
      if (boneNeck) {
        boneNeck.rotation.x =  0.08;
        boneNeck.rotation.y =  Math.sin(t * 0.18) * 0.05;
      }

      // Reaction cycles: surprised → laugh → neutral → lean forward
      if (reactCycle > 11.0 && reactCycle < 12.5) {
        // Surprised moment — lean forward slightly
        const rp = Math.sin((reactCycle - 11.0) / 1.5 * Math.PI);
        setExpression('surprised');
        setBS('O', rp * 0.4);
        if (boneSpine) boneSpine.rotation.x = -0.04 + rp * 0.08;
        if (boneHead)  boneHead.rotation.x  =  0.18 + rp * 0.06;
      } else if (reactCycle > 7.0 && reactCycle < 8.5) {
        // Laugh — head bobs
        const lp = Math.sin((reactCycle - 7.0) / 1.5 * Math.PI);
        setExpression('happy');
        setBS('A', lp * 0.22);
        if (boneHead) boneHead.rotation.x = 0.18 + Math.abs(Math.sin(t*5))*lp*0.05;
      } else {
        setExpression('neutral');
        setBS('O', 0); setBS('A', 0);
      }
      setLeftFingerRelax(); setRightFingerRelax();
      break;
    }

    // ── EAT AT TABLE ───────────────────────────────────────────
    // Seated at dining chair (yOffset: -0.42). Right hand fork loops
    // to mouth. Left hand rests on table edge. Bowl prop spawned by
    // engine-life.js at this spot.
    // Dining chair sit is slightly shallower than sofa (hips.x: 1.3)
    case 'eatAtTable': {
      const breathe   = Math.sin(t * 0.55) * 0.01;
      const forkCycle = t % 5.0;

      // Chair-seated hips — shallower than sofa, more upright
      if (boneHips)  { boneHips.rotation.x = 1.30; boneHips.rotation.z = 0.03 + Math.sin(t*0.3)*0.01; }
      if (boneSpine) { boneSpine.rotation.x = 0.04 + breathe; boneSpine.rotation.z = Math.sin(t*0.22)*0.01; }
      if (boneChest) { boneChest.rotation.x = 0.03 + breathe*0.5; }

      // Legs — same as sofaSit but tighter (chair is narrower)
      if (boneLUpperLeg) { boneLUpperLeg.rotation.x = 1.45; boneLUpperLeg.rotation.z = -0.06; }
      if (boneRUpperLeg) { boneRUpperLeg.rotation.x = 1.45; boneRUpperLeg.rotation.z =  0.08; }
      if (boneLLowerLeg) boneLLowerLeg.rotation.x = -1.35;
      if (boneRLowerLeg) boneRLowerLeg.rotation.x = -1.35;
      if (boneLFoot) { boneLFoot.rotation.x = -0.15; boneLFoot.rotation.z = -0.03; }
      if (boneRFoot) { boneRFoot.rotation.x = -0.15; boneRFoot.rotation.z =  0.04; }

      // Left arm — resting on table edge, elbow bent
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.5; boneLUpperArm.rotation.x = 0.6; boneLUpperArm.rotation.y = -0.1; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.3; boneLLowerArm.rotation.x = 0.15; }
      if (boneLHand)     { boneLHand.rotation.z = 0.18; boneLHand.rotation.x = -0.05; }

      // Right arm — fork to mouth cycle
      // Phase 0–0.8s: lower (fork toward bowl)
      // Phase 0.8–1.8s: lift to mouth
      // Phase 1.8–2.8s: at mouth (chew, happy)
      // Phase 2.8–3.5s: lower back to bowl
      // Phase 3.5–5.0s: rest pause
      if (forkCycle < 0.8) {
        const p = forkCycle / 0.8;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.5; boneRUpperArm.rotation.x = 0.5 - p*0.1; }
        if (boneRLowerArm) boneRLowerArm.rotation.x = 0.45 - p*0.1;
        if (boneRHand)     { boneRHand.rotation.x = -0.1; boneRHand.rotation.z = -0.12; }
        setExpression('neutral');
      } else if (forkCycle < 1.8) {
        const p = (forkCycle - 0.8) / 1.0;
        const ep = 3*p*p - 2*p*p*p;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.5 + ep*0.05; boneRUpperArm.rotation.x = 0.4 + ep*0.3; }
        if (boneRLowerArm) boneRLowerArm.rotation.x = 0.35 + ep*0.2;
        if (boneRHand)     { boneRHand.rotation.x = -0.1 + ep*(-0.1); boneRHand.rotation.z = -0.12; }
        setExpression('neutral');
      } else if (forkCycle < 2.8) {
        // At mouth — open, chew, happy
        const chew = (forkCycle - 1.8) / 1.0;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.45; boneRUpperArm.rotation.x = 0.70; }
        if (boneRLowerArm) boneRLowerArm.rotation.x = 0.55;
        if (boneRHand)     { boneRHand.rotation.x = -0.2 + Math.sin(chew*8)*0.03; }
        if (boneHead)      boneHead.rotation.x = 0.06 + Math.sin(chew*4)*0.02;
        setExpression('happy');
        setBS('A', Math.abs(Math.sin(chew * 7)) * 0.28);
        if (boneJaw) boneJaw.rotation.x = Math.abs(Math.sin(chew * 7)) * 0.10;
      } else if (forkCycle < 3.5) {
        const p = (forkCycle - 2.8) / 0.7;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.45 - p*0.05; boneRUpperArm.rotation.x = 0.70 - p*0.3; }
        if (boneRLowerArm) boneRLowerArm.rotation.x = 0.55 - p*0.2;
        if (boneHead)      boneHead.rotation.x = 0.06;
        setExpression('happy'); setBS('A', 0); if (boneJaw) boneJaw.rotation.x = 0;
        setBS('I', (1-p)*0.12); // satisfied smile as fork lowers
      } else {
        // Rest pause — hands on table, slight head dip
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.5; boneRUpperArm.rotation.x = 0.42; }
        if (boneRLowerArm) boneRLowerArm.rotation.x = 0.38;
        if (boneRHand)     { boneRHand.rotation.x = -0.08; boneRHand.rotation.z = -0.12; }
        if (boneHead)      { boneHead.rotation.x = 0.05 + Math.sin(t*0.4)*0.02; boneHead.rotation.z = Math.sin(t*0.3)*0.02; }
        setExpression('neutral'); setBS('I', 0); setBS('A', 0);
      }
      setRightFingerCurl(0.4); setLeftFingerRelax();
      break;
    }

    // ── DRINK COFFEE ───────────────────────────────────────────
    // Can be used standing or seated. Right hand lifts cup to mouth,
    // tilts for sip, small mouth open, lowers, pause, repeat.
    // Prop: cup-coffee.glb or cup-tea.glb spawned at hand position
    // by engine-life.js before this activity fires.
    case 'drinkCoffee': {
      const sipCycle = t % 6.5;

      // Left arm — resting naturally
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.85; boneLUpperArm.rotation.x = 0.06; }
      if (boneLLowerArm) boneLLowerArm.rotation.z = 0.45;
      if (boneLHand)     { boneLHand.rotation.z = 0.2; boneLHand.rotation.x = 0.06; }

      if (sipCycle < 0.7) {
        // Lift cup from waist to lip height
        const p = sipCycle / 0.7;
        const ep = 3*p*p - 2*p*p*p;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0 + ep*0.52; boneRUpperArm.rotation.x = ep*0.65; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.35; boneRLowerArm.rotation.x = ep*0.4; }
        if (boneRHand)     { boneRHand.rotation.x = -ep*0.15; boneRHand.rotation.z = -0.15; }
        if (boneSpine)     boneSpine.rotation.x = ep * 0.03;
        setExpression('neutral');
      } else if (sipCycle < 1.6) {
        // Cup at lip — tilt for sip
        const sip = (sipCycle - 0.7) / 0.9;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.48; boneRUpperArm.rotation.x = 0.65; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.35; boneRLowerArm.rotation.x = 0.4 + Math.sin(sip*Math.PI)*0.12; }
        if (boneRHand)     { boneRHand.rotation.x = -0.15 - Math.sin(sip*Math.PI)*0.18; boneRHand.rotation.z = -0.15; }
        if (boneHead)      boneHead.rotation.x = 0.06 + Math.sin(sip*Math.PI)*0.04;
        setExpression('neutral');
        setBS('A', Math.sin(sip * Math.PI) * 0.18);
        if (boneJaw) boneJaw.rotation.x = Math.sin(sip * Math.PI) * 0.07;
      } else if (sipCycle < 2.8) {
        // Held at lip, satisfied
        const hold = sipCycle - 1.6;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.48 + Math.sin(hold*1.5)*0.01; boneRUpperArm.rotation.x = 0.65; }
        if (boneRLowerArm) boneRLowerArm.rotation.x = 0.4;
        if (boneRHand)     boneRHand.rotation.x = -0.15;
        setExpression('happy');
        setBS('I', Math.sin(hold*1.2)*0.06 + 0.04);
        setBS('A', 0); if (boneJaw) boneJaw.rotation.x = 0;
      } else if (sipCycle < 3.5) {
        // Lower cup back down
        const p = (sipCycle - 2.8) / 0.7;
        const ep = 3*p*p - 2*p*p*p;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.48 - ep*0.52; boneRUpperArm.rotation.x = 0.65 - ep*0.65; }
        if (boneRLowerArm) boneRLowerArm.rotation.x = 0.4 - ep*0.4;
        if (boneRHand)     boneRHand.rotation.x = -0.15 + ep*0.15;
        if (boneSpine)     boneSpine.rotation.x = 0.03 - ep*0.03;
        setExpression('happy'); setBS('I', (1-ep)*0.04);
      } else {
        // Rest — cup held low, gentle sway, small smile lingers
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0 + Math.sin(t*0.55)*0.02; boneRUpperArm.rotation.x = 0.05; }
        if (boneRLowerArm) boneRLowerArm.rotation.z = -0.35;
        if (boneRHand)     { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = 0.02; }
        if (boneHips)      boneHips.rotation.z = Math.sin(t*0.7)*0.04;
        if (boneHead)      { boneHead.rotation.x = Math.sin(t*0.3)*0.02; boneHead.rotation.z = Math.sin(t*0.4)*0.02; }
        setExpression('neutral');
      }
      setRightFingerCurl(0.35); setLeftFingerRelax();
      break;
    }

    // ── COOK DANCE ─────────────────────────────────────────────
    // Kitchen-only. Hip shimmy while one hand stirs at counter height.
    // Right arm stirs in circles (like `stirring` but looser),
    // left arm swings freely. Hips groove to imaginary music.
    // Spot: kitchen centre x:-2.8, z:1.2 (open floor, can spin)
    case 'cookDance': {
      const stir  = t * 2.8;
      const groove = Math.sin(t * 5.5);
      const bob    = Math.abs(Math.sin(t * 5.5)) * 0.05;

      // Hip groove — bigger sway than normal dance
      if (boneHips) { boneHips.rotation.z = groove*0.18; boneHips.rotation.y = groove*0.10; boneHips.rotation.x = bob*0.5; }
      if (boneSpine) { boneSpine.rotation.z = -groove*0.10; boneSpine.rotation.x = bob*0.9; boneSpine.rotation.y = groove*0.04; }
      if (boneChest) { boneChest.rotation.z = groove*0.07; boneChest.rotation.x = bob*0.5; }

      // Right arm — stirs at chest height in lazy circles
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.60; boneRUpperArm.rotation.x = 0.50; boneRUpperArm.rotation.y = 0.08; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.35 + Math.sin(stir)*0.14; boneRLowerArm.rotation.x = 0.42 + Math.cos(stir)*0.10; }
      if (boneRHand)     { boneRHand.rotation.z = -0.12 + Math.sin(stir*0.8)*0.08; boneRHand.rotation.y = Math.cos(stir)*0.12; }

      // Left arm — free swing with groove
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.7 + Math.sin(t*5.5+1.5)*0.25; boneLUpperArm.rotation.x = 0.18 + bob*0.4; }
      if (boneLLowerArm) boneLLowerArm.rotation.z = 0.5 + Math.sin(t*5.5+0.8)*0.18;
      if (boneLHand)     { boneLHand.rotation.z = 0.22 + Math.sin(t*8)*0.16; boneLHand.rotation.x = 0.08; boneLHand.rotation.y = Math.sin(t*5)*0.08; }

      // Legs — gentle weight shift
      if (boneLUpperLeg) { boneLUpperLeg.rotation.z = groove*0.07; boneLUpperLeg.rotation.x = bob*0.25; }
      if (boneRUpperLeg) { boneRUpperLeg.rotation.z = -groove*0.07; boneRUpperLeg.rotation.x = bob*0.25; }
      if (boneLFoot)     boneLFoot.rotation.x = -0.04 + Math.max(0, groove)*0.10;
      if (boneRFoot)     boneRFoot.rotation.x = -0.04 + Math.max(0, -groove)*0.10;

      // Head bobs and nods to beat
      if (boneHead) { boneHead.rotation.z = Math.sin(t*2.75)*0.06; boneHead.rotation.y = groove*0.06; boneHead.rotation.x = 0.04 + bob*0.3; }

      setExpression('happy');
      setBS('A', Math.max(0, Math.sin(t*5.5)) * 0.20);
      setRightFingerCurl(0.45); setLeftFingerRelax();
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

// ================================================================
//  LORA — dual bone cache + animations
//  Export names match exactly what engine-life.js imports.
// ================================================================
import { getVrmMr } from './engine-scene.js';
const _vrmMr = () => getVrmMr();

// Bone exports — named with Mr suffix to match engine-life.js imports
export let boneHeadMr=null,  boneNeckMr=null,  boneSpineMr=null, boneChestMr=null;
export let boneJawMr=null;
export let boneHipsMr=null;
export let boneLUpperLegMr=null, boneRUpperLegMr=null;
export let boneLLowerLegMr=null, boneRLowerLegMr=null;
export let boneLFootMr=null,     boneRFootMr=null;
export let boneLToesMr=null,     boneRToesMr=null;
export let boneLUpperArmMr=null, boneRUpperArmMr=null;
export let boneLLowerArmMr=null, boneRLowerArmMr=null;
export let boneLHandMr=null,     boneRHandMr=null;
export let boneL_ThumbPxMr=null, boneL_IndexPxMr=null, boneL_MidPxMr=null;
export let boneR_ThumbPxMr=null, boneR_IndexPxMr=null, boneR_MidPxMr=null;
export let teethNodeMr=null;

export function cacheBonesMr() {
  const v = _vrmMr();
  if (!v || !v.humanoid) return;
  const h = v.humanoid;
  boneHeadMr      = h.getNormalizedBoneNode('head');
  boneNeckMr      = h.getNormalizedBoneNode('neck');
  boneSpineMr     = h.getNormalizedBoneNode('spine');
  boneChestMr     = h.getNormalizedBoneNode('chest');
  boneHipsMr      = h.getNormalizedBoneNode('hips');
  boneJawMr       = h.getNormalizedBoneNode('jaw') || h.getNormalizedBoneNode('lowerJaw') || null;
  if (!boneJawMr) v.scene.traverse(n => { if (!boneJawMr && n.isBone && /jaw/i.test(n.name)) boneJawMr = n; });
  boneLUpperLegMr = h.getNormalizedBoneNode('leftUpperLeg');
  boneRUpperLegMr = h.getNormalizedBoneNode('rightUpperLeg');
  boneLLowerLegMr = h.getNormalizedBoneNode('leftLowerLeg');
  boneRLowerLegMr = h.getNormalizedBoneNode('rightLowerLeg');
  boneLFootMr     = h.getNormalizedBoneNode('leftFoot');
  boneRFootMr     = h.getNormalizedBoneNode('rightFoot');
  boneLToesMr     = h.getNormalizedBoneNode('leftToes');
  boneRToesMr     = h.getNormalizedBoneNode('rightToes');
  boneLUpperArmMr = h.getNormalizedBoneNode('leftUpperArm');
  boneRUpperArmMr = h.getNormalizedBoneNode('rightUpperArm');
  boneLLowerArmMr = h.getNormalizedBoneNode('leftLowerArm');
  boneRLowerArmMr = h.getNormalizedBoneNode('rightLowerArm');
  boneLHandMr     = h.getNormalizedBoneNode('leftHand');
  boneRHandMr     = h.getNormalizedBoneNode('rightHand');
  boneL_ThumbPxMr = h.getNormalizedBoneNode('leftThumbProximal');
  boneL_IndexPxMr = h.getNormalizedBoneNode('leftIndexProximal');
  boneL_MidPxMr   = h.getNormalizedBoneNode('leftMiddleProximal');
  boneR_ThumbPxMr = h.getNormalizedBoneNode('rightThumbProximal');
  boneR_IndexPxMr = h.getNormalizedBoneNode('rightIndexProximal');
  boneR_MidPxMr   = h.getNormalizedBoneNode('rightMiddleProximal');
  v.scene.traverse(n => { if (n.name === 'Teeth') teethNodeMr = n; });
  console.log('[Lora] Bones cached:', { boneHeadMr, boneSpineMr, boneLHandMr });
}

// ── Lora finger helpers (matching engine-life.js import names) ───
export function setLeftFingerRelaxMr() {
  if (boneL_ThumbPxMr) { boneL_ThumbPxMr.rotation.z = 0.3; boneL_ThumbPxMr.rotation.y = 0.2; }
  if (boneL_IndexPxMr) boneL_IndexPxMr.rotation.z = 0.1;
  if (boneL_MidPxMr)   boneL_MidPxMr.rotation.z   = 0.1;
}
export function setRightFingerRelaxMr() {
  if (boneR_ThumbPxMr) { boneR_ThumbPxMr.rotation.z = -0.3; boneR_ThumbPxMr.rotation.y = -0.2; }
  if (boneR_IndexPxMr) boneR_IndexPxMr.rotation.z = -0.1;
  if (boneR_MidPxMr)   boneR_MidPxMr.rotation.z   = -0.1;
}

// ── Lora rest pose ───────────────────────────────────────────────
export function setRestPoseMr() {
  if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.95; boneLUpperArmMr.rotation.x = 0.08; }
  if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.80; boneRUpperArmMr.rotation.x = 0.35; }
  if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.30; boneLLowerArmMr.rotation.x = 0.05; }
  if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.20; boneRLowerArmMr.rotation.x = 0.60; }
  if (boneLHandMr) { boneLHandMr.rotation.z =  0.15; }
  if (boneRHandMr) { boneRHandMr.rotation.z = -0.10; boneRHandMr.rotation.x = -0.05; }
  if (boneHipsMr)  { boneHipsMr.rotation.z  = -0.04; boneHipsMr.rotation.x = 0.01; }
  if (boneLUpperLegMr) boneLUpperLegMr.rotation.z = -0.05;
  if (boneRUpperLegMr) boneRUpperLegMr.rotation.z =  0.07;
  if (boneLFootMr) { boneLFootMr.rotation.x = -0.05; boneLFootMr.rotation.z = -0.03; }
  if (boneRFootMr) { boneRFootMr.rotation.x = -0.05; boneRFootMr.rotation.z =  0.04; }
  if (boneSpineMr) { boneSpineMr.rotation.x = 0.03; boneSpineMr.rotation.z = 0.03; }
  if (boneHeadMr)  { boneHeadMr.rotation.x = 0.04; }
  setLeftFingerRelaxMr();
  setRightFingerRelaxMr();
}

// ── Lora blendshape setter ───────────────────────────────────────
export function setBSMr(name, value) {
  const v = _vrmMr();
  if (!v) return;
  const val = Math.max(0, Math.min(1, value));
  try { v.expressionManager?.setValue(name, val); } catch(e) {}
}

export function setExpressionMr(mood) {
  ['happy','angry','sad','relaxed','surprised'].forEach(e => setBSMr(e, 0));
  ['joy','angry','sorrow','fun','neutral'].forEach(e => setBSMr(e, 0));
  const map = {
    happy:     () => { setBSMr('joy',0.8); setBSMr('happy',0.8); },
    excited:   () => { setBSMr('joy',1.0); setBSMr('fun',0.6); },
    angry:     () => { setBSMr('angry',0.7); },
    sad:       () => { setBSMr('sorrow',0.7); setBSMr('sad',0.6); },
    neutral:   () => { setBSMr('neutral',0.3); },
    surprised: () => { setBSMr('surprised',0.8); },
  };
  (map[mood] || map.neutral)();
}

// ── Lora activity system ─────────────────────────────────────────
// Parallel to Miss's ACTIVITY object — engine-life.js reads and
// sets ACTIVITY_MR.current / timer / phase / duration to schedule
// Lora's activities independently of Miss's.
export const ACTIVITY_MR = {
  current:  'idle',
  timer:    0,
  duration: 8,
  phase:    0,
};

export function activityUpdateMr(delta) {
  const v = _vrmMr();
  if (!v) return;
  ACTIVITY_MR.timer += delta;
  const t = ACTIVITY_MR.timer;

  switch (ACTIVITY_MR.current) {

    // ── IDLE ───────────────────────────────────────────────────
    case 'idle':
    default: {
      const breathe  = Math.sin(t * 0.5) * 0.011;
      const headNod  = Math.sin(t * 0.22) * 0.018;
      const headTurn = Math.sin(t * 0.14) * 0.055;
      const hipSway  = Math.sin(t * 0.95) * 0.07;
      const hipBob   = Math.abs(Math.sin(t * 0.95)) * 0.028;
      const chestOpp = Math.sin(t * 0.95 + 0.6) * 0.035;
      const sRoll    = Math.sin(t * 0.48) * 0.020;

      if (boneHipsMr)      { boneHipsMr.rotation.z = hipSway; boneHipsMr.rotation.x = hipBob*0.5; boneHipsMr.rotation.y = Math.sin(t*0.5)*0.05; }
      if (boneSpineMr)     { boneSpineMr.rotation.z = -hipSway*0.6; boneSpineMr.rotation.x = breathe; boneSpineMr.rotation.y = Math.sin(t*0.5)*0.022; }
      if (boneChestMr)     { boneChestMr.rotation.z = chestOpp; boneChestMr.rotation.x = breathe*0.85; boneChestMr.rotation.y = sRoll; }
      if (boneHeadMr)      { boneHeadMr.rotation.z = Math.sin(t*0.42)*0.04; boneHeadMr.rotation.x = headNod+0.02; boneHeadMr.rotation.y = headTurn; }
      if (boneNeckMr)      { boneNeckMr.rotation.z = Math.sin(t*0.42)*0.018; boneNeckMr.rotation.y = headTurn*0.4; }
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.9+Math.sin(t*0.82)*0.06+chestOpp*0.4; boneLUpperArmMr.rotation.x =  0.07+Math.sin(t*0.52)*0.035; boneLUpperArmMr.rotation.y =  0.04+sRoll*0.5; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.50+Math.sin(t*0.95)*0.04; boneLLowerArmMr.rotation.x = -0.04; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.9-Math.sin(t*0.82+0.5)*0.06-chestOpp*0.4; boneRUpperArmMr.rotation.x =  0.07+Math.sin(t*0.52+0.5)*0.035; boneRUpperArmMr.rotation.y = -0.04-sRoll*0.5; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.50-Math.sin(t*0.95+0.5)*0.04; boneRLowerArmMr.rotation.x = -0.04; }
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.24+Math.sin(t*2.0)*0.07; boneLHandMr.rotation.x =  0.10+Math.sin(t*2.4)*0.04; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.24-Math.sin(t*2.0+1.0)*0.07; boneRHandMr.rotation.x =  0.10+Math.sin(t*2.4+1.0)*0.04; }
      if (boneLUpperLegMr) { boneLUpperLegMr.rotation.z = -0.04; boneLUpperLegMr.rotation.x = 0; }
      if (boneRUpperLegMr) { boneRUpperLegMr.rotation.z =  0.06; boneRUpperLegMr.rotation.x = 0; }
      if (boneLLowerLegMr) boneLLowerLegMr.rotation.x = 0.04;
      if (boneRLowerLegMr) boneRLowerLegMr.rotation.x = 0.04;
      if (boneLFootMr)     { boneLFootMr.rotation.x = -0.05; boneLFootMr.rotation.z = -0.03; }
      if (boneRFootMr)     { boneRFootMr.rotation.x = -0.05; boneRFootMr.rotation.z =  0.04; }
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── SOFA SIT ───────────────────────────────────────────────
    case 'sofaSit': {
      const phase   = t % 14;
      const breathe = Math.sin(t * 0.55) * 0.012;
      const headWave = Math.sin(t * 0.28) * 0.018;
      const microZ  = Math.sin(t * 0.38) * 0.016;

      // Hips — 90–110° hip angle (rotation.x ≈ 1.65 = 94°)
      if (boneHipsMr)  { boneHipsMr.rotation.x = 1.65; boneHipsMr.rotation.z = 0.04 + microZ; boneHipsMr.rotation.y = Math.sin(t*0.22)*0.015; }
      // Spine — 100–110° back angle, leaning slightly back
      if (boneSpineMr) { boneSpineMr.rotation.x = -0.18 + breathe; boneSpineMr.rotation.z = -microZ * 0.4; boneSpineMr.rotation.y = Math.sin(t*0.18)*0.010; }
      if (boneChestMr) { boneChestMr.rotation.x = -0.08 + breathe * 0.6; boneChestMr.rotation.z = -microZ * 0.25; }

      // Head — neutral, slight natural sway
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.04 + headWave; boneHeadMr.rotation.y = Math.sin(t*0.18)*0.08; boneHeadMr.rotation.z = Math.sin(t*0.28)*0.03; }
      if (boneNeckMr)  { boneNeckMr.rotation.y = Math.sin(t*0.18)*0.03; boneNeckMr.rotation.x = 0.02 + headWave * 0.4; }

      // Legs — thighs parallel to floor (1.55), knee 95° (lower leg -1.58)
      if (boneLUpperLegMr) { boneLUpperLegMr.rotation.x =  1.55; boneLUpperLegMr.rotation.z = -0.12; boneLUpperLegMr.rotation.y =  0.04; }
      if (boneRUpperLegMr) { boneRUpperLegMr.rotation.x =  1.55; boneRUpperLegMr.rotation.z =  0.10; boneRUpperLegMr.rotation.y = -0.04; }
      if (boneLLowerLegMr) boneLLowerLegMr.rotation.x = -1.58;
      if (boneRLowerLegMr) boneRLowerLegMr.rotation.x = -1.58;
      // Feet flat, minimal toe-up
      if (boneLFootMr)     { boneLFootMr.rotation.x = -0.12; boneLFootMr.rotation.z = -0.05; }
      if (boneRFootMr)     { boneRFootMr.rotation.x = -0.12; boneRFootMr.rotation.z =  0.05; }

      // Arms — resting on thighs, elbow 90–110° per guide
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.70 + Math.sin(t*0.5)*0.012; boneLUpperArmMr.rotation.x =  0.36; boneLUpperArmMr.rotation.y = -0.05; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.70 - Math.sin(t*0.5+1)*0.012; boneRUpperArmMr.rotation.x =  0.36; boneRUpperArmMr.rotation.y =  0.05; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.48 + Math.sin(t*0.7)*0.03; boneLLowerArmMr.rotation.x =  0.10; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.48 - Math.sin(t*0.7+1)*0.03; boneRLowerArmMr.rotation.x =  0.10; }
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.16; boneLHandMr.rotation.x =  0.06; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.16; boneRHandMr.rotation.x =  0.06; }

      // Phase: look around naturally
      if (phase < 4)       setExpressionMr('neutral');
      else if (phase < 8)  { if (boneHeadMr) boneHeadMr.rotation.y += 0.15; }
      else if (phase < 12) { if (boneHeadMr) boneHeadMr.rotation.y -= 0.15; }
      else                 setExpressionMr('happy');

      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── PHONE SCROLL ───────────────────────────────────────────
    case 'phoneScroll': {
      const thumbScroll = Math.sin(t * 2.2) * 0.04;
      const breathe     = Math.sin(t * 0.55) * 0.010;

      // Hips — stay in seated position (same as sofaSit)
      if (boneHipsMr)  { boneHipsMr.rotation.x = 1.65; boneHipsMr.rotation.z = 0.03 + Math.sin(t*0.3)*0.01; }
      // Spine — slight forward lean when looking at phone
      if (boneSpineMr) { boneSpineMr.rotation.x = 0.08 + breathe; boneSpineMr.rotation.z = Math.sin(t*0.3)*0.01; }
      if (boneChestMr) { boneChestMr.rotation.x = 0.05 + breathe*0.5; }

      // Head — neck angle 15–30° down per guide (rotation.x = 0.30)
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.30 + Math.sin(t*0.4)*0.025; boneHeadMr.rotation.y = Math.sin(t*0.2)*0.03; boneHeadMr.rotation.z = Math.sin(t*0.35)*0.018; }
      if (boneNeckMr)  { boneNeckMr.rotation.x = 0.15; }

      // Legs — same seated position as sofaSit
      if (boneLUpperLegMr) { boneLUpperLegMr.rotation.x =  1.55; boneLUpperLegMr.rotation.z = -0.12; boneLUpperLegMr.rotation.y =  0.04; }
      if (boneRUpperLegMr) { boneRUpperLegMr.rotation.x =  1.55; boneRUpperLegMr.rotation.z =  0.10; boneRUpperLegMr.rotation.y = -0.04; }
      if (boneLLowerLegMr) boneLLowerLegMr.rotation.x = -1.58;
      if (boneRLowerLegMr) boneRLowerLegMr.rotation.x = -1.58;
      if (boneLFootMr)     { boneLFootMr.rotation.x = -0.12; boneLFootMr.rotation.z = -0.05; }
      if (boneRFootMr)     { boneRFootMr.rotation.x = -0.12; boneRFootMr.rotation.z =  0.05; }

      // Right arm — elbow close to body (z = -0.28), forearm raised to eye level per guide
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.28; boneRUpperArmMr.rotation.x =  0.45; boneRUpperArmMr.rotation.y =  0.08; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.18; boneRLowerArmMr.rotation.x =  0.55; boneRLowerArmMr.rotation.y = -0.05; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.10; boneRHandMr.rotation.x = -0.20 + thumbScroll; boneRHandMr.rotation.y = 0.05; }

      // Left arm — supports or rests on thigh
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.55; boneLUpperArmMr.rotation.x =  0.30; boneLUpperArmMr.rotation.y = -0.05; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.35; boneLLowerArmMr.rotation.x =  0.15; }
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.12; boneLHandMr.rotation.x =  0.05; }

      const smileCycle = t % 8;
      if (smileCycle > 6.5) { setExpressionMr('happy'); setBSMr('I', Math.sin((smileCycle-6.5)/1.5*Math.PI)*0.15); }
      else { setExpressionMr('neutral'); setBSMr('I', 0); }

      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      break;
    }

    // ── TV REACT ───────────────────────────────────────────────
    case 'tvReact': {
      const phase = t % 18;
      const breathe = Math.sin(t * 0.5) * 0.011;

      if (boneSpineMr) { boneSpineMr.rotation.x = 0.04 + breathe; }
      if (boneChestMr) { boneChestMr.rotation.x = 0.03 + breathe*0.6; }
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.05 + Math.sin(t*0.25)*0.03; boneHeadMr.rotation.y = Math.sin(t*0.15)*0.08; }

      if (phase < 5)       setExpressionMr('neutral');
      else if (phase < 9)  { setExpressionMr('surprised'); if (boneHeadMr) boneHeadMr.rotation.x += 0.08; }
      else if (phase < 13) setExpressionMr('happy');
      else if (phase < 16) setExpressionMr('neutral');
      else                 { if (boneHeadMr) boneHeadMr.rotation.y += Math.sin(t*0.5)*0.12; }

      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.82; boneLUpperArmMr.rotation.x = 0.10; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.82; boneRUpperArmMr.rotation.x = 0.10; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.50; boneLLowerArmMr.rotation.x = 0.08; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.50; boneRLowerArmMr.rotation.x = 0.08; }
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── WATCH TV (seated, calm) ────────────────────────────────
    case 'watchTV': {
      const phase = t % 20;
      const breathe = Math.sin(t * 0.52) * 0.011;
      const headDrift = Math.sin(t * 0.18) * 0.06;

      // Seated pose — hips 90–110° per guide (1.65 = 94°)
      if (boneHipsMr)      { boneHipsMr.rotation.x = 1.65; boneHipsMr.rotation.z = Math.sin(t*0.3)*0.03; }
      if (boneSpineMr)     { boneSpineMr.rotation.x = -0.18 + breathe; }
      if (boneChestMr)     { boneChestMr.rotation.x = -0.10 + breathe*0.5; }
      // Head level, looking toward screen
      if (boneHeadMr)      { boneHeadMr.rotation.x = 0.06 + headDrift; boneHeadMr.rotation.y = Math.sin(t*0.14)*0.07; }

      // Legs — thighs parallel to floor (+1.55), knee 95° (-1.58)
      if (boneLUpperLegMr) { boneLUpperLegMr.rotation.x =  1.55; boneLUpperLegMr.rotation.z = -0.12; }
      if (boneRUpperLegMr) { boneRUpperLegMr.rotation.x =  1.55; boneRUpperLegMr.rotation.z =  0.10; }
      if (boneLLowerLegMr) boneLLowerLegMr.rotation.x = -1.58;
      if (boneRLowerLegMr) boneRLowerLegMr.rotation.x = -1.58;
      if (boneLFootMr)     { boneLFootMr.rotation.x = -0.12; boneLFootMr.rotation.z = -0.05; }
      if (boneRFootMr)     { boneRFootMr.rotation.x = -0.12; boneRFootMr.rotation.z =  0.05; }

      // Arms resting on thighs
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.62; boneLUpperArmMr.rotation.x = 0.15; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.62; boneRUpperArmMr.rotation.x = 0.15; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.52; boneLLowerArmMr.rotation.x = 0.12; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.52; boneRLowerArmMr.rotation.x = 0.12; }
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.18; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.18; }

      // Reaction cycle
      if (phase < 10)      setExpressionMr('neutral');
      else if (phase < 14) { setExpressionMr('surprised'); if (boneHeadMr) boneHeadMr.rotation.x += 0.07; }
      else if (phase < 17) setExpressionMr('happy');
      else                 setExpressionMr('neutral');

      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── READ BOOK ──────────────────────────────────────────────
    case 'readBook': {
      const breathe = Math.sin(t * 0.5) * 0.010;
      const pageCycle = t % 10;

      if (boneHipsMr)      { boneHipsMr.rotation.z = Math.sin(t*0.3)*0.03; }
      if (boneSpineMr)     { boneSpineMr.rotation.x = 0.14 + breathe; }
      if (boneChestMr)     { boneChestMr.rotation.x = 0.10 + breathe*0.5; }
      if (boneHeadMr)      { boneHeadMr.rotation.x = 0.28 + Math.sin(t*0.25)*0.03; boneHeadMr.rotation.y = Math.sin(t*0.2)*0.05; }

      // Both arms holding book
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.42; boneLUpperArmMr.rotation.x = 0.80; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.42; boneRUpperArmMr.rotation.x = 0.80; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.18; boneLLowerArmMr.rotation.x = 0.30; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.18; boneRLowerArmMr.rotation.x = 0.30; }
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.12; boneLHandMr.rotation.x = 0.15; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.12; boneRHandMr.rotation.x = 0.15; }

      // Page turn at ~8s
      if (pageCycle > 7.5 && pageCycle < 9.0) {
        if (boneRHandMr) boneRHandMr.rotation.z = -0.45;
        if (boneRLowerArmMr) boneRLowerArmMr.rotation.z = -0.35;
      }

      setExpressionMr('neutral');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── DANCE ──────────────────────────────────────────────────
    case 'dance': {
      const groove = Math.sin(t * 5.5);
      const bob    = Math.abs(Math.sin(t * 5.5)) * 0.06;

      if (boneHipsMr)      { boneHipsMr.rotation.z = groove*0.14; boneHipsMr.rotation.y = groove*0.08; boneHipsMr.rotation.x = bob*0.4; }
      if (boneSpineMr)     { boneSpineMr.rotation.z = -groove*0.08; boneSpineMr.rotation.x = bob*0.7; }
      if (boneChestMr)     { boneChestMr.rotation.z = groove*0.06; boneChestMr.rotation.x = bob*0.4; }

      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.65 + Math.sin(t*5.5+1.5)*0.28; boneLUpperArmMr.rotation.x = 0.20 + bob*0.5; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -(0.65 + Math.sin(t*5.5)*0.28); boneRUpperArmMr.rotation.x = 0.20 + bob*0.5; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.45 + Math.sin(t*5.5+0.8)*0.22; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -(0.45 + Math.sin(t*5.5+0.3)*0.22); }
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.22+Math.sin(t*8)*0.15; boneLHandMr.rotation.x = 0.08; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -(0.22+Math.sin(t*8+1)*0.15); boneRHandMr.rotation.x = 0.08; }

      if (boneLUpperLegMr) { boneLUpperLegMr.rotation.z = -0.04 + groove*0.06; }
      if (boneRUpperLegMr) { boneRUpperLegMr.rotation.z =  0.06 - groove*0.06; }
      if (boneLLowerLegMr) boneLLowerLegMr.rotation.x = 0.04 + Math.max(0, -groove)*0.08;
      if (boneRLowerLegMr) boneRLowerLegMr.rotation.x = 0.04 + Math.max(0, groove)*0.08;
      if (boneLFootMr)     boneLFootMr.rotation.x = -0.04 + Math.max(0, groove)*0.10;
      if (boneRFootMr)     boneRFootMr.rotation.x = -0.04 + Math.max(0, -groove)*0.10;

      if (boneHeadMr) { boneHeadMr.rotation.z = Math.sin(t*2.75)*0.06; boneHeadMr.rotation.y = groove*0.06; boneHeadMr.rotation.x = 0.04 + bob*0.3; }

      setExpressionMr('happy');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── STRETCH ────────────────────────────────────────────────
    case 'stretch': {
      const phase = t % 9;
      const breathe = Math.sin(t * 0.5) * 0.012;

      if (boneHipsMr)  { boneHipsMr.rotation.x = Math.sin(t*0.35)*0.06; boneHipsMr.rotation.z = Math.sin(t*0.4)*0.05; }
      if (boneSpineMr) { boneSpineMr.rotation.x = breathe + (phase < 3 ? 0.04 : phase < 6 ? -0.06 : 0.04); }
      if (boneChestMr) { boneChestMr.rotation.x = breathe*0.6; }

      if (phase < 3) {
        // Arms reach up
        if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.20; boneLUpperArmMr.rotation.x = -0.15; }
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.20; boneRUpperArmMr.rotation.x = -0.15; }
        if (boneLLowerArmMr) boneLLowerArmMr.rotation.z =  0.08;
        if (boneRLowerArmMr) boneRLowerArmMr.rotation.z = -0.08;
        if (boneHeadMr) boneHeadMr.rotation.x = -0.10;
        setExpressionMr('neutral');
      } else if (phase < 6) {
        // Side lean
        if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.18; boneLUpperArmMr.rotation.x = -0.10; }
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.70; boneRUpperArmMr.rotation.x =  0.08; }
        if (boneSpineMr) boneSpineMr.rotation.z += 0.12;
        if (boneHeadMr) { boneHeadMr.rotation.z = 0.10; boneHeadMr.rotation.x = 0.04; }
      } else {
        // Neck roll
        if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.88; boneLUpperArmMr.rotation.x = 0.08; }
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.88; boneRUpperArmMr.rotation.x = 0.08; }
        if (boneHeadMr) { boneHeadMr.rotation.z = Math.sin(t*1.2)*0.18; boneHeadMr.rotation.x = 0.04; }
        setExpressionMr('neutral');
      }
      break;
    }

    // ── HAIR FLICK ─────────────────────────────────────────────
    case 'hairflick': {
      const phase = t % 8;
      const breathe = Math.sin(t * 0.5) * 0.010;

      if (boneSpineMr) boneSpineMr.rotation.x = breathe;
      if (boneChestMr) boneChestMr.rotation.x = breathe*0.5;

      if (phase < 1.5) {
        // Raise hand to hair
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.32; boneRUpperArmMr.rotation.x = 0.65; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.18; boneRLowerArmMr.rotation.x = 0.25; }
        if (boneRHandMr)     { boneRHandMr.rotation.z = -0.10; boneRHandMr.rotation.y = 0.12; }
      } else if (phase < 4) {
        // Flick — sweep back
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.28; boneRUpperArmMr.rotation.x = 0.55; }
        if (boneRLowerArmMr) boneRLowerArmMr.rotation.x = 0.18;
        if (boneHeadMr)      { boneHeadMr.rotation.y = -0.12; boneHeadMr.rotation.z = -0.05; }
        setExpressionMr('happy');
      } else if (phase < 5.5) {
        // Return
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.75; boneRUpperArmMr.rotation.x = 0.20; }
        if (boneHeadMr)      { boneHeadMr.rotation.y = 0; boneHeadMr.rotation.z = 0; }
      } else {
        // Idle pause
        if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.90; boneLUpperArmMr.rotation.x = 0.08; }
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.90; boneRUpperArmMr.rotation.x = 0.08; }
        setExpressionMr('neutral');
      }

      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── HIP ON HIP ─────────────────────────────────────────────
    case 'hiponhip': {
      const sway = Math.sin(t * 1.2) * 0.05;
      const breathe = Math.sin(t * 0.5) * 0.011;

      if (boneHipsMr)      { boneHipsMr.rotation.z = sway; boneHipsMr.rotation.y = Math.sin(t*0.4)*0.04; }
      if (boneSpineMr)     { boneSpineMr.rotation.z = -sway*0.6; boneSpineMr.rotation.x = breathe; }
      if (boneChestMr)     { boneChestMr.rotation.z = sway*0.3; }

      // Right hand on hip
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.55; boneRUpperArmMr.rotation.x = 0.22; boneRUpperArmMr.rotation.y = -0.18; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.30; boneRLowerArmMr.rotation.x = 0.45; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.22; boneRHandMr.rotation.x = 0.10; }

      // Left arm sways gently
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.88 + sway*0.5; boneLUpperArmMr.rotation.x = 0.08; }
      if (boneLLowerArmMr) boneLLowerArmMr.rotation.z =  0.50 + sway*0.3;
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.22 + sway*0.4; boneLHandMr.rotation.x = 0.08; }

      if (boneHeadMr) { boneHeadMr.rotation.z = Math.sin(t*0.45)*0.04; boneHeadMr.rotation.y = Math.sin(t*0.30)*0.07; }

      setExpressionMr('neutral');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── TYPING ─────────────────────────────────────────────────
    case 'typing': {
      const tap = Math.sin(t * 9) * 0.5 + 0.5;
      const breathe = Math.sin(t * 0.5) * 0.010;

      if (boneSpineMr)     { boneSpineMr.rotation.x = 0.18 + breathe; }
      if (boneChestMr)     { boneChestMr.rotation.x = 0.12 + breathe*0.5; }
      if (boneHeadMr)      { boneHeadMr.rotation.x = 0.28 + Math.sin(t*0.22)*0.04; boneHeadMr.rotation.y = Math.sin(t*0.18)*0.06; }

      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.50; boneLUpperArmMr.rotation.x = 0.55; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.50; boneRUpperArmMr.rotation.x = 0.55; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.22; boneLLowerArmMr.rotation.x = 0.20; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.22; boneRLowerArmMr.rotation.x = 0.20; }

      // Alternating tap
      if (boneLHandMr) { boneLHandMr.rotation.x =  tap * 0.14; boneLHandMr.rotation.z =  0.18; }
      if (boneRHandMr) { boneRHandMr.rotation.x = -tap * 0.14; boneRHandMr.rotation.z = -0.18; }

      setExpressionMr('neutral');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── MONITOR ────────────────────────────────────────────────
    case 'monitor': {
      const phase = t % 12;
      const breathe = Math.sin(t * 0.5) * 0.010;

      if (boneSpineMr)     { boneSpineMr.rotation.x = 0.12 + breathe; }
      if (boneChestMr)     { boneChestMr.rotation.x = 0.08 + breathe*0.5; }

      if (phase < 4) {
        // Lean in
        if (boneSpineMr) boneSpineMr.rotation.x += 0.12;
        if (boneHeadMr)  { boneHeadMr.rotation.x = 0.20; boneHeadMr.rotation.y = Math.sin(t*0.4)*0.10; }
        setExpressionMr('surprised');
      } else if (phase < 8) {
        // Read
        if (boneHeadMr) { boneHeadMr.rotation.x = 0.14; boneHeadMr.rotation.y = Math.sin(t*0.25)*0.08; }
        setExpressionMr('neutral');
      } else {
        // Return
        if (boneHeadMr) { boneHeadMr.rotation.x = 0.06 + breathe; boneHeadMr.rotation.y = Math.sin(t*0.18)*0.06; }
        setExpressionMr('happy');
      }

      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.50; boneLUpperArmMr.rotation.x = 0.45; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.50; boneRUpperArmMr.rotation.x = 0.45; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.22; boneLLowerArmMr.rotation.x = 0.18; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.22; boneRLowerArmMr.rotation.x = 0.18; }
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.16; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.16; }

      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── NOSE COVER ─────────────────────────────────────────────
    case 'noseCover': {
      const phase = t % 7;
      const breathe = Math.sin(t * 0.5) * 0.010;

      if (boneSpineMr) boneSpineMr.rotation.x = breathe;
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.04 + Math.sin(t*0.3)*0.02; }

      if (phase < 0.8) {
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.38; boneRUpperArmMr.rotation.x = 0.90; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.22; boneRLowerArmMr.rotation.x = 0.45; }
        if (boneRHandMr)     { boneRHandMr.rotation.z = -0.08; }
      } else if (phase < 3) {
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.35; boneRUpperArmMr.rotation.x = 0.95; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.18; boneRLowerArmMr.rotation.x = 0.50; }
        if (boneRHandMr)     { boneRHandMr.rotation.z = -0.05; boneRHandMr.rotation.y = 0.08; }
        setExpressionMr('neutral');
      } else if (phase < 4.5) {
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.30; boneRUpperArmMr.rotation.x = 0.75; }
        setExpressionMr('happy');
      } else {
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.88; boneRUpperArmMr.rotation.x = 0.12; }
        setExpressionMr('neutral');
      }

      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.88; boneLUpperArmMr.rotation.x = 0.10; }
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── FIRE GAZE ──────────────────────────────────────────────
    case 'fireGaze': {
      const flicker = Math.sin(t * 3.5) * 0.025 + Math.sin(t * 7.2) * 0.012;
      const breathe = Math.sin(t * 0.48) * 0.010;

      if (boneHipsMr)  { boneHipsMr.rotation.z = Math.sin(t*0.3)*0.025; }
      if (boneSpineMr) { boneSpineMr.rotation.x = breathe; }
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.10 + flicker*0.5; boneHeadMr.rotation.y = Math.sin(t*0.22)*0.05 + flicker; }
      if (boneNeckMr)  boneNeckMr.rotation.y = Math.sin(t*0.22)*0.022;

      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.88; boneLUpperArmMr.rotation.x = 0.08; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.88; boneRUpperArmMr.rotation.x = 0.08; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.48; boneLLowerArmMr.rotation.x = 0.06; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.48; boneRLowerArmMr.rotation.x = 0.06; }

      setExpressionMr('neutral');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── WINDOW LOOK ────────────────────────────────────────────
    case 'windowLook': {
      const breathe = Math.sin(t * 0.5) * 0.010;
      const scanCycle = t % 10;

      if (boneSpineMr) { boneSpineMr.rotation.x = breathe; }
      if (boneHeadMr)  {
        boneHeadMr.rotation.x = 0.06 + Math.sin(t*0.25)*0.03;
        if (scanCycle < 4)       boneHeadMr.rotation.y = -0.28 + Math.sin(t*0.5)*0.04;
        else if (scanCycle < 7)  boneHeadMr.rotation.y =  0.0  + Math.sin(t*0.4)*0.05;
        else                     boneHeadMr.rotation.y =  0.28 - Math.sin(t*0.5)*0.04;
      }
      if (boneNeckMr) boneNeckMr.rotation.y = Math.sin(t*0.3)*0.04;

      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.88; boneLUpperArmMr.rotation.x = 0.08; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.88; boneRUpperArmMr.rotation.x = 0.08; }
      if (boneLLowerArmMr) boneLLowerArmMr.rotation.z =  0.48;
      if (boneRLowerArmMr) boneRLowerArmMr.rotation.z = -0.48;

      setExpressionMr('neutral');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── MIRROR POSE ────────────────────────────────────────────
    case 'mirrorPose': {
      const breathe = Math.sin(t * 0.5) * 0.010;
      const posePhase = t % 10;

      if (boneHipsMr)  { boneHipsMr.rotation.z = Math.sin(t*0.55)*0.06; }
      if (boneSpineMr) { boneSpineMr.rotation.x = breathe; boneSpineMr.rotation.z = -Math.sin(t*0.55)*0.04; }
      if (boneChestMr) { boneChestMr.rotation.x = breathe*0.5; }

      // Arms frame self — hands near face/shoulders
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.35; boneLUpperArmMr.rotation.x = -0.08; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.35; boneRUpperArmMr.rotation.x = -0.08; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.55; boneLLowerArmMr.rotation.x =  0.35; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.55; boneRLowerArmMr.rotation.x =  0.35; }
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.28; boneLHandMr.rotation.x = 0.10; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.28; boneRHandMr.rotation.x = 0.10; }

      if (boneHeadMr) { boneHeadMr.rotation.x = Math.sin(t*0.35)*0.04; boneHeadMr.rotation.z = Math.sin(t*0.4)*0.04; }

      setExpressionMr('happy');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── STIRRING ───────────────────────────────────────────────
    case 'stirring': {
      const stir = t * 2.5;
      const breathe = Math.sin(t * 0.5) * 0.010;

      if (boneSpineMr) { boneSpineMr.rotation.x = 0.10 + breathe; boneSpineMr.rotation.z = Math.sin(t*0.4)*0.03; }
      if (boneChestMr) { boneChestMr.rotation.x = 0.06 + breathe*0.5; }
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.14 + Math.sin(t*0.3)*0.04; boneHeadMr.rotation.y = Math.sin(t*0.22)*0.05; }

      // Right arm stirs in circle
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.60; boneRUpperArmMr.rotation.x = 0.55; boneRUpperArmMr.rotation.y = 0.06; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.32 + Math.sin(stir)*0.14; boneRLowerArmMr.rotation.x = 0.40 + Math.cos(stir)*0.10; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.10 + Math.sin(stir*0.8)*0.08; boneRHandMr.rotation.y = Math.cos(stir)*0.10; }

      // Left arm rests by side
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.88; boneLUpperArmMr.rotation.x = 0.08; }
      if (boneLLowerArmMr) boneLLowerArmMr.rotation.z =  0.50;
      if (boneLHandMr)     boneLHandMr.rotation.z =  0.22;

      setExpressionMr('neutral');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── CHOPPING ───────────────────────────────────────────────
    case 'chopping': {
      const chop = Math.abs(Math.sin(t * 3.5));
      const breathe = Math.sin(t * 0.5) * 0.010;

      if (boneSpineMr) { boneSpineMr.rotation.x = 0.14 + breathe; }
      if (boneChestMr) { boneChestMr.rotation.x = 0.08 + breathe*0.5; }
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.18 + Math.sin(t*0.25)*0.04; }

      // Right arm chops
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.55; boneRUpperArmMr.rotation.x = 0.45 + chop*0.08; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.30; boneRLowerArmMr.rotation.x = chop*0.35; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.12; boneRHandMr.rotation.x = 0.08; }

      // Left arm steadies
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.48; boneLUpperArmMr.rotation.x = 0.60; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.22; boneLLowerArmMr.rotation.x = 0.30; }
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.14; boneLHandMr.rotation.x = 0.12; }

      setExpressionMr('neutral');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── TASTING ────────────────────────────────────────────────
    case 'tasting': {
      const tasteCycle = t % 6;
      const breathe = Math.sin(t * 0.5) * 0.010;

      if (boneSpineMr) { boneSpineMr.rotation.x = 0.08 + breathe; }
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.10 + Math.sin(t*0.3)*0.03; }

      if (tasteCycle < 1.2) {
        // Raise spoon
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.50; boneRUpperArmMr.rotation.x = 0.75; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.28; boneRLowerArmMr.rotation.x = 0.40; }
        if (boneRHandMr)     { boneRHandMr.rotation.z = -0.12; }
      } else if (tasteCycle < 2.5) {
        // At mouth
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.40; boneRUpperArmMr.rotation.x = 0.90; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.20; boneRLowerArmMr.rotation.x = 0.50; }
        setExpressionMr('happy');
      } else if (tasteCycle < 4) {
        // Lower
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.60; boneRUpperArmMr.rotation.x = 0.45; }
        setExpressionMr('happy');
      } else {
        // Rest
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.88; boneRUpperArmMr.rotation.x = 0.10; }
        setExpressionMr('neutral');
      }

      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.88; boneLUpperArmMr.rotation.x = 0.10; }
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── BED LIE ────────────────────────────────────────────────
    case 'bedLie': {
      const breathe = Math.sin(t * 0.45) * 0.018;

      if (boneHipsMr)      { boneHipsMr.rotation.x = -Math.PI * 0.5 + 0.08; boneHipsMr.rotation.z = Math.sin(t*0.25)*0.04; }
      if (boneSpineMr)     { boneSpineMr.rotation.x = breathe; }
      if (boneChestMr)     { boneChestMr.rotation.x = breathe*0.6; }
      if (boneHeadMr)      { boneHeadMr.rotation.x = Math.sin(t*0.28)*0.05; boneHeadMr.rotation.z = Math.sin(t*0.35)*0.04; }

      if (boneLUpperLegMr) { boneLUpperLegMr.rotation.x = Math.PI*0.5 - 0.12; boneLUpperLegMr.rotation.z = -0.10; }
      if (boneRUpperLegMr) { boneRUpperLegMr.rotation.x = Math.PI*0.5 - 0.10; boneRUpperLegMr.rotation.z =  0.08; }
      if (boneLLowerLegMr) boneLLowerLegMr.rotation.x = -0.08;
      if (boneRLowerLegMr) boneRLowerLegMr.rotation.x = -0.06;

      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.80; boneLUpperArmMr.rotation.x = 0.10; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.70; boneRUpperArmMr.rotation.x = 0.10; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.45; boneLLowerArmMr.rotation.x = 0.08; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.35; boneRLowerArmMr.rotation.x = 0.08; }

      setExpressionMr('neutral');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── BED LIE PHONE ──────────────────────────────────────────
    case 'bedLiePhone': {
      const breathe = Math.sin(t * 0.45) * 0.016;
      const scroll = Math.sin(t * 1.8) * 0.05;

      if (boneHipsMr)      { boneHipsMr.rotation.x = -Math.PI*0.5 + 0.08; boneHipsMr.rotation.z = Math.sin(t*0.25)*0.04; }
      if (boneSpineMr)     { boneSpineMr.rotation.x = breathe; }
      if (boneChestMr)     { boneChestMr.rotation.x = breathe*0.6; }
      if (boneHeadMr)      { boneHeadMr.rotation.x = -0.18 + Math.sin(t*0.28)*0.04; }

      if (boneLUpperLegMr) { boneLUpperLegMr.rotation.x = Math.PI*0.5 - 0.12; boneLUpperLegMr.rotation.z = -0.10; }
      if (boneRUpperLegMr) { boneRUpperLegMr.rotation.x = Math.PI*0.5 - 0.10; boneRUpperLegMr.rotation.z =  0.08; }
      if (boneLLowerLegMr) boneLLowerLegMr.rotation.x = -0.08;
      if (boneRLowerLegMr) boneRLowerLegMr.rotation.x = -0.06;

      // Right arm holds phone above face
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.40; boneRUpperArmMr.rotation.x = -0.50; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.22; boneRLowerArmMr.rotation.x = -0.30; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.10; boneRHandMr.rotation.y = scroll; }

      // Left arm rests
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.80; boneLUpperArmMr.rotation.x = 0.10; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.45; boneLLowerArmMr.rotation.x = 0.08; }

      const smileCycle = t % 9;
      if (smileCycle > 7) setExpressionMr('happy');
      else setExpressionMr('neutral');

      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      break;
    }

    // ── CABINET OPEN ───────────────────────────────────────────
    case 'cabinetOpen': {
      const phase = t % 10;
      const breathe = Math.sin(t * 0.5) * 0.010;

      if (boneSpineMr) { boneSpineMr.rotation.x = 0.10 + breathe; }
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.14 + Math.sin(t*0.3)*0.04; boneHeadMr.rotation.y = Math.sin(t*0.2)*0.06; }

      if (phase < 2) {
        // Reach for handle
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.50; boneRUpperArmMr.rotation.x = 0.50; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.28; boneRLowerArmMr.rotation.x = 0.40; }
        if (boneRHandMr)     { boneRHandMr.rotation.z = -0.12; }
        setExpressionMr('neutral');
      } else if (phase < 5) {
        // Pull open + browse
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.62; boneRUpperArmMr.rotation.x = 0.35; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.35; boneRLowerArmMr.rotation.x = 0.22; }
        if (boneHeadMr)      boneHeadMr.rotation.y = 0.15;
        setExpressionMr('neutral');
      } else if (phase < 8) {
        // Look inside — both hands browse
        if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.45; boneLUpperArmMr.rotation.x = 0.55; }
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.45; boneRUpperArmMr.rotation.x = 0.55; }
        if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.20; boneLLowerArmMr.rotation.x = 0.30; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.20; boneRLowerArmMr.rotation.x = 0.30; }
        if (boneHeadMr)      { boneHeadMr.rotation.x = 0.22; boneHeadMr.rotation.y = Math.sin(t*0.5)*0.10; }
        setExpressionMr('happy');
      } else {
        // Close
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.88; boneRUpperArmMr.rotation.x = 0.10; }
        if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.88; boneLUpperArmMr.rotation.x = 0.10; }
        setExpressionMr('neutral');
      }

      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── WASHING UP ─────────────────────────────────────────────
    case 'washingUp': {
      const washL = Math.sin(t * 3.0) * 0.14;
      const washR = Math.sin(t * 3.0 + Math.PI) * 0.14;
      const breathe = Math.sin(t * 0.5) * 0.010;

      if (boneSpineMr) { boneSpineMr.rotation.x = 0.12 + breathe; }
      if (boneChestMr) { boneChestMr.rotation.x = 0.08 + breathe*0.5; }
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.16 + Math.sin(t*0.25)*0.04; boneHeadMr.rotation.y = Math.sin(t*0.2)*0.05; }

      // Both arms reach forward/down into sink
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.40; boneLUpperArmMr.rotation.x = 0.65; }
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.40; boneRUpperArmMr.rotation.x = 0.65; }
      if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.18 + washL; boneLLowerArmMr.rotation.x = 0.30; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.18 + washR; boneRLowerArmMr.rotation.x = 0.30; }
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.14; boneLHandMr.rotation.y =  washL*0.6; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.14; boneRHandMr.rotation.y =  washR*0.6; }

      setExpressionMr('neutral');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── EAT AT TABLE ───────────────────────────────────────────
    case 'eatAtTable': {
      const eatCycle = t % 5;
      const breathe = Math.sin(t * 0.5) * 0.010;

      // Seated
      if (boneHipsMr)      { boneHipsMr.rotation.x = 1.20; boneHipsMr.rotation.z = Math.sin(t*0.3)*0.03; }
      if (boneSpineMr)     { boneSpineMr.rotation.x = -0.10 + breathe; }
      if (boneChestMr)     { boneChestMr.rotation.x = -0.06 + breathe*0.5; }
      if (boneHeadMr)      { boneHeadMr.rotation.x = 0.12 + Math.sin(t*0.25)*0.03; boneHeadMr.rotation.y = Math.sin(t*0.2)*0.04; }
      if (boneLUpperLegMr) { boneLUpperLegMr.rotation.x = -1.50; boneLUpperLegMr.rotation.z = -0.12; }
      if (boneRUpperLegMr) { boneRUpperLegMr.rotation.x = -1.50; boneRUpperLegMr.rotation.z =  0.10; }
      if (boneLLowerLegMr) boneLLowerLegMr.rotation.x = 1.42;
      if (boneRLowerLegMr) boneRLowerLegMr.rotation.x = 1.42;

      if (eatCycle < 1.0) {
        // Fork to mouth
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.44; boneRUpperArmMr.rotation.x = 0.88; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.22; boneRLowerArmMr.rotation.x = 0.45; }
        if (boneRHandMr)     { boneRHandMr.rotation.z = -0.10; }
        setExpressionMr('neutral');
      } else if (eatCycle < 2.2) {
        // At mouth — chew expression
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.38; boneRUpperArmMr.rotation.x = 0.95; }
        setExpressionMr('happy');
      } else if (eatCycle < 3.5) {
        // Lower fork back
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.55; boneRUpperArmMr.rotation.x = 0.55; }
        setExpressionMr('neutral');
      } else {
        // Rest both hands on table
        if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.48; boneLUpperArmMr.rotation.x = 0.55; }
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.48; boneRUpperArmMr.rotation.x = 0.55; }
        if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  0.20; boneLLowerArmMr.rotation.x = 0.28; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.20; boneRLowerArmMr.rotation.x = 0.28; }
        setExpressionMr('neutral');
      }

      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── DRINK COFFEE ───────────────────────────────────────────
    case 'drinkCoffee': {
      const drinkCycle = t % 6;
      const breathe = Math.sin(t * 0.5) * 0.010;

      if (boneSpineMr) { boneSpineMr.rotation.x = breathe; }
      if (boneHeadMr)  { boneHeadMr.rotation.x = 0.04 + Math.sin(t*0.28)*0.03; }

      if (drinkCycle < 1.5) {
        // Raise cup
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.50; boneRUpperArmMr.rotation.x = 0.70; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.25; boneRLowerArmMr.rotation.x = 0.38; }
        if (boneRHandMr)     { boneRHandMr.rotation.z = -0.10; }
      } else if (drinkCycle < 2.8) {
        // Sip tilt
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.42; boneRUpperArmMr.rotation.x = 0.85; }
        if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.18; boneRLowerArmMr.rotation.x = 0.50; }
        if (boneHeadMr)      boneHeadMr.rotation.x += 0.08;
        setExpressionMr('happy');
      } else if (drinkCycle < 4.0) {
        // Lower cup
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.60; boneRUpperArmMr.rotation.x = 0.45; }
        setExpressionMr('neutral');
      } else {
        // Pause at side
        if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.88; boneRUpperArmMr.rotation.x = 0.10; }
        if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.88; boneLUpperArmMr.rotation.x = 0.08; }
        setExpressionMr('neutral');
      }

      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.88; boneLUpperArmMr.rotation.x = 0.08; }
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

    // ── COOK DANCE ─────────────────────────────────────────────
    case 'cookDance': {
      const stir  = t * 2.8;
      const groove = Math.sin(t * 5.5);
      const bob    = Math.abs(Math.sin(t * 5.5)) * 0.05;

      if (boneHipsMr)      { boneHipsMr.rotation.z = groove*0.18; boneHipsMr.rotation.y = groove*0.10; boneHipsMr.rotation.x = bob*0.5; }
      if (boneSpineMr)     { boneSpineMr.rotation.z = -groove*0.10; boneSpineMr.rotation.x = bob*0.9; boneSpineMr.rotation.y = groove*0.04; }
      if (boneChestMr)     { boneChestMr.rotation.z = groove*0.07; boneChestMr.rotation.x = bob*0.5; }

      // Right arm stirs
      if (boneRUpperArmMr) { boneRUpperArmMr.rotation.z = -0.60; boneRUpperArmMr.rotation.x = 0.50; boneRUpperArmMr.rotation.y = 0.08; }
      if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -0.35 + Math.sin(stir)*0.14; boneRLowerArmMr.rotation.x = 0.42 + Math.cos(stir)*0.10; }
      if (boneRHandMr)     { boneRHandMr.rotation.z = -0.12 + Math.sin(stir*0.8)*0.08; boneRHandMr.rotation.y = Math.cos(stir)*0.12; }

      // Left arm swings with groove
      if (boneLUpperArmMr) { boneLUpperArmMr.rotation.z =  0.7 + Math.sin(t*5.5+1.5)*0.25; boneLUpperArmMr.rotation.x = 0.18 + bob*0.4; }
      if (boneLLowerArmMr) boneLLowerArmMr.rotation.z =  0.5 + Math.sin(t*5.5+0.8)*0.18;
      if (boneLHandMr)     { boneLHandMr.rotation.z =  0.22+Math.sin(t*8)*0.16; boneLHandMr.rotation.x = 0.08; boneLHandMr.rotation.y = Math.sin(t*5)*0.08; }

      if (boneLUpperLegMr) { boneLUpperLegMr.rotation.z = groove*0.07; boneLUpperLegMr.rotation.x = bob*0.25; }
      if (boneRUpperLegMr) { boneRUpperLegMr.rotation.z = -groove*0.07; boneRUpperLegMr.rotation.x = bob*0.25; }
      if (boneLFootMr)     boneLFootMr.rotation.x = -0.04 + Math.max(0, groove)*0.10;
      if (boneRFootMr)     boneRFootMr.rotation.x = -0.04 + Math.max(0, -groove)*0.10;

      if (boneHeadMr) { boneHeadMr.rotation.z = Math.sin(t*2.75)*0.06; boneHeadMr.rotation.y = groove*0.06; boneHeadMr.rotation.x = 0.04 + bob*0.3; }

      setExpressionMr('happy');
      if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
      if (setRightFingerRelaxMr) setRightFingerRelaxMr();
      break;
    }

  } // end switch ACTIVITY_MR
}

// ── Lora lip sync ────────────────────────────────────────────────
let _mrLipActive  = false;
let _mrLipRafId   = null;
export let _isSpeakingMr = false;

export function stopLipSyncMr() {
  _mrLipActive = false;
  cancelAnimationFrame(_mrLipRafId);
  ['A','I','U','E','O'].forEach(s => setBSMr(s, 0));
  if (boneJawMr) boneJawMr.rotation.x = 0;
}

export function runLipSyncMr(text) {
  return new Promise((resolve) => {
    stopLipSyncMr();
    _mrLipActive  = true;
    _isSpeakingMr = true;
    const startTime = Date.now();
    const words     = text.split(' ');
    const msPerWord = (text.length * 62) / Math.max(words.length, 1);
    const totalMs   = words.length * msPerWord;
    const VOWELS    = new Set(['a','e','i','o','u']);
    function tick() {
      if (!_mrLipActive) { _isSpeakingMr = false; return; }
      _mrLipRafId = requestAnimationFrame(tick);
      const elapsed = Date.now() - startTime;
      if (elapsed >= totalMs) {
        stopLipSyncMr(); setExpressionMr('neutral');
        _isSpeakingMr = false; resolve(); return;
      }
      const wordIndex = Math.floor(elapsed / msPerWord);
      const word      = (words[wordIndex] || '').toLowerCase();
      const charPos   = Math.floor((elapsed % msPerWord) / msPerWord * word.length);
      const char      = word[charPos] || '';
      const isVowel   = VOWELS.has(char);
      const rhythm    = Math.abs(Math.sin(elapsed*0.018))*0.4+0.3;
      const base      = char === '' ? 0 : rhythm + (isVowel ? 0.5 : 0);
      const openness  = Math.min(1, base);
      const spread    = isVowel && (char==='i'||char==='e') ? 0.6 : 0.1;
      const round     = isVowel && (char==='o'||char==='u') ? 0.5 : 0.1;
      setBSMr('A', openness*0.9); setBSMr('O', openness*round);
      setBSMr('I', openness*spread); setBSMr('E', openness*spread*0.7);
      setBSMr('U', openness*round*0.6);
      if (boneJawMr) boneJawMr.rotation.x = openness * 0.22;
    }
    tick();
  });
}

// ── Mr blink ─────────────────────────────────────────────────────
export function doBlinkMr() {
  setBSMr('blink', 1);
  setTimeout(() => setBSMr('blink', 0), 120);
}

// ================================================================
//  LORA WALK ANIMATION
//  Called each frame from engine-scene._updateLoraWalk()
//  while _loraWalking is true.
//  Mirrors the 8-phase gait applied to Miss in engine-life.js.
// ================================================================
let _loraWalkPhase = 0;

export function loraWalkUpdate(delta) {
  _loraWalkPhase += delta * 2.2 * Math.PI * 2;
  const p = _loraWalkPhase;

  // ── Legs ──────────────────────────────────────────────────────
  const leftLegFwd  =  Math.sin(p);
  const rightLegFwd = -Math.sin(p);
  const leftKnee    = Math.max(0, -Math.sin(p + 0.4)) * 0.58;
  const rightKnee   = Math.max(0,  Math.sin(p + 0.4)) * 0.58;
  const leftFoot    =  Math.sin(p) * 0.22;
  const rightFoot   = -Math.sin(p) * 0.22;
  const leftHeel    = Math.max(0,  Math.sin(p)) * 0.18;
  const rightHeel   = Math.max(0, -Math.sin(p)) * 0.18;

  if (boneLUpperLegMr) { boneLUpperLegMr.rotation.x =  leftLegFwd * 0.44;  boneLUpperLegMr.rotation.z = -0.04; }
  if (boneRUpperLegMr) { boneRUpperLegMr.rotation.x =  rightLegFwd * 0.44; boneRUpperLegMr.rotation.z =  0.04; }
  if (boneLLowerLegMr) boneLLowerLegMr.rotation.x =  leftKnee  + 0.03;
  if (boneRLowerLegMr) boneRLowerLegMr.rotation.x =  rightKnee + 0.03;
  if (boneLFootMr)     { boneLFootMr.rotation.x = -0.04 + leftFoot  + leftHeel  * 0.4; boneLFootMr.rotation.z = -0.03; }
  if (boneRFootMr)     { boneRFootMr.rotation.x = -0.04 + rightFoot + rightHeel * 0.4; boneRFootMr.rotation.z =  0.04; }
  if (boneLToesMr)     boneLToesMr.rotation.x =  0.07 + leftHeel  * 0.25;
  if (boneRToesMr)     boneRToesMr.rotation.x =  0.07 + rightHeel * 0.25;

  // ── Hips — lateral sway + tilt + twist ────────────────────────
  const hipSway  = Math.sin(p) * 0.12;
  const hipTilt  = Math.cos(p) * 0.055;
  const hipTwist = Math.sin(p) * 0.06;

  if (boneHipsMr) {
    boneHipsMr.rotation.z = hipSway;
    boneHipsMr.rotation.x = hipTilt;
    boneHipsMr.rotation.y = hipTwist;
  }

  // ── Spine + chest — counter-rotate ────────────────────────────
  if (boneSpineMr) {
    boneSpineMr.rotation.z = -hipSway * 0.55;
    boneSpineMr.rotation.x =  0.02 + Math.abs(Math.cos(p)) * 0.012;
    boneSpineMr.rotation.y = -hipTwist * 0.6;
  }
  if (boneChestMr) {
    boneChestMr.rotation.z = -hipSway * 0.28;
    boneChestMr.rotation.y = -hipTwist * 0.8;
  }

  // ── Head — forward, slight natural bob ────────────────────────
  if (boneHeadMr) {
    boneHeadMr.rotation.x =  0.03 + Math.abs(Math.sin(p)) * 0.015;
    boneHeadMr.rotation.z =  Math.sin(p) * 0.015;
    boneHeadMr.rotation.y =  Math.sin(p) * 0.03;
  }

  // ── Arms — oppose legs, natural elbow flex ────────────────────
  const elbowFlex = 0.38 + Math.abs(Math.sin(p)) * 0.08;

  if (boneLUpperArmMr) {
    boneLUpperArmMr.rotation.x =  rightLegFwd * 0.30;
    boneLUpperArmMr.rotation.z =  0.78;
    boneLUpperArmMr.rotation.y =  0.03;
  }
  if (boneRUpperArmMr) {
    boneRUpperArmMr.rotation.x =  leftLegFwd * 0.30;
    boneRUpperArmMr.rotation.z = -0.78;
    boneRUpperArmMr.rotation.y = -0.03;
  }
  if (boneLLowerArmMr) { boneLLowerArmMr.rotation.z =  elbowFlex; boneLLowerArmMr.rotation.x =  0.02; }
  if (boneRLowerArmMr) { boneRLowerArmMr.rotation.z = -elbowFlex; boneRLowerArmMr.rotation.x =  0.02; }
  if (boneLHandMr) { boneLHandMr.rotation.z =  0.12; boneLHandMr.rotation.x = 0.04; }
  if (boneRHandMr) { boneRHandMr.rotation.z = -0.12; boneRHandMr.rotation.x = 0.04; }
  if (setLeftFingerRelaxMr)  setLeftFingerRelaxMr();
  if (setRightFingerRelaxMr) setRightFingerRelaxMr();
}

export function resetLoraWalkPhase() { _loraWalkPhase = 0; }
