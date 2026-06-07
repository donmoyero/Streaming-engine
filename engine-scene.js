// ================================================================
//  engine-scene.js
//  Three.js scene setup, lighting, House GLB loader, VRM loader.
//  Exports: scene, camera, renderer, vrm (set after load),
//           _houseFloorY, _houseSpawnX/Z, HOUSE_BOUNDS,
//           _placeVRMOnFloor, _snapCameraToVRM (imported from engine-camera)
// ================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

import { cacheBones, setRestPose, ACTIVITY } from './engine-bones.js';
import { _snapCameraToVRM, setCamFacingY } from './engine-camera.js';
import {
  startTopicPolling, _initDeadAir, initTwitchChat,
  setProgress, setStatus, loader_el,
  HOUSE, ROOM_WAYPOINT_DEFS,
  setTargetFacing,
  vrmPos, showBubble,
} from './engine-life.js';

// ── Config ─────────────────────────────────────────────────────
export const VRM_PATH       = 'MissOgTinz_Master.vrm';
export const API_URL        = 'https://impactgrid-dijo.onrender.com/chat/message';
export const PROACTIVE_URL  = 'https://impactgrid-dijo.onrender.com/chat/proactive';
export const TOPIC_URL      = 'https://impactgrid-dijo.onrender.com/chat/topic/current';
export const USER_ID        = 'stream-viewer-' + Math.random().toString(36).slice(2,8);
export const TTS_URL        = 'https://impactgrid-dijo.onrender.com/tts';
export const TWITCH_CHANNEL = 'Miss_ogtinz';

// ── Elements ────────────────────────────────────────────────────
export const canvas     = document.getElementById('canvas');
export const loader_el2 = document.getElementById('loader');  // re-exported via engine-life
export const bar_fill   = document.getElementById('bar-fill');
export const status_el  = document.getElementById('status');
export const bubble     = document.getElementById('chat-bubble');
export const bubbleTxt  = document.getElementById('bubble-text');
export const chatInput  = document.getElementById('chat-input');
export const sendBtn    = document.getElementById('send-btn');
export const stageLight = document.getElementById('stage-light');

// ── Three.js renderer & camera ──────────────────────────────────
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x080510, 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const scene  = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 999999);
camera.position.set(0, 1.50, 2.6);
camera.lookAt(0, 1.10, 0);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ── Lighting ─────────────────────────────────────────────────────
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

// ── RGB neon point lights ────────────────────────────────────────
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

// Mesh refs used by animation
export let monitorMesh      = null;
export let monitorGlowLight = null;
export let keyboardMesh     = null;
export let chairMesh        = null;
export const roomLights     = {};

// ── House spawn / bounds ─────────────────────────────────────────
export let _houseLoaded = false;
export let _houseSpawnX = -2.7;
export let _houseSpawnZ = -3.8;
export let _houseFloorY = 0;

export const HOUSE_BOUNDS  = { minX: -6.0, maxX: 6.0, minZ: -6.5, maxZ: 6.5 };
export const AVATAR_RADIUS = 0.25;

// ── VRM ref (populated after load) ──────────────────────────────
// Use getVrm() in other modules — a plain `import { vrm }` captures the
// initial null and never sees the update, because ES module live-bindings
// only work when the exporting module writes its own variable.
export let vrm            = null;
export let VRM_BASE_ROT_Y = Math.PI;
export function getVrm()   { return vrm; }
export function _setVrm(v) { vrm = v; }

// ── Place VRM on house floor via raycast ─────────────────────────
export function _placeVRMOnFloor() {
  const vrm = getVrm();
  if (!vrm) return;
  vrmPos.x = _houseSpawnX;
  vrmPos.z = _houseSpawnZ;

  const offsets = [[0,0],[0.25,0],[-0.25,0],[0,0.25],[0,-0.25],[0.15,0.15],[-0.15,0.15]];
  const floorCandidates = [];
  for (const [ox, oz] of offsets) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(_houseSpawnX + ox, 50, _houseSpawnZ + oz),
      new THREE.Vector3(0, -1, 0),
      0, 100
    );
    const hits = ray.intersectObjects(scene.children, true)
      .filter(h => h.object.isMesh && h.object !== vrm?.scene)
      .sort((a, b) => b.point.y - a.point.y);
    if (hits.length > 0) {
      const y = hits[0].point.y;
      if (y > -0.5 && y < 5) floorCandidates.push(y);
    }
  }

  if (floorCandidates.length > 0) {
    floorCandidates.sort((a, b) => a - b);
    let bestClusterY = floorCandidates[0], bestCount = 1, curCount = 1;
    for (let i = 1; i < floorCandidates.length; i++) {
      if (floorCandidates[i] - floorCandidates[i - 1] < 0.15) {
        curCount++;
        if (curCount > bestCount) { bestCount = curCount; bestClusterY = floorCandidates[i]; }
      } else {
        curCount = 1;
      }
    }
    _houseFloorY = bestClusterY;
    console.log(`[VRM] Floor cluster Y=${_houseFloorY.toFixed(4)} (${bestCount}/${floorCandidates.length} rays agreed)`);
  }

  // Keep the box-detected floor as fallback — never fall to 0 unless house says so
  if (_houseFloorY < -1 || isNaN(_houseFloorY)) {
    _houseFloorY = 0;
    console.warn('[VRM] Raycast gave no good floor — defaulting to Y=0');
  } else if (floorCandidates.length === 0) {
    console.warn(`[VRM] No raycast hits — using box floor Y=${_houseFloorY.toFixed(4)}`);
  }

  const feetOffset    = vrm._feetOffset ?? 0;
  const safeFeetOffset = feetOffset < 0.05 ? 0.82 : feetOffset;
  const finalY        = _houseFloorY + safeFeetOffset;

  vrm.scene.position.set(_houseSpawnX, finalY, _houseSpawnZ);
  vrm._restPosY          = finalY;
  vrm.scene.rotation.y   = Math.PI;
  vrmPos.x = _houseSpawnX;
  vrmPos.z = _houseSpawnZ;
  setTargetFacing(Math.PI);
  setCamFacingY(Math.PI);
  console.log(`[VRM] floor=${_houseFloorY.toFixed(4)} feetOffset=${safeFeetOffset.toFixed(4)} finalY=${finalY.toFixed(4)}`);
}

