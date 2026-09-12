'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../server/game');
const bots = require('../server/bots');

const NOW = 1_000_000;

test('the first human into an empty arena gets two bots; the last one out takes them along', () => {
  const w = game.createWorld(NOW);
  assert.equal(bots.sync(w, NOW), null, 'nothing to do in an empty world');
  game.addPlayer(w, '1', 'ryan', NOW);
  assert.equal(bots.sync(w, NOW), 'spawned');
  const names = [...w.players.values()].filter((p) => p.bot).map((p) => p.name).sort();
  assert.deepEqual(names, ['Heeeeeyyyyy', 'Wuhhhhh']);
  assert.ok(w.events.some((e) => e.type === 'bots'));
  assert.equal(bots.sync(w, NOW), null, 'idempotent');
  game.addPlayer(w, '2', 'sandy', NOW);
  assert.equal(bots.sync(w, NOW), null, 'second human changes nothing');
  game.removePlayer(w, '1');
  assert.equal(bots.sync(w, NOW), null);
  game.removePlayer(w, '2');
  assert.equal(bots.sync(w, NOW), 'removed');
  assert.equal(w.players.size, 0);
});

test('bots are flagged in snapshots and drive the normal input path', () => {
  const w = game.createWorld(NOW);
  const human = game.addPlayer(w, '1', 'ryan', NOW);
  human.x = 800; human.y = 450;
  bots.sync(w, NOW);
  for (let i = 0; i < 30; i++) { bots.think(w, NOW + i * 100); game.step(w, 0.1, NOW + i * 100); }
  const snap = game.snapshot(w, NOW + 3000);
  assert.deepEqual(snap.players.map((p) => p.bot), [false, true, true]);
  const wuh = w.players.get('bot-wuh');
  assert.equal(wuh.mode, 'mouse');
  assert.ok(wuh.target, 'the hunter has somewhere to be');
  assert.ok(Math.hypot(wuh.x - human.x, wuh.y - human.y) < 700, 'and it is closing in on the human');
  const hey = w.players.get('bot-hey');
  assert.ok(hey.brain.wp || hey.brain.waitUntil > NOW, 'the dawdler is either walking somewhere or standing around');
});

test('the hunter runs from the goose', () => {
  const w = game.createWorld(NOW);
  game.addPlayer(w, '1', 'ryan', NOW);
  bots.sync(w, NOW);
  const wuh = w.players.get('bot-wuh');
  wuh.x = 800; wuh.y = 450; wuh.brain.nextThinkAt = 0;
  w.goose = { x: 700, y: 450, vx: 0, vy: 0, targetId: 'bot-wuh', until: NOW + 20000, bounceUntil: 0, summoner: 'x' };
  bots.think(w, NOW);
  assert.ok(wuh.target.x > wuh.x + 100, 'target is away from the goose');
});
