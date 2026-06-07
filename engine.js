import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import DeadAirTimer from './utils/dead-air-timer.js';

// ── Dead air — handled by DeadAirTimer class ────────────────
// Instantiated in _initDeadAir() once the VRM is ready.
// The inline implementation has been removed — DeadAirTimer handles
// 429 backoff, minimum intervals, and tiered error recovery.
let deadAir = null;

// ── Config ─────────────────────────────────────────────
const VRM_PATH      = 'MissOgTinz_Master.vrm';
const API_URL       = 'https://impactgrid-dijo.onrender.com/chat/message';
const PROACTIVE_URL = 'https://impactgrid-dijo.onrender.com/chat/proactive';
const TOPIC_URL     = 'https://impactgrid-dijo.onrender.com/chat/topic/current';
const USER_ID       = 'stream-viewer-' + Math.random().toString(36).slice(2,8);
const TTS_URL       = 'https://impactgrid-dijo.onrender.com/tts';
const TWITCH_CHANNEL = 'Miss_ogtinz';

// ── Vision system ────────────────────────────────────────
// Captures what the camera sees and sends it with chat messages
// so Miss OG Tinz can describe her environment naturally.
// Gemini Flash on the server does the actual image reading —
// it's free (1500 req/day) and we only fire it when useful.

const VISION = {
  // How often we're allowed to send a snapshot (ms) — rate limiting
  COOLDOWN_MS:   12000,  // max once every 12 seconds
  // Only fire vision on these triggers — not every single message
  TRIGGERS:      ['look', 'see', 'around', 'room', 'doing', 'house',
                  'standing', 'wearing', 'outfit', 'where', 'what are you',
                  'show me', 'describe', 'background', 'behind', 'floor',
                  'sitting', 'dancing', 'moving'],
  _lastSentAt:   0,
  _lastRoomSent: null,

  // Returns true if we should attach a snapshot to this message
  shouldCapture(message, roomChanged) {
    const now = Date.now();
    if (now - this._lastSentAt < this.COOLDOWN_MS) return false;
    if (roomChanged) return true;
    const lower = (message || '').toLowerCase();
    return this.TRIGGERS.some(t => lower.includes(t));
  },

  // Grab a JPEG snapshot from the Three.js canvas
  // Renders fresh, scales down to 512px wide to save bandwidth
  capture() {
    try {
      // Force a fresh render so the snapshot is current
      renderer.render(scene, camera);

      // Use an offscreen canvas to resize — 512px wide is enough for Gemini
      const src = canvas;
      const scale = Math.min(1, 512 / src.width);
      const w = Math.round(src.width  * scale);
      const h = Math.round(src.height * scale);

      const off = document.createElement('canvas');
      off.width  = w;
      off.height = h;
      off.getContext('2d').drawImage(src, 0, 0, w, h);

      // Return base64 without the data: prefix (server adds it back)
      return off.toDataURL('image/jpeg', 0.72).split(',')[1];
    } catch (e) {
      console.warn('[Vision] Capture failed:', e.message);
      return null;
    }
  },

  markSent(room) {
    this._lastSentAt   = Date.now();
    this._lastRoomSent = room;
  }
};

// ── Elements ────────────────────────────────────────────
const canvas      = document.getElementById('canvas');
const loader_el   = document.getElementById('loader');
const bar_fill    = document.getElementById('bar-fill');
const status_el   = document.getElementById('status');
const bubble      = document.getElementById('chat-bubble');
const bubbleTxt   = document.getElementById('bubble-text');
const chatInput   = document.getElementById('chat-input');
const sendBtn     = document.getElementById('send-btn');
const stageLight  = document.getElementById('stage-light');

// ── Topic box elements ───────────────────────────────────
const topicBox      = document.getElementById('topic-box');
const topicTitleEl  = document.getElementById('topic-title-text');
const topicSourceEl = document.getElementById('topic-source-tag');
let   lastTopicTitle = null;

function setStatus(msg, cls='') {
  status_el.textContent = msg;
  status_el.className = cls;
}
function setProgress(p) { bar_fill.style.width = p + '%'; }

// ── Stage light control ──────────────────────────────────
function setStageLight(mood, durationMs = 4000) {
  stageLight.className = mood;
  if (mood !== '') {
    setTimeout(() => { stageLight.className = ''; }, durationMs);
  }
}

// ── Three.js Scene ──────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x080510, 1);
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.01, 999999);
camera.position.set(0, 1.50, 2.6);
camera.lookAt(0, 1.10, 0);

// ── Lighting ─────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 2.5);
scene.add(ambient);
const keyLight = new THREE.DirectionalLight(0xfff5e0, 3.5);
keyLight.position.set(1.5, 3, 2);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffe0b0, 1.4);
fillLight.position.set(-2, 1, 1);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffb830, 0.5);
rimLight.position.set(0, 2, -3);
scene.add(rimLight);

// ── RGB neon point lights (game room atmosphere) ─────────
const neonPink   = new THREE.PointLight(0xff2d78, 1.8, 12);
neonPink.position.set(-4, 2.5, -3);
scene.add(neonPink);
const neonBlue   = new THREE.PointLight(0x00aaff, 1.5, 12);
neonBlue.position.set(4, 2.5, -3);
scene.add(neonBlue);
const neonPurple = new THREE.PointLight(0x9b30ff, 1.2, 10);
neonPurple.position.set(0, 3.5, -5);
scene.add(neonPurple);
const floorGlow  = new THREE.PointLight(0xff6a00, 0.4, 6);
floorGlow.position.set(0, 0.5, -1);
scene.add(floorGlow);

// ── Streaming Studio Builder ──────────────────────────────
// Global refs so animation can nudge them (e.g. monitor glow on speak)
let monitorMesh = null;
let monitorGlowLight = null;
let keyboardMesh = null;
let chairMesh = null;

// Old game room removed — house GLB is the environment now
const roomLights = {};

// ================================================================
//  HOUSE GLB — single file replaces all procedural room geometry
// ================================================================
const _gltfLoader = new GLTFLoader();

let _houseLoaded = false;
// Spawn coords — living room centre. Confirmed from GLB mesh analysis.
let _houseSpawnX = -2.7;
let _houseSpawnZ = -3.8;
// _houseFloorY is set dynamically by the house loader below (0.430 × hScale).
// Safe fallback of 0 until house loads.
let _houseFloorY = 0;

// ── House interior wall bounds (world space, set after house loads) ────────────
// Raw GLB: walls X:-5.195→5.203, Z:-5.460→5.540. Multiplied by hScale then centered.
// These are set in the house loader once hScale is known.
const HOUSE_BOUNDS = { minX: -6.0, maxX: 6.0, minZ: -6.5, maxZ: 6.5 };
const AVATAR_RADIUS = 0.25; // capsule radius — NOT mesh half-width

// Raycast downward from above spawn point to find the actual floor surface
function _detectFloorByRaycast(x, z) {
  // stub — floor detection is handled inside _placeVRMOnFloor via raycast grid
}
// Place the VRM standing exactly on the house floor at spawn X/Z
function _placeVRMOnFloor() {
  if (!vrm) return;
  vrmPos.x = _houseSpawnX;
  vrmPos.z = _houseSpawnZ;

  // Fire a dense grid of downward raycasts. For each ray we take the
  // FIRST (highest) hit — that's whatever surface the ray lands on first
  // coming down from above, which is the walkable floor, not sub-floor
  // geometry or foundations beneath it.
  const offsets = [[0,0],[0.25,0],[-0.25,0],[0,0.25],[0,-0.25],[0.15,0.15],[-0.15,0.15]];
  let floorCandidates = [];
  for (const [ox, oz] of offsets) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(_houseSpawnX + ox, 50, _houseSpawnZ + oz),
      new THREE.Vector3(0, -1, 0),
      0, 100
    );
    const hits = ray.intersectObjects(scene.children, true)
      .filter(h => h.object.isMesh && h.object !== vrm?.scene)
      .sort((a, b) => b.point.y - a.point.y); // highest first
    if (hits.length > 0) {
      const y = hits[0].point.y;
      // Accept values that are plausibly a ground floor (not ceiling/roof)
      if (y > -0.5 && y < 5) floorCandidates.push(y);
    }
  }

  if (floorCandidates.length > 0) {
    // Cluster: sort ascending, then find the mode cluster (most rays agree on same level).
    floorCandidates.sort((a, b) => a - b);
    // Group values within 0.15 of each other — the largest group is the real floor.
    let bestClusterY = floorCandidates[0], bestCount = 1, curY = floorCandidates[0], curCount = 1;
    for (let i = 1; i < floorCandidates.length; i++) {
      if (floorCandidates[i] - floorCandidates[i - 1] < 0.15) {
        curCount++;
        if (curCount > bestCount) { bestCount = curCount; bestClusterY = floorCandidates[i]; }
      } else {
        curY = floorCandidates[i]; curCount = 1;
      }
    }
    _houseFloorY = bestClusterY;
    console.log(`[VRM] Floor cluster Y=${_houseFloorY.toFixed(4)} (${bestCount}/${floorCandidates.length} rays agreed)`);
  }

  // Final clamp — must be >= 0
  if (_houseFloorY < 0 || isNaN(_houseFloorY)) {
    _houseFloorY = 0;
    console.warn('[VRM] Raycast gave no good floor — defaulting to Y=0');
  }

  // feetOffset was measured after the rest pose so feet sit exactly at Y=0.
  // Adding it to floorY lifts the origin up so feet land ON the floor surface.
  const feetOffset = vrm._feetOffset ?? 0;
  // Safety: if feetOffset is suspiciously small (< 0.05), the matrix measurement
  // failed. Fall back to half of VRM_TARGET_HEIGHT as a safe estimate.
  const safeFeetOffset = feetOffset < 0.05 ? 0.82 : feetOffset;
  const finalY = _houseFloorY + safeFeetOffset;

  vrm.scene.position.set(_houseSpawnX, finalY, _houseSpawnZ);
  vrm._restPosY = finalY;
  vrm.scene.rotation.y = Math.PI;
  console.log(`[VRM] floor=${_houseFloorY.toFixed(4)} feetOffset=${safeFeetOffset.toFixed(4)} finalY=${finalY.toFixed(4)}`);
}

_gltfLoader.load(
  'House.glb',
  (gltf) => {
    const house = gltf.scene;
    scene.add(house);

    // Measure raw size, scale so longest span = 16 units, center at origin floor=0
    const rawBox  = new THREE.Box3().setFromObject(house);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const hScale  = 16 / Math.max(rawSize.x, rawSize.z);
    house.scale.setScalar(hScale);

    const sBox    = new THREE.Box3().setFromObject(house);
    const sCenter = sBox.getCenter(new THREE.Vector3());
    house.position.set(-sCenter.x, -sBox.min.y, -sCenter.z);

    // ── Compute real world floor Y ────────────────────────────────────────────
    // After house.position.set(-sCenter.x, -sBox.min.y, -sCenter.z) the very
    // bottom of the house bounding box is at world Y=0. The actual walkable
    // floor sits some distance above that bottom (foundations/slab).
    // We use a raycast fired straight down from the spawn point — the highest
    // mesh hit IS the floor. A one-frame delay is needed so Three.js has
    // committed the new world matrices before raycasting.
    const finalBox = new THREE.Box3().setFromObject(house);
    // Rough fallback: midpoint between absolute bottom and 20% of house height
    _houseFloorY = finalBox.min.y + (finalBox.max.y - finalBox.min.y) * 0.05;
    if (_houseFloorY < 0 || isNaN(_houseFloorY)) _houseFloorY = 0;

    // Update wall bounds using actual hScale
    HOUSE_BOUNDS.minX = -5.195 * hScale * 0.92;
    HOUSE_BOUNDS.maxX =  5.203 * hScale * 0.92;
    HOUSE_BOUNDS.minZ = -5.460 * hScale * 0.92;
    HOUSE_BOUNDS.maxZ =  5.540 * hScale * 0.92;

    console.log(`[House] hScale=${hScale.toFixed(3)} floorY=${_houseFloorY.toFixed(4)} bounds X:${HOUSE_BOUNDS.minX.toFixed(2)}→${HOUSE_BOUNDS.maxX.toFixed(2)}`);

    house.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    _houseLoaded = true;

    // Spawn coords confirmed from GLB mesh analysis — living room centre
    // Defer by one frame so house world matrices are committed before raycasting.
    if (vrm) {
      requestAnimationFrame(() => {
        _placeVRMOnFloor();
        _snapCameraToVRM();
      });
    }

    console.log(`[House] loaded ✓  scale=${hScale.toFixed(3)}  spawn=(${_houseSpawnX}, ${_houseFloorY}, ${_houseSpawnZ})`);
  },
  (xhr) => {
    const pct = Math.round(xhr.loaded / xhr.total * 100);
    setProgress(pct);
  },
  (err) => {
    console.warn('[House] GLB load failed:', err);
  }
);

// ================================================================
//  HOUSE ROOM DEFINITIONS
//  Spots are inside the real house. All coordinates are relative
//  to the house origin (0,0,0). Tweak X/Z after first test in browser.
//
//  The house has: living room, kitchen, bedroom, bathroom, hallway
//  She stays inside — no separate worlds, one real building.
// ================================================================

const HOUSE = {
  // All coordinates from real GLB mesh analysis (hScale=1.23, floorY=0.486)
  'living-room': {
    origin: { x: -2.7,  z: -3.8 }, size: { w: 5, d: 4 },
    ambientColor: 0x0d0a05,
    spots: [
      { label: 'Sofa',        x: -4.0, z: -4.8, facingY: 0,          activities: ['sofaSit','phoneScroll','idle','tvReact'] },
      { label: 'TV',          x: -2.3, z: -4.8, facingY: 0,          activities: ['tvReact','idle','dance'] },
      { label: 'Centre',      x: -2.7, z: -3.5, facingY: Math.PI,    activities: ['dance','stretch','hairflick','hiponhip','idle'] },
      { label: 'Fireplace',   x: -1.6, z: -2.0, facingY: Math.PI,    activities: ['idle','stretch'] },
    ]
  },
  kitchen: {
    origin: { x: -5.0,  z:  0.3 }, size: { w: 3, d: 3 },
    ambientColor: 0x0a1005,
    spots: [
      { label: 'Stove',   x: -5.3, z:  0.3, facingY: Math.PI/2,  activities: ['stirring','chopping','idle'] },
      { label: 'Sink',    x: -5.9, z: -0.8, facingY: Math.PI/2,  activities: ['idle','hairflick'] },
      { label: 'Centre',  x: -4.5, z:  0.5, facingY: Math.PI,    activities: ['tasting','hiponhip','idle'] },
    ]
  },
  dining: {
    origin: { x: -2.9,  z:  2.3 }, size: { w: 4, d: 3 },
    ambientColor: 0x0a0a05,
    spots: [
      { label: 'Table',   x: -3.0, z:  2.3, facingY: Math.PI/2,  activities: ['idle','tasting','phoneScroll'] },
      { label: 'Centre',  x: -2.5, z:  2.8, facingY: Math.PI,    activities: ['dance','idle','hiponhip'] },
    ]
  },
  bedroom: {
    origin: { x:  3.2,  z: -0.7 }, size: { w: 4, d: 3 },
    ambientColor: 0x05050d,
    spots: [
      { label: 'Wardrobe', x:  3.3, z: -0.7, facingY: -Math.PI/2, activities: ['mirrorPose','hairflick','idle'] },
      { label: 'Centre',   x:  4.0, z:  0.5, facingY: Math.PI,    activities: ['dance','stretch','idle','phoneScroll'] },
    ]
  },
  bedroom2: {
    origin: { x:  5.2,  z:  3.3 }, size: { w: 3, d: 4 },
    ambientColor: 0x05050d,
    spots: [
      { label: 'Window',  x:  4.1, z:  5.5, facingY: 0,          activities: ['idle','stretch','hairflick'] },
      { label: 'Centre',  x:  5.0, z:  3.8, facingY: Math.PI,    activities: ['dance','idle','sofaSit'] },
    ]
  },
  studio: {
    origin: { x: -2.7,  z: -3.8 }, size: { w: 5, d: 4 },
    ambientColor: 0x1a0a2e,
    spots: [
      { label: 'Centre',  x: -2.7, z: -3.5, facingY: Math.PI,    activities: ['dance','stretch','hairflick','hiponhip','idle','typing','monitor'] },
    ]
  },
};

// House is loaded as GLB above — no procedural room shells needed


// setRoomVisible: with GLB house we just update ambient colour on room change
function setRoomVisible(roomName, visible) {
  if (visible) {
    const h = HOUSE[roomName];
    if (h && ambient) ambient.color.setHex(h.ambientColor);
  }
}

// ── Room waypoints — used by moveToRoom() ─────────────────────────────────────
const ROOM_WAYPOINT_DEFS = {
  studio:         { x:  0.6, z: -1.2,  facingY: Math.PI  },
  'living-room':  { x:  2.0, z: -3.5,  facingY: 0.3      },
  kitchen:        { x: -3.0, z: -3.5,  facingY: 0        },
  bedroom:        { x:  4.5, z:  3.5,  facingY: Math.PI/4 },
  bathroom:       { x: -3.5, z:  4.5,  facingY: 0        },
};

// ── State ─────────────────────────────────────────────────────────────────────
let _currentRoom   = 'studio';

// ── Transition to a room ──────────────────────────────────────────────────────
function moveToRoom(roomName) {
  if (!roomName) return;
  _currentRoom = roomName;
  const hDef = HOUSE[roomName];
  if (hDef && ambient) ambient.color.setHex(hDef.ambientColor);
  const pool = getFamiliarActivityPool(roomName);
  ACTIVITY.current  = pool[Math.floor(Math.random() * pool.length)];
  ACTIVITY.timer    = 0; ACTIVITY.phase = 0;
  ACTIVITY.duration = _lifeMinDwell + Math.random() * (_lifeMaxDwell - _lifeMinDwell);
  maybeChangeOutfit(roomName);
  console.log(`[Room] virtual switch → ${roomName}`);
}

// ── Camera system ─────────────────────────────────────────────────────────────
// STREAMER PORTRAIT CAM
// Avatar is locked facing +Z. Camera always at a FIXED world position
// in front of her — never reads her rotation, so it can never drift away.
let camMode = 'IDLE';
const CAM_LERP = 0.05;

// Camera positions: avatar at (vx, 0, vz), facing +Z
// Camera sits at (vx + sideShift, height, vz + dist) looking at (vx, lookH, vz)
const STREAMER_CAM = {
  IDLE:  { dist: 1.8,  height: 1.50, lookHeight: 1.10, sideShift: 0.0  },
  SPEAK: { dist: 0.95, height: 1.60, lookHeight: 1.42, sideShift: 0.0  },
  THINK: { dist: 1.4,  height: 1.55, lookHeight: 1.28, sideShift: 0.22 },
};

// Smoothed camera state — lerps toward target each frame
const camCurrent = { x: 0, y: 1.50, z: 2.6, lookX: 0, lookY: 1.10, lookZ: 0 };
const camSmooth  = camCurrent; // alias kept for compat

function setCamMode(mode) {
  if (!['IDLE','SPEAK','THINK'].includes(mode)) return;
  camMode = mode;
}

// ── VRM world position tracking ───────────────────────────────────────────────
const vrmWorld = { x: 0, y: 0, z: 0, facingY: 0 };

// ── Waypoints & Walk system ───────────────────────────────────────────────────
const WAYPOINTS = {
  centre:     { x:  0.0, z:  0.0, label: 'Centre Stage'   },
  desk:       { x:  0.6, z: -1.2, label: 'Streaming Desk' },
  dartboard:  { x: -4.5, z: -1.0, label: 'Dartboard'      },
  basketball: { x:  4.0, z: -0.8, label: 'Basketball Hoop'},
  foosball:   { x: -4.5, z: -3.2, label: 'Foosball Table' },
  trophy:     { x:  3.5, z: -4.5, label: 'Trophy Shelf'   },
  beans:      { x: -5.2, z:  0.5, label: 'Bean Bag Zone'  },
};

const walk = {
  active: false,
  fromX: 0, fromZ: 0,
  toX: 0,   toZ: 0,
  progress: 0,
  duration: 2.0,
  targetFacing: 0,
  onArrive: null,
};

