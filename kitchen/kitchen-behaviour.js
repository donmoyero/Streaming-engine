// ================================================================
//  kitchen-behaviour.js
//  Orchestrates full cooking sessions for Miss OG Tinz & Lora.
//
//  WIRES INTO:
//    engine-life.js  → _setMissActivity(), ACTIVITY
//    engine-bff.js   → startCoupleEngine(), handleMusicCommand()
//    engine-bones.js → IK targets, pose blending
//
//  HOW IT WORKS:
//    1. KitchenBehaviour.start(trigger) picks a recipe
//    2. Walks through recipe.steps phase by phase
//    3. For each step, assigns activities to Miss + Lora
//    4. Fires dialogue hooks into engine-bff.js
//    5. Triggers Twitch hooks at key moments
//    6. Cleans up and returns both to idle when done
//
//  USAGE:
//    import { KitchenBehaviour } from './kitchen-behaviour.js';
//    KitchenBehaviour.start();                    // autonomous
//    KitchenBehaviour.start('twitch:bacon');      // from Twitch !cook bacon
//    KitchenBehaviour.stop();                     // interrupt
// ================================================================

import { RECIPES, selectRecipe }     from './kitchen_recipes.js';
import { KITCHEN_ACTIONS }           from './kitchen_actions.js';
import { setMusicVolume }            from '../engine-music.js';

// ================================================================
//  SKILL MEMORY — tracks cooking proficiency per action
//  Folded in from skill-memory.js to keep file count down.
//
//  Skills with technique that can succeed or fail:
// ================================================================

const SKILL_ACTIONS = new Set([
  'slice','dice','chop','mince','julienne','crack_egg',
  'flip_food','fry_egg','fry_bacon','stir','season',
  'plate_food','taste_test','boil_water'
]);

const _skills = {}; // { slice: { attempts: 12, successes: 11 } }

export function logSkillAttempt(skill, success) {
  if (!_skills[skill]) _skills[skill] = { attempts: 0, successes: 0 };
  _skills[skill].attempts++;
  if (success) _skills[skill].successes++;
}

export function getSkillConfidence(skill) {
  const s = _skills[skill];
  if (!s || s.attempts === 0) return 0.7; // default starting confidence
  return s.successes / s.attempts;
}

export function getAllSkills() { return { ..._skills }; }

