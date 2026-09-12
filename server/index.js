'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const game = require('./game');
const bots = require('./bots');
const Scores = require('./scores');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const TICK_MS = 1000 / 30;
const MAX_NAME = 16;

const world = game.createWorld();
const scores = new Scores(DATA_DIR);

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, '..', 'public'), { etag: true, maxAge: 0 }));
app.get('/healthz', (_req, res) => res.json({ ok: true, players: world.players.size }));
app.get('/api/scores', (_req, res) => res.json(scores.summary(world)));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 4096 });

let nextId = 1;
const clients = new Set();

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
  const raw = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(raw);
}
function broadcastScores() {
  broadcast({ type: 'scores', ...scores.summary(world) });
}

function sanitizeName(raw) {
  const s = String(raw || '').replace(/[^\P{C}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return s || 'anon';
}

function leave(ws) {
  if (!ws.joined) return;
  ws.joined = false;
  const p = game.removePlayer(world, ws.id);
  scores.recordDeparture(p);
  const botChange = bots.sync(world);
  console.log(`- ${p && p.name} left (${p && p.score} pts) [${bots.humans(world)} humans]${botChange ? ` bots ${botChange}` : ''}`);
  broadcastScores();
}

wss.on('connection', (ws, req) => {
  ws.id = String(nextId++);
  ws.isAlive = true;
  ws.joined = false;
  clients.add(ws);
  send(ws, {
    type: 'welcome',
    id: ws.id,
    arena: game.ARENA,
    consts: {
      R: game.CONSTS.R, hitsToScore: game.CONSTS.hitsToScore, possumMs: game.CONSTS.possumMs,
      bumpsToTransform: game.CONSTS.bumpsToTransform, transformWindowMs: game.CONSTS.transformWindowMs,
      critterMs: game.CONSTS.critterMs, eyesMs: game.CONSTS.eyesMs, safe: game.CONSTS.safe, opossum: game.CONSTS.opossum, goose: game.CONSTS.goose, greylag: game.CONSTS.greylag,
    },
    ...scores.summary(world),
  });

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'join': {
        if (ws.joined) return;
        const name = sanitizeName(msg.name);
        game.addPlayer(world, ws.id, name);
        ws.joined = true;
        const botChange = bots.sync(world);
        console.log(`+ ${name} joined from ${req.socket.remoteAddress} [${bots.humans(world)} humans]${botChange ? ` bots ${botChange}` : ''}`);
        send(ws, { type: 'joined', id: ws.id, name });
        broadcastScores();
        break;
      }
      case 'input':
        if (ws.joined) game.setInput(world, ws.id, msg);
        break;
      case 'leave':
        leave(ws);
        break;
      default:
        break;
    }
  });
  ws.on('close', () => { clients.delete(ws); leave(ws); });
  ws.on('error', () => { /* handled by close */ });
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  bots.think(world, now);
  game.step(world, dt, now);
  const events = world.events.splice(0);
  let scoresChanged = false;
  for (const ev of events) {
    if (ev.type === 'bump' && !ev.partial) {
      const p = world.players.get(ev.scorer);
      if (p && !p.bot && scores.noteScore(p, now)) scoresChanged = true;
    }
  }
  if (clients.size) broadcast({ type: 'state', t: now, ...game.snapshot(world, now), events });
  if (scoresChanged) broadcastScores();
}, TICK_MS);

setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000).unref();

server.listen(PORT, () => {
  console.log(`HappyBumpsy listening on http://localhost:${PORT}  (data: ${DATA_DIR})`);
});

function shutdown() {
  scores.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
