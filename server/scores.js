'use strict';
const fs = require('fs');
const path = require('path');

const TOP_N = 10;
const LATEST_N = 10;

// Scorekeeping: all-time top 10 (one row per play session), and the 10 most recent departures.
// Persisted to <dir>/scores.json; writes are debounced.
class Scores {
  constructor(dir) {
    this.file = path.join(dir, 'scores.json');
    this.data = { allTime: [], latest: [] };
    this.dirty = false;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const loaded = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(loaded.allTime)) this.data.allTime = loaded.allTime;
      if (Array.isArray(loaded.latest)) this.data.latest = loaded.latest;
    } catch (_) { /* first run, or unreadable file: start fresh */ }
    this.timer = setInterval(() => this.flush(), 2000);
    this.timer.unref();
  }

  /** Record a player's current score in the all-time table. Returns true if the table changed. */
  noteScore(p, now = Date.now()) {
    const at = this.data.allTime;
    const i = at.findIndex((e) => e.sid === p.sid);
    if (i >= 0) {
      if (at[i].score >= p.score) return false;
      at[i].score = p.score;
      at[i].at = now;
    } else {
      if (at.length >= TOP_N && at[at.length - 1].score >= p.score) return false;
      at.push({ sid: p.sid, name: p.name, score: p.score, at: now });
    }
    at.sort((a, b) => b.score - a.score || a.at - b.at);
    this.data.allTime = at.slice(0, TOP_N);
    this.dirty = true;
    return true;
  }

  recordDeparture(p, now = Date.now()) {
    if (!p || p.bot) return;
    this.data.latest.unshift({ name: p.name, score: p.score, at: now, playedMs: now - p.joinedAt });
    this.data.latest = this.data.latest.slice(0, LATEST_N);
    this.dirty = true;
  }

  summary(world, now = Date.now()) {
    const current = [...world.players.values()]
      .map((p) => ({ name: p.name, score: p.score, possum: p.possumUntil > now, bot: !!p.bot }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return {
      current,
      latest: this.data.latest.map(({ name, score, at }) => ({ name, score, at })),
      allTime: this.data.allTime.map(({ name, score, at }) => ({ name, score, at })),
    };
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data));
    } catch (err) {
      console.error('scores: could not write', this.file, err.message);
    }
  }
}

module.exports = Scores;