// ── Dialogue lines for each hook ────────────────────────────────
//  These are passed to engine-bff.js speak() / showBubble()
const DIALOGUE = {

  cooking_start_collab: [
    "Aight Lora let's get this — you wash up, I'm on the stove.",
    "We moving today babes, let's cook something proper.",
    "Washing hands first obviously, Miss OG Tinz ain't unhygienic.",
  ],
  cooking_prep_start: [
    "Right, prep time. Let me get everything ready.",
    "Mise en place, that's what the real ones say innit.",
    "Okay okay I got this. Let's do it properly.",
  ],
  cooking_prep_chop: [
    "Listen to that knife on the board. Satisfying fr.",
    "Mum taught me this — curl your fingers, don't lose one.",
    "Chop chop literally, we ain't got all day.",
    "Look at me julienning like a proper chef.",
  ],
  cooking_start_solo: [
    "Just me cooking today — let's see what I can do.",
    "Right, solo mission. Easy.",
  ],
  cooking_wash_veg: [
    "Always wash your veg fam. I don't play with that.",
    "Clean ingredients, clean conscience.",
  ],
  cooking_prep_avocado: [
    "Okay the pit trick — tap the knife in, twist. Don't panic.",
    "Avocado is literally just butter from a tree. Perfection.",
    "Lora don't mess up the toast while I'm doing this.",
  ],
  cooking_toast_bread: [
    "Toast is an art form actually.",
    "Golden brown only. None of that pale bread energy.",
  ],
  cooking_fry_bacon: [
    "You hear that sizzle? That's the sound of a good morning.",
    "Medium heat, always. Don't rush bacon.",
    "The smell alone — chat are you smelling this? 👃",
    "We waiting for the edges to curl. That's the sign.",
  ],
  cooking_fry_egg: [
    "Sunny side up for the culture.",
    "Don't touch it, don't poke it, just let it cook.",
    "Egg cracking is a skill. Tap, split, drop. Clean.",
  ],
  cooking_crack_egg: [
    "One tap, clean split. Watch the pro.",
    "Got it in first try no shell — that's technique right there.",
  ],
  cooking_flip: [
    "The flip! 🍳 Wrist confidence only.",
    "If you hesitate you fumble it. Commit to the flip.",
  ],
  cooking_add_veg: [
    "All these colours going in — it's a vibe.",
    "Vegetables are not optional. That's final.",
  ],
  cooking_stir: [
    "Stir it up. Literally.",
    "Can't stop stirring — this is actually meditative.",
    "Every good soup needs attention.",
  ],
  cooking_taste_test: [
    "Let me try this actually— oh that's NICE.",
    "Blow first, always. I raised myself right.",
    "Hmm... needs a bit more salt I reckon.",
    "Lora come taste this!",
  ],
  cooking_season: [
    "Salt and pepper on everything. Non-negotiable.",
    "Season in layers, not just at the end. Life lesson.",
    "A little goes a long way. Balance.",
  ],
  cooking_simmer: [
    "Now we wait. Patience is the final ingredient.",
    "Low and slow, that's how the flavour builds.",
    "I love watching it just bubble away.",
  ],
  cooking_simmer_react: [
    "Smells unreal from over here.",
    "I'm just stirring but I feel very important.",
    "Tell me when it's ready I'm starving.",
  ],
  cooking_boil: [
    "Watched pot never boils — that's cap, it always boils.",
    "High heat first, then we bring it down.",
  ],
  cooking_wait_pan: [
    "Pan needs to heat up first. Don't rush it.",
    "If you put food in a cold pan you've already lost.",
  ],
  cooking_sizzle: [
    "SSSSS — there it is. Perfect temperature.",
    "That sizzle is my favourite sound after a notification sound.",
  ],
  cooking_plate: [
    "Presentation matters. Even at home.",
    "Look at that. Gordon Ramsay who?",
    "We eat with our eyes first — chat look at this.",
    "Done. That's a masterpiece actually.",
  ],
  cooking_plate_assist: [
    "I got the ketchup deployment covered.",
    "Finishing touches — this is teamwork.",
  ],
  cooking_eat: [
    "Okay this actually slaps fr fr.",
    "We cooked this with our own hands chat. Look at us.",
    "I'm not sharing. Well... maybe a bit.",
    "Every bite better than the last no cap.",
    "This hit different when you made it yourself.",
  ],
  cooking_eat_drinks: [
    "Nothing like a hot drink after all that.",
    "Tea hits different when you let it steep properly.",
    "My coffee is perfect. Lora's tea smells amazing though.",
  ],
  cooking_make_coffee: [
    "Coffee first, everything else second.",
    "Proper coffee, not that instant stuff.",
  ],
  cooking_make_tea: [
    "Let it steep properly. 3 minutes minimum.",
    "Honey in tea is actually elite.",
  ],
  cooking_react_smell: [
    "Oh my gosh that SMELL is unreal.",
    "Okay the kitchen smells amazing right now.",
    "I'm not even cooking and I'm hungry.",
  ],
  cooking_watch_chop_comment: [
    "You're actually good at that.",
    "Look at her go — proper chef energy.",
    "I'd have lost a finger by now.",
  ],
  cooking_cleanup: [
    "Clean as you go, that's the rule.",
    "Kitchen's spotless. We professionals.",
    "Mum would be proud. Kitchen clean, food eaten.",
  ],
  cooking_fumble: [
    "Oop — let me redo that.",
    "Okay that one didn't go to plan. We move.",
    "Nah nah nah — again. Properly this time.",
    "Don't laugh at me chat I'm learning okay.",
    "That happens to everyone. I'm unbothered.",
  ],
};

// ── Helper: pick a random line for a dialogue hook ──────────────
function _getDialogue(hook) {
  const lines = DIALOGUE[hook];
  if (!lines || !lines.length) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}

// ── Helper: fire activity on Miss or Lora ───────────────────────
function _setActivity(who, activityName, duration_ms) {
  if (who === 'miss') {
    if (window._setMissActivity) window._setMissActivity(activityName, duration_ms / 1000);
  } else if (who === 'lora') {
    if (window._setLoraActivity) window._setLoraActivity(activityName, duration_ms / 1000);
  }
}

// ── Helper: speak a line as Miss or Lora ────────────────────────
function _speak(who, line) {
  if (!line) return;
  if (who === 'miss' && window.speak)     window.speak(line);
  if (who === 'lora' && window.speakMr)   window.speakMr(line);
}

// ── Helper: post a Twitch message ───────────────────────────────
function _twitchMessage(msg) {
  console.log(`[Kitchen] Twitch hook: ${msg}`);
  // Wire to your Twitch chat output if available:
  if (window._sendTwitchMessage) window._sendTwitchMessage(msg);
}

