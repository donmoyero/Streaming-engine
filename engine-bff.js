// ================================================================
//  engine-bff.js  (renamed from engine-couple.js)
//  Miss OG Tinz & Lora — Best Friends conversation engine.
//  • They talk to each other randomly (either can go first)
//  • Rich emoji float up + fade above their heads
//  • Twitch chat only interrupts for new viewers or @mentions
//  • Both reply from their own POV / personality
//  • speaker field wired to backend so each gets her own prompt
// ================================================================

import { setExpression, runLipSync, doBlink }
  from './engine-bones.js';
import { setExpressionMr, runLipSyncMr, doBlinkMr }
  from './engine-bones.js';
import { speak, showBubble }
  from './engine-life.js';
import { getVrm, getVrmLora, camera, scene }
  from './engine-scene.js';
import * as THREE from 'three';

// ── Emoji palette — best friend vibes, no romantic pool ──────────
const EMOJI_HYPE    = ['🔥','💯','✨','⚡','🌟','💥','🎉','🎊','🎶','🎵','🎸','🎤','👑','🏆','💎','🚀','🌈','🌊','💫','⭐'];
const EMOJI_LAUGH   = ['😂','🤣','😆','😅','😹','💀','🤭','😁','😄','😃','🥲','😏','😌','😋','🫢','🤪','😜','😝'];
const EMOJI_REACT   = ['👀','😲','🫠','😳','😮','🤯','😱','🫣','😵','🤔','🤨','🧐','🫤','😐','🫡','🤝','🫂','🤗'];
const EMOJI_FRIEND  = ['💜','🤝','🫶','👯','💅','🙌','✌️','🫂','💪','🥂','🎀','🩷','🩵','🩶','🤍','💙','💚','🧡'];
const EMOJI_VIBE    = ['🟣','🔵','🟢','🟠','🔴','🫧','🫨','🌸','🌺','🌻','🌹','💐','🍀','🌿','🦋','🐝','🦄'];
const EMOJI_PLAY    = ['🎮','🃏','🎲','♟️','🎯','🎱','🏀','⚽','🏈','🎳','🎰','🧩','🪀','🪁','🎠','🎡','🎢','🎪'];
const EMOJI_FOOD    = ['🍕','🍔','🌮','🍜','🍱','🧋','🍦','🍰','🎂','🍩','🍪','🍫','🍬','🍭','🫐','🍓','🍇'];
const EMOJI_WEATHER = ['☀️','🌤️','⛅','🌥️','☁️','🌧️','⛈️','🌩️','❄️','🌨️','🌪️','🌈','🌙','🌛','⭐','🌟'];
const EMOJI_RANDOM  = ['🦊','🐺','🦁','🐯','🌸','🌺','🌻','🌹','💐','🍀','🌿','🎋','🦋','🐝','🦄','🐉'];
const ALL_EMOJI = [...EMOJI_HYPE,...EMOJI_LAUGH,...EMOJI_REACT,...EMOJI_FRIEND,...EMOJI_VIBE,...EMOJI_PLAY,...EMOJI_FOOD,...EMOJI_WEATHER,...EMOJI_RANDOM];

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
  const vrmObj = who === 'lora' ? getVrmLora() : getVrm();
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

// ── Lora chat bubble — warm purple, distinct from Miss's style ────
const _loraBubble = document.getElementById('lora-chat-bubble') || (() => {
  const el = document.createElement('div');
  el.id = 'lora-chat-bubble';
  el.innerHTML = `<div class="speaker" style="color:#c084fc">Lora</div><div id="lora-bubble-text"></div>`;
  el.style.cssText = `
    position:fixed; bottom:120px; left:24px;
    background:rgba(20,10,40,0.90); border:1px solid #c084fc44;
    border-radius:16px; padding:12px 18px; max-width:340px;
    font-family:'Segoe UI',sans-serif; color:#fff; font-size:15px;
    backdrop-filter:blur(8px); display:none; z-index:200;
    box-shadow:0 0 18px #c084fc33;
  `;
  document.body.appendChild(el);
  return el;
})();

