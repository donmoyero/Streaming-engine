'use client';

import { useEffect, useRef } from 'react';
import './avatar-stage.css';

/**
 * AvatarStage
 * ------------------------------------------------------------------
 * This component is a faithful port of the old index.html <body>.
 * It does NOT rewrite engine-scene.js / engine-life.js / engine-camera.js /
 * engine-bones.js / engine-bff.js / engine-music.js / kitchen-*.js into
 * React. Those files keep their original logic untouched (only asset
 * paths were changed from relative to absolute — see engine-scene.js).
 *
 * Why: that engine is a tightly-coupled, already-tuned render loop with
 * module-level side effects (WebGLRenderer, AudioContext created at
 * import time). It has no reason to be "more React" — it just needs to
 * run client-side, after this markup exists in the DOM. That's exactly
 * what the useEffect below does.
 *
 * All the IDs below (canvas, loader, bar-fill, chat-bubble, posX, etc.)
 * must stay exactly as they are — the engine files grab these elements
 * directly via document.getElementById / querySelector. Don't add React
 * state that re-renders this subtree; the engine owns these DOM nodes
 * imperatively from here on, the same way it always has.
 */
export default function AvatarStage() {
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return; // guard against double-invoke in dev Strict Mode
    didInit.current = true;

    let cancelled = false;

    async function boot() {
      // 1. Load tmi.js from npm and expose it as a global so the engine
      //    code can reach it via `window.tmi` / `tmi.Client(...)`, exactly
      //    as it did when tmi was loaded via <script src="...">.
      if (!window.tmi) {
        const tmiModule = await import('tmi.js');
        // tmi.js ships as a CommonJS bundle; the default export IS the
        // tmi namespace (Client, ChatUserstate, etc.).
        window.tmi = tmiModule.default ?? tmiModule;
      }
      if (cancelled) return;

      // 2. Now that tmi exists and this markup is mounted, boot the engine.
      //    engine-scene.js owns initScene() (creates renderer/scene/camera
      //    from the DOM nodes this component just rendered) and
      //    startEngine() (loads House.glb + both VRMs, then dynamically
      //    pulls in engine-life.js for UI/render-loop/life-sim wiring).
      //    Both must run, in this order, after mount.
      const sceneModule = await import('@/engine/engine-scene.js');
      if (cancelled) return;
      sceneModule.initScene();
      await sceneModule.startEngine();
    }

    boot().catch((err) => {
      console.error('[AvatarStage] engine failed to start:', err);
    });

    return () => {
      cancelled = true;
      // NOTE: the original engine has no teardown/dispose path (it was
      // built to run forever on a static page). We deliberately don't
      // try to fake one here — see the chat note on Strict Mode below.
    };
  }, []);

  return (
    <>
      <div id="loader">
        <div className="logo">MISS OG TINZ</div>
        <div className="sub">Loading avatar...</div>
        <div className="bar">
          <div className="bar-fill" id="bar-fill" />
        </div>
      </div>

      <div id="studio-bg" style={{ background: 'transparent' }} />
      <div id="stage-light" />

      <canvas id="canvas" />

      {/* Single LIVE badge — top left only */}
      <div id="live-badge">
        <div className="dot" />
        <span>LIVE</span>
      </div>

      <div id="status">Initialising...</div>

      <div id="topic-box">
        <div id="topic-box-inner">
          <div id="topic-label">
            <div className="tdot" />
            Talking About
            <span id="topic-source-tag" />
          </div>
          <div id="topic-title-text" />
        </div>
      </div>

      {/* Miss OG Tinz chat bubble */}
      <div id="chat-bubble">
        <div className="speaker" id="miss-speaker-name">Miss OG Tinz</div>
        <div id="bubble-text">Heyyy! Welcome to the stream!</div>
      </div>

      {/* Controls toggle */}
      <button id="panel-toggle">CONTROLS</button>
      <div id="control-panel" className="hidden">
        <div className="ctrl-label">Send a Message</div>
        <div className="ctrl-chat-row">
          <input id="chat-input" type="text" placeholder="Chat with Miss OG Tinz..." maxLength={200} />
          <button id="send-btn">SEND</button>
        </div>

        <hr className="ctrl-sep" />
        <div className="ctrl-label">Position</div>
        <div className="ctrl-row">
          <label>X</label>
          <input type="range" id="posX" min="-5" max="5" step="0.05" defaultValue="0" />
          <span id="posX-val">0</span>
        </div>
        <div className="ctrl-row">
          <label>Y</label>
          <input type="range" id="posY" min="-2" max="5" step="0.01" defaultValue="0" />
          <span id="posY-val">0</span>
        </div>
        <div className="ctrl-row">
          <label>Z</label>
          <input type="range" id="posZ" min="-5" max="5" step="0.05" defaultValue="0" />
          <span id="posZ-val">0</span>
        </div>

        <div className="ctrl-label">Scale</div>
        <div className="ctrl-row">
          <label>S</label>
          <input type="range" id="scale" min="0.3" max="3.0" step="0.01" defaultValue="1.0" />
          <span id="scale-val">1.0</span>
        </div>

        <hr className="ctrl-sep" />
        <div className="ctrl-label">Colours</div>
        <div className="ctrl-row"><label>Skin</label><input type="color" id="col-skin" defaultValue="#7B3F00" /></div>
        <div className="ctrl-row"><label>Hair</label><input type="color" id="col-hair" defaultValue="#0d0d0d" /></div>
        <div className="ctrl-row"><label>Top</label><input type="color" id="col-top" defaultValue="#ff69b4" /></div>
        <div className="ctrl-row"><label>Bot</label><input type="color" id="col-bottom" defaultValue="#ff1493" /></div>
        <div className="ctrl-row"><label>Gold</label><input type="color" id="col-gold" defaultValue="#FFD700" /></div>

        <hr className="ctrl-sep" />
        <button className="ctrl-btn" id="btn-log">📋 Log Current Values</button>
        <button className="ctrl-btn" id="btn-reset">↺ Reset All</button>
      </div>
    </>
  );
}
