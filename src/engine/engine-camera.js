// ================================================================
//  engine-camera.js
//  TV-director camera — alternates focus between Miss OG Tinz and
//  Lora every 8–15 s. Always locks to the speaker when talking.
//  Never orbits the midpoint (that puts the camera inside walls).
//
//  KEY CHANGE: orbit ONE avatar at a time, not the midpoint.
//  resolveWallCollision() from engine-scene keeps it out of walls.
// ================================================================

import { camera, getVrm, getVrmLora, resolveWallCollision } from './engine-scene.js';

// NOTE: engine-life.js imports setCamMode/updateCamera/onActivityChanged/
// setSleepMode FROM this file, so importing it back statically here would
// create a circular import (engine-camera.js ⇄ engine-life.js). Turbopack's
// static export analysis can misresolve that cycle and report real exports
// (e.g. setTVOn) as missing. Load it dynamically once instead — walk,
// getRoomPath, DOORS, and HOUSE_GRAPH are all stable references/objects
// that are safe to read every frame once the import resolves.
// (vrmPos and HOUSE_BOUNDS were imported but never used here — dropped.)
let _life = null;
(async () => { _life = await import('./engine-life.js'); })();

// Safe accessor for walk — used every frame in updateCamera() below, so it
// needs a harmless fallback for the brief window before _life resolves.
function _getWalk() { return _life ? _life.walk : { active: false }; }

// ── Wall-clamp margin ────────────────────────────────────────────
const CAM_WALL_MARGIN = 1.6;

// ── Max safe orbit distance — beyond this walls become visible ───
// Derived from HOUSE_BOUNDS: interior is ~±5 units, avatar near centre
// means we can go at most ~3 units before risking a wall.
const MAX_SAFE_DIST = 2.8;

// ── Interaction mode ─────────────────────────────────────────────
let camMode = 'IDLE';
export const CAM_LERP = 0.04;

export const STREAMER_CAM = {
  IDLE:  { dist: 2.00, height: 1.60, lookHeight: 1.15, sideShift: 0.0 },
  SPEAK: { dist: 1.25, height: 1.65, lookHeight: 1.42, sideShift: 0.0 },
  THINK: { dist: 1.60, height: 1.58, lookHeight: 1.30, sideShift: 0.22 },
  WALK:  { dist: 2.00, height: 1.65, lookHeight: 1.20, sideShift: 0.0 }, // was 2.40 — too far
};

// ── Sims mode ────────────────────────────────────────────────────
const SIMS_CAM = { heightAbove: 4.5, distBack: 5.0, distSide: 2.5, lookAtHeight: 0.8 };
let _simsMode = false;
export function setSimsMode(on) { _simsMode = on; }
export function getSimsMode()   { return _simsMode; }

// ── Sleep mode — slow cinematic house sweep ───────────────────────
let _sleepMode       = false;
let _sleepAngle      = 0;
let _sleepSweepTimer = 0;
export function setSleepMode(on) { _sleepMode = on; if (!on) _sleepAngle = 0; }
export function getSleepMode()   { return _sleepMode; }

// ── TV-director focus state ───────────────────────────────────────
// 'miss' | 'lora'  — which avatar the camera orbits right now
let _focusTarget  = 'miss';
let _focusTimer   = 0;
const FOCUS_MIN   = 25;   // minimum seconds on one avatar before any possible switch
const FOCUS_MAX   = 45;   // maximum seconds before forced re-evaluation
let _focusDwell   = FOCUS_MIN + Math.random() * (FOCUS_MAX - FOCUS_MIN);

// Hard cooldown after a cut — camera won't even evaluate switching during this window
const FOCUS_COOLDOWN = 20; // seconds of guaranteed lock after any cut
let _focusCooldown   = 0;

// Force-lock: when Miss is speaking we never cut to Lora
let _speakLock    = false;

// ── Angle presets ─────────────────────────────────────────────────
// distMult is applied to STREAMER_CAM dist. WIDE was 1.80 which pushed
// the camera 2.4–3.6 units out — into walls. Capped to 1.30 (2.0–2.6 units max).
const ANGLE_PRESETS = {
  FRONT:      { angleOffset:  0,           distMult: 1.0,  heightMult: 1.0,  lookOffset:  0.0  },
  FRONT_LOW:  { angleOffset:  0,           distMult: 1.1,  heightMult: 0.82, lookOffset: -0.08 },
  CLOSE:      { angleOffset:  0,           distMult: 0.70, heightMult: 1.06, lookOffset:  0.06 },
  SIDE_L:     { angleOffset: -Math.PI / 2, distMult: 1.05, heightMult: 1.0,  lookOffset:  0.0  },
  SIDE_R:     { angleOffset:  Math.PI / 2, distMult: 1.05, heightMult: 1.0,  lookOffset:  0.0  },
  WIDE:       { angleOffset:  0,           distMult: 1.30, heightMult: 1.10, lookOffset: -0.05 }, // was 1.80 — caused wall clips
  QUARTER_L:  { angleOffset: -Math.PI / 4, distMult: 1.1,  heightMult: 1.0,  lookOffset:  0.0  },
  QUARTER_R:  { angleOffset:  Math.PI / 4, distMult: 1.1,  heightMult: 1.0,  lookOffset:  0.0  },
};

