// ================================================================
//  engine-life.js — PODCAST DESK
//  Chat bubble, TTS + lip sync, gestures, Twitch IRC, dead-air
//  proactive chatter, and the render loop. No walking, no rooms,
//  no dog, no kitchen, no outfits — both hosts stay seated at the
//  desk, facing the camera, for the whole stream.
// ================================================================

import * as THREE from 'three';

import { getVrm, getVrmLora, scene, camera, renderer,
         API_URL, PROACTIVE_URL, TOPIC_URL, TWITCH_CHANNEL, USER_ID,
       } from './engine-scene.js';

import { setCamMode, updateCamera } from './engine-camera.js';
import { startMusic } from './engine-music.js';

import {
  ACTIVITY, activityUpdate,
  ACTIVITY_MR, activityUpdateMr,
  setExpression, setExpressionMr, doBlink, doBlinkMr,
  runLipSync, stopLipSync,
  doGesture, updateGesture,
  hyperUpdate,
  triggerRaidDance, triggerSubCelebration, triggerResubHype, triggerGiftPop,
} from './engine-bones.js';

const _vrm = () => getVrm();
const _el  = (id) => document.getElementById(id);

// ── Loading UI ─────────────────────────────────────────────────
export const loader_el = { get classList() { return document.getElementById('loader')?.classList; } };
export function setStatus(msg, cls = '') {
  const el = _el('status'); if (!el) return;
  el.textContent = msg;
  el.className   = cls;
}
export function setProgress(p) {
  const el = _el('bar-fill'); if (!el) return;
  el.style.width = p + '%';
}

// ── Stage light ──────────────────────────────────────────────────
function setStageLight(mood, durationMs = 4000) {
  const sl = _el('stage-light'); if (!sl) return;
  sl.className = mood;
  if (mood !== '') setTimeout(() => { sl.className = ''; }, durationMs);
}

// ── Chat bubble — shared, speaker name swaps between hosts ───────
let bubbleTimeout = null;
export function showBubble(text, speaker = 'Miss OG Tinz') {
  const bubbleTxt = _el('bubble-text');
  const bubble    = _el('chat-bubble');
  if (!bubbleTxt || !bubble) return;
  bubbleTxt.textContent = text;
  bubble.querySelector('.speaker').textContent = speaker;
  bubble.classList.add('visible');
  clearTimeout(bubbleTimeout);
  const displayTime = Math.max(4000, text.length * 60);
  bubbleTimeout = setTimeout(() => bubble.classList.remove('visible'), displayTime);
}

// ── Audio unlock (autoplay policies) ──────────────────────────────
let _audioUnlocked = false;
let _sharedAudioCtx = null;
function _unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  try {
    _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = _sharedAudioCtx.createBuffer(1, 1, 22050);
    const src = _sharedAudioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_sharedAudioCtx.destination);
    src.start(0);
    _sharedAudioCtx.resume();
  } catch(e) {}
  try { window.speechSynthesis.cancel(); } catch(e) {}
  startMusic();
}
document.addEventListener('click',      _unlockAudio, { once: true });
document.addEventListener('keydown',    _unlockAudio, { once: true });
document.addEventListener('touchstart', _unlockAudio, { once: true });

// ── Voice list ─────────────────────────────────────────────────
let _voices = [];
function _loadVoices() { _voices = window.speechSynthesis.getVoices(); }
_loadVoices();
window.speechSynthesis.onvoiceschanged = _loadVoices;

function _pickVoice() {
  if (!_voices.length) _loadVoices();
  return _voices.find(v => v.name.includes('Ezinne'))
    || _voices.find(v => v.name.includes('Sonia'))
    || _voices.find(v => v.name.includes('Zira'))
    || _voices.find(v => v.name.includes('Hazel'))
    || _voices.find(v => v.name.includes('Libby'))
    || _voices.find(v => v.lang === 'en-GB')
    || _voices.find(v => v.lang === 'en-NG')
    || _voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
    || _voices.find(v => v.lang.startsWith('en'))
    || _voices[0]
    || null;
}
function _pickLoraVoice() {
  if (!_voices.length) _loadVoices();
  const missVoice = _pickVoice();
  return _voices.find(v => v.name.includes('Libby') && v !== missVoice)
    || _voices.find(v => v.name.includes('Hazel') && v !== missVoice)
    || _voices.find(v => v.name.includes('Susan') && v !== missVoice)
    || _voices.find(v => v.lang === 'en-GB' && v !== missVoice)
    || _voices.find(v => v.lang.startsWith('en') && v !== missVoice)
    || missVoice;
}

