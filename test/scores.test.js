'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Scores = require('../server/scores');
const game = require('../server/game');

test('all-time keeps the top 10 sessions, latest keeps the last 10 departures, and it persists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-scores-'));
  const s = new Scores(dir);
  const w = game.createWorld(0);
  for (let i = 0; i < 12; i++) {
    const p = game.addPlayer(w, String(i), `p${i}`, i);
    p.score = i;
    s.noteScore(p, 100 + i);
  }
  assert.equal(s.data.allTime.length, 10);
  assert.equal(s.data.allTime[0].name, 'p11');
  assert.equal(s.data.allTime[9].name, 'p2');

  const champ = w.players.get('3');
  champ.score = 50;
  assert.equal(s.noteScore(champ, 200), true);
  assert.equal(s.data.allTime[0].name, 'p3');
  assert.equal(s.data.allTime.filter((e) => e.name === 'p3').length, 1, 'one row per session');

  for (let i = 0; i < 12; i++) s.recordDeparture(w.players.get(String(i)), 300 + i);
  assert.equal(s.data.latest.length, 10);
  assert.equal(s.data.latest[0].name, 'p11');

  s.flush();
  const reloaded = new Scores(dir);
  assert.equal(reloaded.data.allTime[0].name, 'p3');
  assert.equal(reloaded.data.latest.length, 10);
  const summary = reloaded.summary(w);
  assert.deepEqual(Object.keys(summary), ['current', 'latest', 'allTime']);
  assert.equal(summary.current[0].name, 'p3');
  clearInterval(s.timer); clearInterval(reloaded.timer);
  fs.rmSync(dir, { recursive: true, force: true });
});