// ── Map recipe action IDs to engine-life activity names ─────────
const ACTION_TO_ACTIVITY = {
  wash_hands:            'idle',
  approach_counter:      'idle',
  approach_stove:        'idle',
  approach_sink:         'idle',
  approach_fridge:       'idle',
  open_fridge:           'idle',
  close_fridge:          'idle',
  pickup_ingredient:     'idle',
  put_down_object:       'idle',
  pickup_knife:          'idle',
  place_on_cutting_board:'idle',
  wash_ingredient:       'idle',
  slice:                 'cookChop',
  dice:                  'cookChop',
  chop:                  'cookChop',
  mince:                 'cookChop',
  julienne:              'cookChop',
  crack_egg:             'cookChop',
  peel_banana:           'idle',
  place_pan_on_stove:    'idle',
  set_stove_heat:        'idle',
  add_oil_to_pan:        'cookStir',
  wait_for_pan_heat:     'idle',
  add_to_pan:            'cookStir',
  fry_bacon:             'cookStir',
  fry_egg:               'cookStir',
  flip_food:             'cookStir',
  remove_from_pan:       'cookStir',
  stir:                  'cookStir',
  taste_test:            'idle',
  season:                'idle',
  boil_water:            'idle',
  simmer:                'cookStir',
  get_plate:             'idle',
  plate_food:            'idle',
  sit_to_eat:            'sofaSit',
  eat_meal:              'eatAtTable',
  clean_up:              'idle',
};

// ── Main behaviour controller ────────────────────────────────────

let _running = false;
let _currentRecipe = null;
let _stepQueue = [];
let _stepTimer = null;

export const KitchenBehaviour = {

  // ── Start a cooking session ─────────────────────────────────
  start(trigger = 'autonomous') {
    if (_running) {
      console.log('[Kitchen] Already running — ignoring start()');
      return;
    }

    const recipe = selectRecipe(trigger);
    if (!recipe) {
      console.warn('[Kitchen] No recipe selected');
      return;
    }

    _running = true;
    _currentRecipe = recipe;
    window._kitchenRunning = true;   // pauses BFF exchanges during cooking
    window._getAllSkills = getAllSkills; // exposes skill data to memory-store without circular import
    if (window._pauseDeadAir) window._pauseDeadAir();
    console.log(`[Kitchen] Starting: ${recipe.name}`);

    // Raise music volume slightly during cooking
    setMusicVolume(0.15);

    // Announce to stream
    _twitchMessage(`🍳 Miss OG Tinz & Lora are cooking: ${recipe.name}!`);

    // Speak intro line
    setTimeout(() => {
      const intro = _getDialogue('cooking_start_collab') || _getDialogue('cooking_prep_start');
      _speak('miss', intro);
    }, 2000);

    // Build step queue and start executing
    _stepQueue = [...recipe.steps];
    _executeNextStep();
  },

  // ── Stop mid-session ────────────────────────────────────────
  stop() {
    _running = false;
    _currentRecipe = null;
    _stepQueue = [];
    if (_stepTimer) clearTimeout(_stepTimer);
    _stepTimer = null;
    window._kitchenRunning = false;
    if (window._resumeDeadAir) window._resumeDeadAir();

    // Return both to idle
    _setActivity('miss', 'idle', 30);
    _setActivity('lora', 'idle', 30);

    // Return music to ambient
    setMusicVolume(0.08);

    console.log('[Kitchen] Session stopped');
  },

  // ── Check if currently cooking ──────────────────────────────
  isRunning() { return _running; },
  currentRecipe() { return _currentRecipe; },
};

// ── Execute recipe steps one by one ─────────────────────────────
function _executeNextStep() {
  if (!_running || _stepQueue.length === 0) {
    _onRecipeComplete();
    return;
  }

  const step = _stepQueue.shift();
  _executeStep(step);
}

function _executeStep(step) {
  if (!step) { _executeNextStep(); return; }

  console.log(`[Kitchen] Phase: ${step.phase || 'unknown'}`);

  // Fire Twitch hooks for this phase
  if (_currentRecipe && step.phase) {
    const hooks = (_currentRecipe.twitch_hooks || [])
      .filter(h => h.trigger === `phase:${step.phase}`);
    hooks.forEach(h => _twitchMessage(h.message));
  }

  // Calculate step duration
  let duration_ms = _calcStepDuration(step);

  // Assign activities to Miss
  if (step.miss) {
    _assignCharacter('miss', step.miss);
  }

  // Assign activities to Lora
  if (step.lora) {
    _assignCharacter('lora', step.lora);
  }

  // Fire dialogue hook
  if (step.dialogue) {
    const line = _getDialogue(step.dialogue);
    if (line) {
      const speaker = step.miss ? 'miss' : 'lora';
      setTimeout(() => _speak(speaker, line), 1500);
    }
  }

  // Move to next step after duration
  _stepTimer = setTimeout(_executeNextStep, duration_ms);
}

