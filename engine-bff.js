// ================================================================
//  engine-couple.js
//  Miss OG Tinz & Lora — two best friends on stream together.
//  They chat, joke, play games, react to each other & the chat.
//  Emoji float up above their heads. Twitch = new viewers + @mentions only.
// ================================================================

import { setExpression, runLipSync, doBlink }     from './engine-bones.js';
import { setExpressionMr, runLipSyncMr, doBlinkMr } from './engine-bones.js';
import { speak, showBubble }                        from './engine-life.js';
import { getVrm, getVrmMr, camera }                from './engine-scene.js';
import { setMusicVolume }                           from './engine-music.js';
import * as THREE from 'three';

// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
//  EMOJI PALETTE — contextual pools, not random noise
// ════════════════════════════════════════════════════════════════
const EMOJI_LAUGH   = ['😂','🤣','💀','😭','😹','🤭','😆','😅','🫢','🙈'];
const EMOJI_HYPE    = ['🔥','💯','⚡','🚀','🎉','🎊','👑','💎','🏆','💥'];
const EMOJI_SLAY    = ['💅','👸','💪','🕶️','✌️','🤙','🌟','✨','😏','🤩'];
const EMOJI_REACT   = ['👀','😲','🫠','😳','🤯','😱','🫣','😮','🤔','😬'];
const EMOJI_VIBE    = ['💜','💙','💚','🧡','❤️','🩷','🌸','🌺','💐','🍀'];
const EMOJI_BFF     = ['👯','💕','🥰','🫶','👭','🤝','🫂','💗','💖','💞'];
const EMOJI_MUSIC   = ['🎵','🎶','🎤','🎸','🥁','🎹','🎺','🎻','🪗','🪘'];
const EMOJI_DANCE   = ['💃','🕺','🪩','🎶','🔥','✨','💃','🎵','👏','🙌'];
const EMOJI_FOOD    = ['🍕','🍔','🌮','🍜','🧋','🍦','🍰','🎂','🍩','🍪'];
const EMOJI_COOK    = ['🍳','🥘','🍲','🧑‍🍳','👩‍🍳','🫕','🥄','🍴','🔥','😋'];
const EMOJI_CHILL   = ['😌','☕','📖','🛋️','🌙','💤','😴','🧘','🕯️','🌿'];
const EMOJI_THINK   = ['🤔','💭','🧐','🫤','😶','🤨','💡','🧠','✍️','📝'];

// Activity → fitting emoji pool
const ACTIVITY_EMOJI = {
  dance:       EMOJI_DANCE,
  listenDance: EMOJI_DANCE,
  cookDance:   [...EMOJI_DANCE, ...EMOJI_COOK],
  stirring:    EMOJI_COOK,
  chopping:    EMOJI_COOK,
  tasting:     EMOJI_FOOD,
  eatAtTable:  EMOJI_FOOD,
  drinkCoffee: EMOJI_CHILL,
  sofaSit:     EMOJI_CHILL,
  bedLie:      EMOJI_CHILL,
  bedLiePhone: EMOJI_CHILL,
  readBook:    EMOJI_CHILL,
  phoneScroll: EMOJI_REACT,
  tvReact:     EMOJI_REACT,
  watchTV:     EMOJI_REACT,
  typing:      EMOJI_THINK,
  monitor:     EMOJI_THINK,
  mirrorPose:  EMOJI_SLAY,
  hairflick:   EMOJI_SLAY,
  hiponhip:    EMOJI_SLAY,
  stretch:     ['🧘','💪','✨','😤','🙆','🌿','😮‍💨'],
  fireGaze:    ['🔥','🕯️','😌','✨','🌙','💭'],
  windowLook:  ['🌤️','☁️','😌','🌿','👀','✨'],
  noseCover:   ['😤','💅','🙅','😶','🤐'],
  idle:        EMOJI_BFF,
};

