// ================================================================
//  engine-music.js  — Ambient home music system
//  Twitch-safe: 100% procedural Web Audio, zero licensed content.
//
//  Three distinct moods that rotate automatically:
//    'lofi'    — gentle piano chords + soft rain texture
//    'ambient' — slow pad drones, no rhythm, peaceful
//    'evening' — warm jazz-flavoured chords, brushed hi-hat only
//
//  Volume behaviour:
//    • Default: 0.08 (quiet background presence)
//    • TV watching: 0.22 (called by engine-life _updateTVVolume)
//    • Cooking:     0.14
//    • Sleeping:    0.04 (very quiet)
//
//  IMPORTANT: AudioContext is created LAZILY inside startMusic()
//  so it is guaranteed to run after a user gesture. Calling
//  startMusic() before a gesture is safe — the browser will
//  resume the context automatically on first interaction.
// ================================================================

let _ctx        = null;
let _master     = null;
let _running    = false;
let _schedHandle = null;
let _currentMood = 'lofi';
let _moodTimer   = 0;       // bars elapsed in current mood
const MOOD_CHANGE_BARS = 16; // switch mood every 16 bars (~53s at 72bpm)

// ── Lazy init — safe to call multiple times ───────────────────────
function _ensureCtx() {
  if (_ctx) return;
  _ctx    = new (window.AudioContext || window.webkitAudioContext)();
  _master = _ctx.createGain();
  _master.gain.value = 0;
  _master.connect(_ctx.destination);
  _buildChain();
}

// ── Signal chain (built once after ctx exists) ────────────────────
let _dry, _reverb, _reverbGain, _lpf, _shaper;

function _buildChain() {
  // Tape warmth waveshaper — gentle, not clipping
  _shaper = _ctx.createWaveShaper();
  const n = 512, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    // Soft knee — only compresses peaks, leaves quiet sounds clean
    c[i] = x < 0
      ? -Math.pow(Math.abs(x), 0.85)
      :  Math.pow(x, 0.85);
  }
  _shaper.curve = c;
  _shaper.oversample = '4x';

  // Low-pass — roll off harsh highs (like fabric-covered speakers)
  _lpf = _ctx.createBiquadFilter();
  _lpf.type            = 'lowpass';
  _lpf.frequency.value = 4200;
  _lpf.Q.value         = 0.5;

  // Small room reverb
  _reverb = _ctx.createConvolver();
  const irLen = _ctx.sampleRate * 1.8;
  const ir    = _ctx.createBuffer(2, irLen, _ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
      // Exponential decay with early reflections
      const t    = i / irLen;
      const late = Math.pow(1 - t, 2.8);
      d[i] = (Math.random() * 2 - 1) * late * (i < 800 ? 0.3 : 1);
    }
  }
  _reverb.buffer = ir;

  _reverbGain = _ctx.createGain();
  _reverbGain.gain.value = 0.22;

  // Chain: dry → shaper → lpf → master
  //        dry → reverb → reverbGain → lpf → master
  _dry = _ctx.createGain();
  _dry.gain.value = 0.78;

  _dry.connect(_shaper);
  _reverb.connect(_reverbGain);
  _reverbGain.connect(_shaper);
  _shaper.connect(_lpf);
  _lpf.connect(_master);
}

// ── Note → Hz ────────────────────────────────────────────────────
function _hz(note, oct = 4) {
  const map = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,
                'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
  const semi = (map[note] ?? 0) + (oct - 4) * 12;
  return 440 * Math.pow(2, semi / 12);
}