const ACTIVITY_ANGLES = {
  idle:        ['FRONT', 'FRONT', 'FRONT', 'QUARTER_L', 'QUARTER_R', 'WIDE'],
  dance:       ['WIDE', 'WIDE', 'SIDE_L', 'SIDE_R', 'FRONT', 'FRONT_LOW'],
  listenDance: ['WIDE', 'WIDE', 'SIDE_L', 'SIDE_R', 'FRONT', 'FRONT_LOW'],
  stretch:     ['SIDE_L', 'SIDE_R', 'WIDE', 'FRONT', 'FRONT'],
  hairflick:   ['SIDE_L', 'SIDE_R', 'QUARTER_R', 'CLOSE', 'FRONT'],
  hiponhip:    ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'QUARTER_R', 'FRONT'],
  sofaSit:     ['FRONT', 'FRONT', 'FRONT', 'SIDE_L', 'SIDE_R', 'QUARTER_L'],
  phoneScroll: ['SIDE_R', 'QUARTER_R', 'FRONT', 'FRONT'],
  tvReact:     ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'WIDE', 'FRONT'],
  watchTV:     ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'WIDE', 'FRONT'],
  readBook:    ['SIDE_L', 'SIDE_R', 'FRONT', 'FRONT'],
  typing:      ['SIDE_L', 'SIDE_R', 'QUARTER_L', 'FRONT'],
  monitor:     ['SIDE_R', 'SIDE_L', 'QUARTER_R', 'FRONT'],
  stirring:    ['SIDE_L', 'QUARTER_L', 'FRONT', 'FRONT'],
  chopping:    ['SIDE_R', 'SIDE_L', 'FRONT'],
  tasting:     ['FRONT', 'FRONT', 'CLOSE', 'QUARTER_R'],
  mirrorPose:  ['SIDE_L', 'SIDE_R', 'FRONT', 'FRONT'],
  noseCover:   ['CLOSE', 'FRONT', 'FRONT', 'QUARTER_R'],
  windowLook:  ['SIDE_L', 'SIDE_R', 'WIDE'],
  fireGaze:    ['SIDE_L', 'SIDE_R', 'FRONT_LOW', 'FRONT'],
  washingUp:   ['SIDE_L', 'QUARTER_L', 'FRONT'],
  cabinetOpen: ['SIDE_R', 'QUARTER_R', 'FRONT'],
  eatAtTable:  ['FRONT', 'FRONT', 'SIDE_L', 'SIDE_R'],
  drinkCoffee: ['FRONT', 'CLOSE', 'QUARTER_R'],
  cookDance:   ['SIDE_L', 'WIDE', 'FRONT', 'FRONT'],
  bedLie:      ['SIDE_L', 'SIDE_R', 'FRONT'],
  bedLiePhone: ['SIDE_R', 'FRONT'],
};

const ANGLE_DWELL_MIN_MS = 4000;
const ANGLE_DWELL_MAX_MS = 9000;

let _currentAnglePreset = 'FRONT';
let _angleDwellTimer    = 0;
let _angleDwellDuration = ANGLE_DWELL_MIN_MS;
let _currentActivity    = 'idle';

// ================================================================
//  ROOM-AWARE CAMERA DRONE
//  Tracks which room the camera is conceptually "in" and routes
//  it through door waypoints — exactly mirroring the avatar walker
//  but for camera positioning — so it never cuts through walls.
// ================================================================

// ── Camera room ──────────────────────────────────────────────────
// Starts in the same room Miss starts in (studio).
let _cameraRoom = 'studio';