// ── Mood detection — used for proactive lines & reactions ────────
function detectMood(text) {
  const t = text.toLowerCase();
  if (/laugh|lol|haha|funny|hilarious|joke|😂|💀|dead|screaming/.test(t))          return 'happy';
  if (/omg|wait|what|no way|seriously|really\?|ehn\?|omo|shocked|wow/.test(t))     return 'surprised';
  if (/ugh|annoyed|frustrated|tired|abeg|why|stress|headache/.test(t))             return 'angry';
  if (/miss|alone|quiet|sad|wish|feel|lonely|forgot/.test(t))                      return 'sad';
  if (/yes|love|amazing|beautiful|cute|happy|excited|yay|let's go|fire|🔥/.test(t)) return 'happy';
  return 'neutral';
}

// ── Reactions — the other host's face responds briefly ───────────
let _missReactionTimer = null;
function _triggerMissReaction(mood) {
  if (_isSpeaking) return;
  setExpression(mood === 'laugh' ? 'happy' : mood === 'react' ? 'surprised' : 'happy');
  clearTimeout(_missReactionTimer);
  _missReactionTimer = setTimeout(() => setExpression('neutral'), 5000);
}
window._triggerMissReaction = _triggerMissReaction;

let _loraReactionTimer = null;
function _triggerLoraReaction(mood) {
  if (window._loraIsSpeaking) return;
  setExpressionMr(mood === 'laugh' ? 'happy' : mood === 'surprised' ? 'surprised' : 'happy');
  clearTimeout(_loraReactionTimer);
  _loraReactionTimer = setTimeout(() => setExpressionMr('neutral'), 6000);
}

// ── TTS + lip sync — Miss ──────────────────────────────────────────
export let _isSpeaking = false;

export async function speak(text, mood = 'neutral') {
  if (_sharedAudioCtx && _sharedAudioCtx.state === 'suspended') {
    _sharedAudioCtx.resume().catch(() => {});
  }
  window.speechSynthesis.cancel();

  _isSpeaking = true;
  window._currentSpeaker = 'miss';
  setCamMode('SPEAK');
  setExpression(mood);
  setStageLight('speak', text.length * 65 + 2000);
  runLipSync(text);
  setTimeout(() => _triggerLoraReaction(mood), 300);

  await new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(text);
    const voice = _pickVoice();
    if (voice) utter.voice = voice;
    utter.rate   = 1.05;
    utter.pitch  = 1.1;
    utter.volume = 1.0;

    // Chromium bug: long utterances silently stall after ~15s.
    const watchdog = setTimeout(() => { window.speechSynthesis.cancel(); resolve(); }, Math.max(15000, text.length * 80));
    utter.onend   = () => { clearTimeout(watchdog); resolve(); };
    utter.onerror = () => { clearTimeout(watchdog); resolve(); };

    window.speechSynthesis.speak(utter);
  });

  stopLipSync();
  setExpression('neutral');
  _isSpeaking = false;
  setCamMode('IDLE');
  window._currentSpeaker = null;
  deadAir.reset();
}

// ── TTS — Lora (own voice, routed through engine-bff.js) ─────────
function _endLoraSpeech() {
  window._loraIsSpeaking = false;
  window._currentSpeaker = null;
  setCamMode('IDLE');
}
window.speakMr = (text) => {
  if (!text) return;
  showBubble(text, 'Lora');
  if (_isSpeaking) return; // don't clash with Miss
  try {
    const utter = new SpeechSynthesisUtterance(text);
    const voice = _pickLoraVoice();
    if (voice) utter.voice = voice;
    utter.rate   = 1.08;
    utter.pitch  = 1.18;
    utter.volume = 1.0;
    window._loraIsSpeaking = true;
    window._currentSpeaker = 'lora';
    setCamMode('SPEAK');
    const watchdog = setTimeout(() => { window.speechSynthesis.cancel(); _endLoraSpeech(); }, Math.max(12000, text.length * 75));
    utter.onend   = () => { clearTimeout(watchdog); _endLoraSpeech(); };
    utter.onerror = () => { clearTimeout(watchdog); _endLoraSpeech(); };
    window.speechSynthesis.speak(utter);
  } catch(e) { _endLoraSpeech(); }
};

