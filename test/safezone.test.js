'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../server/game');

const { R } = game.CONSTS;
const Z = game.CONSTS.safe;
const G = game.CONSTS.goose;
const GL = game.CONSTS.greylag;
const NOW = 1_000_000;
const DT = 1 / 30;
const inside = { x: Z.x + Z.w / 2, y: Z.y + Z.h / 2 };

function world() {
  const w = game.createWorld(NOW);
  w.nextOpossumAt = Infinity;
  w.nextGreylagAt = Infinity;
  return w;
}
function place(w, id, x, y) {
  const p = game.addPlayer(w, id, id, NOW);
  p.x = x; p.y = y;
  return p;
}

test('the safe zone is on the left and fits four players', () => {
  assert.ok(Z.x + Z.w < game.ARENA.w / 4, 'left side');
  assert.ok(Z.w >= 2 * R + 20 && Z.h >= 4 * 2 * R, 'room to stack four');
  const w = world();
  const p = place(w, 'p', inside.x, inside.y);
  assert.ok(game.inSafeZone(p));
  assert.equal(game.snapshot(w, NOW).players[0].safe, true);
});

test('nobody scores on a player in the safe zone, and a player in it cannot score', () => {
  const w = world();
  const a = place(w, 'a', inside.x, inside.y - 2 * R + 6);   // above, overlapping
  const b = place(w, 'b', inside.x, inside.y);
  game.step(w, DT, NOW);
  assert.equal(a.score, 0);
  assert.equal(b.score, 0);
  assert.equal(w.events.filter((e) => e.type === 'bump').length, 0);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 2 * R - 1e-6, 'still pushed apart');
});

test('the wild opossum and a rage possum cannot flip a player in the safe zone', () => {
  const w = world();
  const p = place(w, 'p', inside.x, inside.y);
  w.opossum = { x: inside.x + 20, y: inside.y, dir: -1, speed: 0, hw: 85, hh: 34, t: 0 };
  game.step(w, DT, NOW);
  assert.equal(game.isPossum(p, NOW), false);
  w.opossum = null;
  const c = place(w, 'c', inside.x + 2 * R - 6, inside.y);
  c.critterUntil = NOW + 10000;
  game.step(w, DT, NOW + 1);
  assert.equal(game.isPossum(p, NOW + 1), false);
  assert.equal(c.score, 0);
});

test('the Canada goose ignores the safe zone and picks another target', () => {
  const w = world();
  const p = place(w, 'p', inside.x, inside.y);
  const q = place(w, 'q', 1200, 700);
  p.score = 3;
  w.goose = { x: inside.x - R - G.r + 4, y: inside.y, vx: G.speed, vy: 0, targetId: 'p', until: NOW + G.ms, bounceUntil: 0, summoner: 'p' };
  game.step(w, DT, NOW);
  assert.equal(game.isPossum(p, NOW), false);
  assert.equal(game.isEyes(p, NOW), false);
  assert.equal(w.goose.targetId, 'q');
});

test('the greylag calms down if her target reaches the safe zone, and leaves them alone there', () => {
  const w = world();
  const p = place(w, 'p', inside.x, inside.y);
  game.spawnGreylag(w, NOW, 2);
  const g = w.greylag;
  g.x = inside.x + R + GL.r - 5; g.y = inside.y; g.until = NOW + 60000; g.wpUntil = NOW + 60000; g.wpY = inside.y;
  g.goslings.forEach((b) => { b.x = inside.x + 10; b.y = inside.y; });
  g.nuts = { targetId: 'p', until: NOW + GL.nutsMs };
  game.step(w, DT, NOW);
  assert.equal(g.nuts, null, 'gave up');
  assert.equal(game.isJelly(p, NOW), false);
  assert.ok(w.events.some((e) => e.type === 'gooseCalm'));
  assert.equal(w.events.filter((e) => e.type === 'gooseNuts').length, 0, 'the goslings sitting on you do not count');
});
