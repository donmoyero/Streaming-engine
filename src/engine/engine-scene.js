// ================================================================
//  engine-scene.js  — PODCAST DESK (Miss OG Tinz + Lora)
//  Two hosts, seated at a desk, facing the camera. No house, no
//  walking, no dog, no kitchen. Replaces the old House.glb rig.
// ================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

import { cacheBones, cacheBonesMr, setRestPose, setRestPoseMr, ACTIVITY, ACTIVITY_MR } from './engine-bones.js';

// engine-life.js imports renderer/scene/camera/etc. FROM this file, so a
// static import back here would create a circular import. Loaded once,
// dynamically, inside startEngine() after this module's own exports exist.
let _life = null;

// ── Config ──────────────────────────────────────────────────────
export const VRM_PATH       = '/MissOgTinz_Master.vrm';
export const VRM_LORA_PATH  = '/Lora_Master.vrm';
export const API_URL        = 'https://impactgrid-dijo.onrender.com/chat/message';
export const PROACTIVE_URL  = 'https://impactgrid-dijo.onrender.com/chat/proactive';
export const TOPIC_URL      = 'https://impactgrid-dijo.onrender.com/chat/topic/current';
export const USER_ID        = 'stream-viewer-' + Math.random().toString(36).slice(2,8);
export const TTS_URL        = 'https://impactgrid-dijo.onrender.com/tts';
export const TWITCH_CHANNEL = 'Miss_ogtinz';

// ── Elements — resolved lazily at init time ──────────────────────
export let canvas     = null;
export let loader_el2 = null;
export let bar_fill   = null;
export let status_el  = null;
export let bubble     = null;
export let bubbleTxt  = null;
export let chatInput  = null;
export let sendBtn    = null;
export let stageLight = null;

// ── Light refs — populated inside initScene() ────────────────────
export let ambient   = null;
export let neonPink   = null;
export let neonBlue   = null;
export let neonPurple = null;
export let floorGlow  = null;

// ── Three.js renderer & camera — created inside initScene() ─────
export let renderer = null;
export let scene    = null;
export let camera   = null;

export function initScene() {
  canvas     = document.getElementById('canvas');
  loader_el2 = document.getElementById('loader');
  bar_fill   = document.getElementById('bar-fill');
  status_el  = document.getElementById('status');
  bubble     = document.getElementById('chat-bubble');
  bubbleTxt  = document.getElementById('bubble-text');
  chatInput  = document.getElementById('chat-input');
  sendBtn    = document.getElementById('send-btn');
  stageLight = document.getElementById('stage-light');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x0c0a12, 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 999999);
  // Fixed two-shot: far enough back to frame both hosts at the desk.
  camera.position.set(0, 1.5, 3.35);
  camera.lookAt(0, 1.25, 0);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ── Lighting ──────────────────────────────────────────────────
  ambient = new THREE.AmbientLight(0xffffff, 2.5);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xfff5e0, 3.2);
  keyLight.position.set(1.5, 3, 2.5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffe0b0, 1.3);
  fillLight.position.set(-2, 1.5, 1.5);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffb830, 0.6);
  rimLight.position.set(0, 2.2, -2);
  scene.add(rimLight);

  neonPink   = new THREE.PointLight(0xff2d78, 1.4, 10);
  neonBlue   = new THREE.PointLight(0x00aaff, 1.2, 10);
  neonPurple = new THREE.PointLight(0x9b30ff, 1.0, 8);
  floorGlow  = new THREE.PointLight(0xff6a00, 0.35, 5);
  neonPink.position.set(-3, 2.2, -2.2);   scene.add(neonPink);
  neonBlue.position.set(3, 2.2, -2.2);    scene.add(neonBlue);
  neonPurple.position.set(0, 3.0, -3.2);  scene.add(neonPurple);
  floorGlow.position.set(0, 0.4, -0.6);   scene.add(floorGlow);

  _buildDeskSet();
} // ── end initScene() ──────────────────────────────────────────

// Mesh refs (kept for engine-bones.js compatibility)
export let monitorMesh      = null;
export let monitorGlowLight = null;
export let keyboardMesh     = null;
export let chairMesh        = null;

