// ================================================================
//  engine-music.js
//  Procedural lo-fi background music — no files, no copyright,
//  plays forever. Uses the Web Audio API only.
//
//  HOW TO USE:
//    import { startMusic, stopMusic, setMusicVolume } from './engine-music.js';
//    startMusic();          // call once after user gesture (autoplay policy)
//
//  The TV is "on" — music plays at low volume like a real TV in the
//  background. Call setMusicVolume(0) to mute (TV off) or
//  setMusicVolume(0.18) to restore.
// ================================================================

const _ctx = new (window.AudioContext || window.webkitAudioContext)();

// ── Master gain (overall volume) ─────────────────────────────────
const _master = _ctx.createGain();
_master.gain.value = 0.0;   // start silent; fade in on startMusic()
_master.connect(_ctx.destination);

// ── Lo-fi tape-saturation via waveshaper ─────────────────────────
function _makeWarmShaper() {
  const ws   = _ctx.createWaveShaper();
  const n    = 256;
  const c    = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i]    = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
  }
  ws.curve = c;
  ws.oversample = '2x';
  return ws;
}

// ── Low-pass filter (makes it sound like speakers behind a TV) ───
const _lpf = _ctx.createBiquadFilter();
_lpf.type            = 'lowpass';
_lpf.frequency.value = 3200;
_lpf.Q.value         = 0.7;
_lpf.connect(_master);

const _shaper = _makeWarmShaper();
_shaper.connect(_lpf);

// ── Reverb (small room feel) ─────────────────────────────────────
const _reverb = _ctx.createConvolver();
(function _buildIR() {
  const len  = _ctx.sampleRate * 1.2;
  const ir   = _ctx.createBuffer(2, len, _ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
  }
  _reverb.buffer = ir;
})();
const _reverbGain = _ctx.createGain();
_reverbGain.gain.value = 0.18;
_reverb.connect(_reverbGain);
_reverbGain.connect(_shaper);

// Main dry signal bus
const _dry = _ctx.createGain();
_dry.gain.value = 0.82;
_dry.connect(_shaper);

// ── Note → frequency ─────────────────────────────────────────────
function _freq(note, octave = 4) {
  const NOTES = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 };
  const semi  = NOTES[note[0]] + (note[1] === '#' ? 1 : note[1] === 'b' ? -1 : 0) + (octave - 4) * 12;
  return 440 * Math.pow(2, semi / 12);
}

// ── Lo-fi chord progressions (minor / jazzy) ─────────────────────
// Each chord = array of [note, octave] pairs
const PROGRESSIONS = [
  // Am7 – Dm7 – G7 – Cmaj7  (classic lo-fi)
  [
    [['A',3],['C',4],['E',4],['G',4]],
    [['D',3],['F',4],['A',4],['C',5]],
    [['G',3],['B',4],['D',4],['F',4]],
    [['C',4],['E',4],['G',4],['B',4]],
  ],
  // Em7 – Am7 – Dm7 – Bm7
  [
    [['E',3],['G',4],['B',4],['D',5]],
    [['A',3],['C',4],['E',4],['G',4]],
    [['D',3],['F',4],['A',4],['C',5]],
    [['B',3],['D',4],['F#',4],['A',4]],
  ],
  // Cm7 – Fm7 – Bb7 – Ebmaj7
  [
    [['C',3],['Eb',4],['G',4],['Bb',4]],
    [['F',3],['Ab',4],['C',4],['Eb',5]],
    [['Bb',3],['D',4],['F',4],['Ab',4]],
    [['Eb',4],['G',4],['Bb',4],['D',5]],
  ],
];

// ── Oscillator helpers ────────────────────────────────────────────
function _osc(freq, type, gainVal, start, dur, dest) {
  const o = _ctx.createOscillator();
  const g = _ctx.createGain();
  o.type            = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gainVal, start + 0.04);
  g.gain.setValueAtTime(gainVal, start + dur - 0.06);
  g.gain.linearRampToValueAtTime(0, start + dur);
  o.connect(g); g.connect(dest);
  o.start(start); o.stop(start + dur + 0.01);
}

function _noise(gainVal, start, dur, dest) {
  const buf  = _ctx.createBuffer(1, _ctx.sampleRate * 0.25, _ctx.sampleRate);
  const d    = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src  = _ctx.createBufferSource();
  src.buffer = buf;
  const hpf  = _ctx.createBiquadFilter();
  hpf.type   = 'highpass'; hpf.frequency.value = 6000;
  const g    = _ctx.createGain();
  g.gain.setValueAtTime(gainVal, start);
  g.gain.linearRampToValueAtTime(0, start + dur);
  src.connect(hpf); hpf.connect(g); g.connect(dest);
  src.start(start); src.stop(start + dur + 0.01);
}

// ── Scheduler state ───────────────────────────────────────────────
let _running      = false;
let _schedHandle  = null;
let _nextBeat     = 0;
const BPM         = 72;
const BEAT        = 60 / BPM;
const BAR         = BEAT * 4;

let _bar          = 0;
let _progIdx      = 0;
let _prog         = PROGRESSIONS[0];
let _chordIdx     = 0;

// Slight swing — 16th notes are slightly late
const _swing = (beat16th) => beat16th % 2 === 1 ? BEAT / 2 * 1.12 : BEAT / 2;

