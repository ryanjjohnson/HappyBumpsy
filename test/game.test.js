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
  assert.deepEqual(s.players, [{ id: 'p', name: 'p', x: 100, y: 100, score: 0, possum: true, hits: 4, possumLeft: 3000, critter: false, critterLeft: 0, bot: false, jelly: false, jellyLeft: 0, jellied: false, eyes: false, eyesLeft: 0, safe: false }]);
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

// ---------- playable possum ("rage possum") ----------
const { bumpsToTransform, transformWindowMs, critterMs } = game.CONSTS;

function bumpAt(w, a, b, t) {
  a.x = 500; a.y = 400; b.x = 500; b.y = 400 + 2 * R - 6; a.iy = 0; b.iy = 0;
  a.bumpCooldownUntil = 0;
  game.step(w, DT, t);
}

test('getting scored on 3 times in 10 seconds turns you into a playable possum', () => {
  const w = world();
  const a = place(w, 'a', 500, 400);
  const b = place(w, 'b', 500, 500);
  for (let i = 0; i < bumpsToTransform - 1; i++) bumpAt(w, a, b, NOW + i * 1000);
  assert.equal(game.isCritter(b, NOW + 2000), false);
  bumpAt(w, a, b, NOW + 2000);
  assert.equal(a.score, bumpsToTransform);
  assert.equal(game.isCritter(b, NOW + 2000), true);
  assert.equal(b.critterUntil, NOW + 2000 + critterMs);
  assert.ok(w.events.some((e) => e.type === 'transform' && e.id === 'b'));
  assert.equal(game.snapshot(w, NOW + 2000).players.find((p) => p.id === 'b').critter, true);
});

test('bumps spread over more than 10 seconds do not transform you', () => {
  const w = world();
  const a = place(w, 'a', 500, 400);
  const b = place(w, 'b', 500, 500);
  const gap = transformWindowMs / 2 + 500;
  for (let i = 0; i < bumpsToTransform; i++) bumpAt(w, a, b, NOW + i * gap);
  assert.equal(a.score, bumpsToTransform);
  assert.equal(game.isCritter(b, NOW + 3 * gap), false);
});

test('a playable possum flips anyone it touches and scores for it', () => {
  const w = world();
  const a = place(w, 'a', 500, 400);
  const b = place(w, 'b', 500 + 2 * R - 6, 400); // side-on, which would never score normally
  a.critterUntil = NOW + critterMs;
  game.step(w, DT, NOW);
  assert.equal(a.score, 1);
  assert.equal(game.isPossum(b, NOW), true);
  const ev = bumps(w).at(-1);
  assert.equal(ev.via, 'possum');
  assert.equal(ev.scorer, 'a');
  assert.ok(w.events.some((e) => e.type === 'possum' && e.id === 'b' && e.by === 'a'));
  // touching again while the victim is down (or immune afterwards) does not score again
  a.x = 500; a.y = 400; b.x = 500 + 2 * R - 6; b.y = 400;
  game.step(w, DT, NOW + 100);
  assert.equal(a.score, 1);
});

test('a playable possum cannot be scored on and does not do top/bottom bumps', () => {
  const w = world();
  const a = place(w, 'a', 500, 400);
  const b = place(w, 'b', 500, 400 + 2 * R - 6);
  b.critterUntil = NOW + critterMs;
  game.step(w, DT, NOW);
  assert.equal(a.score, 0, 'the player on top gets nothing');
  assert.equal(b.score, 1, 'the possum below flipped them instead');
  assert.equal(game.isPossum(a, NOW), true);
});

test('possum form wears off, and the wild opossum ignores a playable possum', () => {
  const w = world();
  const p = place(w, 'p', 800, 450);
  p.critterUntil = NOW + critterMs;
  w.opossum = { x: 800 + R + 60, y: 450, dir: -1, speed: 0, hw: 85, hh: 34, t: 0 };
  game.step(w, DT, NOW);
  assert.equal(game.isPossum(p, NOW), false, 'not flipped by the wild opossum');
  w.opossum = null;
  game.step(w, DT, NOW + critterMs + 1);
  assert.equal(game.isCritter(p, NOW + critterMs + 1), false);
  assert.equal(p.critterUntil, 0);
});

// ---------- HONK zone and the goose ----------
const G = game.CONSTS.goose;
const zoneCentre = { x: G.honk.x + G.honk.w / 2, y: G.honk.y + G.honk.h / 2 };

test('loitering in the HONK zone for 20 seconds releases a goose from the opposite corner', () => {
  const w = world();
  const p = place(w, 'p', zoneCentre.x, zoneCentre.y);
  assert.ok(game.inHonkZone(p));
  game.step(w, DT, NOW);
  game.step(w, DT, NOW + G.honkMs - 100);
  assert.equal(w.goose, null, 'not yet');
  assert.ok(game.snapshot(w, NOW + G.honkMs - 100).honk[0].progress > 0.99);
  game.step(w, DT, NOW + G.honkMs);
  assert.ok(w.goose, 'goose released');
  assert.equal(w.goose.targetId, 'p');
  assert.ok(w.goose.x < 100 && w.goose.y < 100, 'starts top-left');
  assert.ok(w.events.some((e) => e.type === 'goose' && e.name === 'p'));
});

