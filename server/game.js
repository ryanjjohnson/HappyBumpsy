'use strict';
// Pure, deterministic-ish simulation for HappyBumpsy. No I/O in here so it can be unit tested.

const ARENA = { w: 1600, h: 900 };

const CONSTS = {
  R: 44,                 // player radius (arena units)
  speed: 420,            // px / s
  possumMs: 5000,        // how long you play dead after touching the opossum
  possumImmuneMs: 2000,  // grace period after recovering before the opossum can get you again
  hitsToScore: 10,       // bumps needed to score on a player who is playing possum
  bumpCooldownMs: 500,   // per-attacker cooldown between scoring bumps
  bounce: 320,           // impulse applied on a bump (px / s)
  opossum: {
    w: 200, h: 100,      // drawn size
    hw: 85, hh: 34,      // collision half-extents (a bit smaller than the drawing)
    minSpeed: 100, maxSpeed: 170,
    minGapMs: 15000, maxGapMs: 35000,
  },
};

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function createWorld(now = Date.now()) {
  return {
    players: new Map(),
    opossum: null,
    nextOpossumAt: now + rand(6000, 15000),
    events: [],
  };
}

function addPlayer(world, id, name, now = Date.now()) {
  const { R } = CONSTS;
  const p = {
    id,
    sid: `${now.toString(36)}-${id}`,
    name,
    x: rand(R * 2, ARENA.w - R * 2),
    y: rand(R * 2, ARENA.h - R * 2),
    ix: 0, iy: 0,               // decaying impulse velocity
    score: 0,
    mode: 'mouse',
    target: null,
    keys: {},
    possumUntil: 0,
    possumImmuneUntil: 0,
    possumHits: 0,
    bumpCooldownUntil: 0,
    joinedAt: now,
  };
  world.players.set(id, p);
  return p;
}

function removePlayer(world, id) {
  const p = world.players.get(id);
  world.players.delete(id);
  return p;
}

function setInput(world, id, input) {
  const p = world.players.get(id);
  if (!p) return;
  p.mode = input.mode === 'keys' ? 'keys' : 'mouse';
  if (input.target && Number.isFinite(input.target.x) && Number.isFinite(input.target.y)) {
    p.target = { x: clamp(input.target.x, 0, ARENA.w), y: clamp(input.target.y, 0, ARENA.h) };
  } else if (p.mode === 'mouse') {
    p.target = null;
  }
  const k = input.keys || {};
  p.keys = { w: !!k.w, a: !!k.a, s: !!k.s, d: !!k.d };
}

const isPossum = (p, now) => p.possumUntil > now;

function startPossum(world, p, now) {
  p.possumUntil = now + CONSTS.possumMs;
  p.possumImmuneUntil = p.possumUntil + CONSTS.possumImmuneMs;
  p.possumHits = 0;
  world.events.push({ type: 'possum', id: p.id, name: p.name, x: p.x, y: p.y });
}

function movePlayer(p, dt, now) {
  if (p.possumUntil && now >= p.possumUntil) {
    p.possumUntil = 0;
    p.possumHits = 0;
  }
  const sp = CONSTS.speed * (isPossum(p, now) ? 0.5 : 1);
  let vx = 0, vy = 0;
  if (p.mode === 'keys') {
    vx = (p.keys.d ? 1 : 0) - (p.keys.a ? 1 : 0);
    vy = (p.keys.s ? 1 : 0) - (p.keys.w ? 1 : 0);
    const l = Math.hypot(vx, vy);
    if (l > 0) { vx = vx / l * sp; vy = vy / l * sp; }
  } else if (p.target) {
    const dx = p.target.x - p.x, dy = p.target.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 2) {
      const s = Math.min(sp, d / dt); // don't overshoot the cursor
      vx = dx / d * s; vy = dy / d * s;
    }
  }
  p.x += (vx + p.ix) * dt;
  p.y += (vy + p.iy) * dt;
  const decay = Math.pow(0.001, dt);
  p.ix *= decay; p.iy *= decay;
}

function spawnOpossum(world, now) {
  const o = CONSTS.opossum;
  const dir = Math.random() < 0.5 ? 1 : -1;
  world.opossum = {
    x: dir > 0 ? -o.hw - 40 : ARENA.w + o.hw + 40,
    y: rand(140, ARENA.h - 140),
    dir,
    speed: rand(o.minSpeed, o.maxSpeed),
    hw: o.hw, hh: o.hh,
    t: 0,
  };
  world.events.push({ type: 'opossum', dir });
}

