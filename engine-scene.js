// ================================================================
//  engine-scene.js  — DUAL AVATAR (Miss OG Tinz + Lora)
//  Two best friends, different outfits, facing each other.
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
export let vrmMr            = null;   // kept as vrmMr internally for bone compat
export let VRM_MR_BASE_ROT_Y = 0;
export function getVrmMr()   { return vrmMr; }
export function getVrmLora() { return vrmMr; }   // named alias
export function _setVrmMr(v) { vrmMr = v; }

// Expose getVrmLora as a global so engine-life.js render loop can call it
// without a static import (avoids circular dependency)
window.getVrmLora = () => vrmMr;

// ── Spawn positions — facing each other ──────────────────────────
export const MISS_SPAWN_X =  1.1;
export const MISS_SPAWN_Z = -0.6;
export const LORA_SPAWN_X = -1.1;
export const LORA_SPAWN_Z = -0.6;
export const MISS_FACE_Y  =  Math.PI * 0.55;   // Miss faces left toward Lora
export const LORA_FACE_Y  = -Math.PI * 0.55;   // Lora faces right toward Miss

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

// ── Wardrobe loader ──────────────────────────────────────────────
const _wLoader = new GLTFLoader();

// Miss OG Tinz outfit — pink/black streetwear glam
const MISS_OUTFIT = [
  'wardrope/female_mini_skirt.glb',
  'wardrope/female_crop_hoodie.glb',
  'wardrope/female_platform_sneakers.glb',
  'wardrope/female_gold_hoops.glb',
  'wardrope/female_layered_necklace.glb',
  'wardrope/unisex_gold_bracelet.glb',
];

// Lora outfit — edgy/biker different vibe
const LORA_OUTFIT = [
  'wardrope/female_biker_set.glb',
  'wardrope/female_thigh_boots.glb',
  'wardrope/female_bucket_hat.glb',
  'wardrope/female_butterfly_clip.glb',
  'wardrope/unisex_crossbody_bag.glb',
];

// Bone names to attach each outfit piece to (by filename keyword)
const ATTACH_MAP = {
  skirt:      'hips',
  hoodie:     'chest',      crop:      'chest',
  jacket:     'chest',      biker:     'chest',
  sneakers:   'leftFoot',   boots:     'leftFoot',
  hoops:      'head',       hat:       'head',       clip: 'head',
  necklace:   'chest',      chain:     'chest',
  bracelet:   'leftHand',
  bag:        'hips',
  rings:      'rightHand',
};

function _getBoneForItem(filename) {
  const f = filename.toLowerCase();
  for (const [key, bone] of Object.entries(ATTACH_MAP)) {
    if (f.includes(key)) return bone;
  }
  return 'hips';
}

function _attachOutfitToVRM(vrmObj, glbPath) {
  if (!vrmObj) return;
  _wLoader.load(glbPath, (gltf) => {
    const item    = gltf.scene;
    const boneName = _getBoneForItem(glbPath);
    const bone    = vrmObj.humanoid?.getNormalizedBoneNode(boneName);

    if (bone) {
      // Scale outfit to match avatar scale
      const sc = vrmObj.scene.scale.x;
      item.scale.setScalar(sc * 0.01);  // GLBs are often in cm; adjust if needed
      bone.add(item);
      console.log(`[Wardrobe] attached ${glbPath} → ${boneName}`);
    } else {
      // Fallback: add to scene at avatar position
      item.scale.setScalar(vrmObj.scene.scale.x * 0.01);
      item.position.copy(vrmObj.scene.position);
      scene.add(item);
      console.warn(`[Wardrobe] bone "${boneName}" not found for ${glbPath}, placed in scene`);
    }
  },
  undefined,
  (err) => console.warn(`[Wardrobe] failed to load ${glbPath}:`, err)
  );
}

function _loadOutfit(vrmObj, outfitList) {
  for (const path of outfitList) {
    _attachOutfitToVRM(vrmObj, path);
  }
}

// ── Miss OG Tinz skin colours ────────────────────────────────────
const MISS_COLOURS = {
  Julie_Figure: 0x7B3F00,
  Brow:         0x1a0a00,
  Teargum:      0x7B3F00,
  Ear_Jewel:    0xFFD700,
  Eye_R:        0x3b2314,
  Eyes_L:       0x3b2314,
  Lashes:       0x050505,
  Teeth:        0xfffaf0,
  Hair_Block:   0x0d0d0d,
  Top:          0xff69b4,   // hot pink
  Bottom:       0xff1493,   // deep pink
  Shoe_R:       0x222222,
  Shoe_L:       0x222222,
  Necklece:     0xFFD700,
};