const vrmPos = { x: 0, z: 0 };

function walkTo(waypointName, onArrive = null) {
  const wp = WAYPOINTS[waypointName];
  if (!wp || !vrm) return;

  walk.fromX    = vrmPos.x;
  walk.fromZ    = vrmPos.z;
  walk.toX      = wp.x;
  walk.toZ      = wp.z;
  walk.progress = 0;
  walk.active   = true;
  walk.onArrive = onArrive;

  const dx = wp.x - vrmPos.x;
  const dz = wp.z - vrmPos.z;
  const dist = Math.sqrt(dx*dx + dz*dz);
  const WALK_SPEED = 1.5; // world units per second — natural walking pace
  walk.duration = Math.max(0.8, dist / WALK_SPEED);
  walk.targetFacing = Math.atan2(dx, dz) + Math.PI;
}

// Walk animation time accumulator (keeps counting while walking)
let _walkPhase = 0;

function updateWalk(delta) {
  if (!walk.active || !vrm) return;

  walk.progress += delta / walk.duration;
  if (walk.progress >= 1) {
    walk.progress = 1;
    walk.active   = false;
    vrmPos.x = walk.toX;
    vrmPos.z = walk.toZ;
    _walkPhase = 0;
    // Restore rest pose after arriving
    if (boneHips)       boneHips.rotation.set(0,0,0);
    if (boneSpine)      boneSpine.rotation.set(0,0,0);
    if (boneLUpperLeg)  boneLUpperLeg.rotation.set(0,0,-0.04);
    if (boneRUpperLeg)  boneRUpperLeg.rotation.set(0,0, 0.06);
    if (boneLLowerLeg)  boneLLowerLeg.rotation.set(0.04,0,0);
    if (boneRLowerLeg)  boneRLowerLeg.rotation.set(0.04,0,0);
    if (boneLFoot)      boneLFoot.rotation.set(-0.05,0,-0.03);
    if (boneRFoot)      boneRFoot.rotation.set(-0.05,0, 0.04);
    if (boneLUpperArm)  boneLUpperArm.rotation.set(0.07,0.04, 0.9);
    if (boneRUpperArm)  boneRUpperArm.rotation.set(0.07,-0.04,-0.9);
    if (boneLLowerArm)  boneLLowerArm.rotation.set(-0.04,0, 0.52);
    if (boneRLowerArm)  boneRLowerArm.rotation.set(-0.04,0,-0.52);
    if (walk.onArrive) walk.onArrive();
    return;
  }

  // Ease-in-out for position
  const t    = walk.progress;
  const ease = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
  vrmPos.x = walk.fromX + (walk.toX - walk.fromX) * ease;
  vrmPos.z = walk.fromZ + (walk.toZ - walk.fromZ) * ease;

  // ── Wall bounds clamp — never enter walls ──────────────────────────────────
  vrmPos.x = Math.max(HOUSE_BOUNDS.minX + AVATAR_RADIUS, Math.min(HOUSE_BOUNDS.maxX - AVATAR_RADIUS, vrmPos.x));
  vrmPos.z = Math.max(HOUSE_BOUNDS.minZ + AVATAR_RADIUS, Math.min(HOUSE_BOUNDS.maxZ - AVATAR_RADIUS, vrmPos.z));

  vrm.scene.position.x = vrmPos.x;
  vrm.scene.position.z = vrmPos.z;

  // Smooth turn toward travel direction
  const currentFacing = vrm.scene.rotation.y;
  let diff = walk.targetFacing - currentFacing;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  vrm.scene.rotation.y += diff * Math.min(1, delta * 6);

  // ── WALK ANIMATION ──────────────────────────────────────────────
  // Speed: steps per second. A natural feminine walk ~2.2 steps/sec
  const STEP_FREQ  = 2.4;
  _walkPhase += delta * STEP_FREQ * Math.PI * 2;
  const p = _walkPhase; // continuous angle

  // ── Legs ── alternating forward/back swing
  const legSwing  = Math.sin(p) * 0.42;       // upper leg forward-back
  const kneeBend  = Math.max(0, -Math.sin(p)) * 0.55; // knee bends on the back-step
  const kneeSwing = Math.max(0,  Math.sin(p)) * 0.35; // slight bend on forward-swing too
  const footLift  = Math.max(0, Math.sin(p)) * 0.18;  // foot lifts slightly

  if (boneLUpperLeg) boneLUpperLeg.rotation.x =  legSwing;
  if (boneRUpperLeg) boneRUpperLeg.rotation.x = -legSwing;
  if (boneLLowerLeg) boneLLowerLeg.rotation.x =  kneeBend  + 0.04;
  if (boneRLowerLeg) boneRLowerLeg.rotation.x =  kneeSwing + 0.04;
  if (boneLFoot)     { boneLFoot.rotation.x = -0.05 + footLift * 0.5; boneLFoot.rotation.z = -0.03; }
  if (boneRFoot)     { boneRFoot.rotation.x = -0.05;                  boneRFoot.rotation.z =  0.04; }
  if (boneLToes)     boneLToes.rotation.x =  0.08 + footLift * 0.3;
  if (boneRToes)     boneRToes.rotation.x =  0.08;

  // ── Hips ── side sway + forward tilt on each step
  const hipSway = Math.sin(p) * 0.1;
  const hipTilt = Math.cos(p) * 0.04; // slight forward/back tilt
  if (boneHips) {
    boneHips.rotation.z = hipSway;
    boneHips.rotation.x = hipTilt;
    boneHips.rotation.y = Math.sin(p) * 0.05;
  }

  // ── Spine & Chest ── counter-rotate against hips for natural twist
  if (boneSpine) {
    boneSpine.rotation.z = -hipSway * 0.6;
    boneSpine.rotation.x =  0.02 + Math.abs(Math.cos(p)) * 0.015;
    boneSpine.rotation.y = -Math.sin(p) * 0.04;
  }
  if (boneChest) {
    boneChest.rotation.z = -hipSway * 0.3;
    boneChest.rotation.y = -Math.sin(p) * 0.06;
  }

  // ── Head ── slight bob + forward-facing, with subtle look-ahead tilt
  if (boneHead) {
    boneHead.rotation.x = 0.04 + Math.abs(Math.sin(p)) * 0.02;  // bob
    boneHead.rotation.z = Math.sin(p) * 0.018;                    // tiny head tilt
    boneHead.rotation.y = Math.sin(p) * 0.04;                     // micro glance
  }

  // ── Arms ── counter-swing to legs (left arm swings forward when right leg does)
  // Arms stay close to body — not flailing — with a natural bend at the elbow
  const armSwing    = -Math.sin(p) * 0.28;  // opposite phase to lead leg
  const elbowBend   = 0.35 + Math.abs(Math.sin(p)) * 0.1;

  if (boneLUpperArm) {
    boneLUpperArm.rotation.x =  armSwing;
    boneLUpperArm.rotation.z =  0.8;     // arm close to body, slight outward
    boneLUpperArm.rotation.y =  0.04;
  }
  if (boneRUpperArm) {
    boneRUpperArm.rotation.x = -armSwing;
    boneRUpperArm.rotation.z = -0.8;
    boneRUpperArm.rotation.y = -0.04;
  }
  if (boneLLowerArm) {
    boneLLowerArm.rotation.x = 0;
    boneLLowerArm.rotation.z =  elbowBend;
  }
  if (boneRLowerArm) {
    boneRLowerArm.rotation.x = 0;
    boneRLowerArm.rotation.z = -elbowBend;
  }
  // Hands relaxed during walk — slight droop
  if (boneLHand) { boneLHand.rotation.z =  0.15; boneLHand.rotation.x = 0.05; }
  if (boneRHand) { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = 0.05; }

  // Fingers relaxed during walk
  setLeftFingerRelax();
  setRightFingerRelax();

  // Vertical bob — body rises and falls with each step
  const basePosY = vrm.scene.position.y;
  const bobY     = Math.abs(Math.sin(p)) * 0.018;
  vrm.scene.position.y = (vrm._restPosY || 0) + bobY;
}

// ── Activity → location mapping ───────────────────────────────────────────────
const ACTIVITY_LOCATIONS = {
  darts: 'dartboard', basketball: 'basketball', dance: 'centre',
  stretch: 'centre',  hairflick: 'centre',      hiponhip: 'centre',
  noseCover: 'centre', typing: 'desk',           monitor: 'desk', idle: 'centre',
};
let _lastWaypointActivity = '';

// ================================================================
//  DAILY LIFE SCHEDULER
//  She lives autonomously. No waiting at the desk. She moves around
//  her house doing things, and the camera follows her wherever she is.
//  Spots have a 'facingY' so she faces the props, not the camera.
// ================================================================

let _lifeTimer     = 0;
let _lifeMinDwell  = 8;   // minimum seconds at a spot before moving
let _lifeMaxDwell  = 25;  // maximum seconds at a spot
let _nextDwell     = _lifeMinDwell + Math.random() * (_lifeMaxDwell - _lifeMinDwell);
let _apiOverride      = false;
let _apiOverrideTimer = 0;
const API_OVERRIDE_DURATION = 60; // seconds before she resumes her life

// ================================================================
//  FAMILIARITY SYSTEM
//  Tracks time spent in each room + activity. The longer she's
//  been somewhere the more she gravitates back there and the more
//  complex her activities become. No ML needed — weighted scoring.
// ================================================================
const _familiarity = {
  studio:        { room: 0, activities: {} },
  kitchen:       { room: 0, activities: {} },
  'living-room': { room: 0, activities: {} },
  bedroom:       { room: 0, activities: {} },
  bathroom:      { room: 0, activities: {} },
};
// How many seconds spent before she's "comfortable" in a room (unlocks more activities)
const FAM_THRESHOLD_BASIC    = 60;    // 1 min → she's been here a few times
const FAM_THRESHOLD_SETTLED  = 300;   // 5 min → she's settled, picks complex activities
const FAM_THRESHOLD_HOME     = 900;   // 15 min → this is her turf, she goes here first

function famUpdate(delta) {
  if (_currentRoom && _familiarity[_currentRoom]) {
    _familiarity[_currentRoom].room += delta;
    const act = ACTIVITY.current;
    if (act && act !== 'idle') {
      _familiarity[_currentRoom].activities[act] =
        (_familiarity[_currentRoom].activities[act] || 0) + delta;
    }
  }
}

// Returns a 0–1 comfort score for a room
function famScore(roomName) {
  const f = _familiarity[roomName];
  if (!f) return 0;
  return Math.min(1, f.room / FAM_THRESHOLD_HOME);
}

// Weighted room picker — more familiar rooms get picked more often
function pickNextSpotFamiliar() {
  const allSpots = Object.entries(HOUSE).flatMap(([roomKey, roomDef]) =>
    roomDef.spots.map(spot => ({ ...spot, room: roomKey }))
  );

  // Build weighted list — familiar rooms appear more times in the pool
  const weighted = [];
  for (const spot of allSpots) {
    if (spot === _currentSpot) continue;
    const score = famScore(spot.room);
    // Base weight 1, +3 if familiar, +5 if home-tier
    const w = _familiarity[spot.room]?.room > FAM_THRESHOLD_HOME ? 5
            : _familiarity[spot.room]?.room > FAM_THRESHOLD_SETTLED ? 3
            : _familiarity[spot.room]?.room > FAM_THRESHOLD_BASIC ? 2
            : 1;
    for (let i = 0; i < w; i++) weighted.push(spot);
  }
  return weighted[Math.floor(Math.random() * weighted.length)];
}

// Returns activity pool filtered by familiarity level
function getFamiliarActivityPool(roomName) {
  const base = {
    studio:        ['idle','dance','stretch','hairflick','hiponhip','typing','monitor','noseCover','darts','basketball'],
    kitchen:       ['idle','hairflick','hiponhip','noseCover','stirring','chopping','tasting'],
    'living-room': ['idle','hairflick','hiponhip','stretch','sofaSit','phoneScroll','tvReact','dance'],
    bedroom:       ['idle','hairflick','noseCover','sofaSit','phoneScroll','stretch'],
    bathroom:      ['idle','hairflick','noseCover','mirrorPose','stretch'],
    office:        ['idle','hairflick','noseCover','typing','monitor','stretch'],
  };
  const advanced = {
    studio:        ['darts','basketball','dance'],
    kitchen:       ['stirring','chopping','tasting'],
    'living-room': ['tvReact','sofaSit','phoneScroll','dance'],
    bedroom:       ['sofaSit','phoneScroll'],
    bathroom:      ['mirrorPose'],
    office:        ['typing','monitor'],
  };

  const fam = _familiarity[roomName]?.room || 0;
  const pool = [...(base[roomName] || base.studio)];
  if (fam > FAM_THRESHOLD_BASIC) {
    // Unlock advanced activities — weight them higher by adding twice
    const adv = advanced[roomName] || [];
    pool.push(...adv, ...adv);
  }
  return pool;
}

// ================================================================
//  OUTFIT SYSTEM
//  Outfits are colour + emissive presets. Style variants swap mesh
//  visibility (requires mesh names to match). Outfit changes
//  happen autonomously based on room/time or can be triggered.
// ================================================================
const OUTFITS = {
  streaming: {
    label:  'Streaming Look',
    Top:    { color: 0xff69b4, emissive: 0x330011, emissiveIntensity: 0.1 },
    Bottom: { color: 0xff1493, emissive: 0x330011, emissiveIntensity: 0.1 },
    Shoe_R: { color: 0x222222, emissive: 0x000000, emissiveIntensity: 0 },
    Shoe_L: { color: 0x222222, emissive: 0x000000, emissiveIntensity: 0 },
  },
  loungewear: {
    label:  'Loungewear',
    Top:    { color: 0x8b4513, emissive: 0x1a0a00, emissiveIntensity: 0.05 },
    Bottom: { color: 0x6b3410, emissive: 0x1a0a00, emissiveIntensity: 0.05 },
    Shoe_R: { color: 0x5c3317, emissive: 0x000000, emissiveIntensity: 0 },
    Shoe_L: { color: 0x5c3317, emissive: 0x000000, emissiveIntensity: 0 },
  },
  streetwear: {
    label:  'Streetwear',
    Top:    { color: 0x111111, emissive: 0x000000, emissiveIntensity: 0 },
    Bottom: { color: 0x1a1a2e, emissive: 0x000022, emissiveIntensity: 0.08 },
    Shoe_R: { color: 0xffffff, emissive: 0x111111, emissiveIntensity: 0.05 },
    Shoe_L: { color: 0xffffff, emissive: 0x111111, emissiveIntensity: 0.05 },
  },
  pyjamas: {
    label:  'Pyjamas',
    Top:    { color: 0x6a0dad, emissive: 0x200020, emissiveIntensity: 0.06 },
    Bottom: { color: 0x7b1fa2, emissive: 0x200020, emissiveIntensity: 0.06 },
    Shoe_R: { color: 0x9c4dcc, emissive: 0x100010, emissiveIntensity: 0.04 },
    Shoe_L: { color: 0x9c4dcc, emissive: 0x100010, emissiveIntensity: 0.04 },
  },
  afrobeats: {
    label:  'Afrobeats Night',
    Top:    { color: 0xFFB830, emissive: 0x331a00, emissiveIntensity: 0.15 },
    Bottom: { color: 0xff6600, emissive: 0x331100, emissiveIntensity: 0.12 },
    Shoe_R: { color: 0xFFB830, emissive: 0x221100, emissiveIntensity: 0.1 },
    Shoe_L: { color: 0xFFB830, emissive: 0x221100, emissiveIntensity: 0.1 },
  },
};

// Which outfit fits which context
const OUTFIT_CONTEXT = {
  bedroom:       ['pyjamas', 'loungewear'],
  bathroom:      ['pyjamas', 'loungewear'],
  'living-room': ['loungewear', 'streetwear', 'afrobeats'],
  kitchen:       ['loungewear', 'pyjamas'],
  office:        ['streetwear', 'streaming'],
  studio:        ['streaming', 'afrobeats', 'streetwear'],
};

let _currentOutfit = 'streaming';

function applyOutfit(outfitName) {
  if (!vrm || !OUTFITS[outfitName]) return;
  const outfit = OUTFITS[outfitName];
  _currentOutfit = outfitName;
  vrm.scene.traverse(obj => {
    if (!obj.isMesh) return;
    const def = outfit[obj.name];
    if (!def) return;
    const m = obj.material;
    if (!m) return;
    m.color.setHex(def.color);
    m.emissive.setHex(def.emissive);
    m.emissiveIntensity = def.emissiveIntensity;
    m.needsUpdate = true;
  });
  console.log(`[Outfit] Changed to: ${OUTFITS[outfitName].label}`);
}

// Called when she enters a new room — maybe changes outfit
let _lastOutfitRoom = null;
function maybeChangeOutfit(roomName) {
  if (roomName === _lastOutfitRoom) return;
  _lastOutfitRoom = roomName;
  const options = OUTFIT_CONTEXT[roomName];
  if (!options) return;
  // 40% chance to change outfit on room entry
  if (Math.random() > 0.4) return;
  const pick = options[Math.floor(Math.random() * options.length)];
  if (pick !== _currentOutfit) {
    // Small delay so it feels like she "got changed"
    setTimeout(() => applyOutfit(pick), 1500);
  }
}

// All spots across the house, flat list for the scheduler
function getAllSpots() {
  return Object.entries(HOUSE).flatMap(([roomKey, roomDef]) =>
    roomDef.spots.map(spot => ({ ...spot, room: roomKey }))
  );
}

let _currentSpot = null;

function pickNextSpot(avoidRoom = null) {
  // Use familiarity-weighted picker — familiar rooms come up more often
  return pickNextSpotFamiliar();
}

function goToSpot(spot) {
  if (!spot || !vrm) return;
  _currentSpot = spot;

  const needsRoomSwitch = spot.room !== _currentRoom;

  if (needsRoomSwitch) {
    setRoomVisible(_currentRoom, false);
    _currentRoom = spot.room;
    setRoomVisible(_currentRoom, true);  // ambient colour updated inside setRoomVisible
  }

  WAYPOINTS['_life_dest'] = { x: spot.x, z: spot.z, label: spot.label };
  walkTo('_life_dest', () => {
    // Face the right direction for this spot
    if (spot.facingY !== undefined && vrm) {
      _targetFacing = spot.facingY;
    }
    // Pick an activity for this spot
    const pool = getFamiliarActivityPool(_currentRoom);
    const next = pool[Math.floor(Math.random() * pool.length)];
    ACTIVITY.current = next;
    ACTIVITY.timer   = 0;
    ACTIVITY.phase   = 0;
    ACTIVITY.duration = _lifeMinDwell + Math.random() * (_lifeMaxDwell - _lifeMinDwell);
    // Maybe change outfit when she arrives somewhere new
    maybeChangeOutfit(_currentRoom);
  });
}

// Facing target — render loop lerps toward this
// _targetFacing locked to Math.PI so she always faces the camera (+Z)
// Activities that try to set other facing values are ignored
let _targetFacing = Math.PI;

function lifeUpdate() {
  // Room-walking disabled — avatar stays at (0,0,0) doing in-place activities.
  // Calling famUpdate keeps the familiarity scores ticking for activity variety.
  famUpdate(1/60);
}

// Animate room neon lights (very slow ambient breathing — not a flicker)
let _roomTime = 0;
function animateRoomLights(delta) {
  _roomTime += delta;
  // Neon lights only exist if buildGameRoom() was called — guard safely
  if (roomLights.neonPink)   roomLights.neonPink.intensity   = 2.8 + Math.sin(_roomTime * 0.18) * 0.2;
  if (roomLights.neonBlue)   roomLights.neonBlue.intensity   = 2.4 + Math.sin(_roomTime * 0.14 + 1) * 0.2;
  if (roomLights.neonPurple) roomLights.neonPurple.intensity = 2.0 + Math.sin(_roomTime * 0.11 + 2) * 0.15;
  if (monitorGlowLight && ACTIVITY.current !== 'monitor') {
    monitorGlowLight.intensity = 0.6 + Math.sin(_roomTime * 0.12) * 0.08;
  }
}

