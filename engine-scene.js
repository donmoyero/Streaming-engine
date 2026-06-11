// ================================================================
//  engine-scene.js  — DUAL AVATAR (Miss OG Tinz + Lora)
//  Two best friends, different outfits, facing each other.
//
//  FIXES in this version:
//  1. VRM_MR_BASE_ROT_Y = Math.PI  (Lora was facing backwards)
//  2. LORA_FACE_Y corrected to Math.PI * 0.45
//  3. _updateLoraWalk facing uses Math.atan2(dx,dz) + Math.PI
//  4. _LORA_ROOMS corrected to actual house furniture positions
// ================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

import { cacheBones, cacheBonesMr, setRestPose, setRestPoseMr, ACTIVITY } from './engine-bones.js';
import { _snapCameraToVRM, setCamFacingY } from './engine-camera.js';
import {
  startTopicPolling, _initDeadAir, initTwitchChat,
  setProgress, setStatus, loader_el,
  HOUSE, ROOM_WAYPOINT_DEFS,
  setTargetFacing,
  vrmPos, showBubble, speak,
} from './engine-life.js';

// ── Config ──────────────────────────────────────────────────────
export const VRM_PATH       = 'MissOgTinz_Master.vrm';
export const VRM_LORA_PATH  = 'Lora_Master.vrm';
export const API_URL        = 'https://impactgrid-dijo.onrender.com/chat/message';
export const PROACTIVE_URL  = 'https://impactgrid-dijo.onrender.com/chat/proactive';
export const TOPIC_URL      = 'https://impactgrid-dijo.onrender.com/chat/topic/current';
export const USER_ID        = 'stream-viewer-' + Math.random().toString(36).slice(2,8);
export const TTS_URL        = 'https://impactgrid-dijo.onrender.com/tts';
export const TWITCH_CHANNEL = 'Miss_ogtinz';

// ── Elements ────────────────────────────────────────────────────
export const canvas     = document.getElementById('canvas');
export const loader_el2 = document.getElementById('loader');
export const bar_fill   = document.getElementById('bar-fill');
export const status_el  = document.getElementById('status');
export const bubble     = document.getElementById('chat-bubble');
export const bubbleTxt  = document.getElementById('bubble-text');
export const chatInput  = document.getElementById('chat-input');
export const sendBtn    = document.getElementById('send-btn');
export const stageLight = document.getElementById('stage-light');

// ── Three.js renderer & camera ───────────────────────────────────
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x080510, 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const scene  = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 999999);
camera.position.set(0, 1.55, 3.8);
camera.lookAt(0, 1.15, 0);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ── Lighting ────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 2.5);
scene.add(ambient);
export { ambient };

const keyLight = new THREE.DirectionalLight(0xfff5e0, 3.5);
keyLight.position.set(1.5, 3, 2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffe0b0, 1.4);
fillLight.position.set(-2, 1, 1);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffb830, 0.5);
rimLight.position.set(0, 2, -3);
scene.add(rimLight);

export const neonPink   = new THREE.PointLight(0xff2d78, 1.8, 12);
neonPink.position.set(-4, 2.5, -3);
scene.add(neonPink);

export const neonBlue   = new THREE.PointLight(0x00aaff, 1.5, 12);
neonBlue.position.set(4, 2.5, -3);
scene.add(neonBlue);

export const neonPurple = new THREE.PointLight(0x9b30ff, 1.2, 10);
neonPurple.position.set(0, 3.5, -5);
scene.add(neonPurple);

export const floorGlow  = new THREE.PointLight(0xff6a00, 0.4, 6);
floorGlow.position.set(0, 0.5, -1);
scene.add(floorGlow);

// Mesh refs
export let monitorMesh      = null;
export let monitorGlowLight = null;
export let keyboardMesh     = null;
export let chairMesh        = null;
export let roofMesh         = null;
export const roomLights     = {};

// ── House bounds ─────────────────────────────────────────────────
export let _houseLoaded = false;
export let _houseSpawnX = -2.7;
export let _houseSpawnZ = -3.8;
export let _houseFloorY = 0;
export const HOUSE_BOUNDS  = { minX: -6.0, maxX: 6.0, minZ: -6.5, maxZ: 6.5 };
export const AVATAR_RADIUS = 0.25;

// ── Miss OG Tinz VRM ref ─────────────────────────────────────────
export let vrm            = null;
export let VRM_BASE_ROT_Y = Math.PI;
export function getVrm()   { return vrm; }
export function _setVrm(v) { vrm = v; }