function stepOpossum(world, dt, now) {
  const o = world.opossum;
  if (!o) {
    if (now >= world.nextOpossumAt) spawnOpossum(world, now);
    return;
  }
  o.x += o.dir * o.speed * dt;
  o.t += dt;
  const gone = o.dir > 0 ? o.x > ARENA.w + o.hw + 60 : o.x < -o.hw - 60;
  if (gone) {
    world.opossum = null;
    world.nextOpossumAt = now + rand(CONSTS.opossum.minGapMs, CONSTS.opossum.maxGapMs);
  }
}

function collideOpossum(world, p, now) {
  const o = world.opossum;
  if (!o) return;
  const { R } = CONSTS;
  const cx = clamp(p.x, o.x - o.hw, o.x + o.hw);
  const cy = clamp(p.y, o.y - o.hh, o.y + o.hh);
  let dx = p.x - cx, dy = p.y - cy;
  let d = Math.hypot(dx, dy);
  if (d >= R) return;
  if (d < 0.001) {
    // centre is inside the box: eject along the axis of least penetration
    const px = o.hw - Math.abs(p.x - o.x) + R;
    const py = o.hh - Math.abs(p.y - o.y) + R;
    if (px < py) { dx = Math.sign(p.x - o.x) || 1; dy = 0; p.x += dx * px; }
    else { dx = 0; dy = Math.sign(p.y - o.y) || -1; p.y += dy * py; }
  } else {
    const push = R - d;
    dx /= d; dy /= d;
    p.x += dx * push; p.y += dy * push;
  }
  if (!isPossum(p, now) && now >= p.possumImmuneUntil) {
    p.ix += dx * 260; p.iy += dy * 260;
    startPossum(world, p, now);
  }
}

function resolvePair(world, a, b, now) {
  const { R, hitsToScore, bumpCooldownMs, bounce } = CONSTS;
  let dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  if (d >= 2 * R) return;
  if (d < 0.001) { dx = 0; dy = 1; d = 1; }
  const nx = dx / d, ny = dy / d;
  const overlap = 2 * R - d;
  a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
  b.x += nx * overlap / 2; b.y += ny * overlap / 2;

  // The higher player's bottom is touching the lower player's top.
  let top = a, bot = b, ndx = dx, ndy = dy;
  if (dy < 0) { top = b; bot = a; ndx = -dx; ndy = -dy; }
  if (Math.abs(ndx) > ndy) return;           // side-on contact, no tap
  if (isPossum(top, now)) return;             // playing possum: cannot attack
  if (now < top.bumpCooldownUntil) return;

  top.bumpCooldownUntil = now + bumpCooldownMs;
  top.iy -= bounce; bot.iy += bounce;
  const ev = {
    type: 'bump',
    x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
    scorer: top.id, scorerName: top.name,
    victim: bot.id, victimName: bot.name,
    partial: false, hits: 0,
  };
  if (isPossum(bot, now)) {
    bot.possumHits += 1;
    if (bot.possumHits >= hitsToScore) {
      bot.possumHits = 0;
      top.score += 1;
    } else {
      ev.partial = true;
      ev.hits = bot.possumHits;
    }
  } else {
    top.score += 1;
  }
  if (!ev.partial) ev.score = top.score;
  world.events.push(ev);
}

function step(world, dt, now = Date.now()) {
  const { R } = CONSTS;
  const players = [...world.players.values()];
  for (const p of players) movePlayer(p, dt, now);
  stepOpossum(world, dt, now);
  for (const p of players) collideOpossum(world, p, now);
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) resolvePair(world, players[i], players[j], now);
  }
  for (const p of players) {
    p.x = clamp(p.x, R, ARENA.w - R);
    p.y = clamp(p.y, R, ARENA.h - R);
  }
}

function snapshot(world, now = Date.now()) {
  const players = [];
  for (const p of world.players.values()) {
    const possum = isPossum(p, now);
    players.push({
      id: p.id, name: p.name,
      x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10,
      score: p.score,
      possum,
      hits: possum ? p.possumHits : 0,
      possumLeft: possum ? p.possumUntil - now : 0,
    });
  }
  const o = world.opossum;
  return {
    players,
    opossum: o ? { x: Math.round(o.x * 10) / 10, y: Math.round(o.y), dir: o.dir } : null,
  };
}

module.exports = { ARENA, CONSTS, createWorld, addPlayer, removePlayer, setInput, step, snapshot, isPossum };