// Mood → fitting emoji pool
const MOOD_EMOJI = {
  laugh: EMOJI_LAUGH,
  hype:  EMOJI_HYPE,
  slay:  EMOJI_SLAY,
  react: EMOJI_REACT,
  happy: EMOJI_BFF,
  music: EMOJI_MUSIC,
};

// Pick emoji based on what's happening, not pure random
function _emojiForContext(who, mood) {
  const act = who === 'miss'
    ? (window._missCurrentActivity || 'idle')
    : (window._loraCurrentActivity || 'idle');
  const actPool  = ACTIVITY_EMOJI[act];
  const moodPool = MOOD_EMOJI[mood] || EMOJI_BFF;
  const pool     = (actPool && Math.random() < 0.6) ? actPool : moodPool;
  return pool[Math.floor(Math.random() * pool.length)];
}

function rndEmoji(pool, count = 1) {
  if (!pool || !pool.length) pool = EMOJI_BFF;
  const arr = [];
  for (let i = 0; i < count; i++) arr.push(pool[Math.floor(Math.random() * pool.length)]);
  return arr.join('');
}

// ════════════════════════════════════════════════════════════════
//  EMOJI FLOAT SYSTEM — DOM bubbles projected from 3D head
// ════════════════════════════════════════════════════════════════
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

export function floatEmoji(who = 'miss', emojiStr, count) {
  const vrmObj  = who === 'lora' ? getVrmMr() : getVrm();
  const { x, y } = _projectHead(vrmObj);
  const howMany  = count || Math.ceil(Math.random() * 3 + 1);
  const chars    = emojiStr ? [...emojiStr] : Array.from({ length: howMany }, () => rndEmoji(ALL_EMOJI, 1));

  chars.forEach((emoji, i) => {
    const el = document.createElement('span');
    el.textContent = emoji;
    const offsetX  = (Math.random() - 0.5) * 90;
    const size     = 20 + Math.random() * 26;
    el.style.cssText = `position:absolute;left:${x+offsetX}px;top:${y-10}px;font-size:${size}px;opacity:1;user-select:none;will-change:transform,opacity;`;
    _floatContainer.appendChild(el);

    let start = null;
    const dur  = 1800 + Math.random() * 1000;
    const rise = 100 + Math.random() * 80;
    const drift= (Math.random() - 0.5) * 50;
    const spin = (Math.random() - 0.5) * 30;

    function frame(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 2);
      el.style.transform = `translate(${drift*e}px,${-rise*e}px) rotate(${spin*e}deg) scale(${1+e*0.15})`;
      el.style.opacity   = p < 0.55 ? '1' : (1-(p-0.55)/0.45).toFixed(3);
      if (p < 1) requestAnimationFrame(frame); else el.remove();
    }
    setTimeout(() => requestAnimationFrame(frame), i * 90);
  });
}

// ════════════════════════════════════════════════════════════════
//  CHAT BUBBLES
// ════════════════════════════════════════════════════════════════
// Miss bubble already exists in index.html as #chat-bubble
const _missBubble    = document.getElementById('chat-bubble');
const _missBubbleTxt = document.getElementById('bubble-text');

// Lora is a silent visual character — no bubble, no nameplate

function showLoraBubble(_text) { /* no-op — Lora does not speak */ }


// ════════════════════════════════════════════════════════════════
//  AI — routes through your backend (avoids CORS)
// ════════════════════════════════════════════════════════════════
const BACKEND = 'https://impactgrid-dijo.onrender.com/chat/message';

let _askBackoff = 0;  // ms to wait after a 429