// ── Load VRM ────────────────────────────────────────────
let vrm          = null;
let mixer        = null;
let VRM_BASE_ROT_Y = Math.PI; // default; overwritten after rotateVRM0

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

    // ── Skin tone: rich deep brown ────────────────────────────────
    const SKIN_HEX = 0x7B3F00; // deep warm brown
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
      const name      = obj.name;
      const isMetallic = name.includes('Jewel') || name.includes('Necklece');
      const isSkin     = name === 'Julie_Figure' || name === 'Teargum';
      const isEye      = name === 'Eye_R' || name === 'Eyes_L';
      const isLash     = name === 'Lashes';
      const isTooth    = name === 'Teeth';

      if (isEye) {
        const eyeCanvas  = document.createElement('canvas');
        eyeCanvas.width  = 128;
        eyeCanvas.height = 128;
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
        obj.material = new THREE.MeshStandardMaterial({
          map: eyeTex, roughness: 0.05, metalness: 0.0, side: THREE.FrontSide,
        });
      } else if (isLash) {
        obj.material = new THREE.MeshStandardMaterial({
          color: 0x050202, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
        });
      } else if (isTooth) {
        obj.material = new THREE.MeshStandardMaterial({
          color: 0xfff8f0, roughness: 0.4, metalness: 0, side: THREE.FrontSide,
        });
      } else {
        const hexColour = MESH_COLOURS[name] ?? 0xb5743a;
        obj.material = new THREE.MeshStandardMaterial({
          color:            hexColour,
          roughness:        isSkin ? 0.65 : isMetallic ? 0.18 : 0.72,
          metalness:        isMetallic ? 0.88 : 0.0,
          // Emissive floor prevents skin going black under harsh neon swings
          emissive:         isSkin ? new THREE.Color(0x7B3F00) : new THREE.Color(0x000000),
          emissiveIntensity: isSkin ? 0.15 : 0.0,
          side:             THREE.FrontSide,
          depthWrite:       true,
        });
      }
    });

    VRMUtils.rotateVRM0(vrm);
    vrm.scene.scale.set(1,1,1);
    vrm.scene.position.set(0,0,0);
    VRM_BASE_ROT_Y = vrm.scene.rotation.y;
    scene.add(vrm.scene);

    // ── Scale VRM to target height ───────────────────────────────
    // Force matrix update BEFORE measuring so Box3 gets real values.
    vrm.scene.updateMatrixWorld(true);
    const boxRaw    = new THREE.Box3().setFromObject(vrm.scene);
    const sizeRaw   = boxRaw.getSize(new THREE.Vector3());
    const centerRaw = boxRaw.getCenter(new THREE.Vector3());
    const VRM_TARGET_HEIGHT = 1.65;
    const scaleVal  = VRM_TARGET_HEIGHT / sizeRaw.y;
    vrm.scene.scale.set(scaleVal, scaleVal, scaleVal);
    vrm.scene.position.set(-centerRaw.x * scaleVal, 0, -centerRaw.z * scaleVal);

    // Sync the scale slider to the actual computed value so it doesn't
    // snap the VRM on first interaction (fixes HTML default mismatch)
    const scaleSlider = document.getElementById('scale');
    const scaleValEl  = document.getElementById('scale-val');
    if (scaleSlider) { scaleSlider.value = scaleVal; }
    if (scaleValEl)  { scaleValEl.textContent = scaleVal.toFixed(2); }

    cacheBones();

    // ── Set natural girly resting pose (out of T-pose) ───────────
    function setRestPose() {
      if (boneLUpperArm) { boneLUpperArm.rotation.z =  1.0; boneLUpperArm.rotation.x = 0.05; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0; boneRUpperArm.rotation.x = 0.05; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z =  0.35; boneLLowerArm.rotation.x = 0.05; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.35; boneRLowerArm.rotation.x = 0.05; }
      if (boneLHand) { boneLHand.rotation.z =  0.18; boneLHand.rotation.x = 0.08; }
      if (boneRHand) { boneRHand.rotation.z = -0.18; boneRHand.rotation.x = 0.08; }
      if (boneHips) { boneHips.rotation.z = 0.06; boneHips.rotation.x = 0.01; }
      if (boneLUpperLeg) { boneLUpperLeg.rotation.z = -0.04; }
      if (boneRUpperLeg) { boneRUpperLeg.rotation.z =  0.06; }
      if (boneLFoot) { boneLFoot.rotation.x = -0.05; boneLFoot.rotation.z = -0.03; }
      if (boneRFoot) { boneRFoot.rotation.x = -0.05; boneRFoot.rotation.z =  0.04; }
      if (boneLToes) { boneLToes.rotation.x =  0.08; }
      if (boneRToes) { boneRToes.rotation.x =  0.08; }
      if (boneSpine) { boneSpine.rotation.x = 0.02; boneSpine.rotation.z = -0.03; }
    }
    setRestPose();

    // ── Measure feet offset with FULL matrix commit ───────────────
    // updateMatrixWorld(true) forces Three.js to recompute every bone's
    // world transform so Box3 sees the posed skeleton, not the T-pose.
    vrm.update(0);                        // tick VRM internals once
    vrm.scene.updateMatrixWorld(true);    // commit all world matrices
    const boxPosed      = new THREE.Box3().setFromObject(vrm.scene);
    // feetToOrigin = how far to push her UP so her lowest point is at Y=0
    const feetToOrigin  = Math.max(0, -boxPosed.min.y);
    vrm._feetOffset     = feetToOrigin;
    vrm.scene.position.y = feetToOrigin;
    console.log('[VRM] feetOffset after pose:', feetToOrigin.toFixed(4));

    // ── Place avatar on house floor ───────────────────────────────
    if (_houseLoaded) {
      requestAnimationFrame(() => _placeVRMOnFloor());
    } else {
      vrmPos.x = 0; vrmPos.z = 0;
      vrm.scene.position.set(0, feetToOrigin, 0);
      vrm._restPosY = feetToOrigin;
      vrm.scene.rotation.y = Math.PI;
    }

    console.log(`[VRM] initial position (${vrm.scene.position.x.toFixed(2)}, ${vrm.scene.position.y.toFixed(3)}, ${vrm.scene.position.z.toFixed(2)})`);

    // Snap camera directly in front of her — no lerp drift
    _snapCameraToVRM();

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
  (progress) => {
    const p = 10 + (progress.loaded / (progress.total || 1)) * 65;
    setProgress(Math.min(p, 75));
  },
  (error) => {
    console.error(error);
    setStatus('Failed to load VRM — check file path', 'error');
    loader_el.querySelector('.sub').textContent = 'Error loading avatar. Check console.';
  }
);

// ================================================================
//  MALE VRM — drop your own .vrm here when it's ready.
//  Set MALE_VRM_PATH to the filename and uncomment loadMaleVRM().
//  The character will stand on the house floor with a natural idle
//  pose and wander the same room as Miss OG Tinz.
//
//  const MALE_VRM_PATH = 'MrOgTinz.vrm'; // ← swap in your file
//  setTimeout(loadMaleVRM, 3000);
// ================================================================

let companion = null; // kept as null — no character loaded yet

function updateCompanion(_delta) {
  // No-op until a real male VRM is dropped in.
}

// ── loadMaleVRM — uncomment and call once your .vrm is in the repo ───────────
// async function loadMaleVRM() {
//   const loader = new GLTFLoader();
//   loader.register(parser => new VRMLoaderPlugin(parser));
//   loader.load(
//     MALE_VRM_PATH,
//     (gltf) => {
//       companion = gltf.userData.vrm;
//       if (!companion) return;
//       VRMUtils.removeUnnecessaryJoints(gltf.scene);
//       VRMUtils.rotateVRM0(companion);
//
//       // Apply your mesh colours here — mirror the MESH_COLOURS block above
//       // and rename keys to match your male VRM mesh names.
//
//       // Scale to natural male height (1.78 m)
//       companion.scene.scale.set(1, 1, 1);
//       const rawH = new THREE.Box3().setFromObject(companion.scene).getSize(new THREE.Vector3()).y;
//       const sc   = 1.78 / rawH;
//       companion.scene.scale.set(sc, sc, sc);
//
//       // Rest pose — arms down, slight weight shift
//       if (companion.humanoid) {
//         const h = companion.humanoid;
//         const b = n => h.getNormalizedBoneNode(n);
//         if (b('leftUpperArm'))  b('leftUpperArm').rotation.set(0.05, 0.03,  0.78);
//         if (b('rightUpperArm')) b('rightUpperArm').rotation.set(0.05,-0.03, -0.78);
//         if (b('leftLowerArm'))  b('leftLowerArm').rotation.set(0, 0,  0.38);
//         if (b('rightLowerArm')) b('rightLowerArm').rotation.set(0, 0, -0.38);
//         if (b('hips'))          b('hips').rotation.set(0, 0, 0.02);
//         if (b('spine'))         b('spine').rotation.set(0.02, 0, -0.01);
//       }
//
//       // Place feet on house floor
//       companion.scene.updateMatrixWorld(true);
//       const posed   = new THREE.Box3().setFromObject(companion.scene);
//       const feetOff = -posed.min.y;
//       companion._feetOffset = feetOff;
//       const floorY  = (_houseFloorY || 0) + feetOff;
//       companion.scene.position.set(2.5, floorY, 1.5);
//       companion._restPosY = floorY;
//       scene.add(companion.scene);
//       console.log('[MaleVRM] Loaded. floorY:', floorY.toFixed(4));
//     },
//     null,
//     err => console.warn('[MaleVRM] Load failed:', err.message)
//   );
// }

// ── Blendshape helpers ──────────────────────────────────
// Maps VRM standard expression names → mesh morph target names
const BS_MAP = {
  'A': 'vrc.v_aa', 'I': 'vrc.v_ih', 'U': 'vrc.v_ou',
  'E': 'vrc.v_ee', 'O': 'vrc.v_oh',
  'blink': 'blink', 'Blink': 'blink',
  'blink_l': 'blink_l', 'Blink_L': 'blink_l',
  'blink_r': 'blink_r', 'Blink_R': 'blink_r',
  'joy': 'joy',     'Joy': 'joy',
  'angry': 'angry', 'Angry': 'angry',
  'sorrow': 'sorrow', 'Sorrow': 'sorrow',
  'fun': 'fun',     'Fun': 'fun',
};

// Cache of mesh → morph target index maps, built on first use
const _morphCache = {};
function _getMorphIndex(mesh, targetName) {
  if (!mesh.morphTargetDictionary) return -1;
  const key = mesh.uuid;
  if (!_morphCache[key]) _morphCache[key] = mesh.morphTargetDictionary;
  return _morphCache[key][targetName] ?? -1;
}

// Face mesh reference — populated after VRM loads
let faceMesh = null;
function _findFaceMesh() {
  if (faceMesh) return faceMesh;
  if (!vrm) return null;
  vrm.scene.traverse(obj => {
    if (obj.isMesh && obj.morphTargetDictionary &&
        'vrc.v_aa' in obj.morphTargetDictionary) {
      faceMesh = obj;
    }
  });
  return faceMesh;
}

function setBS(name, value) {
  if (!vrm) return;
  const v = Math.max(0, Math.min(1, value));
  // Try VRM expression manager first (works if bindings are set)
  try { vrm.expressionManager?.setValue(name, v); } catch(e) {}
  // Always also drive morph targets directly on the mesh
  const morphName = BS_MAP[name] || name.toLowerCase();
  const mesh = _findFaceMesh();
  if (mesh) {
    const idx = _getMorphIndex(mesh, morphName);
    if (idx !== -1 && mesh.morphTargetInfluences) {
      mesh.morphTargetInfluences[idx] = v;
    }
  }
}

// ── Lip Sync ────────────────────────────────────────────
let lipSyncActive = false;
let _isSpeaking   = false; // true while TTS audio is playing
let lipRafId      = null;
const MOUTH_BS    = ['A','I','U','E','O'];

function stopLipSync() {
  lipSyncActive = false;
  cancelAnimationFrame(lipRafId);
  MOUTH_BS.forEach(s => setBS(s, 0));
  if (boneJaw) boneJaw.rotation.x = 0;
  if (teethNode) teethNode.position.y = 0; // reset teeth back up
}