// ── Room-based camera presets ────────────────────────────────────
// Each entry describes the orbital shape for that room.
// dist / height / lookHeight map 1-to-1 onto the STREAMER_CAM schema
// so they slot cleanly into the existing orbit maths.
const ROOM_CAM_PRESETS = {
  'living-room': { dist: 2.10, height: 1.55, lookHeight: 1.20, label: 'medium shot'         },
  kitchen:       { dist: 1.70, height: 1.80, lookHeight: 1.10, label: 'over-counter shot'    },
  bedroom:       { dist: 1.60, height: 1.65, lookHeight: 1.35, label: 'medium close-up'      },
  hallway:       { dist: 2.50, height: 1.70, lookHeight: 1.15, label: 'wider shot'           },
  dining:        { dist: 2.00, height: 1.60, lookHeight: 1.20, label: 'medium shot'          },
  bathroom:      { dist: 1.50, height: 1.65, lookHeight: 1.30, label: 'medium close-up'      },
  studio:        { dist: 1.90, height: 1.60, lookHeight: 1.25, label: 'medium shot'          },
};

// ── Activity modifiers — override the room preset when active ────
// null fields fall through to the room preset value.
const ACTIVITY_CAM_MODIFIERS = {
  bedLie:      { dist: 2.50, height: 2.20, lookHeight: 0.80, anglePreset: 'SIDE_L', label: 'static wide shot'    },
  bedLiePhone: { dist: 2.50, height: 2.20, lookHeight: 0.80, anglePreset: 'SIDE_R', label: 'static wide shot'    },
  dance:       { dist: 2.60, height: 1.55, lookHeight: 1.10, anglePreset: 'WIDE',   label: 'full body shot'      },
  listenDance: { dist: 2.60, height: 1.55, lookHeight: 1.10, anglePreset: 'WIDE',   label: 'full body shot'      },
  cookDance:   { dist: 2.60, height: 1.55, lookHeight: 1.10, anglePreset: 'WIDE',   label: 'full body shot'      },
  stirring:    { dist: 1.55, height: 1.90, lookHeight: 1.15, anglePreset: 'SIDE_L', label: 'over-shoulder shot'  },
  chopping:    { dist: 1.55, height: 1.90, lookHeight: 1.15, anglePreset: 'SIDE_R', label: 'over-shoulder shot'  },
  washingUp:   { dist: 1.55, height: 1.90, lookHeight: 1.15, anglePreset: 'SIDE_L', label: 'over-shoulder shot'  },
};
// SPEAK modifier is handled inline (camMode === 'SPEAK') — no entry needed here.

// ── Resolve effective preset for current room + activity ─────────
function _resolveRoomPreset(roomName, activityName) {
  const mod = ACTIVITY_CAM_MODIFIERS[activityName];
  const base = ROOM_CAM_PRESETS[roomName] || ROOM_CAM_PRESETS['studio'];
  if (!mod) return { ...base };
  // Activity modifier wins — merge onto base so any null field falls back
  return {
    dist:        mod.dist        ?? base.dist,
    height:      mod.height      ?? base.height,
    lookHeight:  mod.lookHeight  ?? base.lookHeight,
    label:       mod.label       ?? base.label,
    anglePreset: mod.anglePreset ?? null,   // null = keep current angle logic
  };
}

// ── Major-transition cooldown — 10 s minimum between room cuts ───
const CAM_ROOM_TRANSITION_COOLDOWN = 10; // seconds
let _camTransitionCooldown = 0;

// ── Drone waypoint queue ─────────────────────────────────────────
// When the camera needs to move to a different room it queues
// the door thresholds from DOORS and steps through them one by one,
// identical in structure to walkThroughWaypoints in engine-life.js.
let _droneWaypoints = [];   // [{ x, z, toRoom }, ...]
let _droneActive    = false;
let _droneTargetX   = 0;
let _droneTargetZ   = 0;
let _droneTargetRoom = null;
const DRONE_SPEED   = 1.8;   // units per second — slightly faster than avatar walk

function _buildDroneWaypoints(fromRoom, toRoom) {
  if (!_life) return []; // life.js hasn't resolved yet — skip, room label still updates elsewhere
  const { getRoomPath, DOORS, HOUSE_GRAPH } = _life;
  if (!fromRoom || !toRoom || fromRoom === toRoom) return [];
  if (!HOUSE_GRAPH[fromRoom] || !HOUSE_GRAPH[toRoom]) return [];
  const roomPath = getRoomPath(fromRoom, toRoom);
  if (!roomPath || roomPath.length <= 1) return [];

  // Build ROOM_CONNECTIONS map from DOORS on the fly (mirrors engine-life.js logic)
  const connections = DOORS.reduce((acc, door) => {
    const wp = { x: door.x, z: door.z };
    acc[door.fromRoom] = acc[door.fromRoom] || {};
    acc[door.fromRoom][door.toRoom] = wp;
    if (HOUSE_GRAPH[door.toRoom]) {
      acc[door.toRoom] = acc[door.toRoom] || {};
      acc[door.toRoom][door.fromRoom] = wp;
    }
    return acc;
  }, {});

  const waypoints = [];
  for (let i = 1; i < roomPath.length; i++) {
    const prev = roomPath[i - 1];
    const next = roomPath[i];
    const wp   = connections[prev]?.[next];
    if (!wp) continue;
    waypoints.push({ x: wp.x, z: wp.z, toRoom: next });
    console.log(`[Camera] Moving through ${_fmtRoom(prev)}→${_fmtRoom(next)} door`);
  }
  return waypoints;
}