// ── House GLB loader ─────────────────────────────────────────────
const _gltfLoader = new GLTFLoader();

_gltfLoader.load(
  'House.glb',
  (gltf) => {
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

    // Tighter bounds — keep avatar well away from wall geometry
    HOUSE_BOUNDS.minX = -5.195 * hScale * 0.72;
    HOUSE_BOUNDS.maxX =  5.203 * hScale * 0.72;
    HOUSE_BOUNDS.minZ = -5.460 * hScale * 0.72;
    HOUSE_BOUNDS.maxZ =  5.540 * hScale * 0.72;

    console.log(`[House] hScale=${hScale.toFixed(3)} floorY=${_houseFloorY.toFixed(4)}`);
    house.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    _houseLoaded = true;

    if (!window._houseScaled) {
      window._houseScaled = true;
      for (const roomDef of Object.values(HOUSE)) {
        if (!roomDef.spots) continue;
        for (const spot of roomDef.spots) {
          spot.x *= hScale;
          spot.z *= hScale;
          // Clamp each spot inside the walkable bounds with extra margin
          const margin = AVATAR_RADIUS + 0.3;
          spot.x = Math.max(HOUSE_BOUNDS.minX + margin, Math.min(HOUSE_BOUNDS.maxX - margin, spot.x));
          spot.z = Math.max(HOUSE_BOUNDS.minZ + margin, Math.min(HOUSE_BOUNDS.maxZ - margin, spot.z));
        }
        if (roomDef.origin) { roomDef.origin.x *= hScale; roomDef.origin.z *= hScale; }
      }
      for (const wp of Object.values(ROOM_WAYPOINT_DEFS)) { wp.x *= hScale; wp.z *= hScale; }
      _houseSpawnX *= hScale;
      _houseSpawnZ *= hScale;
      // Clamp spawn inside bounds too
      const spawnMargin = AVATAR_RADIUS + 0.5;
      _houseSpawnX = Math.max(HOUSE_BOUNDS.minX + spawnMargin, Math.min(HOUSE_BOUNDS.maxX - spawnMargin, _houseSpawnX));
      _houseSpawnZ = Math.max(HOUSE_BOUNDS.minZ + spawnMargin, Math.min(HOUSE_BOUNDS.maxZ - spawnMargin, _houseSpawnZ));
      console.log(`[House] Spot coords scaled by hScale=${hScale.toFixed(3)}, spawn=(${_houseSpawnX.toFixed(2)},${_houseSpawnZ.toFixed(2)})`);
    }

    if (vrm) {
      requestAnimationFrame(() => {
        _placeVRMOnFloor();
        _snapCameraToVRM();
      });
    }
    console.log(`[House] loaded ✓  scale=${hScale.toFixed(3)}`);
  },
  (xhr) => setProgress(Math.round(xhr.loaded / xhr.total * 100)),
  (err) => console.warn('[House] GLB load failed:', err)
);

// ── VRM loader ───────────────────────────────────────────────────
const gltfLoader = new GLTFLoader();
gltfLoader.register(parser => new VRMLoaderPlugin(parser));

setProgress(10);
setStatus('Loading Miss OG Tinz...');