const _loraBubbleText = document.getElementById('lora-bubble-text');

function showLoraBubble(text) {
  _loraBubble.style.display = 'block';
  _loraBubbleText.textContent = text;
  clearTimeout(_loraBubble._hideTimer);
  _loraBubble._hideTimer = setTimeout(() => { _loraBubble.style.display = 'none'; }, 8000);
}

// ── Lora nameplate — left side, purple accent ─────────────────────
const _loraNameplate = document.getElementById('lora-nameplate') || (() => {
  const el = document.createElement('div');
  el.id = 'lora-nameplate';
  el.innerHTML = `<div class="dot" style="background:#c084fc"></div><div class="name">Lora</div><div class="tag">AI Co-Host</div>`;
  el.style.cssText = `
    position:fixed; bottom:72px; left:24px;
    display:flex; align-items:center; gap:8px;
    font-family:'Segoe UI',sans-serif; color:#fff; font-size:13px;
    text-shadow:0 0 8px #c084fc; z-index:200;
  `;
  document.body.appendChild(el);
  return el;
})();

// ── Conversation state ────────────────────────────────────────────
let _busy        = false;
let _lastSpeaker = null;   // 'miss' or 'lora'
let _convoTimer  = null;

// ── Backend API call — passes speaker so backend routes correctly ─
const BACKEND_CHAT = 'https://impactgrid-dijo.onrender.com/chat/message';
const BACKEND_TTS  = 'https://impactgrid-dijo.onrender.com/tts';

async function _askCharacter(speaker, userMessage) {
  try {
    const res = await fetch(BACKEND_CHAT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'bff-engine-' + Math.random().toString(36).slice(2, 6),
        message: userMessage,
        speaker,           // ← "miss" or "lora" — backend routes to right prompt
      }),
    });
    const data = await res.json();
    if (!_askCharacter._logged) {
      _askCharacter._logged = true;
      console.log('[BFF] backend response shape:', data);
    }
    return data.reply || data.response || data.text || data.message || data.content || '';
  } catch (e) {
    console.warn('[BFF] API error:', e);
    return '';
  }
}

