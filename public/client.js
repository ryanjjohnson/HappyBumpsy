'use strict';
(() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const XLINK = 'http://www.w3.org/1999/xlink';
  const $ = (s) => document.querySelector(s);
  const svg = $('#arena');
  const defs = $('#defs');
  const layerOp = $('#layer-opossum');
  const layerPlayers = $('#layer-players');
  const layerFx = $('#layer-fx');
  const overlay = $('#overlay');
  const form = $('#join');
  const nameInput = $('#name');
  const joinError = $('#join-error');
  const hud = $('#hud');
  const hudName = $('#hud-name');
  const hudScore = $('#hud-score');
  const hudBoard = $('#hud-board');
  const hudBanner = $('#hud-banner');
  const leaveBtn = $('#leave');
  const muteBtn = $('#mute');
  const rulesEl = $('#rules');

  // ---------- sound: everything is synthesized, nothing to download ----------
  const Sfx = (() => {
    let ctx = null, master = null, noise = null;
    let muted = false;
    try { muted = localStorage.getItem('happybumpsy.muted') === '1'; } catch (_) {}
    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.6;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    function noiseBuf() {
      if (noise) return noise;
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return noise;
    }
    function gainEnv(t, peak, attack, hold, release) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.setValueAtTime(peak, t + attack + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
      g.connect(master);
      return g;
    }
    function ready() { return ensure() && !muted; }
    return {
      unlock: ensure,
      get muted() { return muted; },
      setMuted(m) {
        muted = m;
        try { localStorage.setItem('happybumpsy.muted', m ? '1' : '0'); } catch (_) {}
        if (ensure() && master) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.02);
      },
      // a goose honk. kind: 'canada' (higher, brassy) or 'greylag' (lower, lazier)
      honk(kind = 'canada', loud = 1) {
        if (!ready()) return;
        const t = ctx.currentTime;
        const f = kind === 'greylag' ? 175 : 240;
        const dur = kind === 'greylag' ? 0.42 : 0.3;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass'; filt.frequency.value = f * 4; filt.Q.value = 2.5;
        const g = gainEnv(t, 0.32 * loud, 0.03, dur * 0.5, dur * 0.5);
        filt.connect(g);
        for (const [type, mult, vol] of [['sawtooth', 1, 1], ['square', 1.5, 0.35], ['sawtooth', 2.02, 0.2]]) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.setValueAtTime(f * mult * 1.12, t);
          o.frequency.exponentialRampToValueAtTime(f * mult, t + dur * 0.4);
          o.frequency.exponentialRampToValueAtTime(f * mult * 0.9, t + dur);
          const og = ctx.createGain(); og.gain.value = vol;
          o.connect(og); og.connect(filt);
          o.start(t); o.stop(t + dur + 0.05);
        }
      },
      // a sharp goose hiss: band-passed noise
      hiss(loud = 1) {
        if (!ready()) return;
        const t = ctx.currentTime;
        const src = ctx.createBufferSource(); src.buffer = noiseBuf();
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass'; filt.frequency.setValueAtTime(3200, t); filt.frequency.linearRampToValueAtTime(4800, t + 0.5); filt.Q.value = 0.9;
        const g = gainEnv(t, 0.22 * loud, 0.04, 0.25, 0.35);
        src.connect(filt); filt.connect(g);
        src.start(t); src.stop(t + 0.8);
      },
      // getting possumed: a soft, raspy hiss (low-passed noise chopped by a tremolo)
      rasp() {
        if (!ready()) return;
        const t = ctx.currentTime;
        const src = ctx.createBufferSource(); src.buffer = noiseBuf();
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.setValueAtTime(1400, t); filt.frequency.exponentialRampToValueAtTime(600, t + 0.7); filt.Q.value = 1.2;
        const trem = ctx.createGain(); trem.gain.value = 0.6;
        const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 28;
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.4;
        lfo.connect(lfoG); lfoG.connect(trem.gain);
        const g = gainEnv(t, 0.16, 0.05, 0.3, 0.4);
        src.connect(filt); filt.connect(trem); trem.connect(g);
        src.start(t); src.stop(t + 0.85); lfo.start(t); lfo.stop(t + 0.85);
      },
      // getting bonked: a quiet pop
      pop() {
        if (!ready()) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(620, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.07);
        const g = gainEnv(t, 0.14, 0.005, 0.02, 0.08);
        o.connect(g); o.start(t); o.stop(t + 0.15);
      },
      // bonking someone: a soft cha-ching
      chaching() {
        if (!ready()) return;
        const t = ctx.currentTime;
        for (const [f, at, len, vol] of [[1318, 0, 0.12, 0.1], [1760, 0.09, 0.28, 0.12], [3520, 0.09, 0.2, 0.03]]) {
          const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
          const g = gainEnv(t + at, vol, 0.01, len * 0.3, len * 0.7);
          o.connect(g); o.start(t + at); o.stop(t + at + len + 0.05);
        }
      },
    };
  })();
  const sfxTimers = { canadaHonk: 0, greylagHonk: 0, greylagHiss: 0 };
  function renderMute() { muteBtn.textContent = Sfx.muted ? '🔇' : '🔊'; muteBtn.title = Sfx.muted ? 'unmute' : 'mute'; }
  muteBtn.addEventListener('click', () => { Sfx.setMuted(!Sfx.muted); renderMute(); });
  window.addEventListener('pointerdown', () => Sfx.unlock(), { passive: true });
  renderMute();
  const lists = { current: $('#list-current'), latest: $('#list-latest'), allTime: $('#list-alltime') };

  let ARENA = { w: 1600, h: 900 };
  let C = { R: 44, hitsToScore: 10, possumMs: 5000, opossum: { w: 200, h: 100 } };
  let ws = null;
  let myId = null;
  let myName = null;
  let joined = false;
  let wantJoin = false;
  let reconnectDelay = 500;
  let states = [];
  let scores = { current: [], latest: [], allTime: [] };
  const els = new Map();
  let opEl = null;
  let gooseEl = null;
  let greylagEl = null;
  const goslingEls = [];
  const honkFill = $('#honk-fill');
  const honkWho = $('#honk-who');
  let bannerTimer = 0;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const el = (tag, attrs = {}, cls) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (cls) e.setAttribute('class', cls);
    return e;
  };
  const useEl = (href, attrs) => {
    const u = el('use', attrs);
    u.setAttribute('href', href);
    u.setAttributeNS(XLINK, 'xlink:href', href);
    return u;
  };

  // ---------- art: load the standalone SVGs into <symbol>s so they stay single-sourced ----------
  async function loadSymbol(id, url) {
    const txt = await fetch(url).then((r) => r.text());
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const root = doc.documentElement;
    const sym = el('symbol', { id, viewBox: root.getAttribute('viewBox') });
    while (root.firstChild) sym.appendChild(document.adoptNode(root.firstChild));
    defs.appendChild(sym);
  }

  // ---------- networking ----------
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);
    ws.onopen = () => { reconnectDelay = 500; };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (_) { return; }
      onMessage(msg);
    };
    ws.onclose = () => {
      joined = false;
      states = [];
      if (wantJoin) showBanner('reconnecting…', '', 0);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 8000);
    };
    ws.onerror = () => {};
  }
  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function onMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        myId = msg.id;
        ARENA = msg.arena;
        C = msg.consts;
        scores = { current: msg.current, latest: msg.latest, allTime: msg.allTime };
        renderScoreLists();
        if (wantJoin && myName) send({ type: 'join', name: myName });
        break;
      case 'joined':
        joined = true;
        Sfx.unlock();
        myName = msg.name;
        hudName.textContent = msg.name;
        overlay.hidden = true;
        hud.hidden = false;
        hideBanner();
        sendInput();
        break;
      case 'state':
        msg.recv = performance.now();
        states.push(msg);
        if (states.length > 3) states.shift();
        if (msg.events && msg.events.length) handleEvents(msg.events);
        break;
      case 'scores':
        scores = { current: msg.current, latest: msg.latest, allTime: msg.allTime };
        renderScoreLists();
        break;
      case 'error':
        joinError.textContent = msg.message || 'something went wrong';
        break;
      default:
        break;
    }
  }

  // ---------- scoreboard panels ----------
  function fillList(ol, rows, fmt) {
    ol.replaceChildren();
    if (!rows || !rows.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = ol === lists.current ? 'nobody yet' : 'no scores yet';
      ol.appendChild(li);
      return;
    }
    for (const r of rows.slice(0, 10)) {
      const li = document.createElement('li');
      if (r.bot) li.classList.add('bot');
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = fmt ? fmt(r) : r.name;
      const p = document.createElement('span');
      p.className = 'p';
      p.textContent = r.score;
      li.append(n, p);
      ol.appendChild(li);
    }
  }
  function renderScoreLists() {
    fillList(lists.current, scores.current, (r) => (r.possum ? `${r.name} 💤` : r.name));
    fillList(lists.latest, scores.latest);
    fillList(lists.allTime, scores.allTime);
  }

  // ---------- players ----------
  function createPlayer(p) {
    const R = C.R;
    const g = el('g', {}, 'player');
    g.dataset.id = p.id;
    const body = el('g', {}, 'body');
    body.appendChild(useEl('#face', { x: -R, y: -R, width: 2 * R, height: 2 * R, class: 'face' }));
    // playable-possum form: the opossum sprite, shown instead of the face while transformed
    const critter = el('g', {}, 'critter');
    const cw = 2 * R * 1.5, ch = cw / 2;
    critter.appendChild(useEl('#opossum', { x: -cw / 2, y: -ch / 2 + 6, width: cw, height: ch }));
    body.appendChild(critter);
    // mint-jelly form: a quivering green pile
    const jellyG = el('g', {}, 'jellyblob');
    jellyG.appendChild(el('path', { d: `M${-R - 6} ${R - 4} C ${-R - 10} ${R - 30}, ${-R + 4} ${-R + 10}, 0 ${-R + 14} C ${R - 4} ${-R + 10}, ${R + 10} ${R - 30}, ${R + 6} ${R - 4} Z`, fill: '#7be3b0', stroke: '#2f9c6a', 'stroke-width': 2 }));
    jellyG.appendChild(el('ellipse', { cx: -12, cy: -6, rx: 10, ry: 6, fill: '#c9fbe4', opacity: .7 }));
    jellyG.appendChild(el('ellipse', { cx: 8, cy: 10, rx: 5, ry: 3, fill: '#c9fbe4', opacity: .5 }));
    body.appendChild(jellyG);
    // penalty form: 👁️👄👁️
    const eyesT = el('text', { x: 0, y: 10, 'font-size': 30, 'text-anchor': 'middle' }, 'eyes');
    eyesT.textContent = '👁️👄👁️';
    body.appendChild(eyesT);
    const ring = el('g', {}, 'ring');
    const text = el('text', {}, 'name');
    const tp = el('textPath', { startOffset: '0' });
    tp.setAttribute('href', '#ring-path');
    tp.setAttributeNS(XLINK, 'xlink:href', '#ring-path');
    tp.textContent = `${p.name} 🚂`;
    text.appendChild(tp);
    ring.appendChild(text);
    body.appendChild(ring);
    const halo = el('circle', { r: R + 6 }, 'halo');
    const zzz = el('text', { x: 0, y: -R - 32 }, 'zzz');
    zzz.textContent = 'z z z';
    const hits = el('text', { x: 0, y: -R - 32 }, 'hits');
    const badge = el('text', { x: 0, y: R + 40 }, 'badge');
    g.append(halo, body, zzz, hits, badge);
    layerPlayers.appendChild(g);
    return { g, body, critter, hits, badge, zzz, score: -1, possum: null, isCritter: null, isJelly: null, isEyes: null, lastX: p.x, facing: 1 };
  }

  function ensureOpossum() {
    if (opEl) return opEl;
    const g = el('g', { id: 'opossum-actor' });
    const flip = el('g', {}, 'flip');
    const wad = el('g', {}, 'waddle');
    wad.appendChild(useEl('#opossum', { x: 0, y: 0, width: C.opossum.w, height: C.opossum.h }));
    flip.appendChild(wad);
    g.appendChild(flip);
    layerOp.appendChild(g);
    opEl = { g, flip };
    return opEl;
  }

  function ensureGoose() {
    if (gooseEl) return gooseEl;
    const g = el('g', { id: 'goose-actor' });
    const flip = el('g', {}, 'flip');
    const bob = el('g', {}, 'bob');
    bob.appendChild(useEl('#goose', { x: 0, y: 0, width: 200, height: 160 }));
    flip.appendChild(bob);
    g.appendChild(flip);
    layerOp.appendChild(g);
    gooseEl = { g, flip };
    return gooseEl;
  }

  function ensureGreylag() {
    if (greylagEl) return greylagEl;
    const g = el('g', { id: 'greylag-actor' });
    const flip = el('g', {}, 'flip');
    const bob = el('g', {}, 'bob');
    const use = useEl('#greylag', { x: 0, y: 0, width: 190, height: 152 });
    bob.appendChild(use);
    flip.appendChild(bob);
    g.appendChild(flip);
    layerOp.appendChild(g);
    greylagEl = { g, flip, use, nuts: null };
    return greylagEl;
  }
  function ensureGosling(i) {
    while (goslingEls.length <= i) {
      const g = el('g', {}, 'gosling');
      const flip = el('g', {}, 'flip');
      const bob = el('g', {}, 'bob');
      bob.appendChild(useEl('#gosling', { x: 0, y: 0, width: 56, height: 56 }));
      flip.appendChild(bob);
      g.appendChild(flip);
      layerOp.appendChild(g);
      goslingEls.push({ g, flip });
    }
    return goslingEls[i];
  }

  let lastBoard = 0;
  function frame() {
    requestAnimationFrame(frame);
    const n = states.length;
    if (!n) return;
    const cur = states[n - 1];
    const prev = n > 1 ? states[n - 2] : null;
    let alpha = 1;
    if (prev) {
      const span = Math.max(cur.recv - prev.recv, 16);
      alpha = clamp((performance.now() - cur.recv) / span, 0, 1);
    }
    const prevMap = prev ? new Map(prev.players.map((p) => [p.id, p])) : null;
    const seen = new Set();
    let me = null;
    for (const p of cur.players) {
      seen.add(p.id);
      const pp = prevMap && prevMap.get(p.id);
      const x = pp ? lerp(pp.x, p.x, alpha) : p.x;
      const y = pp ? lerp(pp.y, p.y, alpha) : p.y;
      let e = els.get(p.id);
      if (!e) { e = createPlayer(p); els.set(p.id, e); }
      e.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      if (e.possum !== p.possum) {
        e.possum = p.possum;
        e.g.classList.toggle('possum', p.possum);
        if (!p.possum) e.hits.textContent = '';
      }
      if (p.possum) e.hits.textContent = `${p.hits}/${C.hitsToScore}`;
      if (e.isCritter !== p.critter) {
        e.isCritter = p.critter;
        e.g.classList.toggle('critter', p.critter);
      }
      if (e.isJelly !== p.jelly) {
        e.isJelly = p.jelly;
        e.g.classList.toggle('jelly', p.jelly);
      }
      if (e.isEyes !== p.eyes) {
        e.isEyes = p.eyes;
        e.g.classList.toggle('eyes', p.eyes);
      }
      if (p.critter) {
        if (x < e.lastX - 0.5) e.facing = -1; else if (x > e.lastX + 0.5) e.facing = 1;
        e.critter.setAttribute('transform', e.facing < 0 ? 'scale(-1 1)' : '');
      }
      e.lastX = x;
      if (e.score !== p.score) { e.score = p.score; e.badge.textContent = p.score; }
      if (p.id === myId) { me = p; e.g.classList.add('me'); }
    }
    for (const [id, e] of els) {
      if (!seen.has(id)) { e.g.remove(); els.delete(id); }
    }

    const o = cur.opossum;
    if (o) {
      const po = prev && prev.opossum;
      const ox = po ? lerp(po.x, o.x, alpha) : o.x;
      const e = ensureOpossum();
      e.g.setAttribute('transform', `translate(${(ox - C.opossum.w / 2).toFixed(1)} ${(o.y - C.opossum.h / 2).toFixed(1)})`);
      e.flip.setAttribute('transform', o.dir < 0 ? `translate(${C.opossum.w} 0) scale(-1 1)` : '');
    } else if (opEl) {
      opEl.g.remove();
      opEl = null;
    }

    const gs = cur.goose;
    if (gs) {
      const pg = prev && prev.goose;
      const gx = pg ? lerp(pg.x, gs.x, alpha) : gs.x;
      const gy = pg ? lerp(pg.y, gs.y, alpha) : gs.y;
      const e = ensureGoose();
      e.g.setAttribute('transform', `translate(${(gx - 100).toFixed(1)} ${(gy - 90).toFixed(1)})`);
      e.flip.setAttribute('transform', gs.dir < 0 ? 'translate(200 0) scale(-1 1)' : '');
    } else if (gooseEl) {
      gooseEl.g.remove();
      gooseEl = null;
    }

    const gl = cur.greylag;
    if (gl) {
      const pgl = prev && prev.greylag;
      const glx = pgl ? lerp(pgl.x, gl.x, alpha) : gl.x;
      const gly = pgl ? lerp(pgl.y, gl.y, alpha) : gl.y;
      const e = ensureGreylag();
      e.g.setAttribute('transform', `translate(${(glx - 95).toFixed(1)} ${(gly - 86).toFixed(1)})`);
      e.flip.setAttribute('transform', gl.dir < 0 ? 'translate(190 0) scale(-1 1)' : '');
      const nuts = !!gl.nuts;
      if (e.nuts !== nuts) {
        e.nuts = nuts;
        e.g.classList.toggle('nuts', nuts);
        const href = nuts ? '#greylag-nuts' : '#greylag';
        e.use.setAttribute('href', href);
        e.use.setAttributeNS(XLINK, 'xlink:href', href);
      }
      gl.goslings.forEach((b, i) => {
        const pb = pgl && pgl.goslings[i];
        const bx = pb ? lerp(pb.x, b.x, alpha) : b.x;
        const by = pb ? lerp(pb.y, b.y, alpha) : b.y;
        const ge = ensureGosling(i);
        ge.g.setAttribute('transform', `translate(${(bx - 28).toFixed(1)} ${(by - 34).toFixed(1)})`);
        ge.flip.setAttribute('transform', b.dir < 0 ? 'translate(56 0) scale(-1 1)' : '');
        ge.g.classList.remove('gone');
      });
      for (let i = gl.goslings.length; i < goslingEls.length; i++) goslingEls[i].g.classList.add('gone');
    } else if (greylagEl) {
      greylagEl.g.remove();
      greylagEl = null;
      for (const ge of goslingEls) ge.g.remove();
      goslingEls.length = 0;
    }

    // ambient goose noises
    if (joined) {
      const nowMs = performance.now();
      if (gs && nowMs > sfxTimers.canadaHonk) { Sfx.honk('canada', 0.8); sfxTimers.canadaHonk = nowMs + 1200 + Math.random() * 1800; }
      if (gl) {
        if (gl.nuts) { if (nowMs > sfxTimers.greylagHiss) { Sfx.hiss(0.7); sfxTimers.greylagHiss = nowMs + 700 + Math.random() * 500; } }
        else if (nowMs > sfxTimers.greylagHonk) { Sfx.honk('greylag', 0.6); sfxTimers.greylagHonk = nowMs + 4000 + Math.random() * 5000; }
      }
    }

    const honk = cur.honk || [];
    const top = honk.reduce((a, b) => (!a || b.progress > a.progress ? b : a), null);
    const zh = C.goose ? C.goose.honk.h : 110;
    const fillH = top ? Math.round(top.progress * zh) : 0;
    honkFill.setAttribute('y', zh - fillH);
    honkFill.setAttribute('height', fillH);
    honkWho.textContent = top ? `${top.name} ${Math.ceil((1 - top.progress) * (C.goose ? C.goose.honkMs : 15000) / 1000)}s` : '';

    if (joined) {
      if (me) {
        hudScore.textContent = me.score;
        if (rulesEl.hidden === !!me.safe) rulesEl.hidden = !me.safe;
        if (me.jelly) {
          showBanner(`🟢 YOU ARE MINT JELLY  ·  ${(me.jellyLeft / 1000).toFixed(1)}s  ·  quiver quietly`, 'jelly', 0);
        } else if (me.critter) {
          showBanner(`🦝 YOU'RE THE POSSUM  ·  ${(me.critterLeft / 1000).toFixed(1)}s  ·  touch players to flip them`, 'critter', 0);
        } else if (me.possum) {
          showBanner(`PLAYIN' POSSUM  ·  ${(me.possumLeft / 1000).toFixed(1)}s  ·  half speed, can't bump`, 'possum', 0);
        } else if (me.eyes) {
          showBanner(`👁️👄👁️  ·  ${(me.eyesLeft / 1000).toFixed(1)}s`, 'eyes', 0);
        } else if (hudBanner.classList.contains('possum') || hudBanner.classList.contains('critter') || hudBanner.classList.contains('jelly') || hudBanner.classList.contains('eyes')) {
          hideBanner();
        }
      }
      const now = performance.now();
      if (now - lastBoard > 250) { lastBoard = now; renderBoard(cur.players); }
    } else if (!overlay.hidden) {
      const now = performance.now();
      if (now - lastBoard > 500) {
        lastBoard = now;
        scores.current = cur.players.map((p) => ({ name: p.name, score: p.score, possum: p.possum, bot: p.bot }))
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        fillList(lists.current, scores.current, (r) => (r.possum ? `${r.name} 💤` : r.name));
      }
    }
  }

  function renderBoard(players) {
    const chased = states.length && states[states.length - 1].goose ? states[states.length - 1].goose.targetId : null;
    const rows = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 8);
    hudBoard.replaceChildren();
    for (const r of rows) {
      const li = document.createElement('li');
      if (r.id === myId) li.classList.add('me');
      if (r.possum) li.classList.add('possum');
      if (r.critter) li.classList.add('critter');
      if (r.id === chased) li.classList.add('chased');
      if (r.bot) li.classList.add('bot');
      if (r.jelly) li.classList.add('jelly');
      if (r.eyes) li.classList.add('eyes');
      if (r.safe) li.classList.add('safe');
      const n = document.createElement('span'); n.className = 'n'; n.textContent = r.name;
      const p = document.createElement('span'); p.className = 'p'; p.textContent = r.score;
      li.append(n, p);
      hudBoard.appendChild(li);
    }
  }

  // ---------- effects ----------
  function fx(x, y, text, cls) {
    const t = el('text', { x: x.toFixed(0), y: y.toFixed(0) }, `fx ${cls || ''}`);
    t.textContent = text;
    layerFx.appendChild(t);
    t.addEventListener('animationend', () => t.remove());
    setTimeout(() => t.remove(), 1500);
  }
  function showBanner(text, cls, ms) {
    hudBanner.textContent = text;
    hudBanner.className = `banner ${cls || ''}`;
    hudBanner.hidden = false;
    clearTimeout(bannerTimer);
    if (ms) bannerTimer = setTimeout(hideBanner, ms);
  }
  function hideBanner() {
    hudBanner.hidden = true;
    hudBanner.className = 'banner';
  }
  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'bump') {
        if (ev.partial) fx(ev.x, ev.y - 20, `${ev.hits}/${C.hitsToScore}`, 'partial');
        else if (ev.via === 'possum') fx(ev.x, ev.y - 20, ev.scorer === myId ? '+1 FLIPPED!' : '+1 🦝', '');
        else fx(ev.x, ev.y - 20, ev.scorer === myId ? '+1 BUMP!' : '+1', '');
        if (ev.victim === myId) Sfx.pop();
        if (ev.scorer === myId && !ev.partial) Sfx.chaching();
      } else if (ev.type === 'greylag') {
        if (joined) Sfx.honk('greylag', 0.8);
        if (joined) showBanner(ev.goslings ? `🪿 a greylag goose is passing through with ${ev.goslings} goslings. Do NOT touch the babies.` : '🪿 a greylag goose is passing through. She seems calm.', '', 5000);
      } else if (ev.type === 'gooseNuts') {
        fx(ev.x, ev.y - 60, 'MAMA IS COMING', 'nuts');
        if (joined) { Sfx.hiss(1); Sfx.honk('greylag', 1); setTimeout(() => Sfx.hiss(0.8), 300); }
        if (ev.id === myId) showBanner('🪿 you touched a baby. RUN.', 'goose', 3000);
      } else if (ev.type === 'jellied') {
        fx(ev.x, ev.y - 60, 'MINT JELLY', 'jelly');
        if (joined) Sfx.hiss(ev.id === myId ? 1 : 0.5);
      } else if (ev.type === 'sixtyseven') {
        fx(ev.x, ev.y - 60, '67!', 'sixtyseven');
      } else if (ev.type === 'bots') {
        if (joined) showBanner(`🤖 ${ev.names.join(' and ')} wandered in to keep you company`, '', 4000);
      } else if (ev.type === 'goose') {
        showBanner(`🪿 ${ev.name} summoned a goose. RUN.`, 'goose', 4500);
        if (joined) { Sfx.honk('canada', 1); setTimeout(() => Sfx.honk('canada', 0.9), 350); }
      } else if (ev.type === 'goosed') {
        fx(ev.x, ev.y - 40, 'HONK!', 'goosed');
        if (joined) { Sfx.hiss(ev.id === myId ? 1 : 0.6); Sfx.honk('canada', 0.7); }
      } else if (ev.type === 'eyes') {
        fx(ev.x, ev.y + 70, '👁️👄👁️', 'eyesfx');
      } else if (ev.type === 'transform') {
        fx(ev.x, ev.y - 70, `${ev.name} IS THE POSSUM NOW`, 'transform');
      } else if (ev.type === 'possum') {
        fx(ev.x, ev.y - 60, ev.by ? `flipped by ${ev.by}` : "playin' possum", 'possum');
        if (ev.id === myId) Sfx.rasp();
      } else if (ev.type === 'opossum') {
        if (joined) showBanner('🦝 an opossum waddles in… don\'t touch it', '', 3500);
      }
    }
  }

  // ---------- input ----------
  const keys = { w: false, a: false, s: false, d: false };
  const KEYMAP = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd' };
  let mode = 'mouse';
  let target = null;
  let lastMouseSend = 0;
  let trailing = 0;
  const pt = svg.createSVGPoint();

  function toArena(cx, cy) {
    pt.x = cx; pt.y = cy;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    return { x: clamp(p.x, 0, ARENA.w), y: clamp(p.y, 0, ARENA.h) };
  }
  function sendInput() {
    if (!joined) return;
    send({ type: 'input', mode, keys, target });
  }
  function pointerMove(cx, cy) {
    if (!joined) return;
    const t = toArena(cx, cy);
    if (!t) return;
    target = t;
    mode = 'mouse';
    const now = performance.now();
    if (now - lastMouseSend > 50) {
      lastMouseSend = now;
      sendInput();
    } else {
      clearTimeout(trailing);
      trailing = setTimeout(sendInput, 60);
    }
  }
  window.addEventListener('mousemove', (e) => pointerMove(e.clientX, e.clientY));
  window.addEventListener('touchmove', (e) => {
    if (!joined) return;
    e.preventDefault();
    const t = e.touches[0];
    pointerMove(t.clientX, t.clientY);
  }, { passive: false });
  window.addEventListener('touchstart', (e) => {
    if (!joined) return;
    const t = e.touches[0];
    pointerMove(t.clientX, t.clientY);
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (!joined || e.target === nameInput) return;
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (!keys[k] || mode !== 'keys') {
      keys[k] = true;
      mode = 'keys';
      sendInput();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    if (keys[k]) {
      keys[k] = false;
      if (mode === 'keys') sendInput();
    }
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    if (mode === 'keys') sendInput();
  });

  // ---------- join / leave ----------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim().slice(0, 16);
    if (!name) { joinError.textContent = 'you need a name to be bumped by'; return; }
    joinError.textContent = '';
    myName = name;
    wantJoin = true;
    try { localStorage.setItem('happybumpsy.name', name); } catch (_) {}
    if (ws && ws.readyState === WebSocket.OPEN) send({ type: 'join', name });
    else joinError.textContent = 'connecting…';
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); }
  });
  leaveBtn.addEventListener('click', () => {
    wantJoin = false;
    joined = false;
    send({ type: 'leave' });
    hud.hidden = true;
    overlay.hidden = false;
    rulesEl.hidden = true;
    hideBanner();
    nameInput.focus();
  });

  // ---------- boot ----------
  try {
    const saved = localStorage.getItem('happybumpsy.name');
    if (saved) nameInput.value = saved;
  } catch (_) {}
  Promise.all([loadSymbol('face', 'img/face.svg'), loadSymbol('opossum', 'img/opossum.svg'), loadSymbol('goose', 'img/goose.svg'), loadSymbol('greylag', 'img/greylag.svg'), loadSymbol('greylag-nuts', 'img/greylag-nuts.svg'), loadSymbol('gosling', 'img/gosling.svg')])
    .catch((err) => console.error('could not load art', err))
    .finally(() => {
      connect();
      requestAnimationFrame(frame);
    });
})();