function _assignCharacter(who, charStep) {
  if (!charStep) return;

  // Sequence of actions
  if (charStep.sequence) {
    let offset = 0;
    charStep.sequence.forEach((item, i) => {
      const dur = _getActionDuration(item.action || item.motion);
      setTimeout(() => {
        const actName = ACTION_TO_ACTIVITY[item.action] || ACTION_TO_ACTIVITY[item.motion] || 'idle';
        _setActivity(who, actName, dur / 1000);

        // ── Skill learning: roll success/fail for technique actions ──
        const skillId = item.action;
        if (skillId && SKILL_ACTIONS.has(skillId)) {
          const confidence = getSkillConfidence(skillId);
          const success    = Math.random() < confidence;
          logSkillAttempt(skillId, success);
          if (!success) {
            // Small visible fumble — replays the activity briefly and speaks
            setTimeout(() => {
              _setActivity(who, actName, 3);
              const fumble = _getDialogue('cooking_fumble');
              if (fumble) setTimeout(() => _speak(who, fumble), 400);
            }, 800);
          }
        }

        if (item.dialogue) {
          const line = _getDialogue(item.dialogue);
          if (line) setTimeout(() => _speak(who, line), 500);
        }
      }, offset);
      offset += dur;
    });

    // Dialogue for the sequence as a whole
    if (charStep.dialogue) {
      const line = _getDialogue(charStep.dialogue);
      if (line) setTimeout(() => _speak(who, line), 2000);
    }
    return;
  }

  // Single action
  if (charStep.action) {
    const actName = ACTION_TO_ACTIVITY[charStep.action] || 'idle';
    const dur = _getActionDuration(charStep.action);
    _setActivity(who, actName, dur / 1000);
    if (charStep.dialogue) {
      const line = _getDialogue(charStep.dialogue);
      if (line) setTimeout(() => _speak(who, line), 1500);
    }
    return;
  }

  // Motion-only step
  if (charStep.motion) {
    _setActivity(who, 'idle', 10);
  }
}

// ── Duration helpers ─────────────────────────────────────────────
function _getActionDuration(actionId) {
  const action = KITCHEN_ACTIONS[actionId];
  return action?.duration_ms || 5000;
}

function _calcStepDuration(step) {
  // For parallel steps, duration = max of both sides
  // For sequential, duration = sum
  let missDur = 0;
  let loraDur  = 0;

  if (step.miss) {
    if (step.miss.sequence) {
      missDur = step.miss.sequence.reduce((t, s) => t + _getActionDuration(s.action || s.motion), 0);
    } else {
      missDur = _getActionDuration(step.miss.action);
    }
  }

  if (step.lora) {
    if (step.lora.sequence) {
      loraDur = step.lora.sequence.reduce((t, s) => t + _getActionDuration(s.action || s.motion), 0);
    } else {
      loraDur = _getActionDuration(step.lora.action);
    }
  }

  // Add a small buffer between steps
  const buffer = 2000;

  if (step.parallel) {
    return Math.max(missDur, loraDur) + buffer;
  }
  return missDur + loraDur + buffer;
}

// ── Recipe complete ──────────────────────────────────────────────
function _onRecipeComplete() {
  _running = false;
  window._kitchenRunning = false;
  if (window._resumeDeadAir) window._resumeDeadAir();

  console.log(`[Kitchen] Recipe complete: ${_currentRecipe?.name}`);

  const line = _getDialogue('cooking_cleanup');
  _speak('miss', line);
  setTimeout(() => {
    const line2 = _getDialogue('cooking_cleanup');
    _speak('lora', line2);
  }, 3000);

  // Return music to ambient
  setTimeout(() => setMusicVolume(0.08), 5000);

  // Return both to normal life after cleanup
  setTimeout(() => {
    _setActivity('miss', 'idle', 60);
    _setActivity('lora', 'idle', 60);
    _currentRecipe = null;
    console.log('[Kitchen] Both returned to idle');
  }, 45000);

  _twitchMessage('✅ Cooking done! Type 👏 if that looked good!');
}

// ── Twitch !cook command handler ─────────────────────────────────
//  Wire this into your Twitch message handler in engine-life.js:
//    import { handleCookCommand } from './kitchen-behaviour.js';
//    if (message.startsWith('!cook')) handleCookCommand(message);
export function handleCookCommand(message) {
  const parts = message.trim().split(' ');
  const sub = parts[1] || '';

  if (sub === 'stop') {
    KitchenBehaviour.stop();
    return;
  }

  if (sub === 'status') {
    const r = KitchenBehaviour.currentRecipe();
    _twitchMessage(r ? `🍳 Currently cooking: ${r.name}` : '😴 Not cooking right now');
    return;
  }

  KitchenBehaviour.start(`twitch:${sub}`);
}