// ── Lora VRM ref ─────────────────────────────────────────────────
export let vrmMr             = null;
// FIX: was 0 — Lora's model forward is +Z same as Miss, so needs Math.PI
export let VRM_MR_BASE_ROT_Y = Math.PI;
export function getVrmMr()   { return vrmMr; }
export function getVrmLora() { return vrmMr; }
export function _setVrmMr(v) { vrmMr = v; }

window.getVrmLora = () => vrmMr;

// ── Spawn positions ──────────────────────────────────────────────
export let MISS_SPAWN_X = -2.2;
export let MISS_SPAWN_Z = -3.2;
export let LORA_SPAWN_X = -3.2;
export let LORA_SPAWN_Z = -3.2;
export const MISS_FACE_Y  =  Math.PI * 0.55;   // Miss faces left toward Lora
// FIX: was -Math.PI * 0.55 — now offset by Math.PI to match corrected base rotation
export const LORA_FACE_Y  =  Math.PI * 0.45;   // Lora faces right toward Miss

// ── Raycast floor helper ─────────────────────────────────────────
function _rayFloor(spawnX, spawnZ) {
  const offsets = [[0,0],[0.2,0],[-0.2,0],[0,0.2],[0,-0.2]];
  const candidates = [];
  for (const [ox, oz] of offsets) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(spawnX + ox, 50, spawnZ + oz),
      new THREE.Vector3(0, -1, 0), 0, 100
    );
    const hits = ray.intersectObjects(scene.children, true)
      .filter(h => h.object.isMesh)
      .sort((a, b) => b.point.y - a.point.y);
    if (hits.length > 0) {
      const y = hits[0].point.y;
      if (y > -0.5 && y < 5) candidates.push(y);
    }
  }
  if (!candidates.length) return _houseFloorY;
  candidates.sort((a, b) => a - b);
  return candidates[Math.floor(candidates.length / 2)];
}

export function _placeVRMOnFloor() {
  _placeOneVRM(vrm,   MISS_SPAWN_X, MISS_SPAWN_Z, MISS_FACE_Y);
  _placeOneVRM(vrmMr, LORA_SPAWN_X, LORA_SPAWN_Z, LORA_FACE_Y);
  _snapCameraToVRM();
}

function _placeOneVRM(v, spawnX, spawnZ, faceY) {
  if (!v) return;
  const floorY   = _rayFloor(spawnX, spawnZ);
  const safeFeet = (v._feetOffset ?? 0) < 0.05 ? 0.82 : v._feetOffset;
  const finalY   = floorY + safeFeet;
  v.scene.position.set(spawnX, finalY, spawnZ);
  v._restPosY        = finalY;
  v.scene.rotation.y = faceY;
}

// ── Miss OG Tinz colour map ──────────────────────────────────────
// node name  →  mesh name  (for reference)
// Julie_Figure → Julie_Figuremesh   Brow → Browmesh   Teargum → Teargummesh
// Ear_Jewel → Ear_Jewelmesh   Lashes → Lashesmesh   Teeth → Teethmesh
// Hair_Block → Hair_Blockmesh   Top → Topmesh   Bottom → Bottommesh
// Shoe_R → Shoe_Rmesh   Shoe_L → Shoe_Lmesh   Necklece → Necklecemesh
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

// ── Lora colour map ──────────────────────────────────────────────
// node name  →  mesh name  (for reference)
// Mr_OgTinz_Figure → Figure_mesh   Brow → Browmesh   Teargum → Teargummesh
// Ear_Jewel → Ear_mesh   Lashes → Lashes_mesh   Teeth → Teethmesh
// Hair_Block → Hair_mesh   Top → Shirt_mesh   Bottom → Trousers_mesh
// Shoe_R → Shoe_Rmesh   Shoe_L → Shoe_Lmesh   Necklece → Chain_mesh
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