// ── Podcast desk set — desk, two chairs, monitor+PC, picture frame ──
// Everything is placed directly, no GLB. Kept deliberately simple —
// most of it sits below frame / behind the hosts anyway.
function _buildDeskSet() {
  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ color: 0x14101c, roughness: 0.85, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Back wall
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 6),
    new THREE.MeshStandardMaterial({ color: 0x1b1626, roughness: 0.9 })
  );
  wall.position.set(0, 3, -2.4);
  scene.add(wall);

  // Desk — wide enough for both hosts, low enough to not block faces
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 0.4, metalness: 0.2 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.9), deskMat);
  desk.position.set(0, 0.78, -0.55);
  scene.add(desk);
  const deskLegGeo = new THREE.BoxGeometry(0.06, 0.78, 0.06);
  [[-1.2,-0.9],[1.2,-0.9],[-1.2,-0.2],[1.2,-0.2]].forEach(([x,z]) => {
    const leg = new THREE.Mesh(deskLegGeo, deskMat);
    leg.position.set(x, 0.39, z);
    scene.add(leg);
  });

  // Podcast mic — single mic on a small desk stand, centered, close to
  // the hosts (mics sit near the front edge, not pushed back like a
  // monitor would be).
  const micGroup = new THREE.Group();
  const micStandBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.3 })
  );
  micStandBase.position.set(0, 0.79, -0.38);
  micGroup.add(micStandBase);

  const micArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.34, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.6 })
  );
  micArm.position.set(0, 0.96, -0.38);
  micGroup.add(micArm);

  const micHead = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.035, 0.09, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.35, metalness: 0.7 })
  );
  micHead.rotation.z = Math.PI / 2.4;
  micHead.position.set(0, 1.15, -0.36);
  micGroup.add(micHead);

  const micWindscreen = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 })
  );
  micWindscreen.position.set(0, 1.19, -0.34);
  micGroup.add(micWindscreen);

  scene.add(micGroup);
  monitorMesh = micHead; // kept for engine-bones.js compatibility (unused ref)

  // Picture frame on the back wall
  const frameGroup = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.6, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.6 })
  );
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.48),
    new THREE.MeshStandardMaterial({ color: 0x3a2a55, roughness: 0.8 })
  );
  art.position.z = 0.025;
  frameGroup.add(frame, art);
  frameGroup.position.set(-2.6, 2.9, -2.38);
  scene.add(frameGroup);

  // Two simple chairs (mostly hidden by seated hosts, kept minimal)
  chairMesh = _buildChair(-0.62, 0);
  _buildChair(0.62, 0);
}

function _buildChair(x, z) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.6 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), mat);
  seat.position.set(0, 0.44, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.06), mat);
  back.position.set(0, 0.7, -0.2);
  const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.44, 8);
  const post = new THREE.Mesh(postGeo, mat);
  post.position.set(0, 0.22, 0);
  group.add(seat, back, post);
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

export let vrm            = null;
export let VRM_BASE_ROT_Y = Math.PI;
export function getVrm()   { return vrm; }
export function _setVrm(v) { vrm = v; }

// ── Lora VRM ─────────────────────────────────────────────────────
export let vrmMr             = null;
export let VRM_MR_BASE_ROT_Y = Math.PI;
export function getVrmMr()   { return vrmMr; }
export function getVrmLora() { return vrmMr; }
export function _setVrmMr(v) { vrmMr = v; }
window.getVrmLora = () => vrmMr;

// ── Seat positions — both hosts facing the camera (+Z), either side
// of the desk. yOffset (-0.39) matches the sofaSit bone pose's hip
// bend so the seated pose lines up with the chair's seat height —
// same value the original house rig used for its sofa/chair spots.
export const MISS_SEAT_X = -0.62, MISS_SEAT_Z = 0.15;
export const LORA_SEAT_X =  0.62, LORA_SEAT_Z = 0.15;
export const SEAT_FACE_Y = Math.PI;    // facing +Z toward camera — this VRM's
                                        // forward lands on -Z after rotateVRM0,
                                        // so a 180° yaw is needed to face front.
const SEAT_Y_OFFSET      = -0.39;

export function _placeVRMOnFloor() {
  _placeOneVRM(vrm,   MISS_SEAT_X, MISS_SEAT_Z, SEAT_FACE_Y);
  _placeOneVRM(vrmMr, LORA_SEAT_X, LORA_SEAT_Z, SEAT_FACE_Y);
}

function _placeOneVRM(v, spawnX, spawnZ, faceY) {
  if (!v) return;
  const safeFeet = (v._feetOffset ?? 0) < 0.05 ? 0.82 : v._feetOffset;
  const finalY   = safeFeet + SEAT_Y_OFFSET;
  v.scene.position.set(spawnX, finalY, spawnZ);
  v._restPosY        = finalY;
  v.scene.rotation.y = faceY;
}