function _scheduleBar(startTime) {
  const chord = _prog[_chordIdx];

  // ── Pad (piano-ish sine+triangle blend) ─────────────────────────
  chord.forEach(([note, oct]) => {
    const f = _freq(note, oct);
    _osc(f, 'sine',     0.06, startTime,      BAR, _dry);
    _osc(f, 'triangle', 0.03, startTime,      BAR, _dry);
    // subtle 7th harmonic for warmth
    _osc(f * 7, 'sine', 0.004, startTime, BAR, _dry);
  });

  // ── Bass (root note one octave down) ────────────────────────────
  const [bassNote, bassOct] = chord[0];
  const bassF = _freq(bassNote, bassOct - 1);
  // Bass plays on beats 1 and 3 with a walk on beat 3
  _osc(bassF, 'sine', 0.14, startTime,           BEAT * 0.9, _dry);
  _osc(bassF, 'sine', 0.04, startTime + BEAT,    BEAT * 0.4, _dry);
  _osc(bassF * 1.5, 'sine', 0.10, startTime + BEAT * 2, BEAT * 0.9, _dry);
  _osc(bassF, 'sine', 0.04, startTime + BEAT * 3, BEAT * 0.5, _dry);

  // ── Hi-hat (16th note pattern with swing + random drops) ─────────
  let t16 = 0;
  for (let i = 0; i < 16; i++) {
    const t = startTime + t16;
    const skip = Math.random() < 0.18;   // occasional ghost-note drop
    if (!skip) {
      const vol = (i % 4 === 0) ? 0.022 : 0.010;
      _noise(vol, t, 0.04, _dry);
    }
    t16 += _swing(i);
  }

  // ── Kick (beat 1 + light on beat 3) ────────────────────────────
  _osc(55, 'sine', 0.28, startTime,         0.22, _dry);
  _osc(55, 'sine', 0.16, startTime + BAR/2, 0.18, _dry);
  // kick pitch drop
  const kickEnv = _ctx.createGain();
  kickEnv.gain.setValueAtTime(0.28, startTime);
  kickEnv.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

  // ── Snare (beat 2 and 4, with reverb send) ───────────────────────
  [BEAT, BEAT * 3].forEach(ofs => {
    _noise(0.055, startTime + ofs, 0.12, _dry);
    _noise(0.02,  startTime + ofs, 0.35, _reverb);
    // Snare body
    _osc(180, 'triangle', 0.04, startTime + ofs, 0.08, _dry);
  });

  // ── Melodic top note (random from chord, sparse) ─────────────────
  if (Math.random() < 0.6) {
    const pick = chord[Math.floor(Math.random() * chord.length)];
    const mf   = _freq(pick[0], pick[1] + 1);
    const mStart = startTime + Math.floor(Math.random() * 6) * (BEAT / 2);
    _osc(mf, 'sine', 0.025, mStart, BEAT * (0.5 + Math.random()), _dry);
  }

  // ── Advance chord / progression every 2 bars ─────────────────────
  _bar++;
  if (_bar % 2 === 0) {
    _chordIdx = (_chordIdx + 1) % _prog.length;
  }
  if (_bar % 8 === 0) {
    _progIdx  = (_progIdx + 1) % PROGRESSIONS.length;
    _prog     = PROGRESSIONS[_progIdx];
    _chordIdx = 0;
  }
}

// ── Look-ahead scheduler (Web Audio best-practice) ───────────────
const LOOK_AHEAD = 0.2;   // seconds ahead to schedule
const INTERVAL   = 80;    // ms between scheduler runs

function _tick() {
  while (_nextBeat < _ctx.currentTime + LOOK_AHEAD) {
    _scheduleBar(_nextBeat);
    _nextBeat += BAR;
  }
  _schedHandle = setTimeout(_tick, INTERVAL);
}

// ── Public API ────────────────────────────────────────────────────
export function startMusic() {
  if (_running) return;
  _running   = true;
  _nextBeat  = _ctx.currentTime + 0.1;
  _tick();
  // Fade in over 2 seconds
  _master.gain.cancelScheduledValues(_ctx.currentTime);
  _master.gain.setValueAtTime(0, _ctx.currentTime);
  _master.gain.linearRampToValueAtTime(0.18, _ctx.currentTime + 2.0);
  console.log('[Music] lo-fi TV music started ✓');
}

export function stopMusic() {
  if (!_running) return;
  _running = false;
  clearTimeout(_schedHandle);
  _master.gain.cancelScheduledValues(_ctx.currentTime);
  _master.gain.linearRampToValueAtTime(0, _ctx.currentTime + 1.5);
  console.log('[Music] stopped');
}

export function setMusicVolume(v) {
  _master.gain.cancelScheduledValues(_ctx.currentTime);
  _master.gain.setValueAtTime(_master.gain.value, _ctx.currentTime);
  _master.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, v)), _ctx.currentTime + 0.5);
}

export function getMusicVolume() {
  return _master.gain.value;
}

// ── TV on/off helpers ─────────────────────────────────────────────
export function tvOn()  { setMusicVolume(0.18); }
export function tvOff() { setMusicVolume(0.0);  }
