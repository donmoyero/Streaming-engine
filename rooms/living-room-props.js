/**
 * rooms/living-room-props.js
 * ─────────────────────────────────────────────────────────────────
 * Lazy-loads living room props into the Three.js scene.
 * Call loadLivingRoomProps(scene) once after the house GLB is ready.
 *
 * Props are positioned to match the HOUSE['living-room'] spot coords
 * in engine.js — adjust x/y/z if they clip walls after first test.
 *
 * LIVING_ROOM_PROP_KNOWLEDGE is plain text injected into the API
 * body so the AI knows what Miss OG Tinz is near and can comment on it.
 * ─────────────────────────────────────────────────────────────────
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';

// ── Prop definitions ─────────────────────────────────────────────
// file:    path inside models/living-room/
// x/y/z:  world position (tuned to living-room spot coords)
// ry:     rotation Y in radians (facing direction)
// scale:  uniform scale multiplier
// label:  short name used in knowledge text
// desc:   what Miss OG Tinz knows about this object
const PROPS = [
  {
    file:  'models/living-room/loungeSofaLong.glb',
    x: -4.0, y: 0, z: -4.8,
    ry: 0,
    scale: 1.0,
    label: 'sofa',
    desc:  'A long plush sofa. She sits here to chill, scroll her phone, or watch TV.',
  },
  {
    file:  'models/living-room/cabinetTelevision.glb',
    x: -2.3, y: 0, z: -5.6,
    ry: 0,
    scale: 1.0,
    label: 'TV cabinet',
    desc:  'A TV cabinet with a flatscreen. She reacts to what\'s playing — reality TV, music videos, whatever\'s on.',
  },
  {
    file:  'models/living-room/rugRectangle.glb',
    x: -2.7, y: 0.01, z: -3.8,
    ry: 0,
    scale: 1.2,
    label: 'rug',
    desc:  'A big rectangle rug in the centre of the room. Good spot for dancing or stretching.',
  },
  {
    file:  'models/living-room/lampRoundFloor.glb',
    x: -5.0, y: 0, z: -4.0,
    ry: 0,
    scale: 1.0,
    label: 'floor lamp',
    desc:  'A round floor lamp in the corner. Gives the room a warm vibe at night.',
  },
  {
    file:  'models/living-room/pottedPlant.glb',
    x: -1.0, y: 0, z: -2.2,
    ry: 0,
    scale: 1.0,
    label: 'potted plant',
    desc:  'A leafy potted plant by the fireplace end. She named it but keeps forgetting what she called it.',
  },
  {
    file:  'models/living-room/loungeChair.glb',
    x: -5.2, y: 0, z: -3.2,
    ry: Math.PI / 2,
    scale: 1.0,
    label: 'lounge chair',
    desc:  'A single lounge chair next to the sofa. She sometimes curls up here instead.',
  },
  {
    file:  'models/living-room/bookcase.glb',  // try bookcaseOpen.glb if this 404s
    x: -0.8, y: 0, z: -4.8,
    ry: 0,
    scale: 1.0,
    label: 'bookcase',
    desc:  'A bookcase against the wall. More aesthetic than functional — she\'s not reading all those.',
  },
];

// ── Knowledge string ─────────────────────────────────────────────
// Injected into the API body as living_room_context.
// Keep it short — it rides inside every chat request.
export const LIVING_ROOM_PROP_KNOWLEDGE = `
Miss OG Tinz is in her living room right now. The room has:
- A long sofa (she sits here to chill or watch TV)
- A TV cabinet with a flatscreen (she reacts to whatever's on)
- A big rug in the centre (dance/stretch spot)
- A floor lamp in the corner (warm vibes)
- A potted plant she keeps forgetting the name of
- A single lounge chair next to the sofa
- A bookcase (looks nice, barely touched)
She knows all these objects and can comment on them naturally.
`.trim();

// ── Loader ───────────────────────────────────────────────────────
const _loader = new GLTFLoader();
let _loaded = false;

/**
 * loadLivingRoomProps(scene)
 * Call once after House.glb is in the scene.
 * Each prop loads independently — a 404 on one won't block the others.
 */
export function loadLivingRoomProps(scene) {
  if (_loaded) return;
  _loaded = true;

  for (const prop of PROPS) {
    _loader.load(
      prop.file,
      (gltf) => {
        const mesh = gltf.scene;
        mesh.position.set(prop.x, prop.y, prop.z);
        mesh.rotation.y = prop.ry ?? 0;
        mesh.scale.setScalar(prop.scale ?? 1);
        mesh.traverse(n => {
          if (n.isMesh) {
            n.castShadow    = true;
            n.receiveShadow = true;
          }
        });
        scene.add(mesh);
        console.log(`[Props] ✓ ${prop.label} loaded`);
      },
      undefined,
      (err) => {
        // Non-fatal — log and move on
        console.warn(`[Props] ✗ ${prop.label} (${prop.file}) — ${err.message ?? err}`);
      }
    );
  }
}