// ── Oscillator builder ────────────────────────────────────────────
function _osc(freq, type, vol, t0, dur, attack = 0.06, release = 0.12) {
  const o = _ctx.createOscillator();
  const g = _ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  // Slight detuning for warmth — each call gets a random ±3 cents
  o.detune.value = (Math.random() - 0.5) * 6;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.setValueAtTime(vol, Math.max(t0 + attack, t0 + dur - release));
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  o.connect(g);
  g.connect(_dry);
  g.connect(_reverb); // send to reverb too
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// ── Gentle noise layer (rain/air texture) ────────────────────────
function _noiseLayer(vol, t0, dur, hpFreq = 800, dest = null) {
  const bufLen = Math.ceil(_ctx.sampleRate * Math.min(dur, 2));
  const buf    = _ctx.createBuffer(1, bufLen, _ctx.sampleRate);
  const d      = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1;
  const src = _ctx.createBufferSource();
  src.buffer = buf;
  src.loop   = dur > 2;

  const hpf  = _ctx.createBiquadFilter();
  hpf.type   = 'highpass';
  hpf.frequency.value = hpFreq;

  const g = _ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.5);
  g.gain.setValueAtTime(vol, t0 + dur - 0.5);
  g.gain.linearRampToValueAtTime(0, t0 + dur);

  src.connect(hpf);
  hpf.connect(g);
  g.connect(dest ?? _dry);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// ── Timing ───────────────────────────────────────────────────────
const BPM  = 68;        // slower = more relaxed
const BEAT = 60 / BPM;
const BAR  = BEAT * 4;

// Gentle swing — 16ths are humanised, not metronomic
function _swingOffset(i16) {
  return i16 % 2 === 1 ? BEAT * 0.5 * 1.08 : BEAT * 0.5 * 0.92;
}

// ── CHORD SETS ───────────────────────────────────────────────────
// Format: [[note, octave], ...] per chord, 4 chords per progression

// Warm lo-fi minor (Am → F → C → G)
const PROG_LOFI = [
  [['A',3],['C',4],['E',4],['G',4]],   // Am7
  [['F',3],['A',3],['C',4],['E',4]],   // Fmaj7
  [['C',4],['E',4],['G',4],['B',4]],   // Cmaj7
  [['G',3],['B',3],['D',4],['F',4]],   // G7
];

// Sleepy ambient (slow, wide voicings)
const PROG_AMBIENT = [
  [['D',3],['A',3],['F',4],['C',5]],   // Dm9
  [['G',3],['D',4],['B',4],['F',4]],   // G13
  [['E',3],['B',3],['G',4],['D',5]],   // Em9
  [['A',3],['E',4],['C',5],['G',4]],   // Am9
];

// Warm evening jazz (Bb → Eb → Ab → Db)
const PROG_EVENING = [
  [['Bb',3],['D',4],['F',4],['A',4]],  // Bbmaj7
  [['Eb',3],['G',4],['Bb',4],['D',5]], // Ebmaj7
  [['Ab',3],['C',4],['Eb',4],['G',4]], // Abmaj7
  [['Db',4],['F',4],['Ab',4],['C',5]], // Dbmaj7
];

const PROGS = { lofi: PROG_LOFI, ambient: PROG_AMBIENT, evening: PROG_EVENING };

// ── Scheduler state ───────────────────────────────────────────────
let _bar      = 0;
let _chordIdx = 0;
let _nextBeat = 0;

// ── Bar schedulers per mood ───────────────────────────────────────

function _schedLofi(t, chord) {
  // Soft pad — triangle+sine blend, long attack
  chord.forEach(([note, oct]) => {
    const f = _hz(note, oct);
    _osc(f, 'triangle', 0.045, t, BAR * 0.95, 0.12, 0.20);
    _osc(f, 'sine',     0.020, t, BAR * 0.95, 0.18, 0.15);
  });

  // Bass — root on beat 1, soft walk on beat 3
  const [bn, bo] = chord[0];
  const bf = _hz(bn, bo - 1);
  _osc(bf,        'sine', 0.10, t,             BEAT * 0.8, 0.03, 0.10);
  _osc(bf * 1.5,  'sine', 0.06, t + BEAT * 2,  BEAT * 0.7, 0.03, 0.10);

  // Gentle brushed hi-hat — every beat, soft, random drop
  for (let i = 0; i < 8; i++) {
    if (Math.random() < 0.25) continue; // 25% chance of silence = human feel
    const tHat = t + i * BEAT * 0.5;
    const vol  = i % 2 === 0 ? 0.012 : 0.006;
    _noiseLayer(vol, tHat, 0.05, 7000);
  }

  // Sparse top melody — one or two notes per bar max
  if (Math.random() < 0.55) {
    const pick  = chord[Math.floor(Math.random() * chord.length)];
    const mf    = _hz(pick[0], pick[1] + 1);
    const mStart = t + Math.random() * BAR * 0.5;
    _osc(mf, 'sine', 0.018, mStart, BEAT * (0.8 + Math.random() * 1.2), 0.08, 0.20);
  }

  // Subtle room air texture
  _noiseLayer(0.004, t, BAR, 1200, _reverb);
}

function _schedAmbient(t, chord) {
  // Very slow pad, wide stereo, no drums at all
  chord.forEach(([note, oct]) => {
    const f = _hz(note, oct);
    // Long slow swell — takes 2 seconds to fade in
    _osc(f,     'sine',     0.040, t, BAR * 1.1, 0.8, 0.5);
    _osc(f * 2, 'triangle', 0.015, t, BAR * 0.9, 1.0, 0.6);
    // Gentle detuned layer for chorus effect
    const g2 = _ctx.createGain();
    const o2 = _ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    o2.detune.value = 8; // 8 cents sharp for shimmer
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.010, t + 1.0);
    g2.gain.linearRampToValueAtTime(0, t + BAR);
    o2.connect(g2); g2.connect(_reverb);
    o2.start(t); o2.stop(t + BAR + 0.1);
  });

  // Occasional bass hum — very soft
  const [bn, bo] = chord[0];
  _osc(_hz(bn, bo - 1), 'sine', 0.06, t, BAR * 0.9, 0.5, 0.4);

  // Continuous air/wind texture
  _noiseLayer(0.006, t, BAR, 600, _reverb);
}