// ── TTS — fetch audio for the right character voice ───────────────
async function _playTTS(text, character) {
  try {
    const res = await fetch(BACKEND_TTS, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, character }),  // character: "miss" | "lora"
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await new Promise(resolve => {
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn(`[BFF] TTS error (${character}):`, e.message);
  }
}

// ── Best friend conversation starters ────────────────────────────
const STARTER_QUESTIONS = [
  "Okay real talk — what's something you've been meaning to say to me?",
  "If we could go anywhere right now, no budget, no planning — where are we going?",
  "What's something you've changed your mind about recently?",
  "Be honest — what do you think my biggest personality flaw is?",
  "If you had to describe our friendship to someone who'd never met us, what would you say?",
  "What's the best thing that's happened to you this week?",
  "If we were characters in a TV show, which one would we be?",
  "What's a hill you will absolutely die on?",
  "What's something you're genuinely proud of right now?",
  "Do you think people can tell we're best friends just by watching us?",
  "What's something you've learned from me — good or bad?",
  "If you could fix one thing about your life right now, what would it be?",
  "What's a red flag you've ignored in someone that you wouldn't ignore now?",
  "What's the most chaotic thing we've done together?",
  "Be honest — who in chat do you think is most fun?",
  "If you had to start a business tomorrow, what would it be?",
  "What's your unpopular opinion about something everyone loves?",
  "If we swapped lives for a day, what would you do first?",
  "What's something you've been putting off that you really need to do?",
  "Would you rather live in London forever or move somewhere completely new?",
  "What's the weirdest thing you've googled recently?",
  "If you could only eat one cuisine for the rest of your life, what are you choosing?",
];

// ── Game modes — best friend edition ─────────────────────────────
const GAMES = [
  { name: 'This or That',      prompt: 'Ask your friend a fun This or That question and give your own answer too. Keep it short and fun.' },
  { name: 'Hot Takes',         prompt: 'Share a spicy hot take and ask your friend if they agree. Be controversial but fun.' },
  { name: 'Rapid Fire',        prompt: 'Fire 3 rapid-fire questions at your friend super fast, like a quiz show. Keep it quick.' },
  { name: 'Story Time',        prompt: 'Start a short funny story about something you and your friend actually did together (or made up). 2 sentences max.' },
  { name: 'Rate It',           prompt: 'Rate something — a movie, food, a city, a vibe — out of 10 and ask your friend to rate it too.' },
  { name: 'Joke Off',          prompt: 'Tell your friend a short funny joke and challenge them to do better.' },
  { name: 'Roast Me',          prompt: 'Lightly roast your friend in the most affectionate way possible. Keep it funny, not mean.' },
  { name: 'Would You Rather',  prompt: 'Ask a fun Would You Rather question and give your own answer.' },
  { name: 'Confessions',       prompt: 'Confess something mildly embarrassing or funny — something your friend probably doesn\'t know yet.' },
  { name: 'Dream Trip',        prompt: 'Describe your dream trip and ask your friend where they\'d go. Be specific — city, vibe, what you\'d do.' },
];

// ── Core turn: one character speaks ──────────────────────────────
async function _takeTurn(speaker, message, mood = 'happy') {
  _busy = true;
  _lastSpeaker = speaker;
  const isLora = speaker === 'lora';

  // Pick emoji pool based on mood
  let emojiPool = EMOJI_FRIEND;
  if (mood === 'laugh') emojiPool = EMOJI_LAUGH;
  if (mood === 'hype')  emojiPool = EMOJI_HYPE;
  if (mood === 'react') emojiPool = EMOJI_REACT;

  if (isLora) {
    showLoraBubble(message);
    setExpressionMr(mood === 'laugh' ? 'happy' : mood === 'hype' ? 'excited' : 'happy');
    floatEmoji('lora', null, Math.floor(Math.random() * 3) + 2);
    await Promise.all([
      runLipSyncMr(message),
      _playTTS(message, 'lora'),
    ]);
    setExpressionMr('neutral');
  } else {
    showBubble(message, 'Miss OG Tinz');
    setExpression(mood === 'laugh' ? 'happy' : mood === 'hype' ? 'excited' : 'happy');
    floatEmoji('miss', null, Math.floor(Math.random() * 3) + 2);
    await Promise.all([
      speak(message, mood),
      _playTTS(message, 'miss'),
    ]);
    setExpression('neutral');
  }

  _busy = false;
}

// ── Full exchange: one asks, other replies ────────────────────────
async function _doExchange() {
  if (_busy) return;

  // Flip who goes first — avoid same speaker twice in a row
  let asker, responder;
  if (!_lastSpeaker || Math.random() < 0.5) {
    asker = Math.random() < 0.5 ? 'miss' : 'lora';
  } else {
    asker = _lastSpeaker === 'miss' ? 'lora' : 'miss';
  }
  responder = asker === 'miss' ? 'lora' : 'miss';

  // Pick: starter question, game, or free topic
  const roll = Math.random();
  let questionText;

  if (roll < 0.45) {
    questionText = STARTER_QUESTIONS[Math.floor(Math.random() * STARTER_QUESTIONS.length)];
  } else if (roll < 0.72) {
    const game = GAMES[Math.floor(Math.random() * GAMES.length)];
    questionText = await _askCharacter(asker,
      `${game.prompt} Keep it SHORT and fun. Add 1-2 emojis.`
    );
  } else {
    questionText = await _askCharacter(asker,
      'Start a fun, interesting or funny conversation with your best friend. Ask them something real. Short — 1-2 sentences + emojis.'
    );
  }

  if (!questionText) return;

  const mood = _detectMood(questionText);
  await _takeTurn(asker, questionText, mood);

  await _delay(2200 + Math.random() * 1500);
  if (_busy) return;

  // Responder replies — prompt references what was just said
  const replyText = await _askCharacter(responder,
    `Your best friend just said: "${questionText}"\nReply naturally, in character. SHORT — 1-3 sentences + emojis. Be real, funny, and warm.`
  );

  if (!replyText) return;
  const replyMood = _detectMood(replyText);
  await _takeTurn(responder, replyText, replyMood);

  // Sometimes the asker reacts with just an emoji burst
  if (Math.random() < 0.45) {
    await _delay(1200);
    floatEmoji(asker, null, Math.floor(Math.random() * 4) + 2);
  }
}

// ── Mood detection ────────────────────────────────────────────────
function _detectMood(text) {
  if (/😂|🤣|lol|haha|dead|💀|funny/i.test(text))         return 'laugh';
  if (/🔥|💯|hype|omg|wow|🎉|yes|let'?s go/i.test(text))  return 'hype';
  if (/😮|wait|really|no way|what|seriously/i.test(text))  return 'react';
  return 'happy';
}

// ── Twitch: new viewers + @mentions only ─────────────────────────
export function handleTwitchMessage(username, message, isNew = false) {
  if (_busy) return;

  if (isNew) {
    const who = Math.random() < 0.5 ? 'miss' : 'lora';
    const welcomes = [
      `Yooo welcome to the stream ${username}!! So glad you're here 🎉💕`,
      `${username} just pulled up!! We see you 👀🔥`,
      `Heyyy ${username}!! Welcome to the fam, we're vibing hard tonight ✨💜`,
      `${username} in the building!! Let's gooo 🚀💙`,
      `Welcome welcome ${username}!! Make yourself at home 🏠💕`,
      `${username}!! Come in, come in — you're just in time 🎊`,
    ];
    const text = welcomes[Math.floor(Math.random() * welcomes.length)];
    _takeTurn(who, text, 'hype');
    return;
  }

  // @mentions — support @Miss, @Lora, @ogtinz
  const atMiss = /(@miss|@ogtinz|@miss_ogtinz)/i.test(message);
  const atLora = /(@lora)/i.test(message);
  if (!atMiss && !atLora) return;

  const who   = atLora ? 'lora' : 'miss';
  const clean = message.replace(/@\S+/g, '').trim();

  _askCharacter(who,
    `A Twitch viewer called ${username} just said to you: "${clean}"\nReply directly, in character. SHORT — 1-2 sentences + emojis. Be warm and fun.`
  ).then(reply => {
    if (reply) _takeTurn(who, reply, _detectMood(reply));
  });
}

// ── Helpers ───────────────────────────────────────────────────────
function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Start the engine ──────────────────────────────────────────────
let _bffTimer = null;

export function startCoupleEngine() { return startBffEngine(); } // legacy alias

export function startBffEngine() {
  console.log('[BFF] Engine started 💜');

  // First exchange after 3s
  setTimeout(() => _doExchange(), 3000);

  // Then every 22-40 seconds
  function scheduleNext() {
    const wait = 22000 + Math.random() * 18000;
    _bffTimer = setTimeout(async () => {
      await _doExchange();
      scheduleNext();
    }, wait);
  }
  scheduleNext();

  // Random emoji bursts from both independently
  setInterval(() => {
    if (Math.random() < 0.3) floatEmoji('miss', null, Math.ceil(Math.random() * 2));
    if (Math.random() < 0.3) floatEmoji('lora', null, Math.ceil(Math.random() * 2));
  }, 8000);

  // Blink both independently
  setInterval(() => { try { doBlink();    } catch(e){} }, 3200 + Math.random() * 2000);
  setInterval(() => { try { doBlinkMr(); } catch(e){} }, 2800 + Math.random() * 2500);
}