// ── Topic box ────────────────────────────────────────────────────
let lastTopicTitle = null;
function updateTopicBox(data) {
  const topicBox      = _el('topic-box');
  const topicTitleEl  = _el('topic-title-text');
  const topicSourceEl = _el('topic-source-tag');
  if (!topicBox || !topicTitleEl || !topicSourceEl) return;
  if (!data.active) { topicBox.classList.remove('visible'); lastTopicTitle = null; return; }
  const isNew = data.title !== lastTopicTitle;
  topicTitleEl.textContent  = data.title  || '';
  topicSourceEl.textContent = data.source || '';
  topicBox.classList.add('visible');
  if (isNew) {
    lastTopicTitle = data.title;
    topicBox.classList.remove('new-topic');
    void topicBox.offsetWidth;
    topicBox.classList.add('new-topic');
    setTimeout(() => topicBox.classList.remove('new-topic'), 900);
  }
}
export function startTopicPolling() {
  async function poll() {
    try { const res = await fetch(TOPIC_URL); const data = await res.json(); updateTopicBox(data); } catch (_) {}
  }
  poll();
  setInterval(poll, 6000);
}

// ── Dead air — proactive comment after a stretch of silence ──────
let _deadAirTimer   = null;
let _deadAirBusy    = false;
let _deadAirActive  = false;
let _deadAirBackoff = 0;
const DEAD_AIR_MIN = 45_000;
const DEAD_AIR_MAX = 90_000;

const deadAir = {
  start() { _deadAirActive = true; this._arm(); },
  stop()  { _deadAirActive = false; clearTimeout(_deadAirTimer); },
  reset() {
    clearTimeout(_deadAirTimer);
    _deadAirBackoff = 0;
    if (_deadAirActive && !_deadAirBusy) this._arm();
  },
  _arm() {
    clearTimeout(_deadAirTimer);
    const randomDelay = DEAD_AIR_MIN + Math.random() * (DEAD_AIR_MAX - DEAD_AIR_MIN);
    const delay = Math.min(randomDelay + _deadAirBackoff, DEAD_AIR_MAX + _deadAirBackoff);
    _deadAirTimer = setTimeout(() => _triggerProactive(), delay);
  },
};

const recentTopics = [];
function _rememberTopic(topic) {
  if (!topic) return;
  recentTopics.push({ topic, at: Date.now() });
  if (recentTopics.length > 8) recentTopics.shift();
}

const PROACTIVE_TYPES = ['micro', 'micro', 'micro', 'question', 'question', 'story', 'observation'];
function _pickProactiveType() { return PROACTIVE_TYPES[Math.floor(Math.random() * PROACTIVE_TYPES.length)]; }

async function _triggerProactive() {
  if (_deadAirBusy || _isSpeaking) { deadAir._arm(); return; }

  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 3000));
  _deadAirBusy = true;

  try {
    const res = await fetch(PROACTIVE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: _pickProactiveType(), recentTopics: recentTopics.map(r => r.topic) }),
    });

    if (res.status === 429) {
      _deadAirBackoff = 5 * 60_000;
      console.warn('[DeadAir] 429 — backing off 5 min');
      _deadAirBusy = false;
      deadAir._arm();
      return;
    }
    if (!res.ok) throw new Error('status ' + res.status);

    const data = await res.json();
    const text = data?.response || '';
    if (text && !_isSpeaking) {
      _deadAirBackoff = 0;
      _rememberTopic(data?.topic || text.slice(0, 60));
      const mood = data?.mood || detectMood(text);
      showBubble(text, 'Miss OG Tinz');
      setStatus('Live ✦', 'ready');
      doGesture('talk', text.length * 65);
      await speak(text, mood);
    }
  } catch(err) {
    console.warn('[DeadAir] fetch error:', err.message);
    _deadAirBackoff = Math.min((_deadAirBackoff || 0) + 60_000, 10 * 60_000);
  }

  _deadAirBusy = false;
  if (_deadAirActive) deadAir._arm();
}
export function _initDeadAir() { deadAir.start(); }