// ── VRM finalise (scale, floor, rotation) ────────────────────────
function _finaliseVRM(v, spawnX, spawnZ, faceY) {
  VRMUtils.rotateVRM0(v);
  v.scene.scale.set(1,1,1);
  v.scene.position.set(0,0,0);
  scene.add(v.scene);

  v.scene.updateMatrixWorld(true);
  const boxRaw    = new THREE.Box3().setFromObject(v.scene);
  const sizeRaw   = boxRaw.getSize(new THREE.Vector3());
  const centerRaw = boxRaw.getCenter(new THREE.Vector3());
  const scaleVal  = 1.65 / sizeRaw.y;
  v.scene.scale.set(scaleVal, scaleVal, scaleVal);
  v.scene.position.set(-centerRaw.x * scaleVal, 0, -centerRaw.z * scaleVal);

  v.update(0);
  v.scene.updateMatrixWorld(true);
  const boxPosed   = new THREE.Box3().setFromObject(v.scene);
  const feetOffset = Math.max(0, -boxPosed.min.y);
  v._feetOffset    = feetOffset;

  const floorY   = _houseLoaded ? _rayFloor(spawnX, spawnZ) : _houseFloorY;
  const safeFeet = feetOffset < 0.05 ? 0.82 : feetOffset;
  const finalY   = floorY + safeFeet;
  v.scene.position.set(spawnX, finalY, spawnZ);
  v._restPosY        = finalY;
  v.scene.rotation.y = faceY;
  console.log(`[VRM] placed at (${spawnX},${finalY.toFixed(3)},${spawnZ}) faceY=${faceY.toFixed(3)}`);
}

// ── Load state ───────────────────────────────────────────────────
let _missLoaded = false;
let _loraLoaded = false;

function _onBothLoaded() {
  if (!_missLoaded || !_loraLoaded) return;
  setProgress(100);
  setTimeout(() => {
    loader_el.classList.add('hidden');
    setStatus('Ready ✦', 'ready');
    showBubble("Heyyy welcome to the stream!! 🎉💕", "Miss OG Tinz");
    setTimeout(() => speak("Heyyy welcome to the stream!!", 'happy'), 600);
    startTopicPolling();
    _initDeadAir();
    initTwitchChat();
    import('./engine-bff.js').then(m => m.startCoupleEngine());
    _initLoraWalk();
  }, 400);
}

// ── House GLB loader ─────────────────────────────────────────────
const _gltfLoader = new GLTFLoader();

_gltfLoader.load('House.glb', (gltf) => {
  const house   = gltf.scene;
  scene.add(house);
  const rawBox  = new THREE.Box3().setFromObject(house);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const hScale  = 16 / Math.max(rawSize.x, rawSize.z);
  house.scale.setScalar(hScale);
  const sBox    = new THREE.Box3().setFromObject(house);
  const sCenter = sBox.getCenter(new THREE.Vector3());
  house.position.set(-sCenter.x, -sBox.min.y, -sCenter.z);
  const finalBox = new THREE.Box3().setFromObject(house);
  _houseFloorY   = finalBox.min.y + (finalBox.max.y - finalBox.min.y) * 0.05;
  if (_houseFloorY < 0 || isNaN(_houseFloorY)) _houseFloorY = 0;
  HOUSE_BOUNDS.minX = -5.195 * hScale * 0.72;
  HOUSE_BOUNDS.maxX =  5.203 * hScale * 0.72;
  HOUSE_BOUNDS.minZ = -5.460 * hScale * 0.72;
  HOUSE_BOUNDS.maxZ =  5.540 * hScale * 0.72;
  house.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  house.traverse(n => {
    if (n.isMesh && /roof|strecha|ceiling|dach|techo|plafond/i.test(n.name)) {
      roofMesh = n;
    }
  });
  _houseLoaded = true;
  if (!window._houseScaled) {
    window._houseScaled = true;

    MISS_SPAWN_X *= hScale;
    MISS_SPAWN_Z *= hScale;
    LORA_SPAWN_X *= hScale;
    LORA_SPAWN_Z *= hScale;
    console.log(`[House] spawns scaled → Miss(${MISS_SPAWN_X.toFixed(2)},${MISS_SPAWN_Z.toFixed(2)}) Lora(${LORA_SPAWN_X.toFixed(2)},${LORA_SPAWN_Z.toFixed(2)})`);

    for (const roomDef of Object.values(HOUSE)) {
      if (!roomDef.spots) continue;
      for (const spot of roomDef.spots) {
        spot.x *= hScale; spot.z *= hScale;
        const m = AVATAR_RADIUS + 0.3;
        spot.x = Math.max(HOUSE_BOUNDS.minX+m, Math.min(HOUSE_BOUNDS.maxX-m, spot.x));
        spot.z = Math.max(HOUSE_BOUNDS.minZ+m, Math.min(HOUSE_BOUNDS.maxZ-m, spot.z));
      }
      if (roomDef.origin) { roomDef.origin.x *= hScale; roomDef.origin.z *= hScale; }
    }
    for (const wp of Object.values(ROOM_WAYPOINT_DEFS)) { wp.x *= hScale; wp.z *= hScale; }
    if (window.ROOM_CONNECTIONS_REF) {
      for (const targets of Object.values(window.ROOM_CONNECTIONS_REF)) {
        for (const wp of Object.values(targets)) { wp.x *= hScale; wp.z *= hScale; }
      }
    }
    if (window.LORA_ROOM_CONNECTIONS_REF) {
      for (const targets of Object.values(window.LORA_ROOM_CONNECTIONS_REF)) {
        for (const wp of Object.values(targets)) { wp.x *= hScale; wp.z *= hScale; }
      }
    }
  }
  if (vrm || vrmMr) {
    requestAnimationFrame(() => {
      if (vrm)   _finaliseVRM(vrm,   MISS_SPAWN_X, MISS_SPAWN_Z, MISS_FACE_Y);
      if (vrmMr) _finaliseVRM(vrmMr, LORA_SPAWN_X, LORA_SPAWN_Z, LORA_FACE_Y);
      _snapCameraToVRM();
    });
  }
  console.log(`[House] loaded ✓  scale=${hScale.toFixed(3)}`);
},
(xhr) => setProgress(Math.round(xhr.loaded / xhr.total * 100)),
(err) => console.warn('[House] GLB load failed:', err)
);