function _fmtRoom(r) {
  return String(r).split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// Called once per frame while drone is active.
// Returns { x, z } for the camera's current en-route position,
// or null when the final destination is reached.
function _updateDrone(delta, finalX, finalZ) {
  if (!_droneActive) return null;

  const target = _droneWaypoints.length
    ? _droneWaypoints[0]
    : { x: finalX, z: finalZ, toRoom: _droneTargetRoom };

  const dx   = target.x - camCurrent.x;
  const dz   = target.z - camCurrent.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const step = DRONE_SPEED * delta;

  if (dist <= step) {
    // Arrived at this waypoint
    camCurrent.x = target.x;
    camCurrent.z = target.z;

    if (_droneWaypoints.length) {
      const arrived = _droneWaypoints.shift();
      _cameraRoom   = arrived.toRoom;
      console.log(`[Camera] Entering ${_fmtRoom(_cameraRoom)}`);
    } else {
      // All legs done
      _droneActive    = false;
      _cameraRoom     = _droneTargetRoom;
      const preset    = _resolveRoomPreset(_cameraRoom, _currentActivity);
      console.log(`[Camera] ${_fmtRoom(_cameraRoom)} ${preset.label}`);
    }
  } else {
    camCurrent.x += (dx / dist) * step;
    camCurrent.z += (dz / dist) * step;
  }

  return { x: camCurrent.x, z: camCurrent.z };
}

// Kick off a drone route from _cameraRoom to subjectRoom.
// Respects the 10 s cooldown — silently skips if too soon.
function _startDroneRoute(subjectRoom) {
  if (_camTransitionCooldown > 0) return;
  if (subjectRoom === _cameraRoom)  return;
  if (_droneActive && _droneTargetRoom === subjectRoom) return;

  const waypoints = _buildDroneWaypoints(_cameraRoom, subjectRoom);
  if (!waypoints.length && subjectRoom !== _cameraRoom) {
    // No path found — just update the room label silently
    _cameraRoom = subjectRoom;
    return;
  }

  _droneWaypoints  = waypoints;
  _droneActive     = true;
  _droneTargetRoom = subjectRoom;
  _camTransitionCooldown = CAM_ROOM_TRANSITION_COOLDOWN;
  console.log(`[Camera] Routing ${_fmtRoom(_cameraRoom)} → ${_fmtRoom(subjectRoom)}`);
}

// ── Room bounding boxes ────────────────────────────────────────────
// Shared by _getAvatarRoom() (below) and the cinematic orbit room-clamp.
const _ROOM_BOUNDS = {
  'living-room': { minX: -5.75, maxX: -0.25, minZ: -6.25, maxZ: -0.75 },
  kitchen:       { minX: -6.05, maxX: -1.55, minZ: -1.25, maxZ:  3.25 },
  dining:        { minX: -3.75, maxX: -0.25, minZ:  0.50, maxZ:  4.50 },
  hallway:       { minX: -0.50, maxX:  1.70, minZ: -5.75, maxZ:  0.75 },
  bedroom:       { minX:  1.55, maxX:  6.05, minZ: -5.00, maxZ:  1.00 },
  bathroom:      { minX:  2.30, maxX:  5.30, minZ:  0.00, maxZ:  3.00 },
  studio:        { minX: -3.95, maxX: -1.45, minZ: -5.25, maxZ: -2.75 },
};

// ── Determine which room the focused avatar is in ─────────────────
// Uses the avatar's world-space X/Z against HOUSE room origin+size bounds.
function _getAvatarRoom(x, z) {
  for (const [room, b] of Object.entries(_ROOM_BOUNDS)) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return room;
  }
  return 'hallway'; // safe fallback — hallway connects everything
}

export const camCurrent = { x: 0, y: 1.55, z: 3.8, lookX: 0, lookY: 1.15, lookZ: 0 };