// ── Twitch chat — anonymous read-only IRC over WebSocket ─────────
// Works in OBS/browser sources with no auth token needed. This is
// how viewers actually reach the hosts — there is no on-screen
// text box for viewers; they type in Twitch chat.
const _seenViewers = new Set();
let _twitchWs = null;
let _twitchReconTimer = null;

export function initTwitchChat() { _connectTwitchIRC(1); }

function _connectTwitchIRC(attempt = 1) {
  if (_twitchWs) { try { _twitchWs.close(); } catch(_) {} }
  clearTimeout(_twitchReconTimer);

  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  _twitchWs = ws;

  ws.onopen = () => {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    ws.send('PASS oauth:justinfan' + Math.floor(Math.random() * 90000 + 10000));
    ws.send('NICK justinfan' + Math.floor(Math.random() * 90000 + 10000));
    ws.send(`JOIN #${TWITCH_CHANNEL.toLowerCase()}`);
    console.log(`[Twitch IRC] Connected → #${TWITCH_CHANNEL}`);
    setStatus('Live ✦', 'ready');
  };

  ws.onmessage = (event) => {
    const raw = event.data;
    if (raw.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); return; }

    if (raw.includes('PRIVMSG')) {
      const tagStr   = raw.startsWith('@') ? raw.slice(1, raw.indexOf(' ')) : '';
      const tags     = _parseTags(tagStr);
      const username = tags['display-name'] || tags['login'] || (raw.match(/:([^!]+)!/) || [])[1] || 'Someone';
      const msgMatch = raw.match(/PRIVMSG #\S+ :(.+)/);
      const message  = msgMatch ? msgMatch[1].trim() : '';
      if (!message) return;

      const isNew    = !_seenViewers.has(username.toLowerCase());
      if (isNew) _seenViewers.add(username.toLowerCase());
      const prefixed = isNew ? `[NEW VIEWER] ${username}: ${message}` : message;

      queueTwitchMessage(username, prefixed);
      deadAir?.reset();
    }

    // USERNOTICE — subs, resubs, raids, gifts
    if (raw.includes('USERNOTICE')) {
      const tagStr = raw.startsWith('@') ? raw.slice(1, raw.indexOf(' ')) : '';
      const tags   = _parseTags(tagStr);
      const type   = tags['msg-id'];
      const name   = tags['display-name'] || tags['login'] || 'Someone';

      if (type === 'sub' || type === 'subgift') {
        setStageLight('sub', 6000); triggerSubCelebration();
        queueTwitchMessage('StreamEvent', `${name} just subscribed! Omo thank you so much! Welcome to the family!`);
      } else if (type === 'resub') {
        const months = tags['msg-param-cumulative-months'] || '?';
        setStageLight('sub', 5000); triggerResubHype();
        queueTwitchMessage('StreamEvent', `${name} has been here for ${months} months! ${Number(months) >= 6 ? 'A real OG!' : 'Thank you!'} We see you!`);
      } else if (type === 'raid') {
        const viewers = tags['msg-param-viewerCount'] || '?';
        setStageLight('raid', 8000); triggerRaidDance();
        queueTwitchMessage('StreamEvent', `We are being raided by ${name} with ${viewers} viewers! Welcome welcome welcome! Come in, come in!`);
      } else if (type === 'subgift') {
        const recipient = tags['msg-param-recipient-display-name'] || 'someone';
        setStageLight('sub', 4000); triggerGiftPop();
        queueTwitchMessage('StreamEvent', `${name} just gifted a sub to ${recipient}! Omo that is so generous! Big love!`);
      }
    }
  };

  ws.onerror = (e) => console.warn('[Twitch IRC] WebSocket error:', e);
  ws.onclose = () => {
    console.warn(`[Twitch IRC] Disconnected — reconnecting in ${attempt * 5}s`);
    _twitchReconTimer = setTimeout(() => _connectTwitchIRC(Math.min(attempt + 1, 10)), attempt * 5000);
  };
}

