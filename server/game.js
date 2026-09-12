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
  bumpsToTransform: 3,   // get scored on this many times...
  transformWindowMs: 10000, // ...within this window, and you turn into a possum
  critterMs: 10000,      // how long you stay a playable possum
  goose: {
    r: 40,               // collision radius
    speed: 470,          // px / s, a bit faster than a player
    steer: 6,            // how quickly it turns toward its target (per second)
    ms: 20000,           // how long a goose stays
    possumMs: 20000,     // how long a goosed player plays dead
    penalty: 5,          // points lost when goosed
    honkMs: 15000,       // hover in the HONK zone this long to summon one
    honk: { x: 1400, y: 770, w: 180, h: 110 }, // bottom-right zone (top-left corner + size)
  },
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
    goose: null,
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
    bumpedAt: [],               // timestamps of points scored on this player
    critterUntil: 0,            // > now while this player is a playable possum
    honkSince: 0,               // when this player entered the HONK zone (0 = not in it)
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
const isCritter = (p, now) => p.critterUntil > now;

function startPossum(world, p, now, by = null, ms = CONSTS.possumMs) {
  p.possumUntil = now + ms;
  p.possumImmuneUntil = p.possumUntil + CONSTS.possumImmuneMs;
  p.possumHits = 0;
  world.events.push({ type: 'possum', id: p.id, name: p.name, x: p.x, y: p.y, by: by ? by.name : null });
}

function becomeCritter(world, p, now) {
  p.critterUntil = now + CONSTS.critterMs;
  p.possumUntil = 0;
  p.possumImmuneUntil = 0;
  p.possumHits = 0;
  p.bumpedAt = [];
  world.events.push({ type: 'transform', id: p.id, name: p.name, x: p.x, y: p.y });
}

/** Called when `p` has a full point scored on them. Three inside the window and they transform. */
function noteBumped(world, p, now) {
  const { bumpsToTransform, transformWindowMs } = CONSTS;
  p.bumpedAt = p.bumpedAt.filter((t) => now - t <= transformWindowMs);
  p.bumpedAt.push(now);
  if (p.bumpedAt.length >= bumpsToTransform) becomeCritter(world, p, now);
}

function movePlayer(p, dt, now) {
  if (p.possumUntil && now >= p.possumUntil) {
    p.possumUntil = 0;
    p.possumHits = 0;
  }
  if (p.critterUntil && now >= p.critterUntil) p.critterUntil = 0;
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
  if (!isPossum(p, now) && !isCritter(p, now) && now >= p.possumImmuneUntil) {
    p.ix += dx * 260; p.iy += dy * 260;
    startPossum(world, p, now);
  }
}

// ---------- the goose ----------
function inHonkZone(p) {
  const z = CONSTS.goose.honk;
  return p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
}

function spawnGoose(world, summoner, now) {
  const g = CONSTS.goose;
  world.goose = {
    x: g.r + 10, y: g.r + 10,          // opposite corner from the HONK zone
    vx: 0, vy: 0,
    targetId: summoner.id,
    until: now + g.ms,
    bounceUntil: 0,
    summoner: summoner.name,
  };
  world.events.push({ type: 'goose', id: summoner.id, name: summoner.name });
}

function chargeHonk(world, p, now) {
  if (!inHonkZone(p) || isPossum(p, now) || isCritter(p, now)) { p.honkSince = 0; return; }
  if (!p.honkSince) p.honkSince = now;
  if (!world.goose && now - p.honkSince >= CONSTS.goose.honkMs) {
    p.honkSince = 0;
    spawnGoose(world, p, now);
  }
}

function pickGooseTarget(world, g, now) {
  const cur = world.players.get(g.targetId);
  if (cur && !isPossum(cur, now)) return cur;
  let best = null, bestD = Infinity;
  for (const p of world.players.values()) {
    if (isPossum(p, now)) continue;
    const d = Math.hypot(p.x - g.x, p.y - g.y);
    if (d < bestD) { best = p; bestD = d; }
  }
  g.targetId = best ? best.id : null;
  return best;
}

function stepGoose(world, dt, now) {
  const g = world.goose;
  if (!g) return;
  if (now >= g.until) { world.goose = null; world.events.push({ type: 'gooseGone' }); return; }
  const C = CONSTS.goose;
  let dx, dy;
  if (now < g.bounceUntil) {
    dx = g.vx; dy = g.vy;                      // keep going the way we bounced
  } else {
    const t = pickGooseTarget(world, g, now);
    dx = (t ? t.x : ARENA.w / 2) - g.x;
    dy = (t ? t.y : ARENA.h / 2) - g.y;
  }
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, C.steer * dt);
  g.vx += (dx / d * C.speed - g.vx) * k;
  g.vy += (dy / d * C.speed - g.vy) * k;
  g.x = clamp(g.x + g.vx * dt, C.r, ARENA.w - C.r);
  g.y = clamp(g.y + g.vy * dt, C.r, ARENA.h - C.r);
}