test('leaving the HONK zone resets the charge', () => {
  const w = world();
  const p = place(w, 'p', zoneCentre.x, zoneCentre.y);
  game.step(w, DT, NOW);
  p.x = 200; p.y = 200;
  game.step(w, DT, NOW + G.honkMs / 2);
  assert.equal(p.honkSince, 0);
  p.x = zoneCentre.x; p.y = zoneCentre.y;
  game.step(w, DT, NOW + G.honkMs + 1000);
  assert.equal(w.goose, null);
});

test('the goose chases its summoner first', () => {
  const w = world();
  const p = place(w, 'p', 1300, 800);
  const q = place(w, 'q', 100, 300); // much closer to the goose than the summoner
  w.goose = { x: 60, y: 60, vx: 0, vy: 0, targetId: 'p', until: NOW + G.ms, bounceUntil: 0, summoner: 'p' };
  game.step(w, 0.5, NOW);
  assert.equal(w.goose.targetId, 'p');
  assert.ok(w.goose.x > 60 && w.goose.y > 60, 'moving toward the summoner');
  assert.ok(Math.hypot(q.x - 100, q.y - 300) < 1, 'q was not touched');
});

test('a hit in the side means 20 seconds playing dead and 30 seconds as 👁️👄👁️, no points lost; then the goose picks a new target', () => {
  const w = world();
  const p = place(w, 'p', 500, 400);
  const q = place(w, 'q', 1200, 700);
  p.score = 7;
  w.goose = { x: 500 - R - G.r + 4, y: 400, vx: G.speed, vy: 0, targetId: 'p', until: NOW + G.ms, bounceUntil: 0, summoner: 'p' };
  game.step(w, DT, NOW);
  assert.equal(p.score, 7, 'no points lost');
  assert.equal(game.isPossum(p, NOW), true);
  assert.equal(p.possumUntil, NOW + G.possumMs);
  assert.equal(game.isEyes(p, NOW), true);
  assert.equal(p.eyesUntil, NOW + game.CONSTS.eyesMs);
  assert.ok(w.events.some((e) => e.type === 'goosed' && e.id === 'p'));
  assert.ok(w.events.some((e) => e.type === 'eyes' && e.id === 'p'));
  const snap = game.snapshot(w, NOW).players.find((x) => x.id === 'p');
  assert.equal(snap.eyes, true);
  assert.equal(snap.eyesLeft, game.CONSTS.eyesMs);
  game.step(w, DT, NOW + 50);
  assert.equal(w.goose.targetId, 'q', 'moves on to the next player');
});

test('👁️👄👁️ wears off after 30 seconds and a top/bottom hit just bounces the goose', () => {
  const w = world();
  const p = place(w, 'p', 500, 400);
  p.score = 2;
  w.goose = { x: 500 - R - G.r + 4, y: 400, vx: G.speed, vy: 0, targetId: 'p', until: NOW + G.ms, bounceUntil: 0, summoner: 'p' };
  game.step(w, DT, NOW);
  assert.equal(p.score, 2);
  w.goose = null;
  game.step(w, DT, NOW + game.CONSTS.eyesMs + 1);
  assert.equal(game.isEyes(p, NOW + game.CONSTS.eyesMs + 1), false);
  assert.equal(p.eyesUntil, 0);

  const w2 = world();
  const t = place(w2, 't', 500, 400);
  t.score = 9;
  w2.goose = { x: 500, y: 400 + R + G.r - 4, vx: 0, vy: -G.speed, targetId: 't', until: NOW + G.ms, bounceUntil: 0, summoner: 't' };
  game.step(w2, DT, NOW);
  assert.equal(t.score, 9);
  assert.equal(game.isPossum(t, NOW), false);
  assert.ok(w2.goose.bounceUntil > NOW);
  assert.ok(w2.goose.vy > 0, 'bounced back downward');
});

test('the goose flies off after 20 seconds', () => {
  const w = world();
  place(w, 'p', 800, 450);
  w.goose = { x: 60, y: 60, vx: 0, vy: 0, targetId: 'p', until: NOW + G.ms, bounceUntil: 0, summoner: 'p' };
  game.step(w, DT, NOW + G.ms - 1);
  assert.ok(w.goose);
  game.step(w, DT, NOW + G.ms);
  assert.equal(w.goose, null);
  assert.ok(w.events.some((e) => e.type === 'gooseGone'));
  assert.equal(game.snapshot(w, NOW).goose, null);
});