export let _camFacingY = Math.PI;
export function setCamFacingY(y) { _camFacingY = y; }

// ── Public API ───────────────────────────────────────────────────
export function setCamMode(mode) {
  if (!['IDLE','SPEAK','THINK','WALK'].includes(mode)) return;
  const wasSpeaking = camMode === 'SPEAK';
  camMode     = mode;
  _speakLock  = (mode === 'SPEAK');
  if (_speakLock) {
    _focusTarget   = 'miss';   // always cut to Miss when she speaks
    _focusCooldown = 0;        // reset cooldown — lock is handled by _speakLock
  } else if (wasSpeaking) {
    // Just finished speaking — hold on Miss for a natural beat before any cut is allowed
    _focusTimer    = 0;
    _focusCooldown = 12;       // 12-second post-speech lock
  }
}

export function onActivityChanged(activityName) {
  _currentActivity    = activityName || 'idle';
  _angleDwellTimer    = 0;
  _angleDwellDuration = ANGLE_DWELL_MIN_MS + Math.random() * (ANGLE_DWELL_MAX_MS - ANGLE_DWELL_MIN_MS);
  _pickAngleForActivity(_currentActivity);
}

export function setCamAngle(presetName) {
  if (ANGLE_PRESETS[presetName]) _currentAnglePreset = presetName;
}

// ── Snap on first load — orbit Miss ─────────────────────────────
export function _snapCameraToVRM() {
  const vrm = getVrm();
  if (!vrm) return;
  const p  = STREAMER_CAM.IDLE;
  const fy = vrm.scene.rotation.y;
  _camFacingY = fy;
  const mx = vrm.scene.position.x;
  const my = vrm.scene.position.y;
  const mz = vrm.scene.position.z;
  const cx = mx + Math.sin(fy) * p.dist;
  const cy = my + p.height;
  const cz = mz + Math.cos(fy) * p.dist;
  camCurrent.x = cx; camCurrent.y = cy; camCurrent.z = cz;
  camCurrent.lookX = mx; camCurrent.lookY = my + p.lookHeight; camCurrent.lookZ = mz;
  camera.position.set(cx, cy, cz);
  camera.lookAt(mx, my + p.lookHeight, mz);
}

// ── Internal: pick angle ─────────────────────────────────────────
function _pickAngleForActivity(activityName) {
  const pool = ACTIVITY_ANGLES[activityName] || ACTIVITY_ANGLES.idle;
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick === _currentAnglePreset && pool.length > 1) {
    pick = pool[Math.floor(Math.random() * pool.length)];
  }
  _currentAnglePreset = pick;
}

// ── TV-director switch — patient, not trigger-happy ──────────────
//
//  Cuts only happen when:
//   (a) The cooldown has fully expired AND the dwell time is up, OR
//   (b) The OTHER character starts speaking / begins a HIGH-interest activity
//      while we've already been watching the current one for at least FOCUS_MIN.
//
function _maybeSwitch(delta, lora) {
  if (_speakLock || !lora) return;

  // Tick both timers
  _focusCooldown = Math.max(0, _focusCooldown - delta);
  _focusTimer   += delta;

  // Still in hard cooldown — never cut
  if (_focusCooldown > 0) return;

  const otherWho   = _focusTarget === 'miss' ? 'lora' : 'miss';
  const otherAct   = otherWho === 'miss'
    ? (window._missCurrentActivity || 'idle')
    : (window._loraCurrentActivity || 'idle');

  const otherIsHot = _isHighInterest(otherAct);

  // Fast-cut path: other character is doing something compelling
  // and we've been on the current one for at least FOCUS_MIN already
  if (otherIsHot && _focusTimer >= FOCUS_MIN) {
    _doSwitch(otherWho, 'hot-activity');
    return;
  }

  // Normal path: dwell time expired — re-evaluate
  if (_focusTimer >= _focusDwell) {
    const missScore = _scoreTarget('miss');
    const loraScore = _scoreTarget('lora');
    const winner    = loraScore > missScore ? 'lora' : 'miss';

    // Only actually cut if the winner differs from current focus
    // and the margin is meaningful (avoids aimless back-and-forth)
    const margin = Math.abs(loraScore - missScore);
    if (winner !== _focusTarget && margin > 1.0) {
      _doSwitch(winner, 'dwell');
    } else {
      // Stay on current — reset timer for another dwell cycle
      _focusTimer  = 0;
      _focusDwell  = FOCUS_MIN + Math.random() * (FOCUS_MAX - FOCUS_MIN);
    }
  }
}