function collideGoose(world, p, now) {
  const g = world.goose;
  if (!g) return;
  const C = CONSTS.goose;
  const { R } = CONSTS;
  let dx = p.x - g.x, dy = p.y - g.y;
  let d = Math.hypot(dx, dy);
  if (d >= R + C.r) return;
  if (d < 0.001) { dx = 1; dy = 0; d = 1; }
  const nx = dx / d, ny = dy / d;
  const overlap = R + C.r - d;
  p.x += nx * overlap; p.y += ny * overlap;     // the goose does not yield
  if (Math.abs(nx) > Math.abs(ny)) {
    // hit them in the side
    if (isPossum(p, now) || now < p.possumImmuneUntil) return;
    p.score = Math.max(0, p.score - C.penalty);
    p.critterUntil = 0;
    p.ix += nx * 400; p.iy += ny * 400;
    startPossum(world, p, now, null, C.possumMs);
    world.events.push({ type: 'goosed', id: p.id, name: p.name, x: p.x, y: p.y, score: p.score, penalty: C.penalty });
    g.targetId = null;
  } else {
    // top or bottom: the goose bounces off and comes back around
    g.vx = -g.vx * 0.5 + nx * -C.speed * 0.6;
    g.vy = -ny * C.speed;
    g.bounceUntil = now + 450;
    p.iy += ny * 260;
  }
}

// A playable possum touching a player: the player plays dead, the possum scores.
function critterTouch(world, critter, victim, nx, ny, now) {
  if (isPossum(victim, now) || now < victim.possumImmuneUntil) return;
  victim.ix += nx * 300; victim.iy += ny * 300;
  startPossum(world, victim, now, critter);
  critter.score += 1;
  world.events.push({
    type: 'bump', via: 'possum',
    x: victim.x, y: victim.y,
    scorer: critter.id, scorerName: critter.name,
    victim: victim.id, victimName: victim.name,
    partial: false, hits: 0, score: critter.score,
  });
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

  const aCritter = isCritter(a, now), bCritter = isCritter(b, now);
  if (aCritter || bCritter) {
    if (aCritter && bCritter) return;          // two possums just bounce
    if (aCritter) critterTouch(world, a, b, nx, ny, now);
    else critterTouch(world, b, a, -nx, -ny, now);
    return;
  }

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
      noteBumped(world, bot, now);
    } else {
      ev.partial = true;
      ev.hits = bot.possumHits;
    }
  } else {
    top.score += 1;
    noteBumped(world, bot, now);
  }
  if (!ev.partial) ev.score = top.score;
  world.events.push(ev);
}

function step(world, dt, now = Date.now()) {
  const { R } = CONSTS;
  const players = [...world.players.values()];
  for (const p of players) movePlayer(p, dt, now);
  stepOpossum(world, dt, now);
  stepGoose(world, dt, now);
  for (const p of players) collideOpossum(world, p, now);
  for (const p of players) collideGoose(world, p, now);
  for (const p of players) chargeHonk(world, p, now);
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
    const critter = isCritter(p, now);
    players.push({
      id: p.id, name: p.name,
      x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10,
      score: p.score,
      possum,
      hits: possum ? p.possumHits : 0,
      possumLeft: possum ? p.possumUntil - now : 0,
      critter,
      critterLeft: critter ? p.critterUntil - now : 0,
      bot: !!p.bot,
    });
  }
  const honk = [];
  for (const p of world.players.values()) {
    if (p.honkSince) honk.push({ id: p.id, name: p.name, progress: Math.min(1, (now - p.honkSince) / CONSTS.goose.honkMs) });
  }
  const o = world.opossum;
  const g = world.goose;
  return {
    players,
    opossum: o ? { x: Math.round(o.x * 10) / 10, y: Math.round(o.y), dir: o.dir } : null,
    goose: g ? { x: Math.round(g.x * 10) / 10, y: Math.round(g.y * 10) / 10, dir: g.vx < 0 ? -1 : 1, targetId: g.targetId, left: g.until - now } : null,
    honk,
  };
}

module.exports = { ARENA, CONSTS, createWorld, addPlayer, removePlayer, setInput, step, snapshot, isPossum, isCritter, inHonkZone };