// ── Miss OG Tinz colour map (unchanged from the house build) ─────
const MISS_COLOURS = {
  Julie_Figure: { hex: 0x7B3F00, isSkin: true              },
  Brow:         { hex: 0x1a0a00, isSkin: false             },
  Teargum:      { hex: 0x7B3F00, isSkin: true              },
  Ear_Jewel:    { hex: 0xFFD700, isSkin: false, metallic: true },
  Lashes:       { hex: 0x050505, isSkin: false             },
  Teeth:        { hex: 0xfffaf0, isSkin: false             },
  Hair_Block:   { hex: 0x0d0d0d, isSkin: false             },
  Top:          { hex: 0xff69b4, isSkin: false             },
  Bottom:       { hex: 0xff1493, isSkin: false             },
  Shoe_R:       { hex: 0x111111, isSkin: false             },
  Shoe_L:       { hex: 0x111111, isSkin: false             },
  Necklece:     { hex: 0xFFD700, isSkin: false, metallic: true },
};

// ── Lora colour map (unchanged) ───────────────────────────────────
const LORA_COLOURS = {
  Mr_OgTinz_Figure: { hex: 0xc68642, isSkin: true              },
  Brow:             { hex: 0x2a1500, isSkin: false             },
  Teargum:          { hex: 0xc68642, isSkin: true              },
  Ear_Jewel:        { hex: 0xC0C0C0, isSkin: false, metallic: true },
  Lashes:           { hex: 0x080808, isSkin: false             },
  Teeth:            { hex: 0xfff9f0, isSkin: false             },
  Hair_Block:       { hex: 0x3d1a00, isSkin: false             },
  Top:              { hex: 0x7c3aed, isSkin: false             },
  Bottom:           { hex: 0x1a1a1a, isSkin: false             },
  Shoe_R:           { hex: 0xf5f5f5, isSkin: false             },
  Shoe_L:           { hex: 0xf5f5f5, isSkin: false             },
  Necklece:         { hex: 0xC0C0C0, isSkin: false, metallic: true },
};

function applyVRMColours(vrmObj, colourMap, isLora = false) {
  vrmObj.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    const name    = obj.name;
    const isEye   = name === 'Eye_R'  || name === 'Eyes_L';
    const isLash  = name === 'Lashes';
    const isTooth = name === 'Teeth';

    if (isEye) {
      const eyeCanvas = document.createElement('canvas');
      eyeCanvas.width = eyeCanvas.height = 128;
      const ctx  = eyeCanvas.getContext('2d');
      ctx.fillStyle = '#f5f0e8'; ctx.fillRect(0, 0, 128, 128);
      const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 38);
      if (isLora) {
        grad.addColorStop(0, '#050a12'); grad.addColorStop(0.4, '#0e1f35');
        grad.addColorStop(0.8, '#1a3050'); grad.addColorStop(1, '#0a1525');
      } else {
        grad.addColorStop(0, '#1a0a00'); grad.addColorStop(0.4, '#3b1f0a');
        grad.addColorStop(0.8, '#5c3010'); grad.addColorStop(1, '#2a1205');
      }
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(64, 64, 38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#020203'; ctx.beginPath(); ctx.arc(64, 64, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(74, 52, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';  ctx.beginPath(); ctx.arc(54, 72, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0d0500'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(64, 64, 38, 0, Math.PI * 2); ctx.stroke();
      const eyeTex = new THREE.CanvasTexture(eyeCanvas);
      eyeTex.colorSpace = THREE.SRGBColorSpace;
      obj.material = new THREE.MeshStandardMaterial({
        map: eyeTex, roughness: 0.05, metalness: 0.0,
        envMapIntensity: 0, side: THREE.FrontSide,
      });
      return;
    }

    if (isLash) {
      obj.material = new THREE.MeshStandardMaterial({
        color: 0x050202, roughness: 0.9, metalness: 0,
        envMapIntensity: 0, side: THREE.DoubleSide,
      });
      return;
    }

    if (isTooth) {
      obj.material = new THREE.MeshStandardMaterial({
        color: 0xfff8f0, roughness: 0.4, metalness: 0,
        envMapIntensity: 0, side: THREE.FrontSide,
      });
      return;
    }

    const entry      = colourMap[name];
    const hex        = entry ? entry.hex              : 0x999999;
    const isSkin     = entry ? entry.isSkin === true  : false;
    const isMetallic = entry ? entry.metallic === true : false;

    obj.material = new THREE.MeshStandardMaterial({
      color:             hex,
      roughness:         isMetallic ? 0.15 : isSkin ? 0.6 : 0.72,
      metalness:         isMetallic ? 0.85 : 0.0,
      emissive:          new THREE.Color(isSkin ? hex : 0x000000),
      emissiveIntensity: isSkin ? 0.12 : 0.0,
      envMapIntensity:   0,
      side:              THREE.FrontSide,
      depthWrite:        true,
    });
  });
}