async function _ask(systemPrompt, userMessage) {
  // Respect backoff after 429
  if (_askBackoff > 0) {
    console.log(`[BFF] backing off ${Math.round(_askBackoff/1000)}s`);
    return '';
  }
  try {
    const res = await fetch(BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'bff-engine-' + Math.random().toString(36).slice(2,6),
        message: `[PERSONA]\n${systemPrompt}\n\n[SAY]\n${userMessage}`,
      }),
    });
    if (res.status === 429) {
      _askBackoff = 5 * 60_000;  // 5 min backoff
      setTimeout(() => { _askBackoff = 0; }, _askBackoff);
      console.warn('[BFF] 429 — backing off 5 min');
      return '';
    }
    if (!res.ok) { console.warn('[BFF] HTTP', res.status); return ''; }
    const data = await res.json();
    if (!_ask._logged) { _ask._logged = true; console.log('[BFF] backend shape:', data); }
    return data.reply || data.response || data.text || data.message || data.content || '';
  } catch(e) {
    console.warn('[BFF] fetch error:', e);
    return '';
  }
}

// ════════════════════════════════════════════════════════════════
//  CHARACTER PERSONAS
// ════════════════════════════════════════════════════════════════
const MISS_PERSONA = `You are Miss OG Tinz — a confident, charismatic, funny Black British woman and Twitch streamer. Your best friend Lora is co-hosting the stream with you. You two have been best friends for years — you roast each other, hype each other up, share opinions, play games and vibe hard. You use loads of emojis naturally. Keep replies SHORT — 1-3 sentences max. No asterisks. End every message with 1-3 fitting emojis. Speak naturally like you're live on stream with your bestie. You are NOT in love — you are best friends.`;

const LORA_PERSONA = `You are Lora — a bold, opinionated, funny and stylish Black British woman co-hosting a Twitch stream with your best friend Miss OG Tinz. You two have years of friendship — you banter, roast each other lovingly, hype each other up, share hot takes and have the best time. Use lots of emojis. Keep it SHORT — 1-3 sentences max. No asterisks. End with 1-3 emojis. Speak like you're live on stream having the time of your life with your girl. You are NOT in love — you are best friends.`;

// ════════════════════════════════════════════════════════════════
//  CONVERSATION STARTERS — best friend energy
// ════════════════════════════════════════════════════════════════
const STARTERS = [
  "Okay bestie, real talk — what's the most embarrassing thing you've done in public?",
  "If we had to describe each other to a stranger in 3 words, what would you say about me?",
  "Hot take time — what's something everyone loves that you actually can't stand?",
  "If we went on a road trip tomorrow, where are we going and who's driving?",
  "Be honest — what's something about me that used to annoy you when we first met?",
  "What's the funniest memory we have together? I want to hear YOUR version.",
  "If you had to eat one meal for the rest of your life, what are you picking?",
  "Okay chat, who do you think is the funniest out of me and Lora? Let's settle this 👀",
  "What's a trend right now that you're obsessed with that I absolutely don't get?",
  "If we both applied for the same job, who do you think would get it and why?",
  "What's a song that's been stuck in your head all week?",
  "Tell me something you've never told me before. Go.",
  "If you could swap lives with any celebrity for a week, who is it?",
  "What's something you used to be scared of that now seems silly?",
  "Honestly, what do you think my biggest flaw is? Be nice about it though 😭",
  "If the stream blew up overnight and we went viral, what would you do first?",
  "What's a food combination that sounds wrong but is actually amazing?",
  "If you could only keep 3 apps on your phone, which ones survive?",
  "Describe your perfect Saturday in one sentence.",
  "What's a skill you have that most people don't know about?",
];

// ════════════════════════════════════════════════════════════════
//  GAMES
// ════════════════════════════════════════════════════════════════
const GAMES = [
  { name: 'Never Have I Ever',  prompt: 'Say a fun "Never have I ever" and react to it. Keep it appropriate but spicy.' },
  { name: 'Hot Takes',          prompt: 'Drop a controversial hot take and ask bestie if they agree. Be bold.' },
  { name: 'This or That',       prompt: 'Ask a fun This or That question and give your own answer.' },
  { name: 'Would You Rather',   prompt: 'Ask a fun Would You Rather and give your own choice.' },
  { name: 'Rapid Fire',         prompt: 'Fire 3 rapid-fire questions super fast like a quiz show.' },
  { name: 'Roast Me',           prompt: 'Lovingly roast your bestie in 1-2 sentences. Keep it funny not mean.' },
  { name: 'Unpopular Opinion',  prompt: 'Share an unpopular opinion and defend it briefly.' },
  { name: 'Story Time',         prompt: 'Start a short funny made-up story about something you and bestie did. 2 sentences max.' },
  { name: 'Rate It',            prompt: 'Rate something (movie, food, city) out of 10 and ask bestie to rate it.' },
  { name: 'Joke Off',           prompt: 'Tell a short funny joke and challenge bestie to do better.' },
  { name: 'Hype Battle',        prompt: 'Hype up your bestie with the most over-the-top compliment you can think of.' },
  { name: 'Confess It',         prompt: 'Confess a funny or embarrassing opinion you have. Keep it light.' },
];

