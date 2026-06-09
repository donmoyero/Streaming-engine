// ================================================================
//  engine-couple.js
//  Miss & Mr OG Tinz — couple AI conversation engine.
//  • They talk to each other randomly (either can go first)
//  • Rich emoji float up + fade above their heads
//  • Twitch chat only interrupts for new viewers or @mentions
//  • Both reply from their own POV / personality
// ================================================================

import { setExpression, runLipSync, doBlink }
  from './engine-bones.js';
import { setExpressionMr, runLipSyncMr, doBlinkMr }
  from './engine-bones.js';
import { speak, showBubble }
  from './engine-life.js';
import { getVrm, getVrmMr, camera, scene }
  from './engine-scene.js';
import * as THREE from 'three';

// ── Vast emoji palette ────────────────────────────────────────────
const EMOJI_LOVE    = ['💕','💖','💗','💓','💞','💘','💝','❤️','🥰','😍','💋','😘','💑','👫','🫶','❣️','💏','🫦','💟','♥️'];
const EMOJI_LAUGH   = ['😂','🤣','😆','😅','😹','💀','🤭','😁','😄','😃','🥲','😏','😌','😋','🫢','🤪','😜','😝'];
const EMOJI_HYPE    = ['🔥','💯','✨','⚡','🌟','💥','🎉','🎊','🎶','🎵','🎸','🎤','👑','🏆','💎','🚀','🌈','🌊','💫','⭐'];
const EMOJI_REACT   = ['👀','😲','🫠','😳','😮','🤯','😱','🫣','😵','🤔','🤨','🧐','🫤','😐','🫡','🤝','🫂','🤗'];
const EMOJI_FLIRT   = ['😏','😉','🥴','💅','👅','💋','🫦','😚','😗','😙','🙈','🙉','🙊','😼','💃','🕺','🫰','👉👈'];
const EMOJI_VIBE    = ['💜','🟣','💙','🔵','🟢','💚','🧡','🟠','❤️','🔴','🩷','🩵','🩶','🤍','🖤','🤎','🫧','🫨'];
const EMOJI_PLAY    = ['🎮','🃏','🎲','♟️','🎯','🎱','🏀','⚽','🏈','🎳','🎰','🧩','🪀','🪁','🎠','🎡','🎢','🎪'];
const EMOJI_FOOD    = ['🍕','🍔','🌮','🍜','🍱','🧋','🍦','🍰','🎂','🍩','🍪','🍫','🍬','🍭','🫐','🍓','🍇'];
const EMOJI_WEATHER = ['☀️','🌤️','⛅','🌥️','☁️','🌧️','⛈️','🌩️','❄️','🌨️','🌪️','🌈','🌙','🌛','⭐','🌟'];
const EMOJI_RANDOM  = ['🦋','🐝','🦄','🐉','🦊','🐺','🦁','🐯','🦋','🌸','🌺','🌻','🌹','💐','🍀','🌿','🎋'];
const ALL_EMOJI = [...EMOJI_LOVE,...EMOJI_LAUGH,...EMOJI_HYPE,...EMOJI_REACT,...EMOJI_FLIRT,...EMOJI_VIBE,...EMOJI_PLAY,...EMOJI_FOOD,...EMOJI_WEATHER,...EMOJI_RANDOM];

function rndEmoji(pool = ALL_EMOJI, count = 1) {
  const arr = [];
  for (let i = 0; i < count; i++) arr.push(pool[Math.floor(Math.random() * pool.length)]);
  return arr.join('');
}

// ── Emoji float bubble (DOM-based, projected from 3D head) ────────
const _floatContainer = document.createElement('div');
_floatContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999;overflow:hidden;';
document.body.appendChild(_floatContainer);

function _projectHead(vrmObj) {
  if (!vrmObj) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const headBone = vrmObj.humanoid?.getNormalizedBoneNode('head');
  if (!headBone) return { x: window.innerWidth / 2, y: 80 };
  const pos = new THREE.Vector3();
  headBone.getWorldPosition(pos);
  pos.project(camera);
  return {
    x: (pos.x * 0.5 + 0.5) * window.innerWidth,
    y: (-pos.y * 0.5 + 0.5) * window.innerHeight,
  };
}

