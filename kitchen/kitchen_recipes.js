// ================================================================
//  kitchen_recipes.js
//  Recipes Miss OG Tinz & Lora can cook autonomously.
//  Each recipe is a behaviour tree that chains kitchen_actions.js
//  entries into a complete cooking session.
//
//  STRUCTURE:
//    ingredients_needed  — from kitchen_objects.json
//    tools_needed        — cookware + utensils required
//    serves              — number of portions (affects how long eating takes)
//    steps               — ordered behaviour tree nodes
//    roles               — how to split between Miss + Lora
//    twitch_hooks        — Twitch chat moments during cooking
//    difficulty          — easy / medium / hard
// ================================================================

import { KITCHEN_ACTIONS, COOKING_ROLES } from './kitchen_actions.js';

export const RECIPES = {

  // ════════════════════════════════════════════════════════════
  //  RECIPE 1 — BACON & EGG SANDWICH
  // ════════════════════════════════════════════════════════════

  bacon_egg_sandwich: {
    id: 'bacon_egg_sandwich',
    name: 'Bacon & Egg Sandwich',
    description: 'Classic fry-up sandwich. The OG comfort meal.',
    difficulty: 'easy',
    duration_estimate_ms: 480000,
    serves: 2,

    ingredients_needed: [
      'bacon-raw',
      'egg',
      'bread',
      'butter',
      'shaker-salt',
      'shaker-pepper',
      'bottle-ketchup',
    ],

    tools_needed: [
      'frying-pan',
      'cooking-spatula',
      'cooking-knife',
      'cutting-board',
      'plate',
    ],

    roles: {
      ...COOKING_ROLES.collaborative,
      miss_steps: ['wash_hands', 'setup_stove', 'fry_bacon', 'fry_egg', 'plate_food'],
      lora_steps: ['wash_hands', 'slice_bread', 'prepare_plate', 'add_ketchup', 'eat_meal'],
    },

    steps: [
      // ── PHASE 1: Prep ─────────────────────────────────────
      {
        phase: 'prep',
        parallel: true,
        miss: { action: 'wash_hands' },
        lora: { action: 'wash_hands' },
        dialogue: 'cooking_start_collab',
      },
      {
        phase: 'prep',
        miss: { action: 'approach_counter' },
        lora: { action: 'approach_counter' },
      },
      {
        phase: 'prep',
        parallel: false,
        miss: {
          sequence: [
            { action: 'pickup_ingredient',    target: 'frying-pan' },
            { action: 'approach_stove' },
            { action: 'place_pan_on_stove' },
            { action: 'set_stove_heat',        level: 'medium' },
            { action: 'put_down_object',       target: 'oil_bottle', location: 'counter' },
            { action: 'pickup_ingredient',     target: 'bottle-oil' },
          ],
        },
        lora: {
          sequence: [
            { action: 'pickup_ingredient',    target: 'bread' },
            { action: 'place_on_cutting_board' },
            { action: 'pickup_knife' },
            { action: 'slice',               target: 'bread', count: 4, note: '4 slices total' },
            { action: 'put_down_object',      target: 'knife' },
          ],
          dialogue: 'cooking_prep_chop',
        },
      },

      // ── PHASE 2: Cook ─────────────────────────────────────
      {
        phase: 'cook',
        miss: {
          sequence: [
            { action: 'wait_for_pan_heat' },
            { action: 'add_oil_to_pan' },
            { action: 'pickup_ingredient',  target: 'bacon-raw' },
            { action: 'add_to_pan',         ingredient: 'bacon-raw' },
            { action: 'fry_bacon' },
          ],
          dialogue: 'cooking_fry_bacon',
        },
        lora: {
          sequence: [
            { action: 'approach_stove',     note: 'come watch Miss cook' },
            { motion: 'observe_cooking',    duration_ms: 30000, note: 'lean slightly, watch pan' },
            { dialogue: 'cooking_react_smell' },
            { motion: 'idle_near_stove',    note: 'wait for next task' },
          ],
        },
      },
      {
        phase: 'cook',
        note: 'Bacon done — now fry egg while Lora preps plates',
        parallel: true,
        miss: {
          sequence: [
            { action: 'pickup_ingredient', target: 'egg' },
            { action: 'fry_egg' },
          ],
          dialogue: 'cooking_fry_egg',
        },
        lora: {
          sequence: [
            { action: 'approach_counter' },
            { action: 'get_plate' },
            { motion: 'lay_bread_slices_on_plate', note: 'place 2 slices per plate' },
          ],
        },
      },

      // ── PHASE 3: Plate ────────────────────────────────────
      {
        phase: 'plate',
        miss: {
          sequence: [
            { action: 'remove_from_pan',   ingredient: 'bacon', destination: 'plate' },
            { action: 'remove_from_pan',   ingredient: 'egg',   destination: 'plate' },
            { action: 'season' },
            { action: 'plate_food' },
          ],
          dialogue: 'cooking_plate',
        },
        lora: {
          sequence: [
            { action: 'pickup_ingredient',  target: 'bottle-ketchup' },
            { motion: 'squeeze_ketchup_on_plate', note: 'small squeeze, side of plate' },
            { action: 'put_down_object',    target: 'bottle-ketchup' },
            { motion: 'close_sandwich',     note: 'press bread top slice down' },
          ],
          dialogue: 'cooking_plate_assist',
        },
      },

      // ── PHASE 4: Eat ──────────────────────────────────────
      {
        phase: 'eat',
        parallel: true,
        miss: { action: 'sit_to_eat' },
        lora: { action: 'sit_to_eat' },
        dialogue: 'cooking_eat',
      },
      {
        phase: 'eat',
        parallel: true,
        miss: { action: 'eat_meal' },
        lora: { action: 'eat_meal' },
        twitch_hook: 'poll_reaction_to_food',
      },

      // ── PHASE 5: Cleanup ──────────────────────────────────
      {
        phase: 'cleanup',
        parallel: true,
        miss: { action: 'clean_up', note: 'wipe stove and pan' },
        lora: { action: 'clean_up', note: 'clear plates and counter' },
        dialogue: 'cooking_cleanup',
      },
    ],

    twitch_hooks: [
      { trigger: 'phase:cook',    message: '🍳 Miss OG Tinz is cooking!' },
      { trigger: 'phase:eat',     message: '🥪 Time to eat — rate the sandwich!' },
      { trigger: 'smell_comment', message: 'Type 👃 if you can smell that through the screen' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  //  RECIPE 2 — TOMATO SOUP
  // ════════════════════════════════════════════════════════════

  tomato_soup: {
    id: 'tomato_soup',
    name: 'Tomato Soup',
    description: 'Simple warming soup. Lora stirs, Miss seasons.',
    difficulty: 'easy',
    duration_estimate_ms: 1200000,
    serves: 2,

    ingredients_needed: [
      'tomato',
      'carrot',
      'celery-stick',
      'bottle-oil',
      'shaker-salt',
      'shaker-pepper',
      'can',
      'bread',
    ],

    tools_needed: [
      'pot',
      'pot-lid',
      'cooking-knife',
      'cooking-spoon',
      'cutting-board',
      'bowl-soup',
    ],

    roles: {
      ...COOKING_ROLES.collaborative,
      miss_steps: ['chop_veg', 'season', 'taste_test', 'plate_food'],
      lora_steps: ['setup_pot', 'stir', 'simmer_watch', 'serve'],
    },

    steps: [
      {
        phase: 'prep',
        parallel: true,
        miss: { action: 'wash_hands' },
        lora: { action: 'wash_hands' },
      },
      {
        phase: 'prep',
        parallel: true,
        miss: {
          sequence: [
            { action: 'approach_sink' },
            { action: 'wash_ingredient', target: 'tomato' },
            { action: 'wash_ingredient', target: 'carrot' },
            { action: 'wash_ingredient', target: 'celery-stick' },
          ],
          dialogue: 'cooking_wash_veg',
        },
        lora: {
          sequence: [
            { action: 'approach_stove' },
            { action: 'pickup_ingredient', target: 'pot' },
            { action: 'place_pan_on_stove' },
            { action: 'set_stove_heat',    level: 'medium' },
            { action: 'add_oil_to_pan' },
          ],
        },
      },
      {
        phase: 'prep',
        miss: {
          sequence: [
            { action: 'approach_counter' },
            { action: 'place_on_cutting_board', target: 'tomato' },
            { action: 'pickup_knife' },
            { action: 'dice',  target: 'tomato' },
            { action: 'dice',  target: 'carrot' },
            { action: 'slice', target: 'celery-stick' },
            { action: 'put_down_object', target: 'knife' },
          ],
          dialogue: 'cooking_prep_chop',
        },
        lora: {
          sequence: [
            { motion: 'idle_near_stove',    duration_ms: 20000 },
            { motion: 'watch_miss_chop',    note: 'turn head toward chopping board' },
            { dialogue: 'cooking_watch_chop_comment' },
          ],
        },
      },

      {
        phase: 'cook',
        parallel: false,
        sequence_order: ['miss_adds', 'lora_stirs', 'both_simmer'],
        miss: {
          sequence: [
            { motion: 'carry_chopped_veg_to_pot', note: 'scoop from board into pot' },
            { action: 'season' },
          ],
          dialogue: 'cooking_add_veg',
        },
        lora: {
          sequence: [
            { action: 'stir',       target: 'pot' },
            { action: 'taste_test' },
          ],
          dialogue: 'cooking_stir',
        },
      },

      {
        phase: 'cook',
        note: 'Both idle near stove while soup simmers',
        parallel: true,
        miss: {
          sequence: [
            { action: 'simmer',    duration_ms: 900000 },
            { action: 'taste_test' },
            { action: 'season', note: 'adjust salt/pepper after tasting' },
          ],
          dialogue: 'cooking_simmer',
        },
        lora: {
          sequence: [
            { action: 'stir',        every_ms: 120000 },
            { motion: 'idle_near_stove', note: 'watch pot, occasional glance and comment' },
          ],
          dialogue: 'cooking_simmer_react',
        },
      },

      {
        phase: 'plate',
        parallel: true,
        miss: {
          sequence: [
            { action: 'get_plate', type: 'bowl-soup' },
            { motion: 'ladle_soup_into_bowl', note: 'use spoon to scoop from pot' },
            { action: 'plate_food' },
          ],
        },
        lora: {
          sequence: [
            { action: 'get_plate', type: 'bowl-soup' },
            { motion: 'ladle_soup_into_bowl' },
            { motion: 'slice_bread_for_side', ref: 'slice', target: 'bread', count: 2 },
          ],
        },
        dialogue: 'cooking_plate',
      },

      {
        phase: 'eat',
        parallel: true,
        miss: { action: 'eat_meal' },
        lora: { action: 'eat_meal' },
        dialogue: 'cooking_eat',
        twitch_hook: 'poll_soup_rating',
      },

      {
        phase: 'cleanup',
        parallel: true,
        miss: { action: 'clean_up' },
        lora: { action: 'clean_up' },
        dialogue: 'cooking_cleanup',
      },
    ],

    twitch_hooks: [
      { trigger: 'phase:cook',   message: '🍅 Soup is on the stove!' },
      { trigger: 'phase:eat',    message: '🍲 How does it look? Type 🔥 or 🤢' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  //  RECIPE 3 — AVOCADO TOAST
  // ════════════════════════════════════════════════════════════

  avocado_toast: {
    id: 'avocado_toast',
    name: 'Avocado Toast',
    description: 'Quick and healthy. Lora toasts, Miss mashes.',
    difficulty: 'easy',
    duration_estimate_ms: 300000,
    serves: 2,

    ingredients_needed: [
      'avocado',
      'bread',
      'shaker-salt',
      'shaker-pepper',
      'bottle-oil',
      'tomato',
      'cherries',
    ],

    tools_needed: [
      'cooking-knife',
      'cutting-board',
      'utensil-fork',
      'plate',
    ],

    roles: {
      ...COOKING_ROLES.parallel,
      miss_steps: ['prep_avocado', 'mash', 'season', 'plate'],
      lora_steps: ['slice_bread', 'toast_bread', 'slice_tomato', 'assemble'],
    },

    steps: [
      {
        phase: 'prep',
        parallel: true,
        miss: { action: 'wash_hands' },
        lora: { action: 'wash_hands' },
      },
      {
        phase: 'prep',
        parallel: true,
        miss: {
          sequence: [
            { action: 'pickup_ingredient',    target: 'avocado' },
            { action: 'place_on_cutting_board' },
            { action: 'pickup_knife' },
            { motion: 'slice_avocado_lengthwise', note: 'cut around pit, twist to open' },
            { motion: 'remove_pit_with_knife_tap', note: 'firm tap into pit, twist out' },
            { motion: 'scoop_flesh_into_bowl',     note: 'use spoon to scoop from skin' },
            { action: 'put_down_object', target: 'knife' },
            { motion: 'mash_avocado_with_fork',    duration_ms: 10000, note: 'press and fold' },
            { action: 'season' },
          ],
          dialogue: 'cooking_prep_avocado',
        },
        lora: {
          sequence: [
            { action: 'pickup_ingredient',    target: 'bread' },
            { action: 'place_on_cutting_board' },
            { action: 'pickup_knife' },
            { action: 'slice',               target: 'bread', count: 4 },
            { action: 'put_down_object',     target: 'knife' },
            { motion: 'place_bread_in_toaster', note: 'push slices down' },
            { motion: 'wait_for_toast',         duration_ms: 90000 },
            { motion: 'retrieve_toast',         note: 'when pops up, take out' },
          ],
          dialogue: 'cooking_toast_bread',
        },
      },
      {
        phase: 'plate',
        parallel: true,
        miss: {
          sequence: [
            { motion: 'spoon_avocado_onto_toast', note: 'generous scoop, spread with fork' },
            { action: 'season', note: 'final salt + pepper' },
          ],
          dialogue: 'cooking_plate',
        },
        lora: {
          sequence: [
            { action: 'wash_ingredient',  target: 'tomato' },
            { action: 'pickup_knife' },
            { action: 'slice',           target: 'tomato' },
            { motion: 'place_slices_on_top', note: 'lay tomato on avocado' },
          ],
        },
      },
      {
        phase: 'eat',
        parallel: true,
        miss: { action: 'eat_meal' },
        lora: { action: 'eat_meal' },
        dialogue: 'cooking_eat',
        twitch_hook: 'avocado_toast_poll',
      },
      {
        phase: 'cleanup',
        parallel: true,
        miss: { action: 'clean_up' },
        lora: { action: 'clean_up' },
      },
    ],

    twitch_hooks: [
      { trigger: 'phase:prep',   message: '🥑 Making avocado toast — fancy or nah?' },
      { trigger: 'phase:eat',    message: 'Type 🥑 if you eat avo toast unironically' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  //  RECIPE 4 — SALAD
  // ════════════════════════════════════════════════════════════

  fresh_salad: {
    id: 'fresh_salad',
    name: 'Fresh Salad',
    description: 'Quick colourful salad. Both prep simultaneously.',
    difficulty: 'easy',
    duration_estimate_ms: 240000,
    serves: 2,

    ingredients_needed: [
      'tomato',
      'carrot',
      'broccoli',
      'celery-stick',
      'bottle-oil',
      'shaker-salt',
      'shaker-pepper',
    ],

    tools_needed: [
      'cooking-knife',
      'cutting-board',
      'bowl',
    ],

    roles: {
      ...COOKING_ROLES.parallel,
      miss_steps: ['wash_chop_tomato_carrot', 'dress_salad'],
      lora_steps: ['wash_chop_broccoli_celery', 'assemble_bowl'],
    },

    steps: [
      {
        phase: 'prep',
        parallel: true,
        miss: { action: 'wash_hands' },
        lora: { action: 'wash_hands' },
      },
      {
        phase: 'prep',
        parallel: true,
        miss: {
          sequence: [
            { action: 'wash_ingredient', target: 'tomato' },
            { action: 'wash_ingredient', target: 'carrot' },
            { action: 'dice',  target: 'tomato' },
            { action: 'slice', target: 'carrot' },
          ],
          dialogue: 'cooking_prep_chop',
        },
        lora: {
          sequence: [
            { action: 'wash_ingredient', target: 'broccoli' },
            { action: 'wash_ingredient', target: 'celery-stick' },
            { motion: 'cut_broccoli_florets', ref: 'chop', target: 'broccoli' },
            { action: 'slice', target: 'celery-stick' },
          ],
        },
      },
      {
        phase: 'plate',
        miss: {
          sequence: [
            { motion: 'add_all_veg_to_bowl', note: 'toss together' },
            { action: 'add_oil_to_pan',      note: 'drizzle oil over salad instead' },
            { action: 'season' },
            { motion: 'toss_salad',          note: 'two big spoons, lift and fold' },
          ],
          dialogue: 'cooking_plate',
        },
        lora: {
          sequence: [
            { action: 'get_plate', type: 'bowl' },
            { motion: 'serve_salad_into_individual_bowls' },
          ],
        },
      },
      {
        phase: 'eat',
        parallel: true,
        miss: { action: 'eat_meal' },
        lora: { action: 'eat_meal' },
        dialogue: 'cooking_eat',
      },
      {
        phase: 'cleanup',
        parallel: true,
        miss: { action: 'clean_up' },
        lora: { action: 'clean_up' },
      },
    ],

    twitch_hooks: [
      { trigger: 'phase:eat', message: '🥗 Would you eat this? Type YES or NAH' },
    ],
  },

  // ════════════════════════════════════════════════════════════
  //  RECIPE 5 — HOT DRINKS (TEA + COFFEE)
  // ════════════════════════════════════════════════════════════

  hot_drinks: {
    id: 'hot_drinks',
    name: 'Tea & Coffee',
    description: 'Miss makes coffee, Lora makes tea. Side by side.',
    difficulty: 'easy',
    duration_estimate_ms: 300000,
    serves: 2,

    ingredients_needed: [
      'cup-coffee',
      'cup-tea',
      'honey',
      'carton',
    ],

    tools_needed: [
      'pot',
      'cup-coffee',
      'cup-tea',
    ],

    roles: {
      ...COOKING_ROLES.parallel,
      miss_steps: ['boil_water', 'make_coffee', 'add_milk', 'serve'],
      lora_steps: ['boil_water', 'make_tea', 'add_honey', 'serve'],
    },

    steps: [
      {
        phase: 'prep',
        parallel: true,
        miss: { action: 'wash_hands' },
        lora: { action: 'wash_hands' },
      },
      {
        phase: 'cook',
        parallel: true,
        miss: {
          sequence: [
            { action: 'approach_stove' },
            { action: 'boil_water' },
            { motion: 'prepare_coffee_cup', note: 'place cup, add coffee' },
            { motion: 'pour_boiling_water_into_cup', note: 'careful tilt of pot' },
            { action: 'pickup_ingredient', target: 'carton' },
            { motion: 'pour_milk_into_coffee', note: 'tilt carton, small amount' },
          ],
          dialogue: 'cooking_make_coffee',
        },
        lora: {
          sequence: [
            { action: 'approach_stove' },
            { action: 'boil_water' },
            { motion: 'prepare_tea_cup', note: 'place teabag in cup' },
            { motion: 'pour_boiling_water_into_cup' },
            { motion: 'steep_tea',       duration_ms: 180000, note: 'wait with cup' },
            { motion: 'remove_teabag' },
            { action: 'pickup_ingredient', target: 'honey' },
            { motion: 'drizzle_honey',   note: 'small amount, stir' },
          ],
          dialogue: 'cooking_make_tea',
        },
      },
      {
        phase: 'eat',
        parallel: true,
        miss: { action: 'sit_to_eat', note: 'carry coffee to sofa' },
        lora: { action: 'sit_to_eat', note: 'carry tea to sofa' },
        dialogue: 'cooking_eat_drinks',
        twitch_hook: 'poll_tea_or_coffee',
      },
    ],

    twitch_hooks: [
      { trigger: 'phase:eat', message: '☕ TEA or COFFEE? Type your answer!' },
    ],
  },

};

// ════════════════════════════════════════════════════════════
//  RECIPE SELECTOR
//  Picks a recipe based on time of day, recent activity,
//  or Twitch chat command (!cook bacon / !cook soup)
// ════════════════════════════════════════════════════════════

export function selectRecipe(trigger = 'autonomous') {

  // Twitch command: !cook <name>
  if (trigger.startsWith('twitch:')) {
    const cmd = trigger.replace('twitch:', '').trim().toLowerCase();
    const map = {
      'bacon':     'bacon_egg_sandwich',
      'sandwich':  'bacon_egg_sandwich',
      'soup':      'tomato_soup',
      'avo':       'avocado_toast',
      'avocado':   'avocado_toast',
      'salad':     'fresh_salad',
      'tea':       'hot_drinks',
      'coffee':    'hot_drinks',
      'drinks':    'hot_drinks',
    };
    const id = map[cmd];
    if (id) return RECIPES[id];
  }

  // Autonomous: pick by time of day
  const hour = new Date().getHours();
  if (hour >= 7  && hour < 10) return RECIPES.bacon_egg_sandwich;
  if (hour >= 10 && hour < 12) return RECIPES.avocado_toast;
  if (hour >= 12 && hour < 14) return RECIPES.fresh_salad;
  if (hour >= 14 && hour < 17) return RECIPES.hot_drinks;
  if (hour >= 17 && hour < 21) return RECIPES.tomato_soup;

  // Default fallback
  const all = Object.values(RECIPES);
  return all[Math.floor(Math.random() * all.length)];
}