// ════════════════════════════════════════════════════════════════
//  MOOD DETECTION
// ════════════════════════════════════════════════════════════════
function _mood(text) {
  if (/😂|🤣|lol|haha|dead|💀|funny|😭/i.test(text))     return 'laugh';
  if (/🔥|💯|hype|omg|wow|🎉|yes|let's go|🚀/i.test(text)) return 'hype';
  if (/😏|😉|slay|bestie|girl|sis|💅/i.test(text))         return 'slay';
  if (/😮|wait|really|no way|what|🫠/i.test(text))          return 'react';
  return 'happy';
}

// ════════════════════════════════════════════════════════════════
//  SPEAK TURN
// ════════════════════════════════════════════════════════════════
let _busy        = false;
let _lastSpeaker = null;

async function _turn(who, text, mood = 'happy') {
  _busy = true;
  _lastSpeaker = who;

  // Use context-aware emoji — pulled from activity + mood, not a flat pool
  const emojiCount = Math.floor(Math.random() * 2) + 1;  // 1-2 max, not 2-4
  const emojiStr   = _emojiForContext(who, mood);

  if (who === 'lora') {
    showLoraBubble(text);
    setExpressionMr(mood==='laugh'?'happy':mood==='hype'?'excited':'happy');
    floatEmoji('lora', emojiStr, emojiCount);
    await runLipSyncMr(text);
    setExpressionMr('neutral');
  } else {
    showBubble(text, 'Miss OG Tinz');
    setExpression(mood==='laugh'?'happy':mood==='hype'?'excited':'happy');
    floatEmoji('miss', emojiStr, emojiCount);
    await speak(text, mood);
    setExpression('neutral');
  }

  _busy = false;
}

// ════════════════════════════════════════════════════════════════
//  FULL EXCHANGE
// ════════════════════════════════════════════════════════════════
async function _exchange() {
  if (_busy) return;

  // Who goes first — avoid repeating same speaker
  let asker;
  if (!_lastSpeaker) {
    asker = Math.random() < 0.5 ? 'miss' : 'lora';
  } else {
    asker = _lastSpeaker === 'miss' ? 'lora' : 'miss';
    if (Math.random() < 0.25) asker = Math.random() < 0.5 ? 'miss' : 'lora'; // occasional same
  }
  const responder = asker === 'miss' ? 'lora' : 'miss';

  // Pick starter type
  const roll = Math.random();
  let question;

  if (roll < 0.4) {
    question = STARTERS[Math.floor(Math.random() * STARTERS.length)];
  } else if (roll < 0.68) {
    const game   = GAMES[Math.floor(Math.random() * GAMES.length)];
    const persona = asker === 'miss' ? MISS_PERSONA : LORA_PERSONA;
    question = await _ask(persona, `${game.prompt} Add 1-2 emojis. Keep it SHORT.`);
  } else {
    const persona = asker === 'miss' ? MISS_PERSONA : LORA_PERSONA;
    question = await _ask(persona, 'Start a fun conversation with your bestie on stream. Ask something interesting or funny. 1-2 sentences + emojis.');
  }

  if (!question) return;
  await _turn(asker, question, _mood(question));
  await _delay(2000 + Math.random() * 1500);
  if (_busy) return;

  // Responder replies
  const rPersona = responder === 'miss' ? MISS_PERSONA : LORA_PERSONA;
  const reply    = await _ask(rPersona, `Your bestie just said: "${question}"\nReply in character. SHORT — 1-3 sentences + emojis. Be real, funny, warm.`);
  if (!reply) return;
  await _turn(responder, reply, _mood(reply));

  // Occasional reaction emoji — contextual, not random
  if (Math.random() < 0.4) {
    await _delay(1100);
    floatEmoji(asker, _emojiForContext(asker, _mood(reply)), 1);
  }
}

// ════════════════════════════════════════════════════════════════
//  TWITCH — new viewers + @mentions only
// ════════════════════════════════════════════════════════════════
export function handleTwitchMessage(username, message, isNew = false) {
  if (_busy) return;

  if (isNew) {
    const who = Math.random() < 0.5 ? 'miss' : 'lora';
    const welcomes = [
      `Yooo ${username} just pulled up!! Welcome to the stream 🎉🔥`,
      `${username} in the building!! So glad you're here, make yourself comfy 💕✨`,
      `Heyyy ${username}!! Welcome welcome, we're absolutely vibing right now 💯🎶`,
      `${username} just joined!! Let's gooo, the more the merrier 🚀💜`,
      `Welcome ${username}!! You picked a great time to show up, we're going off 🔥👏`,
      `${username}!! Bestie pulled up!! Hi hi hi 👋💕🎊`,
    ];
    _turn(who, welcomes[Math.floor(Math.random()*welcomes.length)], 'hype');
    return;
  }

  const atMiss = /@miss|@ogtinz|@miss_ogtinz/i.test(message);
  const atLora = /@lora/i.test(message);
  if (!atMiss && !atLora) return;

  const who     = atLora ? 'lora' : 'miss';
  const persona = who === 'lora' ? LORA_PERSONA : MISS_PERSONA;
  const clean   = message.replace(/@\S+/g, '').trim();

  _ask(persona, `Twitch viewer "${username}" said: "${clean}"\nReply to them directly, in character. SHORT 1-2 sentences + emojis. Be warm and fun.`)
    .then(reply => { if (reply) _turn(who, reply, _mood(reply)); });
}

// ════════════════════════════════════════════════════════════════
//  START ENGINE
// ════════════════════════════════════════════════════════════════
function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export function startCoupleEngine() {
  console.log('[BFF Engine] Miss OG Tinz is LIVE ✨');

  // First exchange after 18s — gives backend (Render free tier) time to wake
  setTimeout(() => _exchange(), 18000);

  // Schedule ongoing exchanges every 20-38s
  function next() {
    const wait = 20000 + Math.random() * 18000;
    setTimeout(async () => { await _exchange(); next(); }, wait);
  }
  next();

  // Contextual emoji moments — only fires when it makes sense
  setInterval(() => {
    if (_busy) return;
    // Only fire occasionally (not every interval) and only when doing something visual
    if (Math.random() < 0.18) {
      const act = window._missCurrentActivity || 'idle';
      // Skip mid-sentence activities — don't interrupt speak/think moments
      if (!['typing','monitor','readBook'].includes(act)) {
        floatEmoji('miss', _emojiForContext('miss', 'happy'), 1);
      }
    }
    if (Math.random() < 0.14) {
      const act = window._loraCurrentActivity || 'idle';
      if (!['typing','monitor','readBook'].includes(act)) {
        floatEmoji('lora', _emojiForContext('lora', 'happy'), 1);
      }
    }
  }, 12000);

  // Independent blinks
  setInterval(() => { try { doBlink(); }   catch(e){} }, 3000 + Math.random()*2000);
  setInterval(() => { try { doBlinkMr(); } catch(e){} }, 2700 + Math.random()*2500);

  // Start music loop
  _musicLoop();
}

// ════════════════════════════════════════════════════════════════
//  MUSIC + LISTENDANCE SYSTEM
//  Twitch-safe tracks only — royalty-free / CC0 / NCS licensed
//  Sources: NoCopyrightSounds (NCS), Kevin MacLeod (CC BY),
//           Bensound (royalty-free), Lofi Girl (stream-safe)
// ════════════════════════════════════════════════════════════════
export let musicPlaying = false;

// Twitch-safe track list — all CC0 or explicitly stream-safe
const SAFE_TRACKS = [
  { title: 'Elektronomia — Sky High',        artist: 'NCS',          bpm: 128 },
  { title: 'Tobu — Candyland',               artist: 'NCS',          bpm: 125 },
  { title: 'Alan Walker — Fade',             artist: 'NCS',          bpm: 126 },
  { title: 'Cartoon — On & On',              artist: 'NCS',          bpm: 100 },
  { title: 'Jim Yosef — Link',               artist: 'NCS',          bpm: 130 },
  { title: 'Ship Wrek & Zookeepers — Ark',   artist: 'NCS',          bpm: 128 },
  { title: 'Neffex — Destiny',               artist: 'NCS/Neffex',   bpm: 140 },
  { title: 'Ghostrifter — Reverie',          artist: 'NCS',          bpm: 90  },
  { title: 'Syn Cole — Feel Good',           artist: 'NCS',          bpm: 128 },
  { title: 'Gytronic — Hyper',               artist: 'NCS',          bpm: 132 },
  { title: 'Approaching Nirvana — Sugar High',artist: 'NCS',         bpm: 120 },
  { title: 'Kevin MacLeod — Funkorama',      artist: 'CC BY 3.0',    bpm: 110 },
  { title: 'Kevin MacLeod — Chill Wave',     artist: 'CC BY 3.0',    bpm: 90  },
  { title: 'Bensound — Funky Suspense',      artist: 'Bensound',     bpm: 120 },
  { title: 'Bensound — Jazzy Frenchy',       artist: 'Bensound',     bpm: 115 },
];

let _currentTrack = null;

// Called from outside to display current track (e.g. on topic box)
export function getCurrentTrack() { return _currentTrack; }

function _startMusicSession() {
  if (musicPlaying) return;
  musicPlaying = true;

  _currentTrack = SAFE_TRACKS[Math.floor(Math.random() * SAFE_TRACKS.length)];
  console.log(`[Music] Now playing: ${_currentTrack.title} — ${_currentTrack.artist}`);

  // Fire music emoji from both chars
  floatEmoji('miss', rndEmoji(EMOJI_MUSIC, 2), 2);
  setTimeout(() => floatEmoji('lora', rndEmoji(EMOJI_MUSIC, 2), 2), 800);

  // Set listenDance on both via the shared ACTIVITY objects
  if (window._setMissActivity)  window._setMissActivity('listenDance', 18 + Math.random() * 20);
  if (window._setLoraActivity)  window._setLoraActivity('listenDance', 18 + Math.random() * 20);

  // Notify camera
  if (window._onActivityChanged) window._onActivityChanged('listenDance');

  // Raise background music volume during dance session
  setMusicVolume(0.22);
}

function _stopMusicSession() {
  if (!musicPlaying) return;
  musicPlaying = false;
  _currentTrack = null;
  console.log('[Music] Session ended');
  // Chars return to idle naturally via their own life timers
  // Drop back to ambient volume
  setMusicVolume(0.08);
}

function _musicLoop() {
  // Music plays ~25% of the time, in sessions of 30-60s, with 60-120s gaps
  function schedule() {
    const gapMs = (60 + Math.random() * 60) * 1000;
    setTimeout(() => {
      _startMusicSession();
      const sessionMs = (30 + Math.random() * 30) * 1000;
      setTimeout(() => { _stopMusicSession(); schedule(); }, sessionMs);
    }, gapMs);
  }
  schedule();
}

// ── Allow chat commands: !music on / !music off ──────────────────
export function handleMusicCommand(cmd) {
  if (cmd === 'on')  _startMusicSession();
  if (cmd === 'off') _stopMusicSession();
}