// ── Load Miss OG Tinz ────────────────────────────────────────────
const gltfLoader = new GLTFLoader();
gltfLoader.register(parser => new VRMLoaderPlugin(parser));
setProgress(10);
setStatus('Loading Miss OG Tinz...');

gltfLoader.load(VRM_PATH, (gltf) => {
  setProgress(50);
  vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryJoints(gltf.scene);
  applyVRMColours(vrm, MISS_COLOURS, false);
  _finaliseVRM(vrm, MISS_SPAWN_X, MISS_SPAWN_Z, MISS_FACE_Y);
  cacheBones();
  setRestPose();
  ACTIVITY.current = 'idle'; ACTIVITY.timer = 0; ACTIVITY.duration = 3;
  _missLoaded = true;
  setStatus('Loading Lora...');
  _onBothLoaded();
},
(p) => setProgress(Math.min(10 + (p.loaded/(p.total||1))*35, 45)),
(err) => { console.error(err); setStatus('Failed to load Miss VRM', 'error'); }
);

// ── Load Lora ────────────────────────────────────────────────────
const gltfLoaderLora = new GLTFLoader();
gltfLoaderLora.register(parser => new VRMLoaderPlugin(parser));

gltfLoaderLora.load(VRM_LORA_PATH, (gltf) => {
  setProgress(90);
  vrmMr = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryJoints(gltf.scene);
  applyVRMColours(vrmMr, LORA_COLOURS, true);
  _finaliseVRM(vrmMr, LORA_SPAWN_X, LORA_SPAWN_Z, LORA_FACE_Y);
  cacheBonesMr();
  setRestPoseMr();
  _loraLoaded = true;
  _onBothLoaded();
},
(p) => setProgress(Math.min(50 + (p.loaded/(p.total||1))*38, 88)),
(err) => { console.error(err); setStatus('Failed to load Lora VRM', 'error'); }
);

// ================================================================
//  LORA INLINE WALK SYSTEM
// ================================================================

// FIX: All room coordinates corrected to match actual house furniture positions.
//
// House coordinate reference (unscaled, before hScale multiply):
//   X axis: -6 left (kitchen) ←→ +6 right (bedroom)
//   Z axis: -6 back (TV wall) ←→ +6 front (windows)
//
//   living-room:  sofa [-4.16,-4.42]  coffee table [-3.04,-3.68]  TV [-1.93,-4.46]
//   kitchen:      stove/counter [-4.18, 0.03]  sink [-4.85,-0.93]
//   dining:       tables [-2.29,1.58] [-2.13,3.26]  chairs cluster [-2.5,1.5]
//   hallway:      door junction [0.6,-2.0] — between all rooms
//   bedroom:      closets [2.76,-0.84] [4.36,2.39]  rug [3.21,0.86]
//   bathroom:     right front zone [3.8, 1.5]
//   studio:       spawn area near TV wall [-2.5,-3.5]

const _LORA_ROOMS = [
  { name: 'studio',      x: -2.5, z: -3.5 },  // spawn area, TV wall — ✅ was correct
  { name: 'livingRoom',  x: -3.0, z: -3.8 },  // sofa + coffee table — ✅ was close
  { name: 'kitchen',     x: -4.0, z:  0.3 },  // FIX: was [2.8,-3.5] (bedroom area)
  { name: 'dining',      x: -2.0, z:  2.5 },  // FIX: was missing — tables + chairs
  { name: 'hallway',     x:  0.6, z: -1.8 },  // door junction — ✅ was close
  { name: 'bedroom',     x:  3.5, z: -1.0 },  // FIX: was [-3.0,1.8] (dining area)
  { name: 'bathroom',    x:  3.8, z:  1.5 },  // FIX: was missing — right front zone
];