gltfLoader.load(
  VRM_PATH,
  (gltf) => {
    setProgress(80);
    vrm = gltf.userData.vrm;
    VRMUtils.removeUnnecessaryJoints(gltf.scene);

    // ── Skin / mesh colours ──────────────────────────────────────
    const SKIN_HEX    = 0x7B3F00;
    const MESH_COLOURS = {
      Julie_Figure: SKIN_HEX,
      Brow:         0x1a0a00,
      Teargum:      SKIN_HEX,
      Ear_Jewel:    0xFFD700,
      Eye_R:        0x3b2314,
      Eyes_L:       0x3b2314,
      Lashes:       0x050505,
      Teeth:        0xfffaf0,
      Hair_Block:   0x0d0d0d,
      Top:          0xff69b4,
      Bottom:       0xff1493,
      Shoe_R:       0x222222,
      Shoe_L:       0x222222,
      Necklece:     0xFFD700,
    };

    vrm.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      const name       = obj.name;
      const isMetallic = name.includes('Jewel') || name.includes('Necklece');
      const isSkin     = name === 'Julie_Figure' || name === 'Teargum';
      const isEye      = name === 'Eye_R' || name === 'Eyes_L';
      const isLash     = name === 'Lashes';
      const isTooth    = name === 'Teeth';

      if (isEye) {
        const eyeCanvas  = document.createElement('canvas');
        eyeCanvas.width  = 128; eyeCanvas.height = 128;
        const ctx = eyeCanvas.getContext('2d');
        ctx.fillStyle = '#f5f0e8'; ctx.fillRect(0,0,128,128);
        const grad = ctx.createRadialGradient(64,64,4, 64,64,38);
        grad.addColorStop(0,'#1a0a00'); grad.addColorStop(0.4,'#3b1f0a');
        grad.addColorStop(0.8,'#5c3010'); grad.addColorStop(1,'#2a1205');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(64,64,38,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#050202'; ctx.beginPath(); ctx.arc(64,64,18,0,Math.PI*2); ctx.fill();
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
        const hexColour = MESH_COLOURS[name] ?? 0xb5743a;
        obj.material = new THREE.MeshStandardMaterial({
          color:             hexColour,
          roughness:         isSkin ? 0.65 : isMetallic ? 0.18 : 0.72,
          metalness:         isMetallic ? 0.88 : 0.0,
          emissive:          isSkin ? new THREE.Color(0x7B3F00) : new THREE.Color(0x000000),
          emissiveIntensity: isSkin ? 0.15 : 0.0,
          side:              THREE.FrontSide,
          depthWrite:        true,
        });
      }
    });

    VRMUtils.rotateVRM0(vrm);
    vrm.scene.scale.set(1,1,1);
    vrm.scene.position.set(0,0,0);
    VRM_BASE_ROT_Y = vrm.scene.rotation.y;
    scene.add(vrm.scene);

    // Scale to target height 1.65m
    vrm.scene.updateMatrixWorld(true);
    const boxRaw    = new THREE.Box3().setFromObject(vrm.scene);
    const sizeRaw   = boxRaw.getSize(new THREE.Vector3());
    const centerRaw = boxRaw.getCenter(new THREE.Vector3());
    const scaleVal  = 1.65 / sizeRaw.y;
    vrm.scene.scale.set(scaleVal, scaleVal, scaleVal);
    vrm.scene.position.set(-centerRaw.x * scaleVal, 0, -centerRaw.z * scaleVal);

    const scaleSlider = document.getElementById('scale');
    const scaleValEl  = document.getElementById('scale-val');
    if (scaleSlider) scaleSlider.value = scaleVal;
    if (scaleValEl)  scaleValEl.textContent = scaleVal.toFixed(2);

    cacheBones();
    setRestPose();

    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    const boxPosed     = new THREE.Box3().setFromObject(vrm.scene);
    const feetToOrigin = Math.max(0, -boxPosed.min.y);
    vrm._feetOffset    = feetToOrigin;
    vrm.scene.position.y = feetToOrigin;
    console.log('[VRM] feetOffset after pose:', feetToOrigin.toFixed(4));

    if (_houseLoaded) {
      requestAnimationFrame(() => _placeVRMOnFloor());
    } else {
      vrmPos.x = 0; vrmPos.z = 0;
      vrm.scene.position.set(0, feetToOrigin, 0);
      vrm._restPosY        = feetToOrigin;
      vrm.scene.rotation.y = Math.PI;
    }

    // Activity system starts after a short idle
    ACTIVITY.current  = 'idle';
    ACTIVITY.timer    = 0;
    ACTIVITY.duration = 3;

    setProgress(100);
    setTimeout(() => {
      loader_el.classList.add('hidden');
      setStatus('Ready ✦', 'ready');
      showBubble("Heyyy! Welcome to the stream! What's good?", "Miss OG Tinz");
      startTopicPolling();
      _initDeadAir();
      initTwitchChat();
    }, 400);
  },
  (progress) => setProgress(Math.min(10 + (progress.loaded / (progress.total || 1)) * 65, 75)),
  (error) => {
    console.error(error);
    setStatus('Failed to load VRM — check file path', 'error');
    loader_el.querySelector('.sub').textContent = 'Error loading avatar. Check console.';
  }
);