// ── Finger pose helpers ──────────────────────────────────
// curl=0 → straight fingers, curl=1 → fully curled fist
function setLeftFingerCurl(curl, splay=0) {
  const c = curl * 1.4; // max rotation
  if (boneL_IndexPx) { boneL_IndexPx.rotation.x = c; boneL_IndexPx.rotation.z = splay * 0.08; }
  if (boneL_IndexMd) boneL_IndexMd.rotation.x = c * 0.8;
  if (boneL_IndexDt) boneL_IndexDt.rotation.x = c * 0.6;
  if (boneL_MidPx)   { boneL_MidPx.rotation.x = c; }
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
function setRightFingerCurl(curl, splay=0) {
  const c = curl * 1.4;
  if (boneR_IndexPx) { boneR_IndexPx.rotation.x = c; boneR_IndexPx.rotation.z = -splay * 0.08; }
  if (boneR_IndexMd) boneR_IndexMd.rotation.x = c * 0.8;
  if (boneR_IndexDt) boneR_IndexDt.rotation.x = c * 0.6;
  if (boneR_MidPx)   { boneR_MidPx.rotation.x = c; }
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
// Relaxed feminine droop — fingers slightly separated, tips drooping
function setLeftFingerRelax() {
  setLeftFingerCurl(0.12, 0.4);
  if (boneL_ThumbPx) { boneL_ThumbPx.rotation.z = 0.18; boneL_ThumbPx.rotation.y = 0.1; }
}
function setRightFingerRelax() {
  setRightFingerCurl(0.12, 0.4);
  if (boneR_ThumbPx) { boneR_ThumbPx.rotation.z = -0.18; boneR_ThumbPx.rotation.y = -0.1; }
}
// Point index finger (rest curl with index extended)
function setRightIndexPoint() {
  setRightFingerCurl(0.8);
  if (boneR_IndexPx) boneR_IndexPx.rotation.x = 0;
  if (boneR_IndexMd) boneR_IndexMd.rotation.x = 0;
  if (boneR_IndexDt) boneR_IndexDt.rotation.x = 0;
  if (boneR_ThumbPx) { boneR_ThumbPx.rotation.x = 0.2; boneR_ThumbPx.rotation.z = 0.3; }
}
// Splayed wave hand
function setRightFingerWave(flutter) {
  const f = Math.sin(flutter * 8) * 0.1;
  if (boneR_IndexPx) { boneR_IndexPx.rotation.x = 0.05 + f; boneR_IndexPx.rotation.z = -0.1; }
  if (boneR_MidPx)   { boneR_MidPx.rotation.x = 0.05; }
  if (boneR_RingPx)  { boneR_RingPx.rotation.x = 0.05 - f; boneR_RingPx.rotation.z = 0.08; }
  if (boneR_PinkyPx) { boneR_PinkyPx.rotation.x = 0.08 + f * 0.5; boneR_PinkyPx.rotation.z = 0.12; }
  if (boneR_ThumbPx) { boneR_ThumbPx.rotation.z = -0.25; boneR_ThumbPx.rotation.y = -0.1; }
}
// Nose-cover hand — fingers lightly curled, palm facing inward toward face
function setRightFingerCoverNose() {
  if (boneR_IndexPx) { boneR_IndexPx.rotation.x = 0.55; boneR_IndexPx.rotation.z = -0.05; }
  if (boneR_IndexMd) boneR_IndexMd.rotation.x = 0.45;
  if (boneR_IndexDt) boneR_IndexDt.rotation.x = 0.3;
  if (boneR_MidPx)   { boneR_MidPx.rotation.x = 0.5; }
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
}

// ── Expression mapping ──────────────────────────────────
function setExpression(mood) {
  ['happy','angry','sad','relaxed','surprised'].forEach(e => setBS(e, 0));
  ['joy','angry','sorrow','fun','neutral'].forEach(e => setBS(e, 0));
  const map = {
    happy:     () => { setBS('joy',0.8); setBS('happy',0.8); },
    excited:   () => { setBS('joy',1.0); setBS('fun',0.6); },
    angry:     () => { setBS('angry',0.7); },
    sad:       () => { setBS('sorrow',0.7); setBS('sad',0.6); },
    neutral:   () => { setBS('neutral',0.3); },
    surprised: () => { setBS('surprised',0.8); }
  };
  (map[mood] || map.neutral)();
}

// ── Bone cache ───────────────────────────────────────────
let boneHead=null, boneNeck=null, boneSpine=null, boneChest=null;
let boneJaw=null;   // for mouth open/close
let boneHips=null;
let boneHipL=null, boneHipR=null;
let boneLUpperLeg=null, boneRUpperLeg=null;
let boneLLowerLeg=null, boneRLowerLeg=null;
let boneLFoot=null, boneRFoot=null;
let boneLToes=null, boneRToes=null;
let boneLUpperArm=null, boneRUpperArm=null;
let boneLLowerArm=null, boneRLowerArm=null;
let boneLHand=null, boneRHand=null;

// ── Finger bones (full hand — all 5 fingers × 3 joints × 2 hands) ──
// Left hand fingers
let boneL_ThumbPx=null, boneL_ThumbMd=null, boneL_ThumbDt=null;
let boneL_IndexPx=null, boneL_IndexMd=null, boneL_IndexDt=null;
let boneL_MidPx=null,   boneL_MidMd=null,   boneL_MidDt=null;
let boneL_RingPx=null,  boneL_RingMd=null,  boneL_RingDt=null;
let boneL_PinkyPx=null, boneL_PinkyMd=null, boneL_PinkyDt=null;
// Right hand fingers
let boneR_ThumbPx=null, boneR_ThumbMd=null, boneR_ThumbDt=null;
let boneR_IndexPx=null, boneR_IndexMd=null, boneR_IndexDt=null;
let boneR_MidPx=null,   boneR_MidMd=null,   boneR_MidDt=null;
let boneR_RingPx=null,  boneR_RingMd=null,  boneR_RingDt=null;
let boneR_PinkyPx=null, boneR_PinkyMd=null, boneR_PinkyDt=null;

// Teeth mesh node reference (for fake jaw-open via translation)
let teethNode=null;

function cacheBones() {
  if (!vrm || !vrm.humanoid) return;
  const h         = vrm.humanoid;
  boneHead        = h.getNormalizedBoneNode('head');
  boneNeck        = h.getNormalizedBoneNode('neck');
  boneSpine       = h.getNormalizedBoneNode('spine');
  boneChest       = h.getNormalizedBoneNode('chest');
  boneHips        = h.getNormalizedBoneNode('hips');
  // jaw bone — VRM humanoid may or may not expose this, try both names
  boneJaw         = h.getNormalizedBoneNode('jaw') || h.getNormalizedBoneNode('lowerJaw') || null;
  // Fallback: search by name in scene
  if (!boneJaw) {
    vrm.scene.traverse(n => {
      if (!boneJaw && n.isBone && /jaw|lower.?jaw/i.test(n.name)) boneJaw = n;
    });
  }
  boneHipL        = h.getNormalizedBoneNode('leftUpperLeg');
  boneHipR        = h.getNormalizedBoneNode('rightUpperLeg');
  boneLUpperLeg   = h.getNormalizedBoneNode('leftUpperLeg');
  boneRUpperLeg   = h.getNormalizedBoneNode('rightUpperLeg');
  boneLLowerLeg   = h.getNormalizedBoneNode('leftLowerLeg');
  boneRLowerLeg   = h.getNormalizedBoneNode('rightLowerLeg');
  boneLFoot       = h.getNormalizedBoneNode('leftFoot');
  boneRFoot       = h.getNormalizedBoneNode('rightFoot');
  boneLToes       = h.getNormalizedBoneNode('leftToes');
  boneRToes       = h.getNormalizedBoneNode('rightToes');
  boneLUpperArm   = h.getNormalizedBoneNode('leftUpperArm');
  boneRUpperArm   = h.getNormalizedBoneNode('rightUpperArm');
  boneLLowerArm   = h.getNormalizedBoneNode('leftLowerArm');
  boneRLowerArm   = h.getNormalizedBoneNode('rightLowerArm');
  boneLHand       = h.getNormalizedBoneNode('leftHand');
  boneRHand       = h.getNormalizedBoneNode('rightHand');

  // ── Finger bones — VRM0 humanoid names ──
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

  // Teeth mesh — fake mouth open by translating it down slightly
  vrm.scene.traverse(n => { if (n.name === 'Teeth') teethNode = n; });

  console.log('Bones cached:', { boneHead, boneSpine, boneLHand, boneRHand, boneLFoot, boneRFoot });
  console.log('Fingers:', { boneL_IndexPx, boneR_IndexPx, boneL_ThumbPx, boneR_ThumbPx });
  console.log('Teeth node:', teethNode?.name);
}

// ================================================================
//  PHASE 1A — IDLE PACING SYSTEM
//  She walks left/right across the stage naturally.
//  Uses a simple waypoint system: pick a target X, walk to it,
//  pause, pick another. Leg/hip bones animate in sync.
// ================================================================

// ================================================================
//  ACTIVITY SYSTEM — replaces pacing
//  She stays centred, facing camera, and cycles through fun
//  idle activities: darts throw, basketball shot, shimmy/dance,
//  and stretching. Each runs as an animation loop with a timer.
// ================================================================

const ACTIVITY = {
  current:   'idle',   // current activity name
  timer:     0,        // time spent in current activity
  duration:  8,        // how long before picking next (seconds)
  phase:     0,        // time accumulator within current activity
};

// Activities per room — she only does activities that fit where she is
const ACTIVITY_POOLS = {
  studio:        ['darts', 'basketball', 'dance', 'stretch', 'hairflick', 'hiponhip', 'idle', 'typing', 'monitor', 'noseCover'],
  kitchen:       ['stirring', 'chopping', 'tasting', 'hairflick', 'hiponhip', 'idle', 'noseCover'],
  'living-room': ['sofaSit', 'tvReact', 'phoneScroll', 'hairflick', 'hiponhip', 'idle', 'dance', 'stretch'],
  office:        ['typing', 'monitor', 'stretch', 'hairflick', 'idle', 'noseCover'],
  beauty:        ['mirrorPose', 'hairflick', 'hiponhip', 'idle', 'noseCover'],
  bedroom:       ['sofaSit', 'phoneScroll', 'stretch', 'hairflick', 'idle', 'noseCover'],
  bathroom:      ['mirrorPose', 'hairflick', 'stretch', 'idle', 'noseCover'],
};
// Fallback pool when room has no specific entry
const ACTIVITY_POOL = ACTIVITY_POOLS.studio;
let _lastActivity = 'idle';

function activityPickNext() {
  const pool = ACTIVITY_POOLS[_currentRoom] || ACTIVITY_POOL;
  const choices = pool.filter(a => a !== _lastActivity);
  const next    = choices[Math.floor(Math.random() * choices.length)];
  _lastActivity        = next;
  ACTIVITY.current     = next;
  ACTIVITY.timer       = 0;
  ACTIVITY.phase       = 0;
  ACTIVITY.duration    = 6 + Math.random() * 8; // 6–14s per activity
}

function activityUpdate(delta) {
  if (!vrm || hyper.active || gesture) return;

  ACTIVITY.timer += delta;
  ACTIVITY.phase += delta;

  if (ACTIVITY.timer > ACTIVITY.duration) activityPickNext();

  const t = ACTIVITY.phase;

  switch (ACTIVITY.current) {

    // ── DARTS ─────────────────────────────────────────────────
    case 'darts': {
      const cycle = t % 3.5;
      if (cycle < 0.9) {
        // Wind-up: hip pops to one side, right arm pulls back, wrist cocked
        const p = cycle / 0.9;
        if (boneHips)      { boneHips.rotation.z = 0.1 + p * 0.08; boneHips.rotation.y = p * 0.12; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.0 - p * 0.8); boneRUpperArm.rotation.x = -p * 0.4; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.3 + p * 0.5); boneRLowerArm.rotation.x = p * 0.25; }
        if (boneRHand)     { boneRHand.rotation.z = -0.3 - p * 0.2; boneRHand.rotation.x = -p * 0.15; } // wrist cock
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.85; boneLUpperArm.rotation.x = 0.1; }
        if (boneLHand)     { boneLHand.rotation.z = 0.2; } // other hand relaxed
        if (boneSpine)     boneSpine.rotation.y = p * 0.15;
        if (boneHead)      boneHead.rotation.y = -p * 0.12;
        // Foot: left heel lifts slightly for pose
        if (boneLFoot)     boneLFoot.rotation.x = -0.05 - p * 0.08;
      } else if (cycle < 1.15) {
        // Snap throw — arm whips forward, wrist snaps through
        const p = (cycle - 0.9) / 0.25;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.2 - p * 0.05); boneRUpperArm.rotation.x = -0.4 + p * 1.1; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.8 - p * 0.55); boneRLowerArm.rotation.x = 0.25 - p * 0.1; }
        if (boneRHand)     { boneRHand.rotation.z = -0.5 + p * 0.4; boneRHand.rotation.x = 0.15; } // wrist snap
        if (boneSpine)     boneSpine.rotation.y = 0.15 - p * 0.15;
        if (boneHead)      boneHead.rotation.y = -0.12 + p * 0.12;
        setExpression('excited');
        setBS('O', p * 0.25); // mouth opens on throw
      } else if (cycle < 2.4) {
        // Follow-through: arm extended, she watches the dart, hip still popped
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.15; boneRUpperArm.rotation.x = 0.7; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.25; boneRLowerArm.rotation.x = 0.15; }
        if (boneRHand)     { boneRHand.rotation.z = -0.1; boneRHand.rotation.x = 0.12; }
        if (boneLUpperArm) boneLUpperArm.rotation.z = 0.85;
        if (boneLHand)     { boneLHand.rotation.z = 0.2; boneLHand.rotation.x = 0.08; }
        if (boneHead)      boneHead.rotation.x = 0.06; // watching dart
        if (boneHips)      boneHips.rotation.z = 0.1;  // hip still popped
        setExpression('happy');
        setBS('O', 0);
      } else {
        // Reset: arm comes down, she gives a little satisfied hip pop
        const p = (cycle - 2.4) / 1.1;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.15 - p * 0.73; boneRUpperArm.rotation.x = 0.7 - p * 0.62; }
        if (boneRHand)     { boneRHand.rotation.z = -0.1 - p * 0.1; }
        if (boneHips)      { boneHips.rotation.z = 0.1 - p * 0.04; } // settle back
        setExpression('neutral');
        setBS('O', 0);
      }
      break;
    }

    // ── BASKETBALL ────────────────────────────────────────────
    case 'basketball': {
      const cycle = t % 4.2;
      if (cycle < 1.6) {
        // Dribble: bouncy with hip groove, arms loose and girly
        const bounce = Math.abs(Math.sin(cycle * 7)) * 0.2;
        const groove = Math.sin(cycle * 3.5) * 0.06;
        if (boneHips)      { boneHips.rotation.z = groove * 1.2; boneHips.rotation.y = groove * 0.5; }
        if (boneSpine)     { boneSpine.rotation.z = -groove * 0.6; }
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.85 + bounce * 0.3; boneLUpperArm.rotation.x = 0.25 + bounce; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.85 + bounce * 0.3); boneRUpperArm.rotation.x = 0.25 + bounce; }
        if (boneLLowerArm) boneLLowerArm.rotation.z =  0.4 + bounce * 0.3;
        if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.4 + bounce * 0.3);
        if (boneLHand)     { boneLHand.rotation.z = 0.2 + bounce * 0.15; boneLHand.rotation.x = 0.05; }
        if (boneRHand)     { boneRHand.rotation.z = -(0.2 + bounce * 0.15); boneRHand.rotation.x = 0.05; }
        // Feet: little bounce step
        if (boneLFoot)     boneLFoot.rotation.x = -0.05 + Math.abs(Math.sin(cycle * 7)) * 0.06;
        if (boneRFoot)     boneRFoot.rotation.x = -0.05 + Math.abs(Math.sin(cycle * 7 + 1)) * 0.06;
        setExpression('neutral');
      } else if (cycle < 2.3) {
        // Set shot: hands rise, she bends knees, hip dips
        const p = (cycle - 1.6) / 0.7;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.85 - p * 0.65; boneLUpperArm.rotation.x = p * 0.55; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.85 - p * 0.65); boneRUpperArm.rotation.x = p * 0.55; }
        if (boneLLowerArm) boneLLowerArm.rotation.z =  0.4 + p * 0.35;
        if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.4 + p * 0.35);
        if (boneLHand)     { boneLHand.rotation.z =  0.15; boneLHand.rotation.x = p * 0.1; }
        if (boneRHand)     { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = p * 0.1; }
        if (boneHips)      boneHips.rotation.x = -p * 0.1;
        if (boneLUpperLeg) boneLUpperLeg.rotation.x = p * 0.18;
        if (boneRUpperLeg) boneRUpperLeg.rotation.x = p * 0.18;
        setExpression('neutral');
      } else if (cycle < 2.8) {
        // RELEASE: shoots up, toes lift, body extends fully, mouth "ahh"
        const p = (cycle - 2.3) / 0.5;
        const jumpY = Math.sin(p * Math.PI) * 0.15;
        if (vrm) vrm.scene.position.y = jumpY;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.2 - p * 0.18; boneLUpperArm.rotation.x = 0.55 + p * 0.35; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.2 - p * 0.18); boneRUpperArm.rotation.x = 0.55 + p * 0.35; }
        if (boneLHand)     { boneLHand.rotation.z = 0.1 + p * 0.15; boneLHand.rotation.x = p * 0.12; }
        if (boneRHand)     { boneRHand.rotation.z = -(0.1 + p * 0.15); boneRHand.rotation.x = p * 0.12; }
        if (boneHips)      boneHips.rotation.x = -0.1 + p * 0.15;
        if (boneLUpperLeg) boneLUpperLeg.rotation.x = 0.18 - p * 0.25;
        if (boneRUpperLeg) boneRUpperLeg.rotation.x = 0.18 - p * 0.25;
        // Toes point on jump
        if (boneLFoot)     boneLFoot.rotation.x = -0.05 - p * 0.18;
        if (boneRFoot)     boneRFoot.rotation.x = -0.05 - p * 0.18;
        if (boneLToes)     boneLToes.rotation.x =  0.08 + p * 0.12;
        if (boneRToes)     boneRToes.rotation.x =  0.08 + p * 0.12;
        if (boneHead)      boneHead.rotation.x = p * 0.12;
        setExpression('excited');
        setBS('O', p * 0.4); // mouth opens
      } else {
        // Land + watch — arms fall, she poses watching, one hip out
        if (vrm) vrm.scene.position.y = vrm._restPosY || 0;
        if (boneLUpperArm) boneLUpperArm.rotation.z = 0.75;
        if (boneRUpperArm) boneRUpperArm.rotation.z = -0.75;
        if (boneLHand)     { boneLHand.rotation.z =  0.2; boneLHand.rotation.x = 0.08; }
        if (boneRHand)     { boneRHand.rotation.z = -0.2; boneRHand.rotation.x = 0.08; }
        if (boneHead)      boneHead.rotation.x = 0.14; // watching
        if (boneHips)      boneHips.rotation.z = 0.08; // hip pop
        setExpression('happy');
        setBS('O', 0);
      }
      break;
    }

    // ── DANCE / SHIMMY ────────────────────────────────────────
    case 'dance': {
      const shimmy  = Math.sin(t * 6.5);
      const bob     = Math.abs(Math.sin(t * 6.5)) * 0.055;
      const armSwing = Math.sin(t * 3.25); // half speed — alternate arms

      if (boneHips)  { boneHips.rotation.z = shimmy * 0.16; boneHips.rotation.y = shimmy * 0.09; boneHips.rotation.x = bob * 0.4; }
      if (boneSpine) { boneSpine.rotation.z = -shimmy * 0.09; boneSpine.rotation.x = bob * 0.8; boneSpine.rotation.y = shimmy * 0.03; }
      if (boneChest) { boneChest.rotation.z = shimmy * 0.06; boneChest.rotation.x = bob * 0.5; }

      // Arms: alternating wave + wrist flick
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.65 + Math.sin(t*6.5+1.5)*0.28; boneLUpperArm.rotation.x = 0.18 + bob * 0.5; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.65 + Math.sin(t*6.5)*0.28); boneRUpperArm.rotation.x = 0.18 + bob * 0.5; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.5 + Math.sin(t*6.5+0.8)*0.2; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.5 + Math.sin(t*6.5-0.8)*0.2); }
      // Wrist flick — fast, snappy, feminine
      if (boneLHand) { boneLHand.rotation.z = 0.25 + Math.sin(t*9)*0.18; boneLHand.rotation.x = 0.08 + Math.sin(t*7)*0.06; boneLHand.rotation.y = Math.sin(t*5)*0.08; }
      if (boneRHand) { boneRHand.rotation.z = -(0.25 + Math.sin(t*9+1)*0.18); boneRHand.rotation.x = 0.08 + Math.sin(t*7+1)*0.06; boneRHand.rotation.y = Math.sin(t*5+1)*0.08; }

      // Legs: step-touch weight shift
      if (boneLUpperLeg) { boneLUpperLeg.rotation.z = shimmy * 0.08; boneLUpperLeg.rotation.x = bob * 0.3; }
      if (boneRUpperLeg) { boneRUpperLeg.rotation.z = -shimmy * 0.08; boneRUpperLeg.rotation.x = bob * 0.3; }
      // Heel lifts alternate with shimmy
      if (boneLFoot) { boneLFoot.rotation.x = -0.04 + Math.max(0, shimmy) * 0.12; }
      if (boneRFoot) { boneRFoot.rotation.x = -0.04 + Math.max(0, -shimmy) * 0.12; }
      if (boneLToes) boneLToes.rotation.x = 0.08 + Math.max(0, shimmy) * 0.08;
      if (boneRToes) boneRToes.rotation.x = 0.08 + Math.max(0, -shimmy) * 0.08;

      // Head bobs and tilts with the music
      if (boneHead) { boneHead.rotation.z = Math.sin(t * 3.25) * 0.06; boneHead.rotation.y = shimmy * 0.05; }

      setExpression('happy');
      // Mouth opens and closes to the beat
      setBS('A', Math.max(0, Math.sin(t * 6.5)) * 0.22);
      break;
    }

    // ── STRETCH ───────────────────────────────────────────────
    case 'stretch': {
      const cycle = t % 6.0;
      if (cycle < 1.2) {
        // Arms rise overhead — she reaches up, hips counter-shift, toes point
        const p = Math.min(cycle / 1.0, 1);
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 1.0 - p * 1.08; boneLUpperArm.rotation.x = p * 0.18; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.0 - p * 1.08); boneRUpperArm.rotation.x = p * 0.18; }
        if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.35 - p * 0.3; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.35 - p * 0.3); }
        // Hands: fingers reach up, wrists extend
        if (boneLHand) { boneLHand.rotation.z = 0.2 - p * 0.3; boneLHand.rotation.x = -p * 0.12; }
        if (boneRHand) { boneRHand.rotation.z = -(0.2 - p * 0.3); boneRHand.rotation.x = -p * 0.12; }
        if (boneSpine) { boneSpine.rotation.x = -p * 0.08; boneSpine.rotation.z = Math.sin(p*2)*0.02; }
        if (boneHips)  { boneHips.rotation.z = Math.sin(p*3)*0.04; } // hip shifts as she reaches
        // Heel lift: she rises onto toes
        if (boneLFoot) boneLFoot.rotation.x = -0.05 - p * 0.15;
        if (boneRFoot) boneRFoot.rotation.x = -0.05 - p * 0.15;
        if (boneLToes) boneLToes.rotation.x = 0.08 + p * 0.1;
        if (boneRToes) boneRToes.rotation.x = 0.08 + p * 0.1;
        setExpression('neutral');
        setBS('O', p * 0.15); // soft "ooh" as she stretches
      } else if (cycle < 4.0) {
        // Hold the stretch + gentle sway — feels good
        const sway = Math.sin(t * 1.2) * 0.04;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = -0.08 + sway; boneLUpperArm.rotation.x = 0.18; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -(- 0.08 + sway); boneRUpperArm.rotation.x = 0.18; }
        if (boneLHand) { boneLHand.rotation.z = -0.1 + Math.sin(t*1.8)*0.05; boneLHand.rotation.x = -0.12; }
        if (boneRHand) { boneRHand.rotation.z = 0.1 - Math.sin(t*1.8)*0.05; boneRHand.rotation.x = -0.12; }
        if (boneSpine) { boneSpine.rotation.x = -0.08 + Math.sin(t * 0.7) * 0.02; boneSpine.rotation.z = sway * 0.5; }
        if (boneHips)  { boneHips.rotation.z = Math.sin(t * 0.9) * 0.05; }
        // Stay on toes
        if (boneLFoot) boneLFoot.rotation.x = -0.2;
        if (boneRFoot) boneRFoot.rotation.x = -0.2;
        if (boneLToes) boneLToes.rotation.x = 0.18;
        if (boneRToes) boneRToes.rotation.x = 0.18;
        setBS('O', 0.12); // soft held breath
      } else {
        // Arms come back down — she exhales, settles, hip pops
        const p = (cycle - 4.0) / 2.0;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = -0.08 + p * 1.08; boneLUpperArm.rotation.x = 0.18 - p * 0.13; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -((-0.08 + p * 1.08)); boneRUpperArm.rotation.x = 0.18 - p * 0.13; }
        if (boneLHand) { boneLHand.rotation.z = -0.1 + p * 0.3; boneLHand.rotation.x = -0.12 + p * 0.2; }
        if (boneRHand) { boneRHand.rotation.z = 0.1 - p * 0.3; boneRHand.rotation.x = -0.12 + p * 0.2; }
        if (boneSpine) { boneSpine.rotation.x = -0.08 + p * 0.1; }
        if (boneHips)  { boneHips.rotation.z = 0.06 * Math.sin(p * Math.PI); } // satisfying hip pop on settle
        // Heels lower back down
        if (boneLFoot) boneLFoot.rotation.x = -0.2 + p * 0.15;
        if (boneRFoot) boneRFoot.rotation.x = -0.2 + p * 0.15;
        if (boneLToes) boneLToes.rotation.x = 0.18 - p * 0.1;
        if (boneRToes) boneRToes.rotation.x = 0.18 - p * 0.1;
        setExpression('neutral');
        setBS('O', 0.12 - p * 0.12); // exhale
      }
      break;
    }

    // ── HAIR FLICK ────────────────────────────────────────────
    // Raises one hand to hair, flicks/fixes it, gives a little smirk
    case 'hairflick': {
      const cycle = t % 5.0;
      if (cycle < 0.6) {
        // Right hand rises to hair
        const p = cycle / 0.6;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0 + p * 0.55; boneRUpperArm.rotation.x = p * 0.65; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.35 - p * 0.2); boneRLowerArm.rotation.x = p * 0.3; }
        if (boneRHand)     { boneRHand.rotation.z = -(0.18 + p * 0.15); boneRHand.rotation.x = -p * 0.1; }
        if (boneHips)      boneHips.rotation.z = 0.08; // hip out
        if (boneHead)      boneHead.rotation.z = -p * 0.06; // head tilts into it
      } else if (cycle < 2.5) {
        // Hold at hair + flick motion x2
        const flick = Math.sin((cycle - 0.6) * 6) * 0.12;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.45; boneRUpperArm.rotation.x = 0.65 + flick * 0.2; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.15; boneRLowerArm.rotation.x = 0.3 + Math.abs(flick) * 0.15; }
        if (boneRHand)     { boneRHand.rotation.z = -0.33 + flick; boneRHand.rotation.y = flick * 0.5; } // wrist flick
        if (boneHead)      { boneHead.rotation.z = -0.06 + Math.sin((cycle-0.6)*3)*0.03; }
        if (boneHips)      boneHips.rotation.z = 0.1;
        setExpression('happy');
        setBS('I', 0.1); // little smirk
      } else if (cycle < 3.2) {
        // Hand comes down, she does a little confident pose
        const p = (cycle - 2.5) / 0.7;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.45 - p * 0.55; boneRUpperArm.rotation.x = 0.65 - p * 0.6; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.15 - p * 0.2; }
        if (boneRHand)     { boneRHand.rotation.z = -0.33 + p * 0.15; }
        if (boneHead)      boneHead.rotation.z = -0.06 + p * 0.06;
        if (boneHips)      boneHips.rotation.z = 0.1 + Math.sin(p * Math.PI) * 0.06; // extra hip pop
        setExpression('happy');
        setBS('I', 0.1 - p * 0.1);
      } else {
        // Idle pose — left hand on hip, confident slay
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.65; boneLUpperArm.rotation.x = 0.15; }
        if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.8; boneLLowerArm.rotation.x = 0.3; }
        if (boneLHand)     { boneLHand.rotation.z = 0.3; boneLHand.rotation.x = 0.1; }
        if (boneHips)      boneHips.rotation.z = 0.1;
        setExpression('neutral');
        setBS('I', 0);
      }
      break;
    }

    // ── HIP ON HIP — classic sassy pose + bob ─────────────────
    case 'hiponhip': {
      const bob = Math.sin(t * 2.2) * 0.06;
      const sway = Math.sin(t * 1.1) * 0.05;

      if (boneHips)  { boneHips.rotation.z = 0.12 + bob; boneHips.rotation.y = sway * 0.3; }
      if (boneSpine) { boneSpine.rotation.z = -0.06 - bob * 0.4; boneSpine.rotation.x = 0.02; }
      if (boneChest) { boneChest.rotation.z = -0.03; }

      // Right hand on hip
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.75; boneRUpperArm.rotation.x = 0.35; boneRUpperArm.rotation.y = 0.3; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.6; boneRLowerArm.rotation.x = 0.1; }
      if (boneRHand)     { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = 0.3; boneRHand.rotation.y = -0.2; }

      // Left arm: sassy gesture — floats out slightly with wrist limp
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.72 + Math.sin(t*1.8)*0.06; boneLUpperArm.rotation.x = 0.1; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.45 + Math.sin(t*1.8)*0.04; }
      if (boneLHand)     { boneLHand.rotation.z = 0.28 + Math.sin(t*2.5)*0.08; boneLHand.rotation.y = Math.sin(t*2)*0.06; boneLHand.rotation.x = 0.08; }

      // Head: confident slow nod + glance side
      if (boneHead) { boneHead.rotation.z = Math.sin(t*1.1)*0.04; boneHead.rotation.y = Math.sin(t*0.7)*0.06; }

      // Weight on right leg — left leg slightly crossed/kicked out
      if (boneLUpperLeg) { boneLUpperLeg.rotation.z = -0.06 + sway * 0.5; }
      if (boneRUpperLeg) { boneRUpperLeg.rotation.z = 0.08; }
      if (boneLFoot)     { boneLFoot.rotation.z = -0.06; boneLFoot.rotation.x = -0.04; }
      if (boneRFoot)     { boneRFoot.rotation.x = -0.03; }

      setExpression('neutral');
      // Periodic little lip pout
      const pout = Math.sin(t * 0.8) * 0.5 + 0.5;
      setBS('U', pout * 0.1);
      break;
    }

    // ── TYPING ────────────────────────────────────────────────
    // She leans slightly toward the desk and types — head tilted down at keyboard
    case 'typing': {
      const cycle = t % 1.2;
      // Fingers tap in alternating rhythm
      const tapL = Math.sin(t * 12.5) > 0 ? Math.abs(Math.sin(t * 12.5)) * 0.08 : 0;
      const tapR = Math.sin(t * 12.5 + Math.PI) > 0 ? Math.abs(Math.sin(t * 12.5 + Math.PI)) * 0.08 : 0;

      // Lean forward, arms extended toward desk
      if (boneSpine) { boneSpine.rotation.x = 0.12 + Math.sin(t*0.6)*0.02; boneSpine.rotation.z = Math.sin(t*0.4)*0.02; }
      if (boneChest) boneChest.rotation.x = 0.08;
      if (boneHead)  { boneHead.rotation.x = 0.18; boneHead.rotation.z = Math.sin(t*0.5)*0.03; } // looking down at keyboard
      if (boneHips)  boneHips.rotation.z = Math.sin(t*0.9)*0.04;

      // Arms reach forward/down toward keyboard position
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.72; boneLUpperArm.rotation.x = 0.35 + Math.sin(t*0.7)*0.03; boneLUpperArm.rotation.y = -0.15; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.72; boneRUpperArm.rotation.x = 0.35 + Math.sin(t*0.7+0.5)*0.03; boneRUpperArm.rotation.y = 0.15; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.4; boneLLowerArm.rotation.x = 0.35; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.4; boneRLowerArm.rotation.x = 0.35; }

      // Hands hover with typing motion — wrists flat, fingers tap
      if (boneLHand) { boneLHand.rotation.z = 0.08 + tapL; boneLHand.rotation.x = -0.12 + tapL * 0.5; }
      if (boneRHand) { boneRHand.rotation.z = -(0.08 + tapR); boneRHand.rotation.x = -0.12 + tapR * 0.5; }

      // Brief glance up at monitor every few seconds
      if (t % 4.5 < 0.8) {
        const glance = Math.min(t % 4.5 / 0.4, 1) * (1 - Math.max(0, (t % 4.5 - 0.5) / 0.3));
        if (boneHead) boneHead.rotation.x = 0.18 - glance * 0.2;
        setExpression('neutral');
      } else {
        setExpression('neutral');
      }

      setBS('I', Math.sin(t * 0.4) * 0.06 + 0.04); // slight lip press concentration face
      // Keyboard LED pulse when typing
      if (keyboardMesh) {
        const glowMat = keyboardMesh.children ? null : null; // skip if no children
      }
      break;
    }

    // ── MONITOR LOOK ─────────────────────────────────────────
    // She tilts toward the monitor — head turns, leans in, reacts with expression
    case 'monitor': {
      const cycle = t % 7.0;
      if (cycle < 1.0) {
        // Turn and lean toward monitor
        const p = cycle / 1.0;
        if (boneSpine) { boneSpine.rotation.y = -p * 0.12; boneSpine.rotation.x = p * 0.06; }
        if (boneHead)  { boneHead.rotation.y = -p * 0.2; boneHead.rotation.x = p * 0.08; }
        if (boneHips)  boneHips.rotation.z = p * 0.07;
        // Left arm points/gestures at screen
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.8 - p * 0.35; boneLUpperArm.rotation.x = p * 0.2; boneLUpperArm.rotation.y = -p * 0.18; }
        if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.5 - p * 0.1; }
        if (boneLHand)     { boneLHand.rotation.z = 0.25; boneLHand.rotation.x = 0.08; }
        setExpression('neutral');
      } else if (cycle < 5.0) {
        // Reading the screen — subtle head movement, occasional reaction
        const reading = cycle - 1.0;
        if (boneSpine) { boneSpine.rotation.y = -0.12; boneSpine.rotation.x = 0.06 + Math.sin(reading * 0.4) * 0.01; }
        if (boneHead)  { boneHead.rotation.y = -0.2 + Math.sin(reading * 0.35) * 0.04; boneHead.rotation.x = 0.08 + Math.sin(reading * 0.6) * 0.02; }
        if (boneHips)  boneHips.rotation.z = 0.07 + Math.sin(reading * 0.5) * 0.02;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.45; boneLUpperArm.rotation.x = 0.2; }
        if (boneLLowerArm) boneLLowerArm.rotation.z = 0.4;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.85 + Math.sin(reading*0.8)*0.05; boneRUpperArm.rotation.x = 0.08; }
        // React to something on screen
        if (reading > 2.5 && reading < 3.2) {
          setExpression('surprised');
          setBS('O', Math.sin((reading - 2.5) / 0.7 * Math.PI) * 0.3);
        } else {
          setExpression('neutral');
          setBS('O', 0);
        }
        // Monitor glow intensifies
        if (monitorGlowLight) monitorGlowLight.intensity = 1.2 + Math.sin(reading * 2) * 0.3;
      } else {
        // Turn back to face camera
        const p = (cycle - 5.0) / 2.0;
        if (boneSpine) { boneSpine.rotation.y = -0.12 + p * 0.12; boneSpine.rotation.x = 0.06 - p * 0.06; }
        if (boneHead)  { boneHead.rotation.y = -0.2 + p * 0.2; boneHead.rotation.x = 0.08 - p * 0.08; }
        if (boneHips)  boneHips.rotation.z = 0.07 - p * 0.07;
        if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.45 + p * 0.45; boneLUpperArm.rotation.x = 0.2 - p * 0.12; }
        if (monitorGlowLight) monitorGlowLight.intensity = 1.2 - p * 0.4;
        setExpression('happy');
      }
      break;
    }

    // ── NOSE COVER TREND ─────────────────────────────────────
    // The viral gesture: right hand cups over nose/mouth,
    // then dramatically sweeps outward like "giving way" / dismissing.
    // Body language: slight lean back, chin tilt up, confident slay energy.
    case 'noseCover': {
      const cycle = t % 5.5;
      if (cycle < 0.5) {
        // ── Phase 1: arm lifts, hand rises toward face ──
        const p = cycle / 0.5;
        const ep = 3*p*p - 2*p*p*p; // ease in-out
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0 + ep * 0.52; boneRUpperArm.rotation.x = ep * 0.55; boneRUpperArm.rotation.y = ep * 0.12; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.35 - ep * 0.1); boneRLowerArm.rotation.x = ep * 0.35; }
        if (boneRHand)     { boneRHand.rotation.x = -ep * 0.45; boneRHand.rotation.z = -(0.18 - ep*0.12); boneRHand.rotation.y = ep * 0.25; } // rotate palm inward toward face
        setRightFingerCoverNose();
        if (boneHips)  boneHips.rotation.z = ep * 0.06;
        if (boneSpine) boneSpine.rotation.x = -ep * 0.04; // slight lean back
        if (boneHead)  { boneHead.rotation.x = ep * 0.06; boneHead.rotation.z = -ep * 0.04; } // chin tips up slightly
        setExpression('neutral');
      } else if (cycle < 1.8) {
        // ── Phase 2: HOLD — hand covers nose/mouth area ──
        // Subtle breathing movement, eyes glance side
        const hold = cycle - 0.5;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.48 + Math.sin(hold*2)*0.015; boneRUpperArm.rotation.x = 0.55; boneRUpperArm.rotation.y = 0.12; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.25; boneRLowerArm.rotation.x = 0.35 + Math.sin(hold*1.5)*0.01; }
        if (boneRHand)     { boneRHand.rotation.x = -0.45; boneRHand.rotation.z = -0.06; boneRHand.rotation.y = 0.25; }
        setRightFingerCoverNose();
        if (boneHips)  boneHips.rotation.z = 0.06 + Math.sin(hold*1.2)*0.02;
        if (boneSpine) boneSpine.rotation.x = -0.04;
        if (boneHead)  { boneHead.rotation.x = 0.06; boneHead.rotation.y = Math.sin(hold*0.8)*0.05; boneHead.rotation.z = -0.04; }
        setExpression('neutral');
        setBS('I', 0.08); // slight smirk building
      } else if (cycle < 2.4) {
        // ── Phase 3: THE SWEEP — hand flicks dramatically outward ──
        // Fast, snappy — this is the "giving way / presenting" move
        const p = (cycle - 1.8) / 0.6;
        const ep = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2,3)/2; // ease-in then fast out
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.48 - ep * 0.42; boneRUpperArm.rotation.x = 0.55 - ep * 0.1; boneRUpperArm.rotation.y = 0.12 - ep * 0.3; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.25 - ep * 0.1); boneRLowerArm.rotation.x = 0.35 - ep * 0.12; boneRLowerArm.rotation.y = ep * 0.15; }
        // Wrist snaps open — fingers splay as hand sweeps
        if (boneRHand)     { boneRHand.rotation.x = -0.45 + ep * 0.5; boneRHand.rotation.z = -0.06 - ep * 0.08; boneRHand.rotation.y = 0.25 - ep * 0.55; }
        // Fingers open as they sweep — from cover to splay
        const splayAmt = ep;
        if (boneR_IndexPx) boneR_IndexPx.rotation.x = 0.55 - splayAmt * 0.55;
        if (boneR_MidPx)   boneR_MidPx.rotation.x   = 0.5  - splayAmt * 0.5;
        if (boneR_RingPx)  boneR_RingPx.rotation.x  = 0.6  - splayAmt * 0.6;
        if (boneR_PinkyPx) boneR_PinkyPx.rotation.x = 0.65 - splayAmt * 0.65;
        if (boneR_IndexMd) boneR_IndexMd.rotation.x = 0.45 - splayAmt * 0.45;
        if (boneR_MidMd)   boneR_MidMd.rotation.x   = 0.4  - splayAmt * 0.4;
        if (boneR_RingMd)  boneR_RingMd.rotation.x  = 0.5  - splayAmt * 0.5;
        if (boneR_PinkyMd) boneR_PinkyMd.rotation.x = 0.55 - splayAmt * 0.55;
        if (boneR_ThumbPx) { boneR_ThumbPx.rotation.z = 0.35 - splayAmt * 0.5; boneR_ThumbPx.rotation.y = -0.2 + splayAmt * 0.1; }
        if (boneHips)  { boneHips.rotation.z = 0.06 + ep * 0.06; } // hip pops as she sweeps
        if (boneSpine) { boneSpine.rotation.x = -0.04 + ep * 0.06; }
        if (boneHead)  { boneHead.rotation.x = 0.06 - ep * 0.06; boneHead.rotation.z = -0.04; }
        setExpression('excited');
        setBS('I', 0.08 + ep * 0.14); // confident smirk widens
      } else if (cycle < 3.8) {
        // ── Phase 4: POSE — arm held out after sweep, she slays ──
        const hold2 = cycle - 2.4;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.9 + Math.sin(hold2*1.5)*0.02; boneRUpperArm.rotation.x = 0.45; boneRUpperArm.rotation.y = -0.18; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.15; boneRLowerArm.rotation.x = 0.23; boneRLowerArm.rotation.y = 0.15; }
        if (boneRHand)     { boneRHand.rotation.x = 0.05; boneRHand.rotation.z = -0.14; boneRHand.rotation.y = -0.3; }
        setRightFingerWave(hold2);
        if (boneHips)  boneHips.rotation.z = 0.12 + Math.sin(hold2*1.1)*0.03;
        if (boneSpine) { boneSpine.rotation.z = -0.06; boneSpine.rotation.x = 0.02; }
        if (boneHead)  { boneHead.rotation.z = Math.sin(hold2*0.9)*0.03; boneHead.rotation.y = -Math.sin(hold2*0.5)*0.04; }
        setExpression('happy');
        setBS('I', 0.18); // big confident smirk / side-smile
      } else {
        // ── Phase 5: settle back ──
        const p = (cycle - 3.8) / 1.7;
        const ep = 3*p*p - 2*p*p*p;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.9 - ep * 0.1; boneRUpperArm.rotation.x = 0.45 - ep * 0.4; boneRUpperArm.rotation.y = -0.18 + ep * 0.23; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.15 - ep * 0.2; boneRLowerArm.rotation.x = 0.23 - ep * 0.28; }
        if (boneRHand)     { boneRHand.rotation.x = 0.05 + ep * 0.07; boneRHand.rotation.z = -0.14 - ep * 0.04; boneRHand.rotation.y = -0.3 + ep * 0.12; }
        setRightFingerRelax();
        if (boneHips)  boneHips.rotation.z = 0.12 - ep * 0.06;
        if (boneSpine) boneSpine.rotation.z = -0.06 + ep * 0.06;
        setExpression('neutral');
        setBS('I', 0.18 - ep * 0.18);
      }
      break;
    }

    // ── STIRRING THE POT (kitchen) ───────────────────────────────
    // She leans slightly forward over the stove, right arm makes
    // slow clockwise circles as if stirring a pot. Left hand rests.
    // Head tilts down to watch. Occasional satisfied expression.
    case 'stirring': {
      const cycle = t % 2.2; // one stir revolution = 2.2s
      const ang   = (t / 2.2) * Math.PI * 2; // continuous angle
      const stirX = Math.sin(ang) * 0.18;
      const stirZ = Math.cos(ang) * 0.18;
      const leanIn = 0.12 + Math.sin(t * 0.4) * 0.02;

      // Body leans toward stove
      if (boneSpine) { boneSpine.rotation.x = leanIn; boneSpine.rotation.z = Math.sin(t * 0.3) * 0.02; }
      if (boneChest) boneChest.rotation.x = 0.06;
      if (boneHead)  { boneHead.rotation.x = 0.2; boneHead.rotation.z = Math.sin(t * 0.5) * 0.03; } // watching pot

      // Right arm: circular stirring motion
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.7; boneRUpperArm.rotation.x = 0.55 + stirX * 0.3; boneRUpperArm.rotation.y = stirZ * 0.2; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.35; boneRLowerArm.rotation.x = 0.3 + Math.abs(stirX) * 0.15; }
      if (boneRHand)     { boneRHand.rotation.x = -0.15 + stirX * 0.2; boneRHand.rotation.z = -0.12 + stirZ * 0.12; }

      // Left hand: resting on counter edge, relaxed
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.65; boneLUpperArm.rotation.x = 0.3; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.4; boneLLowerArm.rotation.x = 0.2; }
      if (boneLHand)     { boneLHand.rotation.z = 0.2; boneLHand.rotation.x = 0.08; }

      if (boneHips) boneHips.rotation.z = 0.06 + Math.sin(t * 0.7) * 0.03;

      // Occasional reaction — smells good, slight satisfied expression
      if (t % 5.5 < 1.2) setExpression('happy');
      else setExpression('neutral');
      setBS('O', Math.sin(t * 0.8) * 0.04 + 0.02); // mouth slightly open in concentration
      break;
    }

    // ── CHOPPING (kitchen) ────────────────────────────────────────
    // Right arm makes sharp downward chop motions over the cutting board.
    // Body has rhythm, head watches the board, left hand holds the food.
    case 'chopping': {
      const cycle = t % 0.7; // chop rhythm
      const chop  = Math.max(0, Math.sin((cycle / 0.7) * Math.PI * 2)); // 0–1 chop pulse
      const isDown = cycle < 0.35;

      // Lean over the board
      if (boneSpine) { boneSpine.rotation.x = 0.16 + chop * 0.04; boneSpine.rotation.z = Math.sin(t * 0.3) * 0.02; }
      if (boneHead)  { boneHead.rotation.x = 0.22; }

      // Right arm: sharp chop — fast down, slower raise
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.65; boneRUpperArm.rotation.x = 0.35 + (isDown ? chop * 0.55 : 0.3 - chop * 0.3); }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.3; boneRLowerArm.rotation.x = 0.2 + (isDown ? chop * 0.45 : 0.2); }
      if (boneRHand)     { boneRHand.rotation.x = -0.1 + chop * 0.1; boneRHand.rotation.z = -0.18; } // gripping knife

      // Left hand: holding the food, slight protective curl inward
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.6; boneLUpperArm.rotation.x = 0.45; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.38; boneLLowerArm.rotation.x = 0.3; }
      if (boneLHand)     { boneLHand.rotation.z = 0.25; boneLHand.rotation.x = -0.15; boneLHand.rotation.y = 0.1; } // claw grip

      if (boneHips) boneHips.rotation.z = 0.05 + Math.sin(t * 1.4) * 0.025; // weight shifts with rhythm

      setExpression('neutral');
      setBS('I', 0.06); // focused lip press
      break;
    }

    // ── TASTING FROM SPOON (kitchen) ──────────────────────────────
    // Picks up the cooking spoon, brings it to her mouth for a taste.
    // Reacts — either approves (happy) or thinks it needs something (hmm).
    case 'tasting': {
      const cycle = t % 6.0;
      if (cycle < 0.8) {
        // Reach for the spoon
        const p = cycle / 0.8;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.9 + p * 0.35; boneRUpperArm.rotation.x = p * 0.3; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.3; boneRLowerArm.rotation.x = p * 0.25; }
        if (boneHead)      boneHead.rotation.x = p * 0.08;
        setExpression('neutral');
      } else if (cycle < 1.8) {
        // Bring spoon to mouth — arm rises, head tips forward
        const p = (cycle - 0.8) / 1.0;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.55 + p * 0.1; boneRUpperArm.rotation.x = 0.3 + p * 0.35; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.3 - p * 0.1; boneRLowerArm.rotation.x = 0.25 + p * 0.2; }
        if (boneRHand)     { boneRHand.rotation.x = -p * 0.2; }
        if (boneHead)      { boneHead.rotation.x = 0.08 + p * 0.1; boneHead.rotation.z = p * 0.03; }
        if (boneHips)      boneHips.rotation.z = p * 0.05;
        setExpression('neutral');
      } else if (cycle < 2.5) {
        // TASTE — mouth opens, little reaction
        const p = (cycle - 1.8) / 0.7;
        setExpression(p > 0.4 ? 'happy' : 'neutral');
        setBS('O', Math.sin(p * Math.PI) * 0.35); // mouth opens for tasting
        if (boneHead) boneHead.rotation.x = 0.18 + Math.sin(p * Math.PI) * 0.04;
      } else if (cycle < 4.2) {
        // React and consider — she nods or tilts head like "hmm that's good"
        const react = cycle - 2.5;
        setExpression('happy');
        setBS('O', 0);
        if (boneHead) { boneHead.rotation.x = 0.1 + Math.sin(react * 1.5) * 0.06; boneHead.rotation.y = Math.sin(react * 0.8) * 0.06; }
        if (boneHips) boneHips.rotation.z = 0.08 + Math.sin(react * 0.9) * 0.03;
        setBS('I', Math.sin(react * 1.2) * 0.08 + 0.04); // little satisfied smirk
      } else {
        // Put spoon back, return to normal stance
        const p = (cycle - 4.2) / 1.8;
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.45 - p * 0.55; boneRUpperArm.rotation.x = 0.65 - p * 0.6; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.4 - p * 0.05; boneRLowerArm.rotation.x = 0.45 - p * 0.4; }
        if (boneHead)      boneHead.rotation.x = 0.1 - p * 0.1;
        if (boneHips)      boneHips.rotation.z = 0.08 - p * 0.08;
        setExpression('neutral');
        setBS('I', 0);
      }
      break;
    }

    // ── SOFA SIT (living room) ────────────────────────────────────
    // She sinks onto the sofa — hips lower, legs bend forward,
    // leans back with one arm over the armrest. Looks relaxed.
    case 'sofaSit': {
      const settle = Math.min(ACTIVITY.phase / 1.2, 1.0); // ease into seated in 1.2s
      const ease = 3*settle*settle - 2*settle*settle*settle;
      const bob   = Math.sin(t * 0.9) * 0.025;

      // Lower hips to seated height
      if (vrm) vrm.scene.position.y = (vrm._restPosY || 0) - ease * 0.38; // sink down
      if (boneHips)       { boneHips.rotation.x = ease * 0.35; boneHips.rotation.z = ease * 0.08 + bob; }
      if (boneSpine)      { boneSpine.rotation.x = ease * 0.08; boneSpine.rotation.z = -ease * 0.04 + bob * 0.4; }
      if (boneChest)      boneChest.rotation.x = ease * 0.05;

      // Legs bent forward in seat
      if (boneLUpperLeg)  { boneLUpperLeg.rotation.x = ease * 0.9; boneLUpperLeg.rotation.z = ease * 0.1; }
      if (boneRUpperLeg)  { boneRUpperLeg.rotation.x = ease * 0.9; boneRUpperLeg.rotation.z = -ease * 0.06; }
      if (boneLLowerLeg)  boneLLowerLeg.rotation.x = -ease * 1.0;
      if (boneRLowerLeg)  boneRLowerLeg.rotation.x = -ease * 1.0;
      if (boneLFoot)      boneLFoot.rotation.x = -0.05 - ease * 0.1;
      if (boneRFoot)      boneRFoot.rotation.x = -0.05 - ease * 0.1;

      // Right arm rests on armrest — casual
      if (boneRUpperArm)  { boneRUpperArm.rotation.z = -(0.85 + ease * 0.15); boneRUpperArm.rotation.x = ease * 0.12 + bob * 0.3; }
      if (boneRLowerArm)  { boneRLowerArm.rotation.z = -(0.4 + ease * 0.1); }
      if (boneRHand)      { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = 0.05; }

      // Left arm: casual across lap or in air
      if (boneLUpperArm)  { boneLUpperArm.rotation.z = 0.72 + ease * 0.1 + Math.sin(t * 0.6) * 0.03; boneLUpperArm.rotation.x = ease * 0.1; }
      if (boneLLowerArm)  boneLLowerArm.rotation.z = 0.5 + Math.sin(t * 0.4) * 0.04;
      if (boneLHand)      { boneLHand.rotation.z = 0.2; boneLHand.rotation.x = 0.06; }

      // Head: slight backward tilt, relaxed
      if (boneHead)       { boneHead.rotation.x = -ease * 0.04 + bob * 0.5; boneHead.rotation.z = Math.sin(t * 0.5) * 0.03; }

      setExpression('happy');
      setBS('U', 0.08 * ease); // soft relaxed lips

      // When leaving sofaSit, reset position
      if (ACTIVITY.timer > ACTIVITY.duration - 0.5) {
        const fadeOut = 1 - ((ACTIVITY.duration - ACTIVITY.timer) / 0.5);
        if (vrm) vrm.scene.position.y = (vrm._restPosY || 0) - 0.38 + fadeOut * 0.38;
      }
      break;
    }

    // ── TV REACT (living room) ────────────────────────────────────
    // She faces the TV cabinet, watches it, reacts — point, gasp, laugh.
    // Head turns toward TV, body shifts. Multiple reaction phases.
    case 'tvReact': {
      const cycle = t % 8.0;

      // Always slightly facing TV (rotate body a little toward -7.5z TV wall)
      if (boneSpine) boneSpine.rotation.y = -0.12 + Math.sin(t * 0.4) * 0.03;
      if (boneHead)  boneHead.rotation.y  = -0.22 + Math.sin(t * 0.5) * 0.04;

      if (cycle < 2.0) {
        // Just watching — slight lean, arms relaxed
        if (boneHips)       boneHips.rotation.z = 0.07;
        if (boneLUpperArm)  { boneLUpperArm.rotation.z = 0.85; boneLUpperArm.rotation.x = 0.08; }
        if (boneRUpperArm)  { boneRUpperArm.rotation.z = -0.85; boneRUpperArm.rotation.x = 0.08; }
        setExpression('neutral');
      } else if (cycle < 3.5) {
        // REACT — something happens on TV — point and lean forward
        const p = Math.min((cycle - 2.0) / 0.6, 1);
        if (boneLUpperArm)  { boneLUpperArm.rotation.z = 0.85 - p * 0.6; boneLUpperArm.rotation.x = p * 0.45; boneLUpperArm.rotation.y = -p * 0.2; }
        if (boneLLowerArm)  { boneLLowerArm.rotation.z = 0.5 - p * 0.3; boneLLowerArm.rotation.x = p * 0.15; }
        if (boneLHand)      { boneLHand.rotation.z = 0.2; boneLHand.rotation.x = p * 0.1; }
        if (boneSpine)      boneSpine.rotation.x = p * 0.08;
        if (boneHead)       { boneHead.rotation.x = p * 0.06; boneHead.rotation.y = -0.22 - p * 0.06; }
        setExpression('surprised');
        setBS('O', p * 0.35);
        if (boneHips) boneHips.rotation.z = 0.07 + p * 0.04;
      } else if (cycle < 5.5) {
        // LAUGH / enjoy — hip pop, clap energy, big smile
        const laugh = cycle - 3.5;
        if (boneHips)       { boneHips.rotation.z = 0.11 + Math.sin(laugh * 4) * 0.04; boneHips.rotation.x = 0.04; }
        if (boneSpine)      { boneSpine.rotation.z = -0.05 + Math.sin(laugh * 4) * 0.03; boneSpine.rotation.x = 0.04; }
        if (boneLUpperArm)  { boneLUpperArm.rotation.z = 0.75 + Math.sin(laugh * 4) * 0.12; boneLUpperArm.rotation.x = 0.15; }
        if (boneRUpperArm)  { boneRUpperArm.rotation.z = -(0.75 + Math.sin(laugh * 4 + 0.5) * 0.12); boneRUpperArm.rotation.x = 0.15; }
        if (boneHead)       { boneHead.rotation.x = 0.06 + Math.sin(laugh * 3) * 0.04; boneHead.rotation.y = -0.18 + Math.sin(laugh * 1.5) * 0.05; }
        setExpression('happy');
        setBS('A', 0.15 + Math.sin(laugh * 4) * 0.1); // laughing mouth
      } else {
        // Settle back to watching
        const p = (cycle - 5.5) / 2.5;
        if (boneHips)       boneHips.rotation.z = 0.11 - p * 0.04;
        if (boneLUpperArm)  { boneLUpperArm.rotation.z = 0.75 + p * 0.1; boneLUpperArm.rotation.x = 0.15 - p * 0.07; }
        if (boneRUpperArm)  { boneRUpperArm.rotation.z = -(0.75 + p * 0.1); boneRUpperArm.rotation.x = 0.15 - p * 0.07; }
        setExpression('neutral');
        setBS('A', 0);
      }
      break;
    }

    // ── PHONE SCROLL (living room / office) ──────────────────────
    // She holds her phone in front of her, head tilted down, thumb scrolls.
    // Occasional eyeroll, laugh, or lean forward at something interesting.
    case 'phoneScroll': {
      const scroll = Math.sin(t * 0.6) * 0.05; // slow up/down scroll thumb movement

      // Head down looking at phone
      if (boneHead)  { boneHead.rotation.x = 0.25 + Math.sin(t * 0.3) * 0.03; boneHead.rotation.z = Math.sin(t * 0.4) * 0.04; }
      if (boneSpine) { boneSpine.rotation.x = 0.1; boneSpine.rotation.z = Math.sin(t * 0.5) * 0.02; }
      if (boneHips)  boneHips.rotation.z = 0.08 + Math.sin(t * 0.7) * 0.03;

      // Right hand holds phone up — elbow bent, forearm raised
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.6; boneRUpperArm.rotation.x = 0.6; }
      if (boneRLowerArm) { boneRLowerArm.rotation.z = -0.25; boneRLowerArm.rotation.x = 0.3; }
      if (boneRHand)     { boneRHand.rotation.z = -0.1; boneRHand.rotation.x = -0.15; boneRHand.rotation.y = 0.1; }

      // Right thumb scrolling motion
      if (boneR_ThumbPx) boneR_ThumbPx.rotation.z = 0.25 + scroll;
      if (boneR_ThumbMd) boneR_ThumbMd.rotation.z = 0.2 + scroll * 0.5;

      // Left arm: resting / crossing — casual
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.72; boneLUpperArm.rotation.x = 0.2; }
      if (boneLLowerArm) { boneLLowerArm.rotation.z = 0.55; boneLLowerArm.rotation.x = 0.12; }
      if (boneLHand)     { boneLHand.rotation.z = 0.22; boneLHand.rotation.x = 0.06; }

      // Reactions cycling: neutral → something catches her eye → reaction
      const phase = t % 7.0;
      if (phase < 3.5) {
        setExpression('neutral');
        setBS('I', 0.04);
      } else if (phase < 4.8) {
        setExpression('surprised'); // something interesting
        setBS('O', (phase - 3.5) / 1.3 * 0.2);
        if (boneHead) boneHead.rotation.x = 0.25 - (phase - 3.5) / 1.3 * 0.08; // leans in
      } else {
        setExpression('happy');
        setBS('I', 0.12); // little smile / smirk
      }
      break;
    }

    // ── MIRROR POSE (beauty room) ─────────────────────────────────
    // She stands in front of the bathroom mirror, checks herself out.
    // Turns side-to-side, touches hair, gives approving nod.
    case 'mirrorPose': {
      const cycle = t % 7.0;

      if (cycle < 1.5) {
        // Turn and look at reflection — slow head turn, self-satisfied
        const p = Math.min(cycle / 1.0, 1);
        if (boneHead)      { boneHead.rotation.y = p * 0.15; boneHead.rotation.z = p * 0.04; }
        if (boneSpine)     { boneSpine.rotation.y = p * 0.06; }
        if (boneHips)      boneHips.rotation.z = p * 0.1;
        setExpression('neutral');
      } else if (cycle < 3.0) {
        // Check the other side — sassy little turn
        const p = (cycle - 1.5) / 1.5;
        if (boneHead)      { boneHead.rotation.y = 0.15 - p * 0.3; boneHead.rotation.z = 0.04 - p * 0.08; }
        if (boneSpine)     boneSpine.rotation.y = 0.06 - p * 0.12;
        if (boneHips)      boneHips.rotation.z = 0.1 + Math.sin(p * Math.PI) * 0.06;
        setExpression('happy');
        setBS('I', 0.1);
      } else if (cycle < 4.5) {
        // Touch hair — satisfied fix
        const p = Math.min((cycle - 3.0) / 0.7, 1);
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -1.0 + p * 0.55; boneRUpperArm.rotation.x = p * 0.65; }
        if (boneRLowerArm) { boneRLowerArm.rotation.z = -(0.35 - p * 0.2); }
        if (boneRHand)     { boneRHand.rotation.z = -(0.18 + p * 0.12); boneRHand.rotation.y = p * 0.2; }
        if (boneHead)      { boneHead.rotation.y = -0.15; boneHead.rotation.z = -0.04; }
        if (boneHips)      boneHips.rotation.z = 0.12;
        setExpression('happy');
        setBS('I', 0.15);
      } else if (cycle < 5.8) {
        // Approving nod — she likes what she sees
        const nod = cycle - 4.5;
        if (boneHead)      { boneHead.rotation.x = Math.sin(nod * 2.5) * 0.06; boneHead.rotation.y = -0.05; }
        if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.45 - (1 - Math.min((cycle - 4.5) / 0.5, 1)) * 0.55; }
        if (boneHips)      boneHips.rotation.z = 0.12 + Math.sin(nod * 1.1) * 0.03;
        setExpression('happy');
        setBS('I', 0.2); // big smirk — she likes herself
      } else {
        // Settle — hand comes down, faces forward
        const p = (cycle - 5.8) / 1.2;
        if (boneHips) boneHips.rotation.z = 0.12 - p * 0.06;
        if (boneHead) { boneHead.rotation.y = -0.05 + p * 0.05; boneHead.rotation.z = 0; }
        setExpression('neutral');
        setBS('I', 0.2 - p * 0.2);
      }
      break;
    }

    // ── IDLE (base sway handled by render loop) ───────────────
    default:
      break;
  }

  // Do NOT force camera-facing here.
  // Rotation is set by: walkTo() during travel, and spot.facingY when she arrives.
  // Activities in kitchen/lounge face the props, not the camera.
}