let _loraRoom    = 0;
let _loraTarget  = null;
let _loraWalking = false;
let _loraMoveT   = 0;
let _loraOrigin  = null;
let _loraIdleT   = 0;
const _LORA_IDLE_MIN = 12;
const _LORA_IDLE_MAX = 28;
const _LORA_WALK_SPD = 0.9;   // m/s

function _loraPickNextRoom() {
  const options = _LORA_ROOMS.filter((_, i) => i !== _loraRoom);
  const next    = options[Math.floor(Math.random() * options.length)];
  _loraRoom = _LORA_ROOMS.indexOf(next);
  return next;
}

function _initLoraWalk() {
  if (!vrmMr) { setTimeout(_initLoraWalk, 500); return; }
  // Derive hScale from the already-scaled LORA_SPAWN_X vs raw -3.2
  const hScale = Math.abs(LORA_SPAWN_X / -3.2);
  if (!window._loraRoomsScaled) {
    window._loraRoomsScaled = true;
    for (const r of _LORA_ROOMS) { r.x *= hScale; r.z *= hScale; }
  }
  _loraIdleT = _LORA_IDLE_MIN + Math.random() * (_LORA_IDLE_MAX - _LORA_IDLE_MIN);
  let _lastT  = performance.now();

  function _loraTick() {
    const now   = performance.now();
    const delta = Math.min((now - _lastT) / 1000, 0.1);
    _lastT      = now;
    _updateLoraWalk(delta);
    requestAnimationFrame(_loraTick);
  }
  requestAnimationFrame(_loraTick);
  console.log('[Lora Walk] inline system started ✓  rooms:', _LORA_ROOMS.map(r => r.name).join(', '));

  // ── Cross-module bridge for engine-life's Lora scheduler ──────
  // engine-life._loraGoToSpot() calls window._loraSetTarget(x, z, onArrival)
  // to hand off movement to this walk system, then gets a callback on arrival.
  let _loraArrivalCb = null;

  window._loraSetTarget = (x, z, onArrival) => {
    _loraTarget   = { x, z };
    _loraWalking  = true;
    _loraArrivalCb = onArrival || null;
  };

  window._loraSetFacing = (facingY) => {
    if (vrmMr) vrmMr.scene.rotation.y = facingY;
  };

  // Patch _updateLoraWalk to fire arrival callback
  const _origUpdate = _updateLoraWalk;
  Object.defineProperty(window, '_loraArrivalCbRef', {
    get: () => _loraArrivalCb,
    set: (v) => { _loraArrivalCb = v; },
    configurable: true,
  });
}

function _updateLoraWalk(dt) {
  if (!vrmMr) return;

  if (_loraWalking && _loraTarget) {
    const pos   = vrmMr.scene.position;
    const dx    = _loraTarget.x - pos.x;
    const dz    = _loraTarget.z - pos.z;
    const dist  = Math.sqrt(dx*dx + dz*dz);
    const step  = _LORA_WALK_SPD * dt;

    if (dist <= step + 0.05) {
      // Arrived
      pos.x         = _loraTarget.x;
      pos.z         = _loraTarget.z;
      _loraWalking  = false;
      _loraTarget   = null;
      _loraIdleT    = _LORA_IDLE_MIN + Math.random() * (_LORA_IDLE_MAX - _LORA_IDLE_MIN);
      // Fire engine-life arrival callback if one was set
      const cb = window._loraArrivalCbRef;
      if (cb) { window._loraArrivalCbRef = null; cb(); }
    } else {
      // FIX: was Math.atan2(dx,dz) — Lora's forward is +PI offset from raw atan2
      vrmMr.scene.rotation.y = Math.atan2(dx, dz) + Math.PI;
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
    }
    return;
  }

  // Idle countdown
  _loraIdleT -= dt;
  if (_loraIdleT <= 0) {
    const room    = _loraPickNextRoom();
    _loraTarget   = { x: room.x, z: room.z };
    _loraOrigin   = { x: vrmMr.scene.position.x, z: vrmMr.scene.position.z };
    _loraMoveT    = 0;
    _loraWalking  = true;
  }
}
