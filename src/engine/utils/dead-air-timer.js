/**
 * DeadAirTimer
 * Fires a proactive message when the avatar has been silent too long.
 *
 * Options:
 *   silenceThresholdMs  — how long silence must last before triggering (default 2 min)
 *   minIntervalMs       — minimum gap between any two proactive speaks (default 3 min)
 *   chatEndpoint        — URL to fetch the proactive message from
 *   onProactiveMessage  — callback(text: string) called with the fetched message
 *   debug               — log timing info to console
 */
export default class DeadAirTimer {
  constructor({
    silenceThresholdMs = 120_000,
    minIntervalMs      = 180_000,
    chatEndpoint       = '',
    onProactiveMessage = () => {},
    debug              = false,
  } = {}) {
    this._silenceMs   = silenceThresholdMs;
    this._minInterval = minIntervalMs;
    this._endpoint    = chatEndpoint;
    this._onMessage   = onProactiveMessage;
    this._debug       = debug;

    this._timer       = null;      // silence countdown
    this._lastSpoke   = 0;         // timestamp of last proactive fire
    this._backoffMs   = 0;         // extra delay after a 429
    this._fetching    = false;     // guard against concurrent fetches
    this._started     = false;
  }

  /** Start (or restart) the silence countdown. */
  start() {
    this._started = true;
    this._schedule();
  }

  /**
   * Call this whenever the avatar speaks or a user chats —
   * resets the silence clock.
   */
  reset() {
    if (!this._started) return;
    this._clearTimer();
    this._schedule();
    this._log('reset');
  }

  /** Permanently stop the timer (e.g. on page unload). */
  stop() {
    this._started = false;
    this._clearTimer();
  }

  // ── internals ──────────────────────────────────────────────────────

  _schedule() {
    this._clearTimer();
    const delay = this._silenceMs + this._backoffMs;
    this._log(`next check in ${(delay / 1000).toFixed(1)}s`);
    this._timer = setTimeout(() => this._onSilence(), delay);
  }

  _clearTimer() {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  async _onSilence() {
    if (this._fetching) return;

    // Respect minimum interval between proactive speaks
    const now = Date.now();
    const sinceLastSpoke = now - this._lastSpoke;
    if (this._lastSpoke > 0 && sinceLastSpoke < this._minInterval) {
      const wait = this._minInterval - sinceLastSpoke;
      this._log(`min interval not met — waiting ${(wait / 1000).toFixed(1)}s more`);
      this._timer = setTimeout(() => this._onSilence(), wait);
      return;
    }

    this._fetching = true;
    this._log('silence detected — fetching proactive message');

    try {
      const res = await fetch(this._endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ trigger: 'dead_air' }),
      });

      if (res.status === 429) {
        // Back off exponentially, capped at 10 minutes
        this._backoffMs = Math.min((this._backoffMs || 30_000) * 2, 600_000);
        this._log(`429 received — backing off ${(this._backoffMs / 1000).toFixed(0)}s`);
        this._fetching = false;
        this._schedule();
        return;
      }

      // On any non-ok response just reschedule normally
      if (!res.ok) {
        this._log(`HTTP ${res.status} — rescheduling`);
        this._backoffMs = 0;
        this._fetching = false;
        this._schedule();
        return;
      }

      // Reset backoff on success
      this._backoffMs = 0;

      const data = await res.json();
      // Support { text }, { message }, or { response } shapes
      const text = data?.text || data?.message || data?.response || '';

      if (text) {
        this._lastSpoke = Date.now();
        this._log(`firing onProactiveMessage: "${text.slice(0, 60)}…"`);
        this._onMessage(text);
      } else {
        this._log('empty response — rescheduling');
      }

    } catch (err) {
      this._log(`fetch error: ${err.message} — rescheduling`);
    }

    this._fetching = false;
    // Always restart the countdown after a cycle
    this._schedule();
  }

  _log(msg) {
    if (this._debug) console.log(`[DeadAirTimer] ${msg}`);
  }
}