// ================================================================
//  PHASE 2 — HYPE ANIMATION SYSTEM
//
//  Each Twitch event gets a multi-stage full-body choreography.
//  Stages run sequentially: each has a duration and a per-frame
//  bone-animation function. Pacing is paused for the whole sequence.
//
//  Events:
//    raidDance      — raid: full bounce, arm pump, hip sway, step in
//    subCelebration — new sub: jump, clap arms, step toward cam
//    resubHype      — resub: shoulder shimmy, point at camera
//    bitsDazzle     — bits: surprised spin, blows kiss, shimmy down
//    giftPop        — gift sub: both arms up, excited bounce
//
//  Lower-priority gestures (talk, think, wave) still exist for chat.
// ================================================================

let gesture         = null;
let gestureTime     = 0;
let gestureDuration = 0;

// ── Simple single-function gestures (chat / idle) ─────────────
const GESTURES = {
  think: (t) => {
    if (!boneLUpperArm || !boneRUpperArm) return;
    boneLUpperArm.rotation.z =  1.05 + Math.sin(t*0.8)*0.03;
    boneRUpperArm.rotation.z = -(0.45 + Math.sin(t*0.6)*0.04);
    boneRUpperArm.rotation.x =  0.62 + Math.sin(t*0.4)*0.02;
    if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.9 + Math.sin(t*0.5)*0.02);
    // Hand at chin — fingers curled, wrist relaxed
    if (boneRHand) { boneRHand.rotation.z = -0.15; boneRHand.rotation.x = 0.1; }
    if (boneLHand) { boneLHand.rotation.z = 0.22; boneLHand.rotation.x = 0.08; }
    // Tiny mouth movements while thinking
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
    // Wrist flicks while talking — very girly
    if (boneLHand) { boneLHand.rotation.z = 0.22 + Math.sin(t*7)*0.12; boneLHand.rotation.y = Math.sin(t*5)*0.08; }
    if (boneRHand) { boneRHand.rotation.z = -(0.22 + Math.sin(t*7+1)*0.12); boneRHand.rotation.y = Math.sin(t*5+1)*0.08; }
  },
  wave: (t) => {
    if (!boneRUpperArm) return;
    boneRUpperArm.rotation.z = -(0.28 + Math.sin(t*8)*0.28);
    boneRUpperArm.rotation.x =  0.35;
    if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.18 + Math.sin(t*8+0.5)*0.22);
    // Wrist wave — fingers flapping
    if (boneRHand) { boneRHand.rotation.z = -(0.1 + Math.sin(t*10)*0.15); boneRHand.rotation.y = Math.sin(t*8)*0.1; }
    setRightFingerWave(t); // individual finger flutter
    if (boneLUpperArm) boneLUpperArm.rotation.z = 1.0;
    if (boneLHand) { boneLHand.rotation.z = 0.2; boneLHand.rotation.x = 0.08; }
    setLeftFingerRelax();
  },
  excited: (t) => {
    if (!boneLUpperArm || !boneRUpperArm) return;
    boneLUpperArm.rotation.z =  0.38 + Math.sin(t*7)*0.17;
    boneRUpperArm.rotation.z = -(0.38 + Math.sin(t*7+0.3)*0.17);
    boneLUpperArm.rotation.x =  0.22; boneRUpperArm.rotation.x = 0.22;
    if (boneSpine) boneSpine.rotation.y = Math.sin(t*7)*0.06;
    if (boneHips)  boneHips.rotation.z = Math.sin(t*7)*0.07;
    // Hands flap with excitement — splay fingers
    if (boneLHand) { boneLHand.rotation.z = 0.2 + Math.sin(t*9)*0.15; boneLHand.rotation.x = 0.08; }
    if (boneRHand) { boneRHand.rotation.z = -(0.2 + Math.sin(t*9+0.5)*0.15); boneRHand.rotation.x = 0.08; }
    setLeftFingerCurl(0.05, 0.6);  // splayed excited fingers
    setRightFingerCurl(0.05, 0.6);
    setBS('O', Math.abs(Math.sin(t*7))*0.25); // mouth opens with excitement
    if (teethNode) teethNode.position.y = -Math.abs(Math.sin(t*7)) * 0.006;
  },
};