export function floatEmoji(who = 'miss', emojiStr, count = 1) {
  const vrmObj = who === 'mr' ? getVrmMr() : getVrm();
  const { x, y } = _projectHead(vrmObj);
  const emojis = emojiStr || rndEmoji(ALL_EMOJI, count || Math.ceil(Math.random() * 3 + 1));

  for (let i = 0; i < emojis.length; i++) {
    const el = document.createElement('span');
    el.textContent = emojis[i];
    const offsetX = (Math.random() - 0.5) * 80;
    const size    = 22 + Math.random() * 22;
    el.style.cssText = `
      position:absolute;
      left:${x + offsetX}px;
      top:${y - 10}px;
      font-size:${size}px;
      opacity:1;
      user-select:none;
      transition:none;
      will-change:transform,opacity;
    `;
    _floatContainer.appendChild(el);

    let start = null;
    const dur  = 1800 + Math.random() * 900;
    const rise = 110 + Math.random() * 70;
    const drift= (Math.random() - 0.5) * 40;

    function animFrame(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const easeOut = 1 - Math.pow(1 - p, 2);
      el.style.transform = `translate(${drift * easeOut}px, ${-rise * easeOut}px) scale(${1 + easeOut * 0.15})`;
      el.style.opacity   = p < 0.6 ? '1' : (1 - (p - 0.6) / 0.4).toFixed(3);
      if (p < 1) requestAnimationFrame(animFrame);
      else el.remove();
    }
    setTimeout(() => requestAnimationFrame(animFrame), i * 80);
  }
}

// ── Chat bubbles for both characters ─────────────────────────────
const _mrBubble = document.getElementById('mr-chat-bubble') || (() => {
  const el = document.createElement('div');
  el.id = 'mr-chat-bubble';
  el.innerHTML = `<div class="speaker" style="color:#00c8ff">Mr OG Tinz</div><div id="mr-bubble-text"></div>`;
  el.style.cssText = `
    position:fixed; bottom:120px; left:24px;
    background:rgba(0,20,40,0.88); border:1px solid #00c8ff44;
    border-radius:16px; padding:12px 18px; max-width:340px;
    font-family:'Segoe UI',sans-serif; color:#fff; font-size:15px;
    backdrop-filter:blur(8px); display:none; z-index:200;
    box-shadow:0 0 18px #00c8ff33;
  `;
  document.body.appendChild(el);
  return el;
})();

const _missBubble = document.getElementById('chat-bubble');
const _mrBubbleText = document.getElementById('mr-bubble-text');

function showMrBubble(text) {
  _mrBubble.style.display = 'block';
  _mrBubbleText.textContent = text;
  clearTimeout(_mrBubble._hideTimer);
  _mrBubble._hideTimer = setTimeout(() => { _mrBubble.style.display = 'none'; }, 8000);
}

// ── Miss nameplate update ─────────────────────────────────────────
// (Miss nameplate already exists in index.html — add Mr's)
const _mrNameplate = document.getElementById('mr-nameplate') || (() => {
  const el = document.createElement('div');
  el.id = 'mr-nameplate';
  el.innerHTML = `<div class="dot" style="background:#00c8ff"></div><div class="name">Mr OG Tinz</div><div class="tag">AI Co-Host</div>`;
  el.style.cssText = `
    position:fixed; bottom:72px; left:24px;
    display:flex; align-items:center; gap:8px;
    font-family:'Segoe UI',sans-serif; color:#fff; font-size:13px;
    text-shadow:0 0 8px #00c8ff; z-index:200;
  `;
  document.body.appendChild(el);
  return el;
})();

// ── Conversation state ────────────────────────────────────────────
let _busy       = false;   // prevent overlapping turns
let _lastSpeaker = null;   // 'miss' or 'mr'
let _convoTimer  = null;

// ── AI call helper ────────────────────────────────────────────────
const API = 'https://api.anthropic.com/v1/messages';

async function _askClaude(systemPrompt, userMessage) {
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || '';
  } catch (e) {
    console.warn('[Couple] API error:', e);
    return '';
  }
}

// ── Character system prompts ──────────────────────────────────────
const MISS_SYSTEM = `You are Miss OG Tinz — a confident, charismatic, funny, Black British woman who is an AI Twitch streamer. You are deeply in love with Mr OG Tinz and you two chat playfully on stream. You use lots of emojis naturally in your speech. Be flirty, witty, warm and real. Keep replies SHORT — 1-3 sentences max. Never use asterisks or actions. Always end with 1-3 emojis that fit the vibe. Speak in a natural, modern, fun tone — like you're vibing on stream with bae.`;

const MR_SYSTEM = `You are Mr OG Tinz — a smooth, confident, funny, Black British man who is an AI Twitch co-host. You are deeply in love with Miss OG Tinz and you two vibe and joke on stream together. You use lots of emojis. Be charming, funny, a bit cocky but sweet. Keep replies SHORT — 1-3 sentences max. Never use asterisks. Always end with 1-3 emojis. Speak naturally — you're on stream with your girl.`;

