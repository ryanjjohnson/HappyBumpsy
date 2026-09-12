'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../server/game');

const { R } = game.CONSTS;
const GL = game.CONSTS.greylag;
const NOW = 1_000_000;
const DT = 1 / 30;

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
function parkGreylag(w, x, y, goslings = 2) {
  game.spawnGreylag(w, NOW, goslings);
  const g = w.greylag;
  g.x = x; g.y = y; g.wpY = y; g.wpUntil = NOW + 60000; g.until = NOW + 60000;
  g.goslings.forEach((b, i) => { b.x = x - GL.gosling.gap * (i + 1); b.y = y; });
  return g;
}

test('the greylag arrives from a side, usually with 2 or 3 goslings, and leaves later', () => {
  const w = world();
  w.nextGreylagAt = NOW;
  game.step(w, DT, NOW);
  assert.ok(w.greylag, 'arrived');
  assert.ok([0, 2, 3].includes(w.greylag.goslings.length));
  assert.ok(w.events.some((e) => e.type === 'greylag'));
  const counts = { 0: 0, 2: 0, 3: 0 };
  for (let i = 0; i < 200; i++) { const w2 = world(); game.spawnGreylag(w2, NOW); counts[w2.greylag.goslings.length]++; }
  assert.ok(counts[2] + counts[3] > counts[0], 'she usually brings the kids');
  // wait out the visit
  let t = NOW;
  for (let i = 0; i < 60 * 130 && w.greylag; i++) { t += 33; game.step(w, DT, t); }
  assert.equal(w.greylag, null, 'gone');
  assert.ok(w.nextGreylagAt > t);
});

test('she meanders up and down and drifts toward the nearest player to get in the way', () => {
  const w = world();
  place(w, 'p', 1200, 450);
  const g = parkGreylag(w, 400, 450, 0);
  g.wpY = 800; g.wpUntil = NOW + 60000;
  game.step(w, 0.5, NOW);
  assert.ok(g.y > 450 + 60, 'moving toward her vertical waypoint');
  assert.ok(g.x > 400 + 20 && g.x < 400 + 40, 'creeping horizontally toward the player');
  assert.equal(g.nuts, null);
});

test('goslings follow in single file', () => {
  const w = world();
  const g = parkGreylag(w, 400, 450, 3);
  g.wpY = 450; g.vx = 0;
  for (let i = 0; i < 60; i++) { g.x += 4; game.step(w, DT, NOW + i * 33); }  // drag mother to the right
  let leader = g;
  for (const b of g.goslings) {
    const d = Math.hypot(leader.x - b.x, leader.y - b.y);
    assert.ok(d <= GL.gosling.gap + 1, `gosling stays within ${GL.gosling.gap} of its leader (was ${d.toFixed(1)})`);
    assert.ok(b.x < leader.x, 'behind, not ahead');
    leader = b;
  }
});

test('the mother is a solid barrier, and harmless while calm', () => {
  const w = world();
  const p = place(w, 'p', 400 + GL.r + R - 10, 450);
  p.score = 4;
  parkGreylag(w, 400, 450, 0);
  game.step(w, DT, NOW);
  assert.ok(p.x >= 400 + GL.r + R - 1e-6, 'pushed out');
  assert.equal(p.score, 4);
  assert.equal(game.isJelly(p, NOW), false);
});

test('bump a gosling and she goes nuts on you; caught, you are mint jelly (and 👁️👄👁️), no points lost', () => {
  const w = world();
  const g = parkGreylag(w, 400, 450, 2);
  const baby = g.goslings[1];
  const p = place(w, 'p', baby.x, baby.y - R - GL.gosling.r + 6);
  p.score = 42;
  game.step(w, DT, NOW);
  assert.deepEqual(g.nuts && g.nuts.targetId, 'p');
  assert.ok(w.events.some((e) => e.type === 'gooseNuts' && e.id === 'p'));
  assert.equal(p.score, 42, 'nothing lost yet');
  assert.equal(game.snapshot(w, NOW).greylag.nuts, 'p');
  // she sprints at the player
  p.x = 900; p.y = 450;
  game.step(w, 0.5, NOW + 100);
  assert.ok(g.x > 500, 'closing in fast');
  // catch
  g.x = p.x - R - GL.r + 5; g.y = p.y;
  game.step(w, DT, NOW + 200);
  assert.equal(game.isJelly(p, NOW + 200), true);
  assert.equal(p.jellyUntil, NOW + 200 + GL.jellyMs);
  assert.equal(p.score, 42, 'no points lost');
  assert.equal(game.isEyes(p, NOW + 200), true);
  assert.equal(p.jellied, true);
  assert.equal(g.nuts, null, 'calm again');
  assert.ok(w.events.some((e) => e.type === 'jellied' && e.id === 'p'));
  assert.ok(w.events.some((e) => e.type === 'gooseCalm'));
});

test('jelly cannot move, bump, or be bumped, and wears off after 10 seconds', () => {
  const w = world();
  const p = place(w, 'p', 500, 400);
  const q = place(w, 'q', 500, 400 + 2 * R - 6);
  p.jellyUntil = NOW + GL.jellyMs;
  game.setInput(w, 'p', { mode: 'keys', keys: { d: true } });
  game.step(w, 0.2, NOW);
  assert.ok(Math.abs(p.x - 500) < 1, 'did not move');
  assert.equal(p.score, 0);
  assert.equal(q.score, 0, 'no bump happened in either direction');
  game.step(w, DT, NOW + GL.jellyMs + 1);
  assert.equal(game.isJelly(p, NOW + GL.jellyMs + 1), false);
});

test('once jellied, the next gosling bump is worth exactly 67 and re-arms her', () => {
  const w = world();
  const g = parkGreylag(w, 400, 450, 2);
  const baby = g.goslings[1];
  const p = place(w, 'p', baby.x, baby.y - R - GL.gosling.r + 6);
  p.jellied = true;
  p.score = 3;
  game.step(w, DT, NOW);
  assert.equal(p.score, 67);
  assert.equal(p.jellied, false);
  assert.equal(g.nuts, null, 'no rage this time');
  assert.ok(w.events.some((e) => e.type === 'sixtyseven' && e.id === 'p' && e.score === 67));
  // and again, after the cooldown: now she is angry
  p.x = baby.x; p.y = baby.y - R - GL.gosling.r + 6;
  game.step(w, DT, NOW + 1000);
  assert.equal(p.score, 67, 'unchanged');
  assert.deepEqual(g.nuts && g.nuts.targetId, 'p');
});

test('she gives up the chase after 15 seconds', () => {
  const w = world();
  place(w, 'p', 1400, 800);
  const g = parkGreylag(w, 200, 100, 0);
  g.nuts = { targetId: 'p', until: NOW + GL.nutsMs };
  game.step(w, DT, NOW + GL.nutsMs - 1);
  assert.ok(g.nuts);
  game.step(w, DT, NOW + GL.nutsMs);
  assert.equal(g.nuts, null);
});