function _parseTags(tagStr) {
  const out = {};
  if (!tagStr) return out;
  for (const part of tagStr.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

// ── Message queue — paced replies, one at a time ──────────────────
let _msgQueue = [];
let _msgBusy  = false;

const _spamPatterns = [
  /^(lol|lmao|lmfao|haha|hehe|xd|😂|💀|🔥|👀|😭|❤️|🫶|gg|ggs|w|l|f|oof|rip|omg|wow|yep|nope|yes|no|ok|okay|k|hi|hey|hello|ayo|yo|sup|np|ily|ty|thx|thanks|pog|poggers|kappa|5head|pepehands|lulw|monkas)\s*[!?.]*$/i,
  /^(.)\1{4,}$/,
];
function _isSpam(message) {
  const clean = message.trim();
  if (clean.split(/\s+/).length < 4 && !clean.includes('?')) return true;
  return _spamPatterns.some(p => p.test(clean));
}
function queueTwitchMessage(username, message) {
  if (_isSpam(message)) return;
  _msgQueue.push({ username, message });
  if (_msgQueue.length > 5) _msgQueue.shift();
  if (!_msgBusy) processNextMessage();
}
async function processNextMessage() {
  if (_msgQueue.length === 0) { _msgBusy = false; return; }
  _msgBusy = true;
  const { username, message } = _msgQueue.shift();
  await sendMessage(message, username);
  setTimeout(processNextMessage, 15000);
}

// ── Chat API call — Miss replies to a viewer message ──────────────
const chatHistory = [];
async function sendMessage(message, displayName = 'Viewer') {
  if (!message.trim()) return;
  const sendBtn = _el('send-btn');
  deadAir?.reset();
  setStatus('Thinking...', 'thinking');
  if (sendBtn) sendBtn.disabled = true;
  setCamMode('THINK');
  doGesture('think', 4000);
  chatHistory.push({ role: 'user', content: message });

  try {
    const res = await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:      USER_ID,
        message,
        display_name: displayName,
        history:      chatHistory.slice(-6),
        system_hint:  'Reply in 1-2 SHORT punchy sentences max. You are a live streamer — keep it quick, witty and real.',
      }),
    });

    if (res.status === 429) {
      let retryMs = 5000;
      try { const d = await res.json(); if (d?.retry_after_ms) retryMs = d.retry_after_ms; } catch(_) {}
      const fallback = `Hold on, I'm getting too many messages! Try again in ${Math.ceil(retryMs/1000)} seconds.`;
      showBubble(fallback, 'Miss OG Tinz'); await speak(fallback, 'neutral');
      setStatus('Ready ✦', 'ready');
      if (sendBtn) sendBtn.disabled = false;
      await new Promise(r => setTimeout(r, retryMs)); return;
    }
    if (!res.ok) throw new Error('API error ' + res.status);

    const data = await res.json();
    let reply = data.reply || "Ehn ehn, I heard you!";
    const sentences = reply.match(/[^.!?]+[.!?]+/g) || [reply];
    if (sentences.length > 2) reply = sentences.slice(0,2).join(' ').trim();
    const mood = data.viewer?.mood || 'neutral';

    chatHistory.push({ role: 'assistant', content: reply });
    if (chatHistory.length > 20) chatHistory.splice(0,2);

    showBubble(reply, 'Miss OG Tinz');
    setStatus('Live ✦', 'ready');

    const moodGesture = { happy:'excited', excited:'excited', surprised:'excited', neutral:'talk', sad:'think', angry:'talk' };
    doGesture(moodGesture[mood] || 'talk', reply.length * 65);
    const moodLight = { happy:'speak', excited:'sub', sad:'chill', angry:'raid', neutral:'speak' };
    setStageLight(moodLight[mood] || 'speak', reply.length * 65 + 2000);

    await speak(reply, mood);
    deadAir?.reset();

  } catch(err) {
    console.error(err);
    const fallback = "Oya wait, my brain is loading... try again!";
    showBubble(fallback, 'Miss OG Tinz');
    await speak(fallback, 'neutral');
    setStatus('Ready ✦', 'ready');
  }
  if (sendBtn) sendBtn.disabled = false;
}