function _schedEvening(t, chord) {
  // Warm pad — slightly brighter, more presence
  chord.forEach(([note, oct]) => {
    const f = _hz(note, oct);
    _osc(f, 'triangle', 0.050, t, BAR * 0.92, 0.10, 0.18);
    _osc(f, 'sine',     0.025, t, BAR * 0.92, 0.12, 0.15);
  });

  // Walking bass — beats 1, 2, 3, 4 (jazz feel)
  const [bn, bo] = chord[0];
  const bf = _hz(bn, bo - 1);
  [0, 1, 2, 3].forEach((beat, i) => {
    const walkFreq = i % 2 === 0 ? bf : bf * [1, 1.125, 1.25, 1.5][beat % 4];
    const vol = i === 0 ? 0.10 : 0.06;
    _osc(walkFreq, 'sine', vol, t + beat * BEAT, BEAT * 0.85, 0.02, 0.08);
  });

  // Brushed snare on beat 2 and 4 only — very soft
  [BEAT, BEAT * 3].forEach(ofs => {
    if (Math.random() < 0.15) return; // occasional miss = human
    _noiseLayer(0.018, t + ofs, 0.09, 3000);
    _noiseLayer(0.006, t + ofs, 0.28, 3000, _reverb);
  });

  // Soft hi-hat — 8th notes, drops
  for (let i = 0; i < 8; i++) {
    if (Math.random() < 0.30) continue;
    _noiseLayer(0.007, t + i * BEAT * 0.5, 0.04, 8000);
  }

  // Melody — more frequent in evening mood
  if (Math.random() < 0.70) {
    const pick   = chord[Math.floor(Math.random() * chord.length)];
    const mf     = _hz(pick[0], pick[1] + 1);
    const mStart = t + Math.floor(Math.random() * 4) * BEAT * 0.5;
    _osc(mf, 'sine', 0.022, mStart, BEAT * (0.6 + Math.random()), 0.06, 0.16);
  }
}

const SCHEDULERS = { lofi: _schedLofi, ambient: _schedAmbient, evening: _schedEvening };

// ── Mood rotation ─────────────────────────────────────────────────
const MOODS   = ['lofi', 'ambient', 'evening'];
let _moodIdx  = 0;