// ── VRM finalise (scale + seat) ───────────────────────────────────
function _finaliseVRM(v, spawnX, spawnZ, faceY, targetHeight = 1.65) {
  VRMUtils.rotateVRM0(v);
  v.scene.scale.set(1,1,1);
  v.scene.position.set(0,0,0);
  scene.add(v.scene);

  v.scene.updateMatrixWorld(true);
  const boxRaw    = new THREE.Box3().setFromObject(v.scene);
  const sizeRaw   = boxRaw.getSize(new THREE.Vector3());
  const centerRaw = boxRaw.getCenter(new THREE.Vector3());
  const scaleVal  = targetHeight / sizeRaw.y;
  v.scene.scale.set(scaleVal, scaleVal, scaleVal);
  v.scene.position.set(-centerRaw.x * scaleVal, 0, -centerRaw.z * scaleVal);

  v.update(0);
  v.scene.updateMatrixWorld(true);
  const boxPosed   = new THREE.Box3().setFromObject(v.scene);
  const feetOffset = Math.max(0, -boxPosed.min.y);
  v._feetOffset    = feetOffset;

  const finalY   = feetOffset + SEAT_Y_OFFSET;
  v.scene.position.set(spawnX, finalY, spawnZ);
  v._restPosY        = finalY;
  v.scene.rotation.y = faceY;
  console.log(`[VRM] seated at (${spawnX},${finalY.toFixed(3)},${spawnZ}) faceY=${faceY.toFixed(3)}`);
}

// ── Load state ───────────────────────────────────────────────────
let _missLoaded = false;
let _loraLoaded = false;

function _onBothLoaded() {
  if (!_missLoaded || !_loraLoaded) return;
  _life.setProgress(100);
  setTimeout(() => {
    _life.loader_el.classList.add('hidden');
    _life.setStatus('Ready ✦', 'ready');
    _life.showBubble("Heyyy! Welcome to the stream!!", "Miss OG Tinz");
    setTimeout(() => _life.speak("Heyyy welcome to the stream!!", 'happy'), 600);
    _life.initUI();
    _life.startTopicPolling();
    _life._initDeadAir();
    _life.initTwitchChat();
    import('./engine-bff.js').then(m => m.startCoupleEngine());
  }, 400);
}

// ── startEngine() — called from AvatarStage.tsx useEffect ────────
export async function startEngine() {
  _life = await import('./engine-life.js');

  // ── Load Miss OG Tinz ────────────────────────────────────────────
  const gltfLoader = new GLTFLoader();
  gltfLoader.register(parser => new VRMLoaderPlugin(parser));
  _life.setProgress(10);
  _life.setStatus('Loading Miss OG Tinz...');

  gltfLoader.load(VRM_PATH, (gltf) => {
    _life.setProgress(50);
    vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryJoints(gltf.scene);
    applyVRMColours(vrm, MISS_COLOURS, false);
    _finaliseVRM(vrm, MISS_SEAT_X, MISS_SEAT_Z, SEAT_FACE_Y);
    cacheBones();
    setRestPose();
    ACTIVITY.current = 'sofaSit'; ACTIVITY.timer = 0; ACTIVITY.duration = 3;
    _missLoaded = true;
    _life.setStatus('Loading Lora...');
    _onBothLoaded();
  },
  (p) => _life.setProgress(Math.min(10 + (p.loaded/(p.total||1))*40, 50)),
  (err) => { console.error(err); _life.setStatus('Failed to load Miss VRM', 'error'); }
  );

  // ── Load Lora ────────────────────────────────────────────────────
  const gltfLoaderLora = new GLTFLoader();
  gltfLoaderLora.register(parser => new VRMLoaderPlugin(parser));

  gltfLoaderLora.load(VRM_LORA_PATH, (gltf) => {
    _life.setProgress(90);
    vrmMr = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryJoints(gltf.scene);
    applyVRMColours(vrmMr, LORA_COLOURS, true);
    _finaliseVRM(vrmMr, LORA_SEAT_X, LORA_SEAT_Z, SEAT_FACE_Y);
    cacheBonesMr();
    setRestPoseMr();
    ACTIVITY_MR.current = 'sofaSit'; ACTIVITY_MR.timer = 0; ACTIVITY_MR.duration = 3;
    _loraLoaded = true;
    _onBothLoaded();
  },
  (p) => _life.setProgress(Math.min(50 + (p.loaded/(p.total||1))*40, 90)),
  (err) => { console.error(err); _life.setStatus('Failed to load Lora VRM', 'error'); }
  );

  _life.startRenderLoop();
} // ── end startEngine() ────────────────────────────────────────
