'use strict';
// House bots. Two of them appear when the first human joins an empty arena and
// leave when the last human does. They drive the same input path as players
// (mouse mode: walk toward a target point), so the simulation treats them alike.
const game = require('./game');

const { ARENA, CONSTS } = game;
const R = CONSTS.R;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const ROSTER = [
  { id: 'bot-wuh', name: 'Wuhhhhh', brain: 'aggressive' },
  { id: 'bot-hey', name: 'Heeeeeyyyyy', brain: 'dumb' },
];

function humans(world) {
  let n = 0;
  for (const p of world.players.values()) if (!p.bot) n++;
  return n;
}

/** Make the bot roster match the room: present iff at least one human is playing. */
function sync(world, now = Date.now()) {
  const want = humans(world) > 0;
  const have = ROSTER.some((b) => world.players.has(b.id));
  if (want && !have) {
    for (const b of ROSTER) {
      const p = game.addPlayer(world, b.id, b.name, now);
      p.bot = b.brain;
      p.brain = { nextThinkAt: now + rand(300, 900), jitter: { x: 0, y: 0 }, jitterUntil: 0, wp: null, waitUntil: 0 };
    }
    world.events.push({ type: 'bots', names: ROSTER.map((b) => b.name) });
    return 'spawned';
  }
  if (!want && have) {
    for (const b of ROSTER) game.removePlayer(world, b.id);
    return 'removed';
  }
  return null;
}

function aim(p, x, y) {
  p.mode = 'mouse';
  p.target = { x: clamp(x, R, ARENA.w - R), y: clamp(y, R, ARENA.h - R) };
}

function nearest(world, p, filter) {
  let best = null, bestD = Infinity;
  for (const o of world.players.values()) {
    if (o.id === p.id || !filter(o)) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < bestD) { best = o; bestD = d; }
  }
  return best;
}

function aggressive(world, p, now) {
  const b = p.brain;
  b.nextThinkAt = now + rand(120, 260);
  if (now > b.jitterUntil) {
    b.jitter = { x: rand(-70, 70), y: rand(-45, 45) };
    b.jitterUntil = now + rand(500, 1200);
  }
  const t = nearest(world, p, (o) => !game.isPossum(o, now)) || nearest(world, p, () => true);
  let tx, ty;
  if (!t) {
    tx = ARENA.w / 2 + Math.sin(now / 1500) * 400;
    ty = ARENA.h / 2 + Math.cos(now / 1100) * 250;
  } else {
    const dx = t.x - p.x, dy = t.y - p.y;
    if (game.isCritter(p, now)) { tx = t.x; ty = t.y; }                       // as a possum, just touch them
    else if (game.isPossum(p, now)) { tx = p.x - Math.sign(dx || 1) * 300; ty = p.y + (dy < 0 ? 250 : -250); }
    else if (game.isCritter(t, now)) { tx = t.x + Math.sign(-dx || 1) * 320; ty = t.y - 200; } // keep clear of a playable possum
    else if (p.y < t.y - R && Math.abs(dx) < 50) { tx = t.x; ty = t.y; }      // lined up above: dive
    else if (t.y < R + 30 && Math.abs(dx) < 2 * R + 20) { tx = t.x + (dx < 0 ? 1 : -1) * 220; ty = t.y + 40; } // they hug the ceiling
    else { tx = t.x + (Math.abs(dx) < 2 * R + 10 ? Math.sign(dx || 1) * 150 : 0); ty = t.y - 2 * R - 60; }
  }
  const o = world.opossum;
  if (o) {
    const ox = o.x - p.x, oy = o.y - p.y, d = Math.hypot(ox, oy) || 1;
    if (d < 260) { tx = p.x - ox / d * 300; ty = p.y - oy / d * 300; }
  }
  const g = world.goose;
  if (g) {
    const gx = g.x - p.x, gy = g.y - p.y, d = Math.hypot(gx, gy) || 1;
    if (d < 340) { tx = p.x - gx / d * 320; ty = p.y - gy / d * 320; }
  }
  const gl = world.greylag;
  if (gl) {
    const threats = gl.nuts && gl.nuts.targetId === p.id ? [gl, ...gl.goslings] : gl.goslings;
    for (const th of threats) {
      const hx = th.x - p.x, hy = th.y - p.y, d = Math.hypot(hx, hy) || 1;
      if (d < 200) { tx = p.x - hx / d * 300; ty = p.y - hy / d * 300; break; }
    }
  }
  aim(p, tx + b.jitter.x, ty + b.jitter.y);
}

function dumb(world, p, now) {
  const b = p.brain;
  b.nextThinkAt = now + 200;
  if (now < b.waitUntil) { p.mode = 'mouse'; p.target = null; return; }   // standing around, thinking about nothing
  if (b.wp && Math.hypot(b.wp.x - p.x, b.wp.y - p.y) < 24) {
    // arrived. Dawdle for a bit; a lot longer if this happens to be the HONK box.
    b.waitUntil = now + (b.wp.honk ? rand(6000, 22000) : rand(400, 3500));
    b.wp = null;
    p.target = null;
    return;
  }
  if (!b.wp) {
    const r = Math.random();
    const z = CONSTS.goose.honk;
    if (r < 0.06) b.wp = { x: z.x + z.w / 2 + rand(-30, 30), y: z.y + z.h / 2 + rand(-20, 20), honk: true };
    else if (r < 0.35) {
      const t = nearest(world, p, () => true);
      b.wp = t ? { x: t.x + rand(-80, 80), y: t.y + rand(-80, 80) } : { x: rand(R, ARENA.w - R), y: rand(R, ARENA.h - R) };
    } else b.wp = { x: rand(R, ARENA.w - R), y: rand(R, ARENA.h - R) };
  }
  aim(p, b.wp.x, b.wp.y);
}

function think(world, now = Date.now()) {
  for (const p of world.players.values()) {
    if (!p.bot || now < p.brain.nextThinkAt) continue;
    if (p.bot === 'aggressive') aggressive(world, p, now);
    else dumb(world, p, now);
  }
}

module.exports = { ROSTER, sync, think, humans };