function _rotateMood() {
  _moodIdx     = (_moodIdx + 1) % MOODS.length;
  _currentMood = MOODS[_moodIdx];
  _chordIdx    = 0;
  // Smooth transition: briefly dip volume then recover
  if (_master) {
    const now = _ctx.currentTime;
    const cur = _master.gain.value;
    _master.gain.cancelScheduledValues(now);
    _master.gain.setValueAtTime(cur, now);
    _master.gain.linearRampToValueAtTime(cur * 0.6, now + BAR * 0.5);
    _master.gain.linearRampToValueAtTime(cur, now + BAR * 1.5);
  }
  console.log(`[Music] mood → ${_currentMood}`);
}

// ── Main scheduler tick ───────────────────────────────────────────
const LOOK_AHEAD = 0.25;
const INTERVAL   = 100; // ms

function _tick() {
  if (!_running || !_ctx) return;
  while (_nextBeat < _ctx.currentTime + LOOK_AHEAD) {
    const prog    = PROGS[_currentMood];
    const chord   = prog[_chordIdx % prog.length];
    const sched   = SCHEDULERS[_currentMood];
    sched(_nextBeat, chord);
    _nextBeat += BAR;
    _bar++;
    _chordIdx = (_chordIdx + 1) % prog.length;
    _moodTimer++;
    if (_moodTimer >= MOOD_CHANGE_BARS) {
      _moodTimer = 0;
      _rotateMood();
    }
  }
  _schedHandle = setTimeout(_tick, INTERVAL);
}

// ================================================================
//  PUBLIC API
// ================================================================

export function startMusic() {
  if (_running) return;
  _ensureCtx();

  // If context was blocked by browser (autoplay policy), resume it
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }

  _running   = true;
  _nextBeat  = _ctx.currentTime + 0.15;
  _tick();

  // Gentle fade-in over 3 seconds — no sudden loud hit
  _master.gain.cancelScheduledValues(_ctx.currentTime);
  _master.gain.setValueAtTime(0, _ctx.currentTime);
  _master.gain.linearRampToValueAtTime(0.08, _ctx.currentTime + 3.0);

  console.log('[Music] ambient home music started ✓  mood:', _currentMood);
}

export function stopMusic() {
  if (!_running) return;
  _running = false;
  clearTimeout(_schedHandle);
  if (_master) {
    _master.gain.cancelScheduledValues(_ctx.currentTime);
    _master.gain.linearRampToValueAtTime(0, _ctx.currentTime + 2.0);
  }
  console.log('[Music] stopped');
}

/**
 * Smooth volume ramp — 0 to 1 scale.
 * engine-life.js calls this with:
 *   0.08  — default background
 *   0.22  — TV watching
 *   0.04  — sleeping
 */
export function setMusicVolume(v) {
  if (!_master) return;
  const clamped = Math.max(0, Math.min(1, v));
  _master.gain.cancelScheduledValues(_ctx.currentTime);
  _master.gain.setValueAtTime(_master.gain.value, _ctx.currentTime);
  _master.gain.linearRampToValueAtTime(clamped, _ctx.currentTime + 1.2);
}

export function getMusicVolume() {
  return _master?.gain.value ?? 0;
}

/**
 * Set the music mood manually.
 * Valid values: 'lofi' | 'ambient' | 'evening'
 * engine-life.js can call this when room changes:
 *   bedroom  → 'ambient'
 *   studio   → 'lofi'
 *   living-room → 'evening'
 */
export function setMusicMood(mood) {
  if (!MOODS.includes(mood) || mood === _currentMood) return;
  _currentMood = mood;
  _moodIdx     = MOODS.indexOf(mood);
  _chordIdx    = 0;
  _moodTimer   = 0;
  console.log(`[Music] mood set → ${mood}`);
}

export function getCurrentMood() { return _currentMood; }

// Legacy helpers — kept for backward compatibility
export function tvOn()  { setMusicVolume(0.22); }
export function tvOff() { setMusicVolume(0.08); }
