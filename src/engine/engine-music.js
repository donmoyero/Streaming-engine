// ================================================================
//  engine-music.js  — Ambient home music system
//  Powered by Jamendo API (CC-licensed, Twitch-safe).
//
//  Three distinct moods that rotate automatically:
//    'lofi'    — lofi / chillhop tracks
//    'ambient' — ambient / downtempo tracks
//    'evening' — jazz / lounge tracks
//
//  Volume behaviour:
//    • Default: 0.08 (quiet background presence)
//    • TV watching: 0.22 (called by engine-life _updateTVVolume)
//    • Cooking:     0.14
//    • Sleeping:    0.04 (very quiet)
//
//  Track selection: top 20 per mood, shuffled each session.
//  Tracks auto-advance when one ends. Mood rotates every ~4 tracks.
//
//  IMPORTANT: AudioContext is created LAZILY inside startMusic()
//  so it is guaranteed to run after a user gesture.
// ================================================================

const JAMENDO_CLIENT_ID = 'c4c11c18';
const JAMENDO_BASE      = 'https://api.jamendo.com/v3.0/tracks/';
const SAFE_LICENSES     = 'by,cc0';   // CC-BY + CC0 only — no -nc
const TRACKS_PER_MOOD   = 20;
const TRACKS_PER_ROTATION = 4;        // switch mood after this many tracks

// Mood → Jamendo search tags (multiple tried in order until we have enough)
const MOOD_TAGS = {
  lofi:    ['lofi', 'lo-fi', 'chillhop'],
  ambient: ['ambient', 'chillout', 'downtempo'],
  evening: ['jazz', 'smoothjazz', 'lounge'],
};

// ── State ─────────────────────────────────────────────────────────
let _ctx          = null;
let _master       = null;
let _running      = false;
let _currentMood  = 'lofi';
let _moodIdx      = 0;
const MOODS       = ['lofi', 'ambient', 'evening'];

// Per-mood track libraries (loaded once on first startMusic)
const _library    = { lofi: [], ambient: [], evening: [] };
let _libLoaded    = false;
let _libLoading   = false;

// Playback
let _audioEl      = null;   // current <audio> element
let _trackQueue   = [];     // shuffled queue for current mood
let _trackIdx     = 0;      // position in queue
let _tracksPlayed = 0;      // count since last mood rotation
let _targetVol    = 0.08;   // current logical volume (0–1)

// ── Jamendo fetch ─────────────────────────────────────────────────
async function _fetchTag(tag, limit = TRACKS_PER_MOOD) {
  const url = new URL(JAMENDO_BASE);
  url.searchParams.set('client_id',   JAMENDO_CLIENT_ID);
  url.searchParams.set('format',      'json');
  url.searchParams.set('limit',       String(limit));
  url.searchParams.set('tags',        tag);
  url.searchParams.set('license_cc',  SAFE_LICENSES);
  url.searchParams.set('order',       'popularity_total');
  url.searchParams.set('audioformat', 'mp32');
  try {
    const res  = await fetch(url);
    const data = await res.json();
    return data.results || [];
  } catch (e) {
    console.warn(`[Music] Jamendo fetch failed for tag "${tag}":`, e);
    return [];
  }
}

async function _loadLibrary() {
  if (_libLoaded || _libLoading) return;
  _libLoading = true;
  console.log('[Music] Loading track library from Jamendo…');

  for (const [mood, tags] of Object.entries(MOOD_TAGS)) {
    const seen = new Map();
    for (const tag of tags) {
      if (seen.size >= TRACKS_PER_MOOD) break;
      const tracks = await _fetchTag(tag, TRACKS_PER_MOOD);
      for (const t of tracks) {
        if (seen.has(t.id) || !t.audio) continue;
        seen.set(t.id, { id: t.id, title: t.name, artist: t.artist_name, url: t.audio });
      }
    }
    _library[mood] = Array.from(seen.values());
    console.log(`[Music] ${mood}: ${_library[mood].length} tracks loaded`);
  }

  _libLoaded  = true;
  _libLoading = false;
}

// ── Shuffle helper ────────────────────────────────────────────────
function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Audio element management ──────────────────────────────────────
function _ensureCtx() {
  if (_ctx) return;
  _ctx    = new (window.AudioContext || window.webkitAudioContext)();
  _master = _ctx.createGain();
  _master.gain.value = 0;
  _master.connect(_ctx.destination);
}