function doGesture(name, durationMs = 3000) {
  // Don't interrupt a hype sequence with a low-priority gesture
  if (hyper.active) return;
  gesture = name; gestureTime = 0; gestureDuration = durationMs / 1000;
}

function gestureActive() { return gesture !== null || hyper.active; }

// ── Hype sequence engine ─────────────────────────────────────
// A sequence = array of { dur (seconds), fn(t, progress) }
// t = time within this stage, progress = 0→1 within this stage

const hyper = {
  active:     false,
  stages:     [],
  stageIdx:   0,
  stageTimer: 0,
  onDone:     null,   // callback when sequence ends
};

function playHype(stages, onDone) {
  hyper.active     = true;
  hyper.stages     = stages;
  hyper.stageIdx   = 0;
  hyper.stageTimer = 0;
  hyper.onDone     = onDone || null;

  // Move camera to SPEAK for full effect
  setCamMode('SPEAK');
}

function hyperUpdate(delta) {
  if (!hyper.active) return;
  const stage = hyper.stages[hyper.stageIdx];
  if (!stage) { _hyperFinish(); return; }

  hyper.stageTimer += delta;
  const progress = Math.min(hyper.stageTimer / stage.dur, 1);
  stage.fn(hyper.stageTimer, progress);

  if (hyper.stageTimer >= stage.dur) {
    hyper.stageIdx++;
    hyper.stageTimer = 0;
    if (hyper.stageIdx >= hyper.stages.length) _hyperFinish();
  }
}

