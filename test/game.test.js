'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../server/game');

const { R, hitsToScore, possumMs, speed } = game.CONSTS;
const NOW = 1_000_000;
const DT = 1 / 30;

function world() {
  const w = game.createWorld(NOW);
  w.nextOpossumAt = Infinity; // keep the opossum out of these tests unless placed by hand
  return w;
}
function place(w, id, x, y) {
  const p = game.addPlayer(w, id, id, NOW);
  p.x = x; p.y = y;
  return p;
}
const bumps = (w) => w.events.filter((e) => e.type === 'bump');

test('bumping an opponent\'s top with your bottom scores a point for the one on top', () => {
  const w = world();
  const a = place(w, 'a', 500, 400);
  const b = place(w, 'b', 500, 400 + 2 * R - 6);
  game.step(w, DT, NOW);
  assert.equal(a.score, 1);
  assert.equal(b.score, 0);
  assert.equal(bumps(w).length, 1);
  assert.equal(bumps(w)[0].scorer, 'a');
  assert.equal(bumps(w)[0].partial, false);
});

test('side-on contact does not score', () => {
  const w = world();
  const a = place(w, 'a', 500, 400);
  const b = place(w, 'b', 500 + 2 * R - 6, 404);
  game.step(w, DT, NOW);
  assert.equal(a.score, 0);
  assert.equal(b.score, 0);
  assert.equal(bumps(w).length, 0);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 2 * R - 1e-6, 'players are pushed apart');
});

test('a scoring bump has a cooldown', () => {
  const w = world();
  const a = place(w, 'a', 500, 400);
  const b = place(w, 'b', 500, 400 + 2 * R - 6);
  game.step(w, DT, NOW);
  a.x = 500; a.y = 400; b.x = 500; b.y = 400 + 2 * R - 6; a.iy = 0; b.iy = 0;
  game.step(w, DT, NOW + 100);
  assert.equal(a.score, 1, 'no second point inside the cooldown');
  a.x = 500; a.y = 400; b.x = 500; b.y = 400 + 2 * R - 6; a.iy = 0; b.iy = 0;
  game.step(w, DT, NOW + 1000);
  assert.equal(a.score, 2, 'scores again after the cooldown');
});

test('a player playing possum cannot attack', () => {
  const w = world();
  const a = place(w, 'a', 500, 400);
  const b = place(w, 'b', 500, 400 + 2 * R - 6);
  a.possumUntil = NOW + possumMs;
  game.step(w, DT, NOW);
  assert.equal(a.score, 0);
  assert.equal(bumps(w).length, 0);
});

test('it takes 10 bumps to score on a player playing possum', () => {
  const w = world();
  const a = place(w, 'a', 500, 400);
  const b = place(w, 'b', 500, 400 + 2 * R - 6);
  b.possumUntil = NOW + 60_000;
  for (let i = 1; i <= hitsToScore; i++) {
    a.x = 500; a.y = 400; b.x = 500; b.y = 400 + 2 * R - 6; a.iy = 0; b.iy = 0;
    a.bumpCooldownUntil = 0;
    game.step(w, DT, NOW + i);
    if (i < hitsToScore) {
      assert.equal(a.score, 0, `no point after ${i} bumps`);
      assert.equal(b.possumHits, i);
      const ev = bumps(w).at(-1);
      assert.equal(ev.partial, true);
      assert.equal(ev.hits, i);
    }
  }
  assert.equal(a.score, 1);
  assert.equal(b.possumHits, 0, 'hit counter resets after scoring');
  assert.equal(bumps(w).at(-1).partial, false);
});

test('touching the opossum makes you play possum for 5 seconds, then you recover', () => {
  const w = world();
  const p = place(w, 'p', 800, 450);
  w.opossum = { x: 800 + R + 60, y: 450, dir: -1, speed: 0, hw: 85, hh: 34, t: 0 };
  game.step(w, DT, NOW);
  assert.ok(game.isPossum(p, NOW));
  assert.equal(p.possumUntil, NOW + possumMs);
  assert.ok(w.events.some((e) => e.type === 'possum' && e.id === 'p'));
  assert.ok(p.x <= w.opossum.x - w.opossum.hw - R + 1e-6, 'player is pushed out of the opossum');
  w.opossum = null;
  game.step(w, DT, NOW + possumMs + 1);
  assert.equal(game.isPossum(p, NOW + possumMs + 1), false);
});

test('a possum player moves at half speed', () => {
  const w = world();
  const p = place(w, 'p', 300, 300);
  game.setInput(w, 'p', { mode: 'keys', keys: { d: true } });
  game.step(w, 0.1, NOW);
  const normal = p.x - 300;
  assert.ok(Math.abs(normal - speed * 0.1) < 1e-6);
  p.x = 300;
  p.possumUntil = NOW + possumMs;
  game.step(w, 0.1, NOW + 1);
  assert.ok(Math.abs((p.x - 300) - speed * 0.05) < 1e-6);
});

test('mouse mode moves toward the target without overshooting', () => {
  const w = world();
  const p = place(w, 'p', 300, 300);
  game.setInput(w, 'p', { mode: 'mouse', target: { x: 310, y: 300 } });
  game.step(w, 0.1, NOW);
  assert.ok(Math.abs(p.x - 310) < 1e-6);
  assert.equal(p.y, 300);
});

test('players stay inside the arena', () => {
  const w = world();
  const p = place(w, 'p', 10, 10);
  game.setInput(w, 'p', { mode: 'keys', keys: { w: true, a: true } });
  game.step(w, 1, NOW);
  assert.equal(p.x, R);
  assert.equal(p.y, R);
});

test('snapshot exposes what the client needs', () => {
  const w = world();
  const p = place(w, 'p', 100, 100);
  p.possumUntil = NOW + 3000;
  p.possumHits = 4;
  const s = game.snapshot(w, NOW);
  assert.deepEqual(s.players, [{ id: 'p', name: 'p', x: 100, y: 100, score: 0, possum: true, hits: 4, possumLeft: 3000 }]);
  assert.equal(s.opossum, null);
  game.removePlayer(w, 'p');
  assert.equal(game.snapshot(w, NOW).players.length, 0);
});

test('the opossum spawns when due and leaves once it has crossed the arena', () => {
  const w = game.createWorld(NOW);
  w.nextOpossumAt = NOW;
  game.step(w, DT, NOW);
  assert.ok(w.opossum, 'spawned');
  assert.ok(w.events.some((e) => e.type === 'opossum'));
  for (let i = 0; i < 60 * 60 && w.opossum; i++) game.step(w, DT, NOW + i * 33);
  assert.equal(w.opossum, null, 'gone');
  assert.ok(w.nextOpossumAt > NOW + 15_000);
});