// ── Lora skin colours — lighter skin, purple/white vibe ──────────
const LORA_COLOURS = {
  Julie_Figure: 0xc68642,   // lighter brown skin
  Brow:         0x2a1500,
  Teargum:      0xc68642,
  Ear_Jewel:    0xC0C0C0,   // silver
  Eye_R:        0x1a2a3a,   // dark blue-brown eyes
  Eyes_L:       0x1a2a3a,
  Lashes:       0x080808,
  Teeth:        0xfff9f0,
  Hair_Block:   0x3d1a00,   // dark auburn hair
  Top:          0x7c3aed,   // purple
  Bottom:       0x1a1a1a,   // black
  Shoe_R:       0xf5f5f5,   // white
  Shoe_L:       0xf5f5f5,
  Necklece:     0xC0C0C0,   // silver
};

function applyVRMColours(vrmObj, colourMap, isLora = false) {
  vrmObj.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    const name = obj.name;

    const isMetallic = /jewel|chain|ring|necklec/i.test(name);
    const isSkin     = /figure|body|head|skin|teargum/i.test(name);
    const isEye      = /eye/i.test(name);
    const isLash     = /lash/i.test(name);
    const isTooth    = /teeth|tooth/i.test(name);

    if (isEye) {
      const eyeCanvas  = document.createElement('canvas');
      eyeCanvas.width  = 128; eyeCanvas.height = 128;
      const ctx = eyeCanvas.getContext('2d');
      ctx.fillStyle = '#f5f0e8'; ctx.fillRect(0,0,128,128);
      const grad = ctx.createRadialGradient(64,64,4, 64,64,38);
      if (isLora) {
        grad.addColorStop(0,'#050a12'); grad.addColorStop(0.4,'#0e1f35');
        grad.addColorStop(0.8,'#1a3050'); grad.addColorStop(1,'#0a1525');
      } else {
        grad.addColorStop(0,'#1a0a00'); grad.addColorStop(0.4,'#3b1f0a');
        grad.addColorStop(0.8,'#5c3010'); grad.addColorStop(1,'#2a1205');
      }
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(64,64,38,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#020203'; ctx.beginPath(); ctx.arc(64,64,18,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(74,52,8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(54,72,4,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#0d0500'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(64,64,38,0,Math.PI*2); ctx.stroke();
      const eyeTex = new THREE.CanvasTexture(eyeCanvas);
      obj.material = new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.05, metalness: 0.0, side: THREE.FrontSide });
    } else if (isLash) {
      obj.material = new THREE.MeshStandardMaterial({ color: 0x050202, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    } else if (isTooth) {
      obj.material = new THREE.MeshStandardMaterial({ color: 0xfff8f0, roughness: 0.4, metalness: 0, side: THREE.FrontSide });
    } else {
      let hexColour = colourMap[name];
      if (hexColour === undefined) {
        for (const [key, val] of Object.entries(colourMap)) {
          if (name.toLowerCase().includes(key.toLowerCase())) { hexColour = val; break; }
        }
      }
      if (hexColour === undefined) {
        hexColour = isLora ? 0xc68642 : 0xb5743a;
        console.log(`[VRM${isLora?'Lora':'Miss'}] unmatched mesh: "${name}" — default applied`);
      }
      obj.material = new THREE.MeshStandardMaterial({
        color:             hexColour,
        roughness:         isSkin ? 0.65 : isMetallic ? 0.18 : 0.72,
        metalness:         isMetallic ? 0.88 : 0.0,
        emissive:          isSkin ? new THREE.Color(hexColour) : new THREE.Color(0x000000),
        emissiveIntensity: isSkin ? 0.12 : 0.0,
        side:              THREE.FrontSide,
        depthWrite:        true,
      });
    }
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
  }
  if (vrm || vrmMr) {
    requestAnimationFrame(() => { _placeVRMOnFloor(); _snapCameraToVRM(); });
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
  // Load Miss outfit after a short delay (VRM needs to settle)
  setTimeout(() => _loadOutfit(vrm, MISS_OUTFIT), 1000);
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
  // Load Lora outfit
  setTimeout(() => _loadOutfit(vrmMr, LORA_OUTFIT), 1000);
  _loraLoaded = true;
  _onBothLoaded();
},
(p) => setProgress(Math.min(50 + (p.loaded/(p.total||1))*38, 88)),
(err) => { console.error(err); setStatus('Failed to load Lora VRM', 'error'); }
);