function _playTrack(track) {
  if (!track) return;

  // Clean up previous element
  if (_audioEl) {
    _audioEl.onended = null;
    _audioEl.pause();
    _audioEl.src = '';
  }

  console.log(`[Music] ▶ ${track.artist} — ${track.title} (${_currentMood})`);

  _audioEl           = new Audio();
  _audioEl.crossOrigin = 'anonymous';
  _audioEl.src       = track.url;
  _audioEl.volume    = 1; // volume controlled via _master gain node

  // Route through Web Audio so setMusicVolume() works
  const src = _ctx.createMediaElementSource(_audioEl);
  src.connect(_master);

  _audioEl.play().catch(e => {
    console.warn('[Music] Playback error, skipping track:', e);
    _advanceTrack();
  });

  _audioEl.onended = () => _advanceTrack();
}

function _advanceTrack() {
  if (!_running) return;

  _tracksPlayed++;

  // Rotate mood after TRACKS_PER_ROTATION tracks
  if (_tracksPlayed >= TRACKS_PER_ROTATION) {
    _tracksPlayed = 0;
    _rotateMood();
    return; // _rotateMood calls _startMoodQueue which plays next
  }

  _trackIdx++;
  if (_trackIdx >= _trackQueue.length) {
    // Re-shuffle when we've exhausted the queue
    _trackQueue = _shuffle(_library[_currentMood]);
    _trackIdx   = 0;
  }
  _playTrack(_trackQueue[_trackIdx]);
}

function _startMoodQueue(mood) {
  _currentMood  = mood;
  _trackQueue   = _shuffle(_library[mood]);
  _trackIdx     = 0;
  _tracksPlayed = 0;
  _playTrack(_trackQueue[0]);
}

// ── Mood rotation ─────────────────────────────────────────────────
function _rotateMood() {
  _moodIdx     = (_moodIdx + 1) % MOODS.length;
  const next   = MOODS[_moodIdx];
  console.log(`[Music] mood → ${next}`);

  // Brief dip on transition
  if (_master) {
    const now = _ctx.currentTime;
    const cur = _master.gain.value;
    _master.gain.cancelScheduledValues(now);
    _master.gain.setValueAtTime(cur, now);
    _master.gain.linearRampToValueAtTime(cur * 0.4, now + 1.5);
    _master.gain.linearRampToValueAtTime(_targetVol, now + 3.5);
  }

  _startMoodQueue(next);
}

// ================================================================
//  PUBLIC API  (identical surface to original — engine-life.js
//  requires zero changes)
// ================================================================

export async function startMusic() {
  if (_running) return;
  _ensureCtx();

  if (_ctx.state === 'suspended') {
    await _ctx.resume().catch(() => {});
  }

  _running = true;

  // Fade in
  _master.gain.cancelScheduledValues(_ctx.currentTime);
  _master.gain.setValueAtTime(0, _ctx.currentTime);
  _master.gain.linearRampToValueAtTime(_targetVol, _ctx.currentTime + 3.0);

  // Load tracks then start playing
  await _loadLibrary();

  if (_library[_currentMood].length === 0) {
    console.warn('[Music] No tracks loaded — Jamendo may be unavailable.');
    return;
  }

  _startMoodQueue(_currentMood);
  console.log('[Music] started ✓  mood:', _currentMood);
}

export function stopMusic() {
  if (!_running) return;
  _running = false;

  if (_audioEl) {
    _audioEl.onended = null;
    _audioEl.pause();
  }

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
  _targetVol = Math.max(0, Math.min(1, v));
  if (!_master || !_ctx) return;
  _master.gain.cancelScheduledValues(_ctx.currentTime);
  _master.gain.setValueAtTime(_master.gain.value, _ctx.currentTime);
  _master.gain.linearRampToValueAtTime(_targetVol, _ctx.currentTime + 1.2);
}

export function getMusicVolume() {
  return _master?.gain.value ?? 0;
}

/**
 * Set the music mood manually.
 * Valid values: 'lofi' | 'ambient' | 'evening'
 * engine-life.js can call this when room changes:
 *   bedroom     → 'ambient'
 *   studio      → 'lofi'
 *   living-room → 'evening'
 */
export function setMusicMood(mood) {
  if (!MOODS.includes(mood) || mood === _currentMood) return;
  _moodIdx = MOODS.indexOf(mood);
  console.log(`[Music] mood set → ${mood}`);
  if (_running && _libLoaded) {
    _startMoodQueue(mood);
  } else {
    _currentMood = mood; // will be picked up when startMusic() runs
  }
}

export function getCurrentMood() { return _currentMood; }

// Legacy helpers — kept for backward compatibility
export function tvOn()  { setMusicVolume(0.22); }
export function tvOff() { setMusicVolume(0.08); }
