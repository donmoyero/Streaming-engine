// engine-wardrobe.js
// Permanent outfit system for Miss OG Tinz and Lora
// Guarantees they are NEVER in the same outfit combination

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ─────────────────────────────────────────────
// WARDROBE INVENTORY
// All paths relative to repo root
// ─────────────────────────────────────────────
const WARDROBE = {
  tops:       ['wardrope/female_varsity_jacket.glb',
               'wardrope/female_crop_hoodie.glb',
               'wardrope/female_biker_set.glb'],

  bottoms:    ['wardrope/female_mini_skirt.glb'],

  shoes:      ['wardrope/female_thigh_boots.glb',
               'wardrope/female_platform_sneakers.glb'],

  hats:       ['wardrope/female_bucket_hat.glb',
               'wardrope/female_butterfly_clip.glb'],

  jewelry:    ['wardrope/female_gold_hoops.glb',
               'wardrope/female_layered_necklace.glb',
               'wardrope/unisex_gold_bracelet.glb'],

  accessories:['wardrope/unisex_crossbody_bag.glb'],
};

// ─────────────────────────────────────────────
// PERMANENT OUTFIT ASSIGNMENTS
// Edit these to swap looks without touching logic
// ─────────────────────────────────────────────
export const OUTFITS = {
  missOgTinz: {
    top:        WARDROBE.tops[0],         // varsity jacket
    bottom:     WARDROBE.bottoms[0],      // mini skirt
    shoes:      WARDROBE.shoes[0],        // thigh boots
    hat:        WARDROBE.hats[1],         // butterfly clip
    jewelry:    WARDROBE.jewelry[0],      // gold hoops
    accessory:  WARDROBE.accessories[0],  // crossbody bag
  },
  lora: {
    top:        WARDROBE.tops[1],         // crop hoodie
    bottom:     WARDROBE.bottoms[0],      // mini skirt (same piece, different combo)
    shoes:      WARDROBE.shoes[1],        // platform sneakers
    hat:        WARDROBE.hats[0],         // bucket hat
    jewelry:    WARDROBE.jewelry[1],      // layered necklace
    accessory:  null,                     // no bag — keeps looks distinct
  },
};

// ─────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────
const loader = new GLTFLoader();

/**
 * Load a single GLB and return its scene root.
 * Returns null (with console warning) if path is null/undefined.
 */
async function loadGLB(path) {
  if (!path) return null;
  return new Promise((resolve, reject) => {
    loader.load(
      path,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn(`[Wardrobe] Failed to load ${path}:`, err);
        resolve(null); // soft-fail so other pieces still load
      }
    );
  });
}

// ─────────────────────────────────────────────
// BONE ATTACH HELPER
// Attaches a GLB mesh to the nearest matching VRM bone.
// ─────────────────────────────────────────────
const BONE_MAP = {
  // outfit slot  →  VRM humanoid bone name
  top:         'chest',
  bottom:      'hips',
  shoes:       'leftFoot',    // cloned to rightFoot below
  hat:         'head',
  jewelry:     'neck',
  accessory:   'spine',
};

function attachToBone(vrmHumanoid, boneKey, mesh) {
  if (!mesh) return;

  const boneName = BONE_MAP[boneKey];
  const bone     = vrmHumanoid.getRawBoneNode(boneName);

  if (!bone) {
    console.warn(`[Wardrobe] Bone not found: ${boneName}`);
    return;
  }

  // Zero out transform — the GLB artist should have modelled at origin
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);

  bone.add(mesh);

  // Mirror shoes to right foot as well
  if (boneKey === 'shoes') {
    const rightBone = vrmHumanoid.getRawBoneNode('rightFoot');
    if (rightBone) {
      const clone = mesh.clone();
      clone.scale.x = -1; // mirror
      rightBone.add(clone);
    }
  }
}

// ─────────────────────────────────────────────
// MAIN: dress a VRM character from an outfit object
// ─────────────────────────────────────────────
/**
 * @param {import('@pixiv/three-vrm').VRM} vrm   - loaded VRM instance
 * @param {object}  outfit  - one of OUTFITS.missOgTinz / OUTFITS.lora
 * @param {string}  label   - 'Miss OG Tinz' or 'Lora' (for logs)
 */
export async function dressCharacter(vrm, outfit, label = 'Character') {
  const humanoid = vrm.humanoid;
  if (!humanoid) {
    console.error(`[Wardrobe] VRM has no humanoid data: ${label}`);
    return;
  }

  console.log(`[Wardrobe] Dressing ${label}…`);

  const slots = Object.keys(outfit);
  await Promise.all(slots.map(async (slot) => {
    const mesh = await loadGLB(outfit[slot]);
    attachToBone(humanoid, slot, mesh);
    if (mesh) console.log(`[Wardrobe]   ✓ ${label} ${slot} → ${outfit[slot]}`);
  }));

  console.log(`[Wardrobe] ${label} dressed ✓`);
}

// ─────────────────────────────────────────────
// CONVENIENCE: dress both characters at once
// ─────────────────────────────────────────────
/**
 * @param {import('@pixiv/three-vrm').VRM} missOgTinzVrm
 * @param {import('@pixiv/three-vrm').VRM} loraVrm
 */
export async function dressBothCharacters(missOgTinzVrm, loraVrm) {
  await Promise.all([
    dressCharacter(missOgTinzVrm, OUTFITS.missOgTinz, 'Miss OG Tinz'),
    dressCharacter(loraVrm,       OUTFITS.lora,        'Lora'),
  ]);
}
