// ================================================================
//  kitchen-behaviour.js  — TEMPORARY STUB
//  Your real kitchen-behaviour.js (and kitchen_actions.js,
//  kitchen_objects.json, kitchen_recipes.js) were lost when you
//  deleted the originals after uploading them to chat.
//
//  This stub exists ONLY so engine-life.js can build and run.
//  Right now, !cook commands from chat are simply logged and
//  ignored — Miss OG Tinz won't perform any kitchen actions.
//
//  Replace this file with your real kitchen-behaviour.js as soon
//  as you find a backup, or rebuild the kitchen logic from scratch.
// ================================================================

export function handleCookCommand(message) {
  console.log('[kitchen-behaviour STUB] !cook command received but ignored:', message);
  // Real implementation would parse `message` against kitchen_recipes.js /
  // kitchen_actions.js / kitchen_objects.json and trigger the matching
  // animation/activity sequence on the avatar.
}