// ── Debug UI — hidden behind the CONTROLS toggle, never shown to
// viewers by default. Handy for testing without going through Twitch. ──
function bindSlider(id, onChange) {
  const el  = document.getElementById(id);
  const val = document.getElementById(id + '-val');
  if (!el) return;
  el.addEventListener('input', () => { if (val) val.textContent = el.value; onChange(parseFloat(el.value)); });
}
function bindColour(id, meshNames) {
  const el = _el(id); if (!el) return;
  el.addEventListener('input', () => {
    const hex = parseInt(el.value.slice(1), 16);
    const vrm = _vrm(); if (!vrm) return;
    vrm.scene.traverse(obj => { if (obj.isMesh && meshNames.includes(obj.name)) obj.material.color.setHex(hex); });
  });
}

export function initUI() {
  const sendBtn      = _el('send-btn');
  const chatInput    = _el('chat-input');
  const panelToggle  = _el('panel-toggle');
  const controlPanel = _el('control-panel');

  if (sendBtn) sendBtn.addEventListener('click', () => {
    const msg = chatInput?.value.trim();
    if (!msg) return;
    if (chatInput) chatInput.value = '';
    sendMessage(msg, 'You');
  });
  if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn?.click(); });

  if (panelToggle) panelToggle.addEventListener('click', () => {
    const isOpen = !controlPanel.classList.contains('hidden');
    controlPanel.classList.toggle('hidden', isOpen);
    panelToggle.classList.toggle('open', !isOpen);
  });

  bindSlider('posX',  v => { const vrm = _vrm(); if (vrm) vrm.scene.position.x = v; });
  bindSlider('posY',  v => { const vrm = _vrm(); if (vrm) { vrm.scene.position.y = v; vrm._restPosY = v; } });
  bindSlider('posZ',  v => { const vrm = _vrm(); if (vrm) vrm.scene.position.z = v; });
  bindSlider('scale', v => { const vrm = _vrm(); if (vrm) vrm.scene.scale.set(v,v,v); });

  bindColour('col-skin',   ['Julie_Figure', 'Mr_OgTinz_Figure', 'Teargum']);
  bindColour('col-hair',   ['Hair_Block', 'Brow', 'Lashes']);
  bindColour('col-top',    ['Top']);
  bindColour('col-bottom', ['Bottom']);
  bindColour('col-gold',   ['Ear_Jewel', 'Necklece']);

  _el('btn-log')?.addEventListener('click', () => {
    const vrm = _vrm(); if (!vrm) return;
    const p = vrm.scene.position, s = vrm.scene.scale;
    console.log(`vrm pos (${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})  scale ${s.x.toFixed(3)}`);
    console.log(`camera pos (${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)})`);
  });
  _el('btn-reset')?.addEventListener('click', () => location.reload());
}

// ── Public API ─────────────────────────────────────────────────
window.missOgTinz = {
  receive:    (username, message) => sendMessage(message, username),
  express:    setExpression,
  gesture:    doGesture,
  speak,
  showBubble,
  camMode:    setCamMode,
  stageLight: setStageLight,
};
Object.defineProperty(window, '_missCurrentActivity', { get: () => ACTIVITY.current,    configurable: true });
Object.defineProperty(window, '_loraCurrentActivity', { get: () => ACTIVITY_MR.current, configurable: true });

// ================================================================
//  RENDER LOOP
// ================================================================
const clock = new THREE.Clock();

let idleTime       = 0, blinkTimer     = 0, nextBlink     = 3;
let loraIdleTime   = 0, loraBlinkTimer = 0, loraNextBlink = 2.2 + Math.random() * 3;
let _missEyeTarget = { yaw: 0, pitch: -2 }, _missEyeDwell = 2   + Math.random() * 3;
let _loraEyeTarget = { yaw: 0, pitch: -2 }, _loraEyeDwell = 2.5 + Math.random() * 3;