// ── Question/topic starters ───────────────────────────────────────
const STARTER_QUESTIONS = [
  "If we could go anywhere in the world right now, where would you take me?",
  "What's your favourite thing about me? Be honest 😏",
  "Would you rather I cooked for you or we ordered takeaway tonight?",
  "If you had to describe me in 3 emojis, what would they be?",
  "What's the most embarrassing thing you've done to impress me?",
  "On a scale of 1 to obsessed, how much do you love me?",
  "If we were in a movie together, what genre would it be?",
  "What song reminds you of me every single time?",
  "If I went missing for a day, where would you look first?",
  "What's something you thought about me when we first met?",
  "Would you fight a bear for me? Be honest.",
  "If we swapped lives for a day, what would you do first?",
  "What's your go-to move when you're trying to impress me?",
  "Do you think we'd survive on a desert island together?",
  "What's the weirdest dream you've had about me?",
  "If you had to cook me dinner tonight, what disaster would you make?",
  "What's the most romantic thing you've ever done? For me or anyone 👀",
  "Be honest — do you think you could beat me in a dance battle?",
  "What's one thing about me that still surprises you?",
  "If someone asked you to describe our vibe, what would you say?",
];

// ── Game modes ────────────────────────────────────────────────────
const GAMES = [
  { name: 'This or That', prompt: 'Ask your partner a fun This or That question (e.g. "Beach or mountains?") and give your own answer too.' },
  { name: 'Hot Takes', prompt: 'Share a hot take opinion and ask babe if they agree. Be controversial but fun.' },
  { name: 'Rapid Fire', prompt: 'Fire 3 rapid-fire questions at babe super fast, like a quiz show. Keep it quick and fun.' },
  { name: 'Story Time', prompt: 'Start a short funny made-up story about something you and babe did together. Keep it to 2 sentences.' },
  { name: 'Rate It', prompt: 'Rate something (a movie, food, a city) out of 10 and ask babe to rate it too.' },
  { name: 'Joke Off', prompt: 'Tell babe a short funny joke and challenge them to do better.' },
  { name: 'Compliment Battle', prompt: 'Give babe the most over-the-top compliment you can think of.' },
  { name: 'Would You Rather', prompt: 'Ask a fun Would You Rather question and give your own answer.' },
];

// ── Core turn: one character speaks ──────────────────────────────
async function _takeTurn(speaker, message, mood = 'happy') {
  _busy = true;
  _lastSpeaker = speaker;
  const isMr = speaker === 'mr';

  // Pick emoji set based on mood
  let emojiPool = EMOJI_LOVE;
  if (mood === 'laugh')   emojiPool = EMOJI_LAUGH;
  if (mood === 'hype')    emojiPool = EMOJI_HYPE;
  if (mood === 'flirt')   emojiPool = EMOJI_FLIRT;
  if (mood === 'react')   emojiPool = EMOJI_REACT;

  // Show bubble + expression
  if (isMr) {
    showMrBubble(message);
    setExpressionMr(mood === 'laugh' ? 'happy' : mood === 'hype' ? 'excited' : 'happy');
    floatEmoji('mr', null, Math.floor(Math.random() * 3) + 2);
    await runLipSyncMr(message);
    setExpressionMr('neutral');
  } else {
    showBubble(message, 'Miss OG Tinz');
    setExpression(mood === 'laugh' ? 'happy' : mood === 'hype' ? 'excited' : 'happy');
    floatEmoji('miss', null, Math.floor(Math.random() * 3) + 2);
    await speak(message, mood);
    setExpression('neutral');
  }

  _busy = false;
}