function _doSwitch(newTarget, reason) {
  _focusTarget   = newTarget;
  _focusTimer    = 0;
  _focusCooldown = FOCUS_COOLDOWN;
  _focusDwell    = FOCUS_MIN + Math.random() * (FOCUS_MAX - FOCUS_MIN);
  _pickAngleForActivity(_currentActivity);
  console.log(`[Cam] cut → ${_focusTarget} (${reason})`);
}

// Activities that justify a fast cut to the OTHER character
const HIGH_INTEREST_ACTS = new Set([
  'stirring', 'chopping', 'dance', 'cookDance', 'tasting',
  'flip_food', 'fry_egg', 'hairflick', 'noseCover', 'SPEAK',
]);
function _isHighInterest(act) { return HIGH_INTEREST_ACTS.has(act); }

function _scoreTarget(who) {
  let score = 0;
  const act = who === 'miss'
    ? (window._missCurrentActivity || 'idle')
    : (window._loraCurrentActivity || 'idle');

  // Only truly active / visual activities earn a meaningful bonus
  if (_isHighInterest(act))                                   score += 4;
  else if (['phoneScroll','tvReact','watchTV','typing',
            'monitor','readBook','eatAtTable','drinkCoffee',
            'mirrorPose','windowLook','fireGaze'].includes(act)) score += 2;
  // idle / sofaSit / bedLie earn 0 — no reason to cut there

  // Bias toward whoever we're currently watching so the camera stays put
  if (who === _focusTarget)                                   score += 2;

  // Tiny random jitter — breaks exact ties, nothing more
  score += Math.random() * 0.4;
  return score;
}