function _hyperFinish() {
  hyper.active   = false;
  hyper.stages   = [];
  hyper.stageIdx = 0;
  setCamMode('IDLE');
  if (hyper.onDone) hyper.onDone();
}

// ── Helper: ease in-out ───────────────────────────────────────
function easeInOut(p) { return p < 0.5 ? 2*p*p : -1+(4-2*p)*p; }

// ================================================================
//  HYPE CHOREOGRAPHIES
// ================================================================

// ── RAID DANCE (8s) ──────────────────────────────────────────
// Stage 1 (1s): freeze, look surprised — eyes wide, arms snap up
// Stage 2 (2s): arms pump up/down fast, chest bounces, hip sway
// Stage 3 (2s): full body bounce + lateral hip shimmy
// Stage 4 (2s): step forward toward camera, both arms out wide
// Stage 5 (1s): settle back, face camera, big smile arms

function triggerRaidDance() {
  setCamMode('IDLE'); // start wide so viewer sees full body

  playHype([
    // Stage 1 — shocked freeze
    { dur: 0.8, fn: (t, p) => {
      const snap = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 1.1 - snap*0.7; boneLUpperArm.rotation.x = snap*0.5; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.1 - snap*0.7); boneRUpperArm.rotation.x = snap*0.5; }
      if (boneHead) boneHead.rotation.x = snap * 0.12;
      if (boneSpine) boneSpine.rotation.x = snap * 0.06;
      setExpression('surprised');
    }},
    // Stage 2 — arms pump, chest bounce
    { dur: 2.2, fn: (t, p) => {
      const pump = Math.sin(t * 10) * 0.28;
      const bounce = Math.abs(Math.sin(t * 10)) * 0.04;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.35 + pump; boneLUpperArm.rotation.x = 0.45 + bounce; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.35 + pump); boneRUpperArm.rotation.x = 0.45 + bounce; }
      if (boneLLowerArm) boneLLowerArm.rotation.z =  0.6 + Math.abs(pump)*0.5;
      if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.6 + Math.abs(pump)*0.5);
      if (boneSpine) { boneSpine.rotation.x = bounce*1.5; boneSpine.rotation.z = Math.sin(t*5)*0.04; }
      if (boneHips)  boneHips.rotation.z = Math.sin(t*5) * 0.09;
      if (boneLUpperLeg) boneLUpperLeg.rotation.x = Math.sin(t*10)*0.08;
      if (boneRUpperLeg) boneRUpperLeg.rotation.x = -Math.sin(t*10)*0.08;
      setExpression('excited');
    }},
    // Stage 3 — hip shimmy + full body sway
    { dur: 2.2, fn: (t, p) => {
      const sway = Math.sin(t * 7) * 0.18;
      const bob  = Math.abs(Math.sin(t * 7)) * 0.05;
      if (boneHips)  { boneHips.rotation.z = sway; boneHips.rotation.y = sway*0.4; }
      if (boneSpine) { boneSpine.rotation.z = -sway*0.5; boneSpine.rotation.x = bob; }
      if (boneChest) boneChest.rotation.z = sway * 0.3;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.5 + Math.sin(t*7+1)*0.2; boneLUpperArm.rotation.x = 0.3+bob; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.5 + Math.sin(t*7)*0.2); boneRUpperArm.rotation.x = 0.3+bob; }
      if (boneLUpperLeg) boneLUpperLeg.rotation.z =  sway*0.35;
      if (boneRUpperLeg) boneRUpperLeg.rotation.z = -sway*0.35;
    }},
    // Stage 4 — step toward camera, arms wide open (welcoming raid)
    { dur: 2.0, fn: (t, p) => {
      const ep    = easeInOut(Math.min(p*2,1));
      const retract = p > 0.5 ? easeInOut((p-0.5)*2) : 0;
      if (vrm) vrm.scene.position.z = ep * 0.18 - retract * 0.18;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.3 - ep*0.25; boneLUpperArm.rotation.x = ep*0.35; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.3 - ep*0.25); boneRUpperArm.rotation.x = ep*0.35; }
      if (boneLLowerArm) boneLLowerArm.rotation.z =  0.2 + ep*0.15;
      if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.2 + ep*0.15);
      if (boneHead) boneHead.rotation.y = Math.sin(t*2)*0.04;
    }},
    // Stage 5 — settle, big wave-both-hands
    { dur: 1.0, fn: (t, p) => {
      const settle = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.6 + Math.sin(t*8)*0.12; boneLUpperArm.rotation.x = 0.2 - settle*0.2; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.6 + Math.sin(t*8+0.5)*0.12); boneRUpperArm.rotation.x = 0.2 - settle*0.2; }
      if (vrm) vrm.scene.position.z = 0;
      setExpression('happy');
    }},
  ]);
}

// ── SUB CELEBRATION (7s) ────────────────────────────────────
// Stage 1 (0.5s): freeze → eyes wide, gasp pose
// Stage 2 (1.5s): clap arms come together fast then apart (x3)
// Stage 3 (2s):   body bounce + jump (Y position bob)
// Stage 4 (2s):   step forward, point at sub, big grin
// Stage 5 (1s):   settle, blow kiss

function triggerSubCelebration() {
  playHype([
    // Gasp
    { dur: 0.5, fn: (t, p) => {
      const g = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 1.1 - g*0.4; boneLUpperArm.rotation.x = g*0.3; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.1 - g*0.4); boneRUpperArm.rotation.x = g*0.3; }
      if (boneHead) boneHead.rotation.x = g*0.1;
      setExpression('surprised');
    }},
    // Clap
    { dur: 1.8, fn: (t, p) => {
      const clap = Math.abs(Math.sin(t * 9)) ;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.7 - clap*0.5; boneLUpperArm.rotation.x = 0.25 + clap*0.1; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.7 - clap*0.5); boneRUpperArm.rotation.x = 0.25 + clap*0.1; }
      if (boneLLowerArm) boneLLowerArm.rotation.z =  0.3 + clap*0.4;
      if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.3 + clap*0.4);
      if (boneSpine) boneSpine.rotation.x = clap * 0.05;
      setExpression('excited');
    }},
    // Jump bounce
    { dur: 2.0, fn: (t, p) => {
      const jump = Math.abs(Math.sin(t * 8)) * 0.12;
      if (vrm) vrm.scene.position.y = (vrm.scene.position.y || 0) + (jump - (vrm._lastJump||0));
      vrm._lastJump = jump;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.4 + Math.sin(t*7)*0.18; boneLUpperArm.rotation.x = 0.3; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.4 + Math.sin(t*7+0.4)*0.18); boneRUpperArm.rotation.x = 0.3; }
      if (boneSpine) boneSpine.rotation.x = Math.sin(t*8)*0.03;
      if (boneHips) boneHips.rotation.z = Math.sin(t*8)*0.06;
    }},
    // Point and lean toward cam
    { dur: 2.0, fn: (t, p) => {
      if (vrm) { vrm.scene.position.y = vrm._restPosY || 0; vrm._lastJump = 0; }
      const ep = easeInOut(Math.min(p*2,1));
      const ret = p > 0.5 ? easeInOut((p-0.5)*2) : 0;
      if (vrm) vrm.scene.position.z = ep*0.14 - ret*0.14;
      // Right arm points forward (at viewer / sub)
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.15); boneRUpperArm.rotation.x = 0.55 + Math.sin(t*3)*0.04; }
      if (boneRLowerArm) boneRLowerArm.rotation.x = 0.15;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.6 + Math.sin(t*4)*0.08; boneLUpperArm.rotation.x = 0.2; }
      if (boneHead) boneHead.rotation.y = -0.08; // slight look right
      setExpression('happy');
    }},
    // Blow kiss
    { dur: 1.2, fn: (t, p) => {
      if (vrm) vrm.scene.position.z = 0;
      const kiss = Math.sin(t*5)*0.1;
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.3 + kiss); boneRUpperArm.rotation.x = 0.6; }
      if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.6);
      if (boneLUpperArm) boneLUpperArm.rotation.z = 1.0;
      if (boneHead) boneHead.rotation.y = -0.06;
      setExpression('happy');
    }},
  ]);
}

// ── RESUB HYPE (5s) ─────────────────────────────────────────
// Shoulder shimmy + point at camera + nod

function triggerResubHype() {
  playHype([
    // Shimmy build-up
    { dur: 2.5, fn: (t, p) => {
      const shimmy = Math.sin(t * 9);
      if (boneChest) boneChest.rotation.z = shimmy * 0.1;
      if (boneSpine) boneSpine.rotation.z = -shimmy * 0.07;
      if (boneLUpperArm) boneLUpperArm.rotation.z =  1.0 + shimmy*0.18;
      if (boneRUpperArm) boneRUpperArm.rotation.z = -(1.0 + shimmy*0.18);
      if (boneLUpperArm) boneLUpperArm.rotation.x = 0.1 + Math.abs(shimmy)*0.08;
      if (boneRUpperArm) boneRUpperArm.rotation.x = 0.1 + Math.abs(shimmy)*0.08;
      setExpression('happy');
    }},
    // Double point — both index fingers toward camera (via arm pose)
    { dur: 1.5, fn: (t, p) => {
      const nod = Math.sin(t*6)*0.06;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.2; boneLUpperArm.rotation.x = 0.5 + nod; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -0.2; boneRUpperArm.rotation.x = 0.5 + nod; }
      if (boneLLowerArm) boneLLowerArm.rotation.x = 0.15;
      if (boneRLowerArm) boneRLowerArm.rotation.x = 0.15;
      if (boneHead) boneHead.rotation.x = nod;
    }},
    // Settle
    { dur: 1.0, fn: (t, p) => {
      const s = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.2 + s*0.9; boneLUpperArm.rotation.x = 0.5 - s*0.5; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.2 + s*0.9); boneRUpperArm.rotation.x = 0.5 - s*0.5; }
      setExpression('happy');
    }},
  ]);
}

// ── BITS DAZZLE (6s) ─────────────────────────────────────────
// Surprised spin + shimmy down + blows kiss
// Scales with bit amount — more bits = bigger reaction

function triggerBitsDazzle(bits = 100) {
  const scale = Math.min(1, bits / 500); // 0→1, caps at 500 bits
  const spinAmt = 0.18 + scale * 0.25;

  playHype([
    // Surprised arms fly up
    { dur: 0.6, fn: (t, p) => {
      const g = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 1.1 - g*0.9; boneLUpperArm.rotation.x = g*(0.3+scale*0.2); }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.1 - g*0.9); boneRUpperArm.rotation.x = g*(0.3+scale*0.2); }
      if (boneHead) boneHead.rotation.x = g * 0.15;
      setExpression('surprised');
    }},
    // Spin shimmy (body sways dramatically)
    { dur: 2.0 + scale, fn: (t, p) => {
      const spin = Math.sin(t * (6 + scale*3)) * spinAmt;
      if (boneHips)  boneHips.rotation.z  = spin;
      if (boneSpine) boneSpine.rotation.z = -spin * 0.6;
      if (boneChest) boneChest.rotation.z = spin * 0.3;
      if (boneLUpperArm) boneLUpperArm.rotation.z =  0.45 + spin*0.5;
      if (boneRUpperArm) boneRUpperArm.rotation.z = -(0.45 + spin*0.5);
      if (boneLUpperArm) boneLUpperArm.rotation.x = 0.15;
      if (boneRUpperArm) boneRUpperArm.rotation.x = 0.15;
      if (boneHead) boneHead.rotation.z = spin * 0.2;
      setExpression('excited');
    }},
    // Shimmy down (arms lower, chest dips)
    { dur: 1.2, fn: (t, p) => {
      const dip  = Math.abs(Math.sin(t*8)) * 0.08;
      const down = easeInOut(p) * 0.06;
      if (boneSpine) boneSpine.rotation.x = dip - down;
      if (boneLUpperArm) boneLUpperArm.rotation.z =  0.7 + dip;
      if (boneRUpperArm) boneRUpperArm.rotation.z = -(0.7 + dip);
      if (boneHips) boneHips.rotation.z = 0;
    }},
    // Blow kiss finish
    { dur: 1.2, fn: (t, p) => {
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.25 + Math.sin(t*5)*0.08); boneRUpperArm.rotation.x = 0.65; }
      if (boneRLowerArm) boneRLowerArm.rotation.z = -0.55;
      if (boneLUpperArm) boneLUpperArm.rotation.z = 1.0;
      if (boneSpine) boneSpine.rotation.x = 0;
      setExpression('happy');
    }},
  ]);
}

// ── GIFT POP (5s) ────────────────────────────────────────────
// Both arms shoot up in celebration, body jumps, shimmy down

function triggerGiftPop() {
  playHype([
    // Arms shoot up
    { dur: 0.4, fn: (t, p) => {
      const g = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 1.1 - g; boneLUpperArm.rotation.x = g*0.4; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(1.1 - g); boneRUpperArm.rotation.x = g*0.4; }
      setExpression('excited');
    }},
    // Hold up + shake
    { dur: 2.0, fn: (t, p) => {
      const shake = Math.sin(t * 12) * 0.06;
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.1 + shake; boneLUpperArm.rotation.x = 0.4; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.1 + shake); boneRUpperArm.rotation.x = 0.4; }
      if (boneLLowerArm) boneLLowerArm.rotation.z =  0.1 + Math.abs(shake);
      if (boneRLowerArm) boneRLowerArm.rotation.z = -(0.1 + Math.abs(shake));
      const bob = Math.abs(Math.sin(t*8)) * 0.04;
      if (boneSpine) boneSpine.rotation.x = bob;
      if (boneHips) boneHips.rotation.z = Math.sin(t*8)*0.05;
    }},
    // Wave both hands
    { dur: 1.6, fn: (t, p) => {
      const wv = Math.sin(t * 9) * 0.2;
      if (boneLUpperArm) boneLUpperArm.rotation.z =  0.5 + wv;
      if (boneRUpperArm) boneRUpperArm.rotation.z = -(0.5 + wv);
      if (boneLUpperArm) boneLUpperArm.rotation.x = 0.25;
      if (boneRUpperArm) boneRUpperArm.rotation.x = 0.25;
      setExpression('happy');
    }},
    // Settle
    { dur: 1.0, fn: (t, p) => {
      const s = easeInOut(p);
      if (boneLUpperArm) { boneLUpperArm.rotation.z = 0.5 + s*0.6; boneLUpperArm.rotation.x = 0.25 - s*0.25; }
      if (boneRUpperArm) { boneRUpperArm.rotation.z = -(0.5 + s*0.6); boneRUpperArm.rotation.x = 0.25 - s*0.25; }
    }},
  ]);
}


// ================================================================
//  PHASE 1C — CAMERA WORK
//  Smooth lerp between IDLE / SPEAK / THINK camera states.
// ================================================================

// ================================================================
//  STREAMER PORTRAIT CAMERA — updateCamera
//  NEVER reads vrm.scene.rotation. Camera position is computed
//  purely from avatar's X/Z world position + fixed preset offsets.
//  Avatar is locked facing +Z, camera always at +Z from her.
// ================================================================

// Instantly snap camCurrent (and the real camera) to sit in front of
// wherever the VRM currently stands. Call this after spawn or teleport.
function _snapCameraToVRM() {
  if (!vrm) return;
  const vx = vrm.scene.position.x;
  const vy = vrm.scene.position.y;
  const vz = vrm.scene.position.z;
  const p  = STREAMER_CAM.IDLE;
  camCurrent.x     = vx + p.sideShift;
  camCurrent.y     = vy + p.height;
  camCurrent.z     = vz + p.dist;
  camCurrent.lookX = vx;
  camCurrent.lookY = vy + p.lookHeight;
  camCurrent.lookZ = vz;
  camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
  camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
}

function updateCamera(delta) {
  if (!vrm) return;

  const vx = vrm.scene.position.x;
  const vy = vrm.scene.position.y;
  const vz = vrm.scene.position.z;

  const p  = STREAMER_CAM[camMode] || STREAMER_CAM.IDLE;
  const tx = vx + p.sideShift;
  const ty = vy + p.height;
  const tz = vz + p.dist;
  const lx = vx;
  const ly = vy + p.lookHeight;
  const lz = vz;

  const L = camMode === 'SPEAK' ? 0.08 : CAM_LERP;
  camCurrent.x     += (tx - camCurrent.x)     * L;
  camCurrent.y     += (ty - camCurrent.y)     * L;
  camCurrent.z     += (tz - camCurrent.z)     * L;
  camCurrent.lookX += (lx - camCurrent.lookX) * L;
  camCurrent.lookY += (ly - camCurrent.lookY) * L;
  camCurrent.lookZ += (lz - camCurrent.lookZ) * L;

  camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
  camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
}


// ── Chat bubble ─────────────────────────────────────────
let bubbleTimeout = null;

function showBubble(text, speaker='Miss OG Tinz') {
  bubbleTxt.textContent = text;
  bubble.querySelector('.speaker').textContent = speaker;
  bubble.classList.add('visible');
  clearTimeout(bubbleTimeout);
  const displayTime = Math.max(4000, text.length * 60);
  bubbleTimeout = setTimeout(() => bubble.classList.remove('visible'), displayTime);
}


// ── Render loop ─────────────────────────────────────────
const clock = new THREE.Clock();
let idleTime   = 0;
let blinkTimer = 0;
let nextBlink  = 3;

