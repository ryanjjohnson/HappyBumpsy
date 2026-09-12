# HappyBumpsy

A tiny multiplayer arena game with one objective: **tap your opponent's top with your bottom.**
Every tap is a point. Most points wins. Mind the opossum.

<p align="center"><img src="public/img/face.svg" width="160" alt="HappyBumpsy"></p>

## Rules

- Get above an opponent and drop your bottom onto their top: **+1**.
- Side-on contact just bounces. Only the player on top scores.
- An **opossum** waddles across the arena now and then. It's a solid barrier, and touching it makes you
  **play possum** for 5 seconds: you flip upside down, move at half speed, and can't bump anyone.
  You can still be bumped, but it takes **10** bumps to score a point off you.
- Get scored on **3 times within 10 seconds** and you turn into a **playable possum** for 10 seconds.
  Anyone you touch plays dead and you take the point. Nobody can score on you while you're the possum,
  and the wild opossum leaves you alone.
- Loiter in the **HONK** box in the bottom-right corner for 15 seconds and a Canada goose is released from
  the top-left corner. It chases players for 20 seconds, the summoner first. A hit in your **side** means 20 seconds
  playing dead and 30 seconds as 👁️👄👁️. Meet it with your top or bottom and it bounces off.
- A **greylag goose** drifts through now and then, meandering up and down and parking herself in front of whoever's
  nearest. She usually brings 2 or 3 goslings in single file. She's harmless until someone bumps a gosling: then the
  head goes down and she sprints after them. Caught, you're a **quivering pile of mint jelly** for 10 seconds, unable
  to move, and 👁️👄👁️ for 30. Once you've been jellied, bumping a gosling sets your score to **exactly 67**
  (and re-arms her).
- **No penalty ever costs points.** The 👁️👄👁️ form is purely cosmetic: you play on as normal, you just look like that.
- Join an empty arena and two house bots show up: **Wuhhhhh** hunts you, **Heeeeeyyyyy** mostly wanders.
  They leave when the last human does, and they don't get on the score tables.
- Scores stick around: the join screen shows who's playing now, the latest scores of people who left,
  and the all-time top 10.

## Controls

- **Mouse / touch**: your bumpsy chases the pointer.
- **WASD** (or arrow keys): drive directly. Whichever you used last wins.

## Run it locally

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # restarts on file changes
npm test           # simulation + scorekeeping tests (node:test)
```

Open two browser tabs, pick two names, and bump.

## How it's built

- `server/game.js`: the whole simulation, pure and unit-tested. 30 Hz server-authoritative tick:
  movement, player/player bumps, opossum spawning, possum state.
- `server/scores.js`: all-time top 10 and the 10 latest departures, persisted to `data/scores.json`.
- `server/index.js`: Express serves `public/`, `ws` carries `join` / `input` / `state` / `scores` messages.
- `public/`: dependency-free SVG front end. Player art is `img/face.svg`, the opossum is `img/opossum.svg`;
  the client loads them into `<symbol>`s at boot. Names run around each face on a circular `textPath`.

Env vars: `PORT` (default 3000), `DATA_DIR` (default `./data`).

## Deploying (free) with GitHub Actions + Render

The workflow in `.github/workflows/deploy.yml` runs the tests on every push and PR, and on pushes to
`main` it triggers a deploy on [Render](https://render.com)'s free tier.

1. Sign in to Render with GitHub and create a **Blueprint** from this repo. It reads `render.yaml`
   and creates a free Node web service named `happybumpsy` with auto-deploy switched off.
2. In the service's **Settings → Deploy Hook**, copy the hook URL.
3. In the GitHub repo, add a secret named `RENDER_DEPLOY_HOOK_URL` with that URL
   (Settings → Secrets and variables → Actions), or from a terminal:

   ```bash
   gh secret set RENDER_DEPLOY_HOOK_URL
   ```

4. Push to `main`. Tests run, then Render builds and deploys. First deploy takes a couple of minutes;
   the URL is `https://happybumpsy.onrender.com` (or whatever Render assigned).

Notes on the free tier: the service sleeps after ~15 minutes without traffic and takes ~30 s to wake,
and its disk is ephemeral, so the all-time high score table resets on every deploy or restart.
To keep scores across deploys, point `DATA_DIR` at a paid persistent disk, or swap `server/scores.js`
for a hosted store. Until the secret is set, the deploy job just logs that it was skipped, so CI stays green.
