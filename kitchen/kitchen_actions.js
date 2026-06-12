// ================================================================
//  kitchen_actions.js
//  Atomic action library for Miss OG Tinz & Lora in the kitchen.
//  Every action is a self-contained step sequence that maps to:
//    - engine-bones.js  → body pose / IK target
//    - engine-life.js   → ACTIVITY state
//    - engine-bff.js    → dialogue trigger
//
//  HOW IT WORKS:
//    Each action has:
//      preconditions   — what must be true before starting
//      steps           — ordered body motion sequence
//      duration_ms     — how long the action takes
//      on_complete     — state changes when done
//      dialogue_hook   — optional BFF dialogue tag to trigger
//      can_be_shared   — if true, both chars can do it cooperatively
// ================================================================

export const KITCHEN_ACTIONS = {

  // ══════════════════════════════════════════════════════════════
  //  NAVIGATION & APPROACH
  // ══════════════════════════════════════════════════════════════

  approach_counter: {
    id: 'approach_counter',
    description: 'Walk to the kitchen counter and stand in position',
    preconditions: [],
    steps: [
      { motion: 'face_target',       target: 'countertop' },
      { motion: 'walk_to',           target: 'countertop', nav_stop: 'arm_reach_distance' },
      { motion: 'idle_stand',        note: 'settle weight, face counter' },
    ],
    duration_ms: 2000,
    on_complete: { position: 'at_counter' },
  },

  approach_stove: {
    id: 'approach_stove',
    description: 'Walk to the stove',
    preconditions: [],
    steps: [
      { motion: 'face_target', target: 'stove' },
      { motion: 'walk_to',     target: 'stove', nav_stop: 'arm_reach_distance' },
      { motion: 'idle_stand',  note: 'square hips to stove' },
    ],
    duration_ms: 2000,
    on_complete: { position: 'at_stove' },
  },

  approach_sink: {
    id: 'approach_sink',
    steps: [
      { motion: 'face_target', target: 'sink' },
      { motion: 'walk_to',     target: 'sink' },
    ],
    duration_ms: 1800,
    on_complete: { position: 'at_sink' },
  },

  approach_fridge: {
    id: 'approach_fridge',
    steps: [
      { motion: 'face_target', target: 'fridge' },
      { motion: 'walk_to',     target: 'fridge' },
    ],
    duration_ms: 2200,
    on_complete: { position: 'at_fridge' },
  },

  // ══════════════════════════════════════════════════════════════
  //  HYGIENE — always first
  // ══════════════════════════════════════════════════════════════

  wash_hands: {
    id: 'wash_hands',
    description: 'Wash hands at the sink before cooking',
    preconditions: [{ position: 'at_sink' }],
    steps: [
      { motion: 'extend_both_arms_to_sink' },
      { motion: 'turn_on_tap',             note: 'reach forward, twist tap handle' },
      { motion: 'rub_hands_under_water',   duration_ms: 3000, note: 'both hands scrubbing motion' },
      { motion: 'reach_for_soap',          note: 'side step to soap dispenser' },
      { motion: 'pump_soap_dominant_hand', note: 'press dispenser top' },
      { motion: 'lather_hands',            duration_ms: 4000, note: 'circular hand rubbing' },
      { motion: 'rinse_hands',             duration_ms: 2000 },
      { motion: 'turn_off_tap' },
      { motion: 'reach_for_towel' },
      { motion: 'dry_hands',              duration_ms: 2000 },
    ],
    duration_ms: 12000,
    on_complete: { hands_clean: true },
    dialogue_hook: 'cooking_prep_start',
  },

  // ══════════════════════════════════════════════════════════════
  //  OBJECT RETRIEVAL
  // ══════════════════════════════════════════════════════════════

  open_fridge: {
    id: 'open_fridge',
    preconditions: [{ position: 'at_fridge' }],
    steps: [
      { motion: 'extend_dominant_arm_to_handle' },
      { motion: 'grip_door_handle',   note: 'wrap fingers around handle' },
      { motion: 'pull_door_toward_body', note: 'step back slightly as door opens' },
      { motion: 'scan_fridge_interior', note: 'head moves left-right across shelves' },
    ],
    duration_ms: 2500,
    on_complete: { fridge_open: true },
  },

  close_fridge: {
    id: 'close_fridge',
    preconditions: [{ fridge_open: true }],
    steps: [
      { motion: 'extend_arm_to_door_edge' },
      { motion: 'push_door_closed' },
    ],
    duration_ms: 800,
    on_complete: { fridge_open: false },
  },

  pickup_ingredient: {
    id: 'pickup_ingredient',
    description: 'Pick up an ingredient from counter or fridge',
    preconditions: [
      { object_visible: true },
      { object_reachable: true },
    ],
    steps: [
      { motion: 'look_at_object',       note: 'eyes track target, head tilts slightly' },
      { motion: 'extend_dominant_arm',  note: 'reach toward object' },
      { motion: 'open_hand',            note: 'fingers spread for grasp' },
      { motion: 'conform_grip_to_size', note: 'see grasp_size in kitchen_objects.json' },
      { motion: 'close_fingers',        note: 'wrap around object gently' },
      { motion: 'verify_grip',          note: 'brief micro-adjustment if needed' },
      { motion: 'lift_object',          note: 'raise 10–15cm off surface' },
    ],
    duration_ms: 1500,
    on_complete: { object_state: 'in_hand' },
  },

  put_down_object: {
    id: 'put_down_object',
    preconditions: [{ object_state: 'in_hand' }],
    steps: [
      { motion: 'lower_arm_to_surface' },
      { motion: 'set_object_down_gently' },
      { motion: 'release_fingers' },
      { motion: 'withdraw_hand' },
    ],
    duration_ms: 1000,
    on_complete: { object_state: 'on_surface' },
  },

  pickup_knife: {
    id: 'pickup_knife',
    description: 'Take knife from knife block or surface — pinch grip',
    preconditions: [
      { object_visible: true },
      { object_reachable: true },
    ],
    steps: [
      { motion: 'look_at_knife' },
      { motion: 'extend_dominant_arm_to_knife_handle' },
      { motion: 'pinch_grip_handle',           note: 'thumb + index on handle spine, others wrap' },
      { motion: 'pull_up_from_block_cleanly',  note: 'straight vertical pull, no tilting' },
      { motion: 'keep_blade_pointing_down_safe' },
    ],
    duration_ms: 1200,
    on_complete: { object_state: 'in_hand', grip_type: 'pinch_knife' },
    safety_note: 'Always pull straight up from block. Never swipe.',
  },

  place_on_cutting_board: {
    id: 'place_on_cutting_board',
    preconditions: [
      { object_state: 'in_hand' },
      { cutting_board_available: true },
    ],
    steps: [
      { motion: 'lower_object_to_board_surface' },
      { motion: 'orient_object_for_cutting',    note: 'flat side down where possible' },
      { motion: 'release_fingers' },
    ],
    duration_ms: 800,
    on_complete: { object_state: 'on_board' },
  },

  // ══════════════════════════════════════════════════════════════
  //  WASHING
  // ══════════════════════════════════════════════════════════════

  wash_ingredient: {
    id: 'wash_ingredient',
    preconditions: [
      { position: 'at_sink' },
      { object_state: 'in_hand' },
    ],
    steps: [
      { motion: 'hold_ingredient_under_running_water' },
      { motion: 'rotate_ingredient_all_sides', duration_ms: 3000 },
      { motion: 'rub_surface_gently_with_fingers' },
      { motion: 'lift_out_of_stream' },
      { motion: 'shake_off_excess_water' },
    ],
    duration_ms: 5000,
    on_complete: { object_state_flag: 'washed' },
  },

  // ══════════════════════════════════════════════════════════════
  //  CUTTING ACTIONS
  //  All cutting requires: knife in hand + ingredient on board
  // ══════════════════════════════════════════════════════════════

  _cutting_base_preconditions: [
    { knife_in_dominant_hand: true },
    { ingredient_on_cutting_board: true },
    { cutting_board_stable: true },
  ],

  slice: {
    id: 'slice',
    description: 'Cut ingredient into thin flat pieces',
    preconditions: ['_cutting_base_preconditions'],
    steps: [
      { motion: 'non_dominant_hand_claw_grip_ingredient', note: 'fingers curled inward — fingertips protected' },
      { motion: 'position_knife_at_ingredient_end' },
      {
        motion: 'slice_loop',
        repeat: 'until_done',
        sub_steps: [
          { motion: 'raise_knife_10cm' },
          { motion: 'push_forward_and_down_simultaneously', speed: 'controlled_not_fast' },
          { motion: 'contact_board' },
          { motion: 'lift_knife' },
          { motion: 'non_dominant_hand_slides_back_2cm', note: 'guide hand repositions each slice' },
        ],
      },
      { motion: 'set_knife_down_safely', note: 'blade away from body' },
    ],
    duration_ms: 6000,
    on_complete: { ingredient_state: 'sliced' },
    dialogue_hook: 'cooking_prep_chop',
  },

  dice: {
    id: 'dice',
    description: 'Cut into small even cubes',
    preconditions: ['_cutting_base_preconditions'],
    steps: [
      { motion: 'slice_into_planks_first', ref: 'slice', count: 3 },
      { motion: 'stack_planks' },
      { motion: 'slice_planks_into_strips' },
      { motion: 'rotate_90_degrees' },
      { motion: 'slice_strips_into_cubes' },
    ],
    duration_ms: 10000,
    on_complete: { ingredient_state: 'diced' },
  },

  chop: {
    id: 'chop',
    description: 'Rough irregular pieces — quick up and down',
    preconditions: ['_cutting_base_preconditions'],
    steps: [
      { motion: 'non_dominant_hand_flat_press_ingredient' },
      {
        motion: 'chop_loop',
        repeat: 'until_done',
        sub_steps: [
          { motion: 'raise_knife_15cm' },
          { motion: 'bring_down_with_force', speed: 'medium_firm' },
          { motion: 'lift_and_reposition' },
        ],
      },
    ],
    duration_ms: 5000,
    on_complete: { ingredient_state: 'chopped' },
  },

  mince: {
    id: 'mince',
    description: 'Very fine pieces — rocking blade technique',
    preconditions: ['_cutting_base_preconditions'],
    steps: [
      { motion: 'chop_rough_first', ref: 'chop' },
      { motion: 'gather_into_pile' },
      { motion: 'non_dominant_hand_on_knife_spine', note: 'guide blade tip stays on board' },
      {
        motion: 'rock_chop_loop',
        repeat: 20,
        sub_steps: [
          { motion: 'pivot_blade_tip_on_board' },
          { motion: 'rock_handle_down' },
          { motion: 'sweep_pile_back_together' },
        ],
      },
    ],
    duration_ms: 12000,
    on_complete: { ingredient_state: 'minced' },
  },

  julienne: {
    id: 'julienne',
    description: 'Thin matchstick strips',
    preconditions: ['_cutting_base_preconditions'],
    steps: [
      { motion: 'square_off_ingredient_sides', ref: 'slice', note: 'cut 4 flat sides' },
      { motion: 'slice_into_thin_planks_2mm' },
      { motion: 'stack_planks' },
      { motion: 'slice_planks_lengthwise_into_strips' },
    ],
    duration_ms: 14000,
    on_complete: { ingredient_state: 'julienned' },
  },

  crack_egg: {
    id: 'crack_egg',
    description: 'Crack egg into pan or bowl',
    preconditions: [
      { egg_in_hand: true },
      { target_vessel_ready: true },
    ],
    steps: [
      { motion: 'hold_egg_dominant_hand', note: 'gentle wrap' },
      { motion: 'tap_egg_center_on_rim',  note: 'firm single tap — not too hard or too soft' },
      { motion: 'both_thumbs_into_crack', note: 'use both hands to pull shell halves apart' },
      { motion: 'open_over_vessel',       note: 'hold directly above pan, let contents fall' },
      { motion: 'pull_halves_fully_apart' },
      { motion: 'check_for_shell_fragments', note: 'look down into vessel briefly' },
      { motion: 'discard_shell' },
    ],
    duration_ms: 4000,
    on_complete: { egg_state: 'cracked', contents_in: 'target_vessel' },
    dialogue_hook: 'cooking_crack_egg',
  },

  peel_banana: {
    id: 'peel_banana',
    preconditions: [{ banana_in_hand: true }],
    steps: [
      { motion: 'hold_banana_non_dominant_hand' },
      { motion: 'pinch_tip_dominant_hand' },
      { motion: 'peel_back_first_strip' },
      { motion: 'peel_back_remaining_strips', count: 3 },
    ],
    duration_ms: 3000,
    on_complete: { banana_state: 'peeled' },
  },

  // ══════════════════════════════════════════════════════════════
  //  COOKWARE SETUP
  // ══════════════════════════════════════════════════════════════

  place_pan_on_stove: {
    id: 'place_pan_on_stove',
    preconditions: [
      { position: 'at_stove' },
      { pan_in_hand: true },
    ],
    steps: [
      { motion: 'carry_pan_level',           note: 'grip handle, pan stays flat' },
      { motion: 'position_over_burner' },
      { motion: 'lower_onto_burner_ring' },
      { motion: 'release_handle' },
      { motion: 'step_back_slightly' },
    ],
    duration_ms: 2000,
    on_complete: { pan_state: 'on_stove', pan_heat: 'off' },
  },

  set_stove_heat: {
    id: 'set_stove_heat',
    preconditions: [{ position: 'at_stove' }],
    params: { level: 'medium' },
    steps: [
      { motion: 'look_at_burner_knob' },
      { motion: 'reach_to_knob' },
      { motion: 'grip_knob' },
      { motion: 'turn_to_target_level', note: 'rotate to: off | low | medium | medium_high | high' },
      { motion: 'release_knob' },
    ],
    duration_ms: 1500,
    on_complete: { stove_heat: '{{params.level}}' },
  },

  add_oil_to_pan: {
    id: 'add_oil_to_pan',
    preconditions: [
      { pan_on_stove: true },
      { oil_bottle_in_hand: true },
    ],
    steps: [
      { motion: 'hold_bottle_over_pan_center' },
      { motion: 'tilt_bottle_to_30_degrees' },
      { motion: 'let_oil_drizzle', duration_ms: 2000, note: 'small amount only — 1-2 seconds' },
      { motion: 'return_bottle_upright' },
      { motion: 'put_down_bottle' },
    ],
    duration_ms: 3000,
    on_complete: { pan_has_oil: true },
  },

  wait_for_pan_heat: {
    id: 'wait_for_pan_heat',
    description: 'Wait for pan to reach cooking temperature',
    preconditions: [{ pan_on_stove: true, stove_heat: 'not_off' }],
    steps: [
      { motion: 'idle_stand_near_stove' },
      { motion: 'glance_at_pan_occasionally', note: 'head looks down at pan every few seconds' },
      { motion: 'shift_weight_hip', note: 'natural idle shifting' },
    ],
    duration_ms: 15000,
    on_complete: { pan_state: 'hot' },
    dialogue_hook: 'cooking_wait_pan',
  },

  // ══════════════════════════════════════════════════════════════
  //  COOKING ACTIONS
  // ══════════════════════════════════════════════════════════════

  add_to_pan: {
    id: 'add_to_pan',
    preconditions: [
      { pan_on_stove: true },
      { pan_state: 'hot' },
      { ingredient_in_hand_or_on_board: true },
    ],
    steps: [
      { motion: 'carry_ingredient_to_pan_edge' },
      { motion: 'lower_ingredient_into_pan_carefully', note: 'oil may spit — move slowly' },
      { motion: 'release_ingredient' },
      { motion: 'step_back_slightly', note: 'oil spit reflex' },
    ],
    duration_ms: 2000,
    on_complete: { ingredient_state: 'in_pan' },
    dialogue_hook: 'cooking_sizzle',
  },

  fry_bacon: {
    id: 'fry_bacon',
    description: 'Full bacon frying sequence',
    preconditions: [
      { pan_on_stove: true, pan_has_oil: true, pan_state: 'hot' },
      { bacon_raw_in_hand: true },
    ],
    steps: [
      { action: 'add_to_pan', ingredient: 'bacon-raw' },
      { motion: 'observe_bacon_cooking',  duration_ms: 90000, note: 'idle near stove, glance at pan' },
      { motion: 'check_bacon_colour',     note: 'lean slightly forward, look down' },
      { motion: 'trigger_flip_when_brown', note: 'edges curl and change colour = flip time' },
      { action: 'flip_food',              instrument: 'spatula' },
      { motion: 'observe_second_side',    duration_ms: 60000 },
      { motion: 'check_both_sides_brown' },
      { action: 'remove_from_pan',        instrument: 'spatula', destination: 'plate' },
    ],
    duration_ms: 180000,
    on_complete: { bacon_state: 'cooked', bacon_location: 'plate' },
    dialogue_hook: 'cooking_fry_bacon',
  },

  fry_egg: {
    id: 'fry_egg',
    preconditions: [
      { pan_on_stove: true, pan_has_oil: true, pan_state: 'hot' },
    ],
    steps: [
      { action: 'crack_egg', target_vessel: 'pan' },
      { motion: 'observe_egg_setting',  duration_ms: 120000, note: 'white sets, yolk still runny' },
      { motion: 'check_egg_done',       note: 'white fully opaque = done (sunny side up)' },
      { action: 'remove_from_pan',      instrument: 'spatula', destination: 'plate' },
    ],
    duration_ms: 150000,
    on_complete: { egg_state: 'fried', egg_location: 'plate' },
    dialogue_hook: 'cooking_fry_egg',
  },

  flip_food: {
    id: 'flip_food',
    preconditions: [
      { spatula_in_hand: true },
      { food_in_pan: true },
    ],
    steps: [
      { motion: 'slide_spatula_under_food', note: 'angle at 20 degrees, gentle insertion' },
      { motion: 'lift_food_slightly_off_pan', note: '2–3cm' },
      { motion: 'quick_wrist_flip',           note: 'fast rotation — confidence required' },
      { motion: 'lower_food_back_down' },
      { motion: 'withdraw_spatula' },
    ],
    duration_ms: 2000,
    on_complete: { food_flipped: true },
    dialogue_hook: 'cooking_flip',
  },

  remove_from_pan: {
    id: 'remove_from_pan',
    preconditions: [
      { spatula_in_hand: true },
      { food_in_pan: true },
    ],
    steps: [
      { motion: 'slide_spatula_under_food' },
      { motion: 'lift_food_clear_of_pan' },
      { motion: 'carry_to_plate' },
      { motion: 'tilt_spatula_to_slide_food_off' },
    ],
    duration_ms: 2500,
    on_complete: { food_location: 'plate' },
  },

  stir: {
    id: 'stir',
    preconditions: [
      { spoon_in_hand: true },
      { pot_on_stove: true },
    ],
    steps: [
      { motion: 'insert_spoon_into_pot' },
      { motion: 'rotate_wrist_clockwise',  note: '4 full rotations' },
      { motion: 'vary_depth_occasionally', note: 'reach to bottom of pot every other stir' },
      { motion: 'lift_spoon_to_check',     note: 'check consistency' },
    ],
    duration_ms: 8000,
    on_complete: {},
    dialogue_hook: 'cooking_stir',
  },

  taste_test: {
    id: 'taste_test',
    preconditions: [{ spoon_in_hand: true }],
    steps: [
      { motion: 'scoop_small_amount' },
      { motion: 'raise_spoon_toward_mouth' },
      { motion: 'blow_cool_3_times' },
      { motion: 'taste_sip' },
      { motion: 'pause_and_evaluate', note: 'slight head tilt, thinking expression' },
      { motion: 'return_spoon_to_pot_or_down' },
    ],
    duration_ms: 6000,
    on_complete: {},
    dialogue_hook: 'cooking_taste_test',
  },

  season: {
    id: 'season',
    description: 'Add salt and/or pepper',
    preconditions: [{ food_in_pan_or_on_plate: true }],
    steps: [
      { action: 'pickup_ingredient', target: 'shaker-salt' },
      { motion: 'hold_over_food_45deg' },
      { motion: 'shake_2_to_3_times' },
      { motion: 'return_upright' },
      { action: 'put_down_object', target: 'shaker-salt' },
      { action: 'pickup_ingredient', target: 'shaker-pepper' },
      { motion: 'hold_over_food_45deg' },
      { motion: 'shake_2_times' },
      { action: 'put_down_object', target: 'shaker-pepper' },
    ],
    duration_ms: 8000,
    on_complete: { food_seasoned: true },
    dialogue_hook: 'cooking_season',
  },

  boil_water: {
    id: 'boil_water',
    preconditions: [
      { pot_on_stove: true },
      { water_in_pot: true },
    ],
    steps: [
      { action: 'set_stove_heat', level: 'high' },
      { motion: 'wait_and_observe', duration_ms: 300000, note: 'check pot occasionally, idle near stove' },
      { motion: 'detect_boiling',  note: 'bubbles and steam visible' },
      { action: 'set_stove_heat', level: 'medium', note: 'reduce to simmer once boiling' },
    ],
    duration_ms: 300000,
    on_complete: { water_state: 'boiling' },
    dialogue_hook: 'cooking_boil',
  },

  simmer: {
    id: 'simmer',
    preconditions: [{ pot_on_stove: true, stove_heat: 'low_or_medium' }],
    steps: [
      { motion: 'idle_near_stove' },
      { motion: 'occasional_stir',  ref: 'stir', every_ms: 60000 },
      { motion: 'occasional_taste', ref: 'taste_test', every_ms: 120000 },
    ],
    duration_ms: 900000,
    on_complete: {},
    dialogue_hook: 'cooking_simmer',
  },

  // ══════════════════════════════════════════════════════════════
  //  PLATING
  // ══════════════════════════════════════════════════════════════

  get_plate: {
    id: 'get_plate',
    steps: [
      { motion: 'walk_to_cupboard' },
      { motion: 'open_cupboard_door' },
      { motion: 'reach_for_plate', note: 'palm flat up underneath' },
      { motion: 'carry_plate_to_counter' },
      { motion: 'set_plate_down_gently' },
    ],
    duration_ms: 4000,
    on_complete: { plate_ready: true },
  },

  plate_food: {
    id: 'plate_food',
    description: 'Transfer cooked food to plate attractively',
    preconditions: [
      { plate_ready: true },
      { food_cooked: true },
    ],
    steps: [
      { action: 'remove_from_pan', destination: 'plate' },
      { motion: 'arrange_food_neatly', note: 'step back slightly, look at plate critically' },
      { action: 'season', note: 'final seasoning on plate' },
      { motion: 'optional_garnish',   note: 'if garnish available: place decoratively' },
      { motion: 'step_back_admire',   note: 'tilt head, satisfied expression' },
    ],
    duration_ms: 8000,
    on_complete: { food_plated: true },
    dialogue_hook: 'cooking_plate',
  },

  // ══════════════════════════════════════════════════════════════
  //  EATING
  // ══════════════════════════════════════════════════════════════

  sit_to_eat: {
    id: 'sit_to_eat',
    steps: [
      { motion: 'carry_plate_to_dining_area' },
      { motion: 'set_plate_on_table' },
      { action: 'sit', target: 'dining_chair_or_sofa' },
      { motion: 'look_at_food_appreciatively' },
    ],
    duration_ms: 5000,
    on_complete: { position: 'seated_at_food' },
  },

  eat_meal: {
    id: 'eat_meal',
    preconditions: [{ position: 'seated_at_food', food_plated: true }],
    steps: [
      { motion: 'pick_up_utensil', note: 'fork for solids, spoon for soup' },
      {
        motion: 'eat_loop',
        repeat: 'until_plate_empty',
        sub_steps: [
          { motion: 'pierce_or_scoop_food' },
          { motion: 'raise_to_mouth' },
          { motion: 'chew', duration_ms: 2000, note: 'slight jaw movement, eyes relax' },
          { motion: 'lower_utensil_to_plate' },
          { motion: 'occasional_sip_of_drink', probability: 0.2 },
          { motion: 'occasional_comment_on_food', probability: 0.3 },
        ],
      },
      { motion: 'set_utensil_down' },
      { motion: 'satisfied_lean_back' },
    ],
    duration_ms: 120000,
    on_complete: { meal_eaten: true },
    dialogue_hook: 'cooking_eat',
  },

  // ══════════════════════════════════════════════════════════════
  //  CLEANUP
  // ══════════════════════════════════════════════════════════════

  clean_up: {
    id: 'clean_up',
    description: 'Post-cooking cleanup — both chars can share this',
    can_be_shared: true,
    steps: [
      { motion: 'turn_off_stove', note: 'reach to knob, rotate to off' },
      { motion: 'carry_dirty_items_to_sink' },
      { motion: 'rinse_pan_and_utensils', duration_ms: 15000 },
      { motion: 'wipe_counter',            duration_ms: 8000 },
      { motion: 'put_items_away' },
    ],
    duration_ms: 40000,
    on_complete: { kitchen_clean: true },
    dialogue_hook: 'cooking_cleanup',
  },

};

// ══════════════════════════════════════════════════════════════
//  ROLE ASSIGNMENT
//  When both Miss OG Tinz and Lora cook together,
//  this maps which char takes which role.
// ══════════════════════════════════════════════════════════════

export const COOKING_ROLES = {

  collaborative: {
    description: 'One preps, one cooks — efficient teamwork',
    miss: 'cook',    // Miss OG Tinz manages stove
    lora: 'prep',    // Lora handles washing + chopping
    chat_style: 'instructive_banter',
  },

  reactive: {
    description: 'One leads, one watches and reacts',
    miss: 'lead',    // Miss cooks, explains, shows off
    lora: 'react',   // Lora watches, comments, taste-tests
    chat_style: 'show_and_tell',
  },

  parallel: {
    description: 'Both cook different components simultaneously',
    miss: 'main_dish',
    lora: 'side_dish_or_drink',
    chat_style: 'casual_chatter',
  },

  competitive: {
    description: 'Both make the same thing — who finishes first / tastes better',
    miss: 'contestant',
    lora: 'contestant',
    chat_style: 'playful_rivalry',
    twitch_hook: 'poll_who_wins',
  },

};