// ── Main update ──────────────────────────────────────────────────
export function updateCamera(delta) {
  const vrm  = getVrm();
  if (!vrm) return;
  const lora = (typeof getVrmLora === 'function') ? getVrmLora() : null;

  // ── Tick major-transition cooldown ───────────────────────────
  _camTransitionCooldown = Math.max(0, _camTransitionCooldown - delta);

  // ── TV-director switch ────────────────────────────────────────
  _maybeSwitch(delta, lora);

  // ── Determine subject room and start drone if rooms differ ───
  // Only check when not speaking (req 10 — no random moves while speaking)
  const focusVrmForRoom = (_focusTarget === 'lora' && lora) ? lora : vrm;
  const subjectRoom = _getAvatarRoom(
    focusVrmForRoom.scene.position.x,
    focusVrmForRoom.scene.position.z
  );
  if (!_speakLock && subjectRoom !== _cameraRoom) {
    _startDroneRoute(subjectRoom);
  }

  // ── SLEEP MODE — slow cinematic house sweep ───────────────────
  if (_sleepMode) {
    _sleepSweepTimer += delta;
    const speed = 0.04; // very slow pan
    _sleepAngle += delta * speed;
    // Orbit the focused avatar rather than world origin (which clips walls)
    const sleepTarget = (_focusTarget === 'lora' && lora) ? lora : vrm;
    const scx = sleepTarget.scene.position.x;
    const scz = sleepTarget.scene.position.z;
    const radius = 2.5; // safe indoor radius (was 4.5 — too far, hit walls)
    const height = 2.2;
    const tx = scx + Math.sin(_sleepAngle) * radius;
    const tz = scz + Math.cos(_sleepAngle) * radius;
    // Clamp sleep camera inside bounds too
    const safeSleep = resolveWallCollision(tx, tz, CAM_WALL_MARGIN);
    const L  = 0.008; // extremely slow lerp — cinematic
    camCurrent.x += (safeSleep.x - camCurrent.x)    * Math.min(1, L * 60 * delta);
    camCurrent.y += (height      - camCurrent.y)     * Math.min(1, L * 60 * delta);
    camCurrent.z += (safeSleep.z - camCurrent.z)     * Math.min(1, L * 60 * delta);
    camCurrent.lookX += (scx - camCurrent.lookX) * Math.min(1, L * 60 * delta * 1.5);
    camCurrent.lookY += (1.0 - camCurrent.lookY) * Math.min(1, L * 60 * delta * 1.5);
    camCurrent.lookZ += (scz - camCurrent.lookZ) * Math.min(1, L * 60 * delta * 1.5);
    camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
    camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
    return;
  }

  // ── Pick the avatar we're focused on right now ────────────────
  const focusVrm = (_focusTarget === 'lora' && lora) ? lora : vrm;
  const fx = focusVrm.scene.position.x;
  const fy_ = focusVrm.scene.position.y;   // height
  const fz = focusVrm.scene.position.z;

  // ── SIMS MODE ─────────────────────────────────────────────────
  if (_simsMode) {
    // Sims orbits midpoint — fine because camera is high and angled down
    const mx = lora ? (vrm.scene.position.x + lora.scene.position.x) / 2 : vrm.scene.position.x;
    const my = vrm.scene.position.y;
    const mz = lora ? (vrm.scene.position.z + lora.scene.position.z) / 2 : vrm.scene.position.z;
    const tx = mx + SIMS_CAM.distSide;
    const ty = my + SIMS_CAM.heightAbove;
    const tz = mz + SIMS_CAM.distBack;
    const L  = 0.025;
    camCurrent.x += (tx - camCurrent.x) * Math.min(1, L * 60 * delta);
    camCurrent.y += (ty - camCurrent.y) * Math.min(1, L * 60 * delta);
    camCurrent.z += (tz - camCurrent.z) * Math.min(1, L * 60 * delta);
    camCurrent.lookX += (mx - camCurrent.lookX) * Math.min(1, L * 60 * delta * 2);
    camCurrent.lookY += (my + SIMS_CAM.lookAtHeight - camCurrent.lookY) * Math.min(1, L * 60 * delta * 2);
    camCurrent.lookZ += (mz - camCurrent.lookZ) * Math.min(1, L * 60 * delta * 2);
    camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
    camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
    return;
  }

  // ── Smooth facing — track the focused avatar ──────────────────
  const rawFacing = focusVrm.scene.rotation.y;
  let df = rawFacing - _camFacingY;
  while (df >  Math.PI) df -= Math.PI * 2;
  while (df < -Math.PI) df += Math.PI * 2;
  const facingLerp = _getWalk().active ? 0.025 : 0.035;
  _camFacingY += df * Math.min(1, delta / facingLerp);
  _camFacingY  = ((_camFacingY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  // ── Angle dwell timer — suppressed while speaking (req 10) ───
  if (camMode === 'IDLE' && !_getWalk().active && !_speakLock) {
    _angleDwellTimer += delta * 1000;
    if (_angleDwellTimer >= _angleDwellDuration) {
      _angleDwellTimer    = 0;
      _angleDwellDuration = ANGLE_DWELL_MIN_MS + Math.random() * (ANGLE_DWELL_MAX_MS - ANGLE_DWELL_MIN_MS);
      _pickAngleForActivity(_currentActivity);
    }
  }

  // ── Resolve preset & angle ────────────────────────────────────
  let interactionPreset;
  let effectiveAngle;

  // ── TWO-SHOT: both characters are speaking/interacting ────────
  // When Miss is in SPEAK mode AND Lora exists, frame both characters
  // together using the midpoint — but only if they're close enough
  // that a two-shot won't zoom out into walls.
  const missAct = window._missCurrentActivity || 'idle';
  const loraAct = window._loraCurrentActivity || 'idle';
  const bothTalking = camMode === 'SPEAK' && lora &&
    (loraAct === 'SPEAK' || loraAct === 'listenDance' || loraAct === 'idle');

  let twoShotActive = false;
  let twoShotMidX = fx, twoShotMidZ = fz;

  if (bothTalking && lora) {
    const lx = lora.scene.position.x;
    const lz = lora.scene.position.z;
    const separation = Math.sqrt((fx - lx) ** 2 + (fz - lz) ** 2);
    // Only do a two-shot if characters are within 2.5 units of each other
    // — beyond that a two-shot would need to zoom out too far
    if (separation < 2.5) {
      twoShotActive = true;
      twoShotMidX = (fx + lx) / 2;
      twoShotMidZ = (fz + lz) / 2;
    }
  }

  // ── Room preset + activity modifier ──────────────────────────
  // SPEAK and WALK modes use STREAMER_CAM directly (unchanged).
  // IDLE/THINK use the room preset, optionally overridden by the
  // activity modifier. This gives per-room framing without touching
  // any of the existing SPEAK/WALK/THINK paths.
  const roomPreset     = _resolveRoomPreset(_cameraRoom, _currentActivity);
  const actMod         = ACTIVITY_CAM_MODIFIERS[_currentActivity];

  if (_getWalk().active) {
    interactionPreset = STREAMER_CAM.WALK;
    effectiveAngle    = ANGLE_PRESETS.FRONT; // was WIDE — FRONT tracks character safely
  } else if (camMode === 'SPEAK') {
    interactionPreset = STREAMER_CAM.SPEAK;
    effectiveAngle    = ANGLE_PRESETS.FRONT;
  } else if (camMode === 'THINK') {
    interactionPreset = STREAMER_CAM.THINK;
    effectiveAngle    = ANGLE_PRESETS.QUARTER_R;
  } else {
    // IDLE — blend room preset into the orbital shape
    interactionPreset = {
      dist:       roomPreset.dist,
      height:     roomPreset.height,
      lookHeight: roomPreset.lookHeight,
      sideShift:  STREAMER_CAM.IDLE.sideShift,
    };
    // Activity modifier can pin a specific angle preset (e.g. WIDE for dance)
    const pinnedAngle = actMod?.anglePreset;
    if (pinnedAngle && ANGLE_PRESETS[pinnedAngle]) {
      effectiveAngle = ANGLE_PRESETS[pinnedAngle];
    } else {
      effectiveAngle = ANGLE_PRESETS[_currentAnglePreset] || ANGLE_PRESETS.FRONT;
    }
  }

  // ── Compute target — orbit the FOCUSED avatar only ────────────
  const orbitAngle = _camFacingY + effectiveAngle.angleOffset;
  // Hard-cap dist so it can never reach walls regardless of preset/mult
  const rawDist    = interactionPreset.dist * effectiveAngle.distMult;
  const dist       = Math.min(rawDist, MAX_SAFE_DIST);
  const height     = interactionPreset.height * effectiveAngle.heightMult;
  const lookHeight = interactionPreset.lookHeight + effectiveAngle.lookOffset;

  // Orbit origin: midpoint for two-shot, focused character otherwise
  const orbitX = twoShotActive ? twoShotMidX : fx;
  const orbitZ = twoShotActive ? twoShotMidZ : fz;

  let tx = orbitX + Math.sin(orbitAngle) * dist;
  const ty = fy_ + height;
  let tz = orbitZ + Math.cos(orbitAngle) * dist;

  // ── Wall push-out ─────────────────────────────────────────────
  const safe = resolveWallCollision(tx, tz, CAM_WALL_MARGIN);
  tx = safe.x;
  tz = safe.z;

  // ── Room containment (cinematic shots only) ────────────────────
  // resolveWallCollision() leaves door gaps open so avatars can walk
  // through them — but a cinematic orbit shot should never wander out
  // through a doorway just because the angle lines up with one. Clamp
  // the orbit target to the room the SUBJECT is actually standing in,
  // not the camera's previous room, so a transition still lets the
  // drone route between rooms (that path is handled separately below)
  // while a normal orbit always frames from inside the subject's room.
  if (!_droneActive) {
    const subjectRoomNow = _getAvatarRoom(orbitX, orbitZ);
    const rb = _ROOM_BOUNDS[subjectRoomNow];
    if (rb) {
      const rm = CAM_WALL_MARGIN; // keep the same margin used against interior walls
      tx = Math.max(rb.minX + rm, Math.min(rb.maxX - rm, tx));
      tz = Math.max(rb.minZ + rm, Math.min(rb.maxZ - rm, tz));
    }
  }

  // ── Drone in-transit: override XZ with waypoint path ─────────
  // Y and look-at still lerp to the subject so the avatar stays
  // visible throughout the transit. Only the camera's XZ position
  // is driven by the drone queue.
  if (_droneActive) {
    _updateDrone(delta, tx, tz);
    // tx/tz already mutated inside _updateDrone via camCurrent — skip normal lerp
    camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
    camera.lookAt(fx, fy_ + lookHeight, fz);
    return;
  }

  // ── Lerp ──────────────────────────────────────────────────────
  const L = camMode === 'SPEAK' ? 0.09 : _getWalk().active ? 0.03 : 0.018;
  const lf = Math.min(1, L * 60 * delta);

  // Look at midpoint when two-shot, otherwise focused character
  const lookAtX = twoShotActive ? twoShotMidX : fx;
  const lookAtZ = twoShotActive ? twoShotMidZ : fz;

  camCurrent.x     += (tx              - camCurrent.x)    * lf;
  camCurrent.y     += (ty              - camCurrent.y)     * lf;
  camCurrent.z     += (tz              - camCurrent.z)     * lf;
  camCurrent.lookX += (lookAtX         - camCurrent.lookX) * Math.min(1, lf * 1.5);
  camCurrent.lookY += (fy_ + lookHeight - camCurrent.lookY) * Math.min(1, lf * 1.5);
  camCurrent.lookZ += (lookAtZ         - camCurrent.lookZ) * Math.min(1, lf * 1.5);

  camera.position.set(camCurrent.x, camCurrent.y, camCurrent.z);
  camera.lookAt(camCurrent.lookX, camCurrent.lookY, camCurrent.lookZ);
}