function render() {
  const delta = clock.getDelta();

  // ── Miss ─────────────────────────────────────────────────────
  const vrm = _vrm();
  if (vrm) {
    idleTime   += delta;
    blinkTimer += delta;

    activityUpdate(delta);   // seated micro-animation (breathing, subtle sway)
    hyperUpdate(delta);      // overlays raid/sub/gift celebration poses when active
    updateGesture(delta);    // overlays talk/think/excited gestures when active
    vrm.update(delta);

    if (vrm.lookAt) {
      if (_isSpeaking) {
        vrm.lookAt.yaw   = Math.sin(idleTime * 0.3) * 8 + Math.sin(idleTime * 0.9) * 3;
        vrm.lookAt.pitch = Math.sin(idleTime * 0.2) * 4 - 2;
      } else {
        // Small, camera-aware saccades — she's looking straight at the
        // lens most of the time, not off into a room that no longer exists.
        _missEyeDwell -= delta;
        if (_missEyeDwell <= 0) {
          _missEyeDwell        = 1.5 + Math.random() * 4.0;
          _missEyeTarget.yaw   = (Math.random() - 0.5) * 10;
          _missEyeTarget.pitch = -2 + (Math.random() - 0.4) * 4;
        }
        vrm.lookAt.yaw   += (_missEyeTarget.yaw   - vrm.lookAt.yaw)   * Math.min(1, delta * 10);
        vrm.lookAt.pitch += (_missEyeTarget.pitch - vrm.lookAt.pitch) * Math.min(1, delta * 10);
      }
    }

    if (blinkTimer > nextBlink) { blinkTimer = 0; nextBlink = 2.5 + Math.random() * 3; doBlink(); }
  }

  // ── Lora ─────────────────────────────────────────────────────
  const lora = getVrmLora ? getVrmLora() : null;
  if (lora) {
    loraIdleTime   += delta;
    loraBlinkTimer += delta;

    activityUpdateMr(delta);
    lora.update(delta);

    if (lora.lookAt) {
      if (window._loraIsSpeaking) {
        _loraEyeDwell -= delta;
        if (_loraEyeDwell <= 0) {
          _loraEyeDwell        = 0.4 + Math.random() * 1.1;
          _loraEyeTarget.yaw   = (Math.random() - 0.5) * 10;
          _loraEyeTarget.pitch = -3 + (Math.random() - 0.4) * 4;
        }
        lora.lookAt.yaw   += (_loraEyeTarget.yaw   - lora.lookAt.yaw)   * Math.min(1, delta * 14);
        lora.lookAt.pitch += (_loraEyeTarget.pitch - lora.lookAt.pitch) * Math.min(1, delta * 14);
      } else {
        _loraEyeDwell -= delta;
        if (_loraEyeDwell <= 0) {
          _loraEyeDwell        = 1.5 + Math.random() * 5.0;
          _loraEyeTarget.yaw   = (Math.random() - 0.5) * 10;
          _loraEyeTarget.pitch = -2 + (Math.random() - 0.35) * 4;
        }
        lora.lookAt.yaw   += (_loraEyeTarget.yaw   - lora.lookAt.yaw)   * Math.min(1, delta * 10);
        lora.lookAt.pitch += (_loraEyeTarget.pitch - lora.lookAt.pitch) * Math.min(1, delta * 10);
      }
    }

    if (loraBlinkTimer > loraNextBlink) { loraBlinkTimer = 0; loraNextBlink = 2.5 + Math.random() * 3.5; doBlinkMr(); }
  }

  updateCamera(delta);
  renderer.render(scene, camera);
}

let _rafPending = false;
function _tick() { _rafPending = false; render(); }
function _scheduleRender() { if (!_rafPending) { _rafPending = true; requestAnimationFrame(_tick); } }

// startRenderLoop() is called by engine-scene.startEngine() once
// initScene() has created the renderer.
export function startRenderLoop() {
  setInterval(() => {
    if (!renderer) return;
    if (document.hidden) render(); else _scheduleRender();
  }, 33);
  _scheduleRender();
  console.log('Miss OG Tinz & Lora ready ✦');
}