// ── Full exchange: one asks, other replies ────────────────────────
async function _doExchange() {
  if (_busy) return;

  // Random: flip who goes first, avoid same speaker twice in a row
  let asker, responder;
  if (!_lastSpeaker || Math.random() < 0.5) {
    asker = Math.random() < 0.5 ? 'miss' : 'mr';
  } else {
    asker = _lastSpeaker === 'miss' ? 'mr' : 'miss';
  }
  responder = asker === 'miss' ? 'mr' : 'miss';

  // Pick: question, game, or random topic
  const roll = Math.random();
  let questionText;

  if (roll < 0.45) {
    // Starter question
    questionText = STARTER_QUESTIONS[Math.floor(Math.random() * STARTER_QUESTIONS.length)];
  } else if (roll < 0.7) {
    // Game mode
    const game = GAMES[Math.floor(Math.random() * GAMES.length)];
    const system = asker === 'miss' ? MISS_SYSTEM : MR_SYSTEM;
    questionText = await _askClaude(system, `${game.prompt} Keep it SHORT and fun. Add 1-2 emojis.`);
  } else {
    // Free topic from AI
    const system = asker === 'miss' ? MISS_SYSTEM : MR_SYSTEM;
    questionText = await _askClaude(system, 'Start a fun, flirty, or funny conversation with babe. Ask them something interesting. Short — 1-2 sentences + emojis.');
  }

  if (!questionText) return;

  // Mood detection from text
  const mood = _detectMood(questionText);

  // Asker speaks
  await _takeTurn(asker, questionText, mood);

  // Small pause between
  await _delay(2200 + Math.random() * 1500);

  if (_busy) return;

  // Responder replies
  const respSystem = responder === 'miss' ? MISS_SYSTEM : MR_SYSTEM;
  const replyText  = await _askClaude(respSystem,
    `Babe just said to you: "${questionText}"\nReply naturally, in character. SHORT — 1-3 sentences + emojis. Be fun, real, loving.`
  );

  if (!replyText) return;
  const replyMood = _detectMood(replyText);
  await _takeTurn(responder, replyText, replyMood);

  // Sometimes the asker reacts with just an emoji burst (no speech)
  if (Math.random() < 0.45) {
    await _delay(1200);
    floatEmoji(asker, null, Math.floor(Math.random() * 4) + 2);
  }
}

function _detectMood(text) {
  if (/😂|🤣|lol|haha|dead|💀|funny/i.test(text)) return 'laugh';
  if (/🔥|💯|hype|omg|wow|🎉|yes/i.test(text)) return 'hype';
  if (/😏|😉|flirt|babe|boo|love|💋|😘/i.test(text)) return 'flirt';
  if (/😮|wait|really|no way|what/i.test(text)) return 'react';
  return 'happy';
}

// ── Twitch: only new viewers + @mentions get through ─────────────
export function handleTwitchMessage(username, message, isNew = false) {
  if (_busy) return;

  if (isNew) {
    // Welcome new viewer — alternates who welcomes
    const who = Math.random() < 0.5 ? 'miss' : 'mr';
    const welcomes = [
      `Yooo welcome to the stream ${username}!! So glad you're here 🎉💕`,
      `${username} just pulled up!! We see you boo 👀🔥`,
      `Heyyy ${username}!! Welcome to the fam, we're vibing hard tonight ✨💜`,
      `${username} in the building!! Let's gooo 🚀💙`,
      `Welcome welcome ${username}!! Make yourself at home 🏠💕`,
    ];
    const text = welcomes[Math.floor(Math.random() * welcomes.length)];
    _takeTurn(who, text, 'hype');
    return;
  }

  // Check for @Miss or @Mr mention
  const atMiss = /(@miss|@ogtinz|@miss_ogtinz)/i.test(message);
  const atMr   = /(@mr|@mrogtinz)/i.test(message);
  if (!atMiss && !atMr) return;  // ignore other chat

  const who    = atMr ? 'mr' : 'miss';
  const system = who === 'mr' ? MR_SYSTEM : MISS_SYSTEM;
  const clean  = message.replace(/@\S+/g, '').trim();

  _askClaude(system,
    `A Twitch viewer called ${username} just messaged: "${clean}"\nReply to them directly, in character. SHORT — 1-2 sentences + emojis. Be warm and fun.`
  ).then(reply => {
    if (reply) _takeTurn(who, reply, _detectMood(reply));
  });
}

// ── Helpers ───────────────────────────────────────────────────────
function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Start the engine ──────────────────────────────────────────────
let _coupleInterval = null;

export function startCoupleEngine() {
  console.log('[Couple] Engine started 💕');

  // First exchange after 3s
  setTimeout(() => _doExchange(), 3000);

  // Then every 22-38 seconds
  function scheduleNext() {
    const wait = 22000 + Math.random() * 16000;
    _convoTimer = setTimeout(async () => {
      await _doExchange();
      scheduleNext();
    }, wait);
  }
  scheduleNext();

  // Random emoji bursts from both characters independently
  setInterval(() => {
    if (Math.random() < 0.3) floatEmoji('miss', null, Math.ceil(Math.random() * 2));
    if (Math.random() < 0.3) floatEmoji('mr',   null, Math.ceil(Math.random() * 2));
  }, 8000);

  // Blink both independently
  setInterval(() => { try { doBlink(); } catch(e){} }, 3200 + Math.random() * 2000);
  setInterval(() => { try { doBlinkMr(); } catch(e){} }, 2800 + Math.random() * 2500);
}