function render() {
  requestAnimationFrame(render);
  const delta = clock.getDelta();

  // ── Room neon pulse ───────────────────────────────────
  animateRoomLights(delta);
  updateCompanion(delta);

  if (vrm) {
    idleTime   += delta;
    blinkTimer += delta;

    // ── Activity system ────────────────────────────────
    if (!walk.active) activityUpdate(delta);
    hyperUpdate(delta);

    // ── Walk / room movement ───────────────────────────
    updateWalk(delta);
    lifeUpdate();
    // Show the walk — use IDLE/world camera mode while she's moving
    if (walk.active && camMode === 'IDLE') {
      // camMode stays IDLE (world cam) so we can see her walk
    }

    // ── Facing — always face the camera (+Z). Never rotate away. ──
    if (vrm) {
      const cur = vrm.scene.rotation.y;
      const diff = Math.PI - cur;
      const norm = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
      vrm.scene.rotation.y += norm * Math.min(delta * 4, 1);
    }

    // ── Idle body sway (only when not mid-gesture AND not walking) ────
    if (!gestureActive() && !walk.active) {

      // ── GIRLY IDLE BASE — always running ──────────────
      // S-curve weight shift: hips sway, spine counter, chest independent
      const hipSway    = Math.sin(idleTime * 1.05) * 0.09;    // slightly slower, wider arc
      const hipBob     = Math.abs(Math.sin(idleTime * 1.05)) * 0.035;
      const breathe    = Math.sin(idleTime * 0.72) * 0.014;
      const chestOpp   = Math.sin(idleTime * 1.05 + 0.6) * 0.04; // chest lags behind hips
      const shoulderRoll = Math.sin(idleTime * 0.52) * 0.022;    // slow shoulder roll

      if (boneHips) {
        boneHips.rotation.z = hipSway;
        boneHips.rotation.x = hipBob * 0.5;
        boneHips.rotation.y = Math.sin(idleTime * 0.5) * 0.05;
      }
      if (boneSpine) {
        boneSpine.rotation.z = -hipSway * 0.65;  // tighter counter for S-curve
        boneSpine.rotation.x = breathe + Math.sin(idleTime * 1.2) * 0.01;
        boneSpine.rotation.y = Math.sin(idleTime * 0.5) * 0.025;
      }
      if (boneChest) {
        boneChest.rotation.z = chestOpp;                    // chest has own delayed sway
        boneChest.rotation.x = breathe * 0.9;
        boneChest.rotation.y = shoulderRoll;
      }

      // Head — gentle tilt, nod, side glance
      if (boneHead) {
        boneHead.rotation.z = Math.sin(idleTime * 0.45) * 0.045; // slow cute tilt
        boneHead.rotation.x = Math.sin(idleTime * 0.7)  * 0.03 + 0.02;
        boneHead.rotation.y = Math.sin(idleTime * 0.32) * 0.08; // slow glance side to side
      }
      if (boneNeck) {
        boneNeck.rotation.z = Math.sin(idleTime * 0.45) * 0.02;
        boneNeck.rotation.y = Math.sin(idleTime * 0.32) * 0.04;
      }

      // Legs — still when not walking, walk system handles all leg movement
      if (boneLUpperLeg) { boneLUpperLeg.rotation.z = -0.04; boneLUpperLeg.rotation.x = 0; }
      if (boneRUpperLeg) { boneRUpperLeg.rotation.z =  0.06; boneRUpperLeg.rotation.x = 0; }
      if (boneLLowerLeg) { boneLLowerLeg.rotation.x = 0.04; }
      if (boneRLowerLeg) { boneRLowerLeg.rotation.x = 0.04; }
      if (boneLFoot) { boneLFoot.rotation.x = -0.05; boneLFoot.rotation.z = -0.03; }
      if (boneRFoot) { boneRFoot.rotation.x = -0.05; boneRFoot.rotation.z =  0.04; }
      if (boneLToes) boneLToes.rotation.x = 0.08;
      if (boneRToes) boneRToes.rotation.x = 0.08;

      // Arms & hands — only idle pose when no activity animating them
      if (ACTIVITY.current === 'idle') {
        // Left arm: slightly bent, hand on hip vibe — shoulder follows chest sway
        if (boneLUpperArm) {
          boneLUpperArm.rotation.z =  0.9 + Math.sin(idleTime * 0.85) * 0.07 + chestOpp * 0.4;
          boneLUpperArm.rotation.x =  0.07 + Math.sin(idleTime * 0.55) * 0.04;
          boneLUpperArm.rotation.y =  0.04 + shoulderRoll * 0.5;
        }
        if (boneLLowerArm) {
          boneLLowerArm.rotation.z =  0.52 + Math.sin(idleTime * 1.0) * 0.045;
          boneLLowerArm.rotation.x = -0.04;
        }
        // Right arm: loose at side with gentle sway
        if (boneRUpperArm) {
          boneRUpperArm.rotation.z = -0.9 - Math.sin(idleTime * 0.85 + 0.5) * 0.07 - chestOpp * 0.4;
          boneRUpperArm.rotation.x =  0.07 + Math.sin(idleTime * 0.55 + 0.5) * 0.04;
          boneRUpperArm.rotation.y = -0.04 - shoulderRoll * 0.5;
        }
        if (boneRLowerArm) {
          boneRLowerArm.rotation.z = -0.52 - Math.sin(idleTime * 1.0 + 0.5) * 0.045;
          boneRLowerArm.rotation.x = -0.04;
        }
        // Wrists — more pronounced limp droop + fast feminine flutter
        if (boneLHand) {
          boneLHand.rotation.z =  0.26 + Math.sin(idleTime * 2.1) * 0.08;   // flutter
          boneLHand.rotation.x =  0.12 + Math.sin(idleTime * 2.6) * 0.05;
          boneLHand.rotation.y =  Math.sin(idleTime * 1.6) * 0.07;          // twist
        }
        if (boneRHand) {
          boneRHand.rotation.z = -0.26 - Math.sin(idleTime * 2.1 + 1.0) * 0.08;
          boneRHand.rotation.x =  0.12 + Math.sin(idleTime * 2.6 + 1.0) * 0.05;
          boneRHand.rotation.y =  Math.sin(idleTime * 1.6 + 0.9) * 0.07;
        }
        // Relaxed finger poses — natural droop, no T-pose stiffness
        setLeftFingerRelax();
        setRightFingerRelax();
      }

      // ── Idle mouth micro-expressions ──────────────────
      // Little pout, lip press, and soft "hmm" mouth movements
      const mouthCycle = idleTime % 6.5;
      if (mouthCycle > 5.5) {
        // tiny "ooh" pout at the end of each cycle
        const p = (mouthCycle - 5.5) / 1.0;
        const pout = Math.sin(p * Math.PI) * 0.18;
        setBS('O', pout);
        setBS('U', pout * 0.5);
        if (teethNode) teethNode.position.y = -pout * 0.004;
      } else if (mouthCycle > 3.8 && mouthCycle < 4.4) {
        // lip press / hmm
        const p = Math.sin((mouthCycle - 3.8) / 0.6 * Math.PI);
        setBS('I', p * 0.12);
        if (teethNode) teethNode.position.y = 0;
      } else {
        setBS('O', 0);
        setBS('U', 0);
        setBS('I', 0);
        if (teethNode) teethNode.position.y = 0;
      }
    }

    // ── Gesture override ──────────────────────────────
    if (gesture) {
      gestureTime += delta;
      if (gestureTime < gestureDuration && GESTURES[gesture]) {
        GESTURES[gesture](gestureTime);
      } else {
        gesture = null;
        // Reset z-position if stepForward was used
        if (vrm) vrm.scene.position.z = 0;
      }
    }

    vrm.update(delta);

    // ── Eye look-at — reads chat, looks at camera ────────
    if (vrm.lookAt) {
      vrm.lookAt.yaw   = Math.sin(idleTime * 0.22) * 6 + Math.sin(idleTime * 0.67) * 2;
      vrm.lookAt.pitch = Math.sin(idleTime * 0.18) * 3 - 2;
    }

    // ── Blink ─────────────────────────────────────────
    if (blinkTimer > nextBlink) {
      blinkTimer = 0;
      nextBlink  = 2.5 + Math.random() * 3;
      doBlink();
    }
  }

  // ── Camera lerp ───────────────────────────────────────
  updateCamera(delta);

  renderer.render(scene, camera);
}

function doBlink() {
  setBS('blink', 1);
  setTimeout(() => setBS('blink', 0), 120);
}

render();


// ── Audio unlock (browser autoplay policy) ──────────────
// Browsers block audio until first user gesture. We silently
// unlock the audio context on the first click/key anywhere.
let _audioUnlocked = false;
function _unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  // Play a silent buffer to satisfy the browser autoplay policy
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    ctx.resume();
  } catch(e) {}
}
document.addEventListener('click',   _unlockAudio, { once: true });
document.addEventListener('keydown', _unlockAudio, { once: true });
document.addEventListener('touchstart', _unlockAudio, { once: true });

// ── TTS ─────────────────────────────────────────────────
async function speak(text, mood='neutral') {
  _isSpeaking = true;
  setExpression(mood);
  setStageLight('speak', text.length * 65 + 2000);

  try {
    const controller = new AbortController();
    const ttsTimeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(ttsTimeout);

    if (res.ok) {
      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = 1.0; // full volume by default
      runLipSync(text);
      await new Promise((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        // Try play; if blocked, user hasn't interacted yet — show a nudge
        audio.play().catch(() => {
          const nudge = document.createElement('div');
          nudge.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,184,48,0.95);color:#000;padding:18px 32px;border-radius:12px;font-family:Syne,sans-serif;font-weight:700;font-size:16px;z-index:9999;cursor:pointer;letter-spacing:0.08em;';
          nudge.textContent = '🔊 TAP TO HEAR MISS OG TINZ';
          nudge.onclick = () => { audio.play(); nudge.remove(); };
          document.body.appendChild(nudge);
          setTimeout(() => nudge?.remove(), 8000);
          resolve();
        });
      });
      stopLipSync();
      setExpression('neutral');
      _isSpeaking = false;
      return;
    }
  } catch(_) {}

  await runLipSync(text);
  setExpression('neutral');
  _isSpeaking = false;
}

function runLipSync(text) {
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
      const rhythm    = Math.abs(Math.sin(elapsed * 0.018)) * 0.4 + 0.3;
      const base      = isSilence ? 0 : rhythm + (isVowel ? 0.5 : 0);
      const openness  = Math.min(1, base);
      const spread    = isVowel && (char==='i'||char==='e') ? 0.6 : 0.1;
      const round     = isVowel && (char==='o'||char==='u') ? 0.5 : 0.1;
      setBS('A', openness * 0.9);
      setBS('O', openness * round);
      setBS('I', openness * spread);
      setBS('E', openness * spread * 0.7);
      setBS('U', openness * round * 0.6);
      // Physical jaw bone — rotate down when mouth opens (fallback for VRM without blendshapes)
      if (boneJaw) boneJaw.rotation.x = openness * 0.22;
      // Teeth mesh: translate downward to visually open mouth gap
      if (teethNode) teethNode.position.y = -openness * 0.008;
    }
    tick();
  });
}


// ── Topic box ────────────────────────────────────────────
function updateTopicBox(data) {
  if (!data.active) {
    topicBox.classList.remove('visible');
    lastTopicTitle = null;
    return;
  }
  const isNew = data.title !== lastTopicTitle;
  topicTitleEl.textContent  = data.title  || '';
  topicSourceEl.textContent = data.source || '';
  topicBox.classList.add('visible');
  if (isNew) {
    lastTopicTitle = data.title;
    topicBox.classList.remove('new-topic');
    void topicBox.offsetWidth;
    topicBox.classList.add('new-topic');
    setTimeout(() => topicBox.classList.remove('new-topic'), 900);
  }
}

function startTopicPolling() {
  async function poll() {
    try {
      const res  = await fetch(TOPIC_URL);
      const data = await res.json();
      updateTopicBox(data);
    } catch (_) {}
  }
  poll();
  setInterval(poll, 6000);
}


// ── Dead air — DeadAirTimer integration ────────────────────
// The DeadAirTimer class handles silence detection, 429 backoff,
// minimum speak intervals, and tiered error recovery.
// We only need to handle the proactive message payload here.

async function _onProactiveMessage(text) {
  if (_isSpeaking) return; // guard: don't talk over herself
  if (!text) return;
  setCamMode('SPEAK');
  showBubble(text, 'Miss OG Tinz');
  setStatus('Live ✦', 'ready');
  doGesture('talk', text.length * 65);
  await speak(text, 'neutral');
  setCamMode('IDLE');
  deadAir?.reset(); // restart timer after speaking
}

function _initDeadAir() {
  deadAir = new DeadAirTimer({
    silenceThresholdMs: 120_000,   // 2 minutes of silence
    minIntervalMs:      180_000,   // at least 3 min between proactive speaks
    chatEndpoint:       PROACTIVE_URL,
    onProactiveMessage: (text) => {
      // DeadAirTimer has already fetched and parsed the response;
      // hand it off to the UI handler
      _onProactiveMessage(text);
    },
    debug: false,
  });
  deadAir?.start();
}


// ── API call ─────────────────────────────────────────────
const chatHistory = [];

async function sendMessage(message, displayName='Viewer') {
  if (!message.trim()) return;
  deadAir?.reset();
  setStatus('Thinking...', 'thinking');
  sendBtn.disabled = true;

  // Camera: go to THINK while processing
  setCamMode('THINK');
  doGesture('think', 4000);

  chatHistory.push({ role:'user', content: message });

  try {
    // ── Vision: capture scene snapshot if triggered ──────────────
    const roomChanged = VISION._lastRoomSent !== _currentRoom;
    let sceneSnapshot = null;
    if (VISION.shouldCapture(message, roomChanged)) {
      sceneSnapshot = VISION.capture();
      if (sceneSnapshot) VISION.markSent(_currentRoom);
    }

    const body = {
      user_id:      USER_ID,
      message,
      display_name: displayName,
      // NOTE: chatHistory holds up to 20 entries for local context continuity,
      // but we only send the last 6 to the API. This is intentional — it keeps
      // token costs low while giving the model enough recent context.
      history:      chatHistory.slice(-6),
      system_hint:  'Reply in 1-2 SHORT punchy sentences max. You are a live streamer — keep it quick, witty and real. No long explanations.',
      current_room: _currentRoom,
    };
    if (sceneSnapshot) {
      body.scene_image    = sceneSnapshot;   // base64 JPEG
      body.vision_context = `This is a screenshot of Miss OG Tinz's live 3D avatar standing in her ${_currentRoom.replace('-', ' ')}. Use what you see to make your reply feel grounded and self-aware.`;
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    if (res.status === 429) {
      let retryMs = 5000;
      try {
        const errData = await res.json();
        if (errData?.retry_after_ms) retryMs = errData.retry_after_ms;
      } catch(_) {}
      const fallback = `Hold on, I'm getting too many messages! Try again in ${Math.ceil(retryMs/1000)} seconds.`;
      showBubble(fallback, 'Miss OG Tinz');
      await speak(fallback, 'neutral');
      setStatus('Ready ✦', 'ready');
      setCamMode('IDLE');
      sendBtn.disabled = false;
      await new Promise(r => setTimeout(r, retryMs));
      return;
    }
    if (!res.ok) throw new Error('API error ' + res.status);

    const data = await res.json();
    let reply = data.reply || "Ehn ehn, I heard you!";
    const sentences = reply.match(/[^.!?]+[.!?]+/g) || [reply];
    if (sentences.length > 2) reply = sentences.slice(0,2).join(' ').trim();
    const mood = data.viewer?.mood || 'neutral';

    // Move her to the room the API detected
    if (data.location) moveToRoom(data.location);

    chatHistory.push({ role:'assistant', content: reply });
    if (chatHistory.length > 20) chatHistory.splice(0,2);

    // Camera: zoom in for speaking
    setCamMode('SPEAK');
    showBubble(reply, 'Miss OG Tinz');
    setStatus('Live ✦', 'ready');

    const moodGesture = {
      happy:'excited', excited:'excited', surprised:'excited',
      neutral:'talk', sad:'think', angry:'talk'
    };
    doGesture(moodGesture[mood] || 'talk', reply.length * 65);

    // Light follows mood
    const moodLight = {
      happy:'speak', excited:'sub', sad:'chill', angry:'raid', neutral:'speak'
    };
    setStageLight(moodLight[mood] || 'speak', reply.length * 65 + 2000);

    await speak(reply, mood);

    // Camera: back to idle after speaking
    setCamMode('IDLE');
    deadAir?.reset();

  } catch(err) {
    console.error(err);
    const fallback = "Oya wait, my brain is loading... try again!";
    showBubble(fallback, 'Miss OG Tinz');
    await speak(fallback, 'neutral');
    setStatus('Ready ✦', 'ready');
    setCamMode('IDLE');
  }

  sendBtn.disabled = false;
}


// ── UI events ────────────────────────────────────────────
sendBtn.addEventListener('click', () => {
  const msg = chatInput.value.trim();
  if (!msg) return;
  chatInput.value = '';
  sendMessage(msg, 'You');
});
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn.click(); });


// ── Twitch Chat Integration ──────────────────────────────
// tmi.js is loaded via <script> in index.html before this module runs.
// Dynamic injection inside a module can't assign to global scope reliably,
// so we rely solely on the HTML script tag.
function initTwitchChat() {
  if (typeof tmi === 'undefined') {
    console.warn('[Twitch] tmi.js not available — check the <script> tag in index.html');
    return;
  }
  const client = new tmi.Client({ channels: [TWITCH_CHANNEL] });
  client.connect().then(() => {
    console.log(`[Twitch] Connected to #${TWITCH_CHANNEL}`);
    setStatus('Live ✦', 'ready');
  }).catch(err => console.warn('[Twitch] Chat connect failed:', err));

  client.on('message', (channel, tags, message, self) => {
    if (self) return;
    const username = tags['display-name'] || tags.username || 'Someone';
    queueTwitchMessage(username, message);
  });

  client.on('subscription', (channel, username) => {
    setStageLight('sub', 6000);
    doGesture('excited', 5000);
    const event = `${username} just subscribed! Omo thank you so much! Welcome to the family!`;
    queueTwitchMessage('StreamEvent', event);
  });

  client.on('resub', (channel, username, months) => {
    setStageLight('sub', 5000);
    const event = `${username} has been here for ${months} months! ${months >= 6 ? 'A real OG!' : 'Thank you!'} We see you!`;
    queueTwitchMessage('StreamEvent', event);
  });

  client.on('cheer', (channel, tags, message) => {
    const username = tags['display-name'] || 'Someone';
    const bits     = tags.bits || '?';
    setStageLight('bits', 5000);
    const event = `${username} just sent ${bits} bits! Ayyyy thank you! The support is real!`;
    queueTwitchMessage('StreamEvent', event);
  });

  client.on('raided', (channel, username, viewers) => {
    setStageLight('raid', 8000);
    doGesture('excited', 6000);
    const event = `We are being raided by ${username} with ${viewers} viewers! Welcome welcome welcome! Come in, come in!`;
    queueTwitchMessage('StreamEvent', event);
  });

  client.on('subgift', (channel, username, streakMonths, recipient) => {
    setStageLight('sub', 4000);
    doGesture('wave', 2500);
    const event = `${username} just gifted a sub to ${recipient}! Omo that is so generous! Big love!`;
    queueTwitchMessage('StreamEvent', event);
  });
}

// ── Message queue ────────────────────────────────────────
let _msgQueue = [];
let _msgBusy  = false;

function queueTwitchMessage(username, message) {
  const words      = message.trim().split(' ').length;
  const isQuestion = message.includes('?');
  if (words < 2 && !isQuestion) return;
  _msgQueue.push({ username, message });
  if (_msgQueue.length > 5) _msgQueue.shift();
  if (!_msgBusy) processNextMessage();
}

async function processNextMessage() {
  if (_msgQueue.length === 0) { _msgBusy = false; return; }
  _msgBusy = true;
  const { username, message } = _msgQueue.shift();
  await sendMessage(message, username);
  setTimeout(processNextMessage, 15000);
}

// ── Public API ───────────────────────────────────────────
window.missOgTinz = {
  receive:     (username, message) => sendMessage(message, username),
  express:     setExpression,
  gesture:     doGesture,
  speak,
  showBubble,
  wave:        () => doGesture('wave', 2500),
  camMode:     setCamMode,
  stageLight:  setStageLight,
  pauseActivity:  () => { ACTIVITY.current = 'idle'; ACTIVITY.timer = 0; },
  resumeActivity: () => activityPickNext(),
};

console.log('Miss OG Tinz ready. Phase 1 active: pacing ✓  camera ✓  body turn ✓');

// ── Control Panel toggle ─────────────────────────────────
const panelToggle  = document.getElementById('panel-toggle');
const controlPanel = document.getElementById('control-panel');
panelToggle.addEventListener('click', () => {
  const isOpen = !controlPanel.classList.contains('hidden');
  controlPanel.classList.toggle('hidden', isOpen);
  panelToggle.classList.toggle('open', !isOpen);
});

// ── Control sliders ──────────────────────────────────────
function bindSlider(id, onChange) {
  const el  = document.getElementById(id);
  const val = document.getElementById(id + '-val');
  if (!el) return;
  el.addEventListener('input', () => {
    if (val) val.textContent = el.value;
    onChange(parseFloat(el.value));
  });
}

bindSlider('posX',  v => { if (vrm) vrm.scene.position.x = v; });
bindSlider('posY',  v => { if (vrm) { vrm.scene.position.y = v; vrm._restPosY = v; _houseFloorY = v - (vrm._feetOffset ?? 0); } });
bindSlider('posZ',  v => { if (vrm) vrm.scene.position.z = v; });
bindSlider('scale', v => { if (vrm) vrm.scene.scale.set(v,v,v); });
bindSlider('camY',  v => { camera.position.y = v; camera.lookAt(0, parseFloat(document.getElementById('lookY').value), 0); });
bindSlider('camZ',  v => { camera.position.z = v; });
bindSlider('lookY', v => { camera.lookAt(0, v, 0); });

// ── Colour pickers ───────────────────────────────────────
function bindColour(id, meshNames) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    if (!vrm) return;
    const col = new THREE.Color(el.value);
    vrm.scene.traverse(obj => {
      if (obj.isMesh && meshNames.includes(obj.name)) {
        const m = obj.material;
        if (m) { m.color.set(col); m.needsUpdate = true; }
      }
    });
  });
}

bindColour('col-skin',   ['Julie_Figure','Teargum']);
bindColour('col-hair',   ['Hair_Block','Brow','Lashes']);
bindColour('col-top',    ['Top']);
bindColour('col-bottom', ['Bottom']);
bindColour('col-gold',   ['Ear_Jewel','Necklece']);

document.getElementById('btn-log')?.addEventListener('click', () => {
  if (!vrm) return;
  const p = vrm.scene.position, s = vrm.scene.scale;
  console.log(`vrm pos (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})  scale ${s.x.toFixed(3)}`);
  console.log(`camera pos (${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)})`);
});
document.getElementById('btn-reset')?.addEventListener('click', () => location.reload());
