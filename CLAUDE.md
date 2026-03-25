# Campus Clash

## Overview
Campus Clash is a top-down multiplayer arena game set on a college campus. Players log in with a username, choose to host or join a room from the lobby, then battle other players in real time. All rendering is procedural (no sprite sheets). The game is fully deployed and playable across different devices and networks.

---

## Tech Stack

### Frontend — `client/`
- **Phaser 3** — game engine (scenes, graphics, input, camera)
- **TypeScript** — strict mode, ES modules
- **Vite** — dev server and bundler (`npm run dev` → `localhost:5173`)
- **Colyseus SDK** (`@colyseus/sdk`) — WebSocket client connecting to the game server
- **CSS** — `src/style.css` imported via Vite, handles lobby and login screens

### Backend — `my-server/`
- **Colyseus 0.17** — WebSocket game server (rooms, state sync, schema)
- **Node.js 20 + TypeScript** — compiled with `tsc`, run with `node build/index.js`
- **Express** — HTTP layer (CORS, monitor route, `/hi` health check)
- **`@colyseus/tools`** — `defineServer`, `listen`, `monitor`, `playground` utilities
- **`@colyseus/schema`** — typed state schema synced to all clients

### Deployment
- **Frontend → Vercel** — auto-deploys from GitHub (`client/` directory)
  - Production URL: `https://cscapstone-one.vercel.app`
  - Vercel project ID: `prj_ngLa8Tu1kkdi0qtp0GSDtkRth8DC`
  - Org/team ID: `team_Mphd4bwb4tIzNdGBe1NbUbhA`
- **Backend → AWS EC2** — deployed via Docker + SSH (`my-server/`)
  - Production URL: `wss://campusclash.duckdns.org`
  - Domain: DuckDNS (`campusclash.duckdns.org`) → EC2 IP `18.226.163.181` (us-east-2)
  - Instance: SSH as `ubuntu` via `ssh -i "campus-server.pem" ubuntu@ec2-18-226-163-181.us-east-2.compute.amazonaws.com`, port 2567
  - Deploy: SSH in, git pull, docker build + run (see Key Commands)

---

## Environment Variables

### `client/.env` (committed, used in Vercel production)
```
VITE_SERVER_URL=wss://campusclash.duckdns.org
```

### `client/.env.local` (gitignored, used for local dev)
```
VITE_SERVER_URL=wss://campusclash.duckdns.org
VERCEL_OIDC_TOKEN=...  (added by Vercel CLI, do not remove)
```
> Both local dev and production connect to the AWS EC2 server. Never run the server locally.

### `my-server/.env.development` / `.env.production`
- Used by `dotenv` at runtime inside the Docker container
- Currently minimal (Colyseus template defaults)

---

## Running Locally (Frontend Only)

```bash
cd "Campus Clash/client"
npm install
npm run dev
# Opens at http://localhost:5173
# Connects to wss://campusclash.duckdns.org automatically
```

## Deploying the Server

```bash
ssh -i "campus-server.pem" ubuntu@ec2-18-226-163-181.us-east-2.compute.amazonaws.com
cd Campus-Clash/my-server
git pull
docker build -t campus-clash .
docker stop campus-clash-app || true
docker run -d --restart unless-stopped --name campus-clash-app -p 2567:2567 campus-clash
# Check logs:
docker logs campus-clash-app --tail 50
```

## Deploying the Frontend

```bash
cd "Campus Clash/client"
vercel --prod
# or push to GitHub — Vercel auto-deploys
```

---

## Project Structure

```
Campus Clash/
├── client/                         # Vercel frontend (Phaser 3 + Vite)
│   ├── index.html                  # Entry HTML, login + lobby screens
│   ├── vite.config.ts              # Vite config (MIME fix for .ts files)
│   ├── tsconfig.json               # TypeScript config (includes vite/client types)
│   ├── package.json
│   ├── .env                        # Production server URL
│   ├── .env.local                  # Local overrides (gitignored)
│   ├── public/
│   │   ├── favicon.png             # Red 16x16 favicon
│   │   └── lobby-bg.jpg            # Campus building photo (lobby background)
│   └── src/
│       ├── main.ts                 # Phaser game config, boot after lobby resolves
│       ├── lobby.ts                # Login + lobby HTML logic, returns {username, mode}
│       ├── style.css               # All CSS (login card, lobby layout, game container)
│       ├── scenes/
│       │   ├── GameScene.ts        # Main gameplay: map, players, combat, state sync
│       │   └── HUDScene.ts         # Overlay: HP bar, kills, dash, room code, buttons
│       ├── entities/
│       │   ├── Player.ts           # Local player: movement, dash (3 charges), attack
│       │   └── RemotePlayer.ts     # Network players rendered from server state
│       ├── map/
│       │   └── CampusMap.ts        # 200x150 tile grid (16px tiles = 3200x2400 world)
│       ├── data/
│       │   └── Classes.ts          # 7 character class definitions (name, hp, speed, weapon)
│       └── network/
│           └── Network.ts          # Colyseus client: createRoom, joinAnyRoom, reconnect, leaveRoom, sendEndGame
│
└── my-server/                      # AWS EC2 backend (Colyseus WebSocket server)
    ├── Dockerfile                  # node:22-alpine, npm install, tsc build, node build/index.js
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.build.json
    └── src/
        ├── index.ts                # Entry: listen(appConfig, PORT, ) on 0.0.0.0
        ├── app.config.ts           # defineServer: rooms, CORS middleware, /hi route, monitor
        └── rooms/
            ├── MyRoom.ts           # Game room: join/leave, movement, combat, kills, endGame
            └── schema/
                └── MyRoomState.ts  # Colyseus schema: PlayerState (x,y,hp,kills,alive,name), gameOver flag
```

---

## Game Architecture

### Lobby Flow
1. `index.html` loads login and lobby screens (hidden divs)
2. `lobby.ts` runs first — shows login if no stored username, else goes straight to lobby
3. Username saved to `localStorage`
4. Player selects HOST or JOIN, clicks PLAY
5. `main.ts` starts Phaser, sets `registry.username` and `registry.mode`
6. `HUDScene` reads mode from registry and calls `createRoom()` or `joinAnyRoom()`

### Multiplayer Flow
- `Network.ts` connects via Colyseus SDK to `wss://campusclash.duckdns.org`
- Room name: `my_room`
- `GameScene` listens to server state changes and syncs remote players
- Local player sends position updates every frame via `room.send('move', {x, y, angle})`
- Server broadcasts state to all clients using Colyseus schema

### Combat
- Local player attacks with `O` key
- Hit detection on server: attacker sends `attack` message, server checks distance
- On kill: victim HP → 0, attacker `kills++`, victim HP restored to `maxHp`
- Host can trigger end game: sends `endGame` message → server sets `gameOver = true` → all clients show leaderboard → room disposes after 5s

### Dash System
- 3 charges max
- 400ms cooldown between individual dashes
- Each used charge recharges in 3s
- If all 3 depleted: 7s penalty before first charge returns

---

## Conventions
- TypeScript strict mode, ES module imports (`import`/`export`)
- All gameplay rendering is procedural (Phaser Graphics API) — no sprite sheets
- 16px tile size, 200x150 grid = 3200x2400 world
- Tile collision via grid lookup — no physics engine
- HUD runs as a parallel Phaser scene (fixed camera overlay)
- CSS imported through Vite pipeline
- No Redis — Colyseus uses in-memory presence/driver (single server)
- CORS: `Access-Control-Allow-Origin: *` set in Express middleware

---

## Key Commands

| Task | Command |
|------|---------|
| Run frontend locally | `cd client && npm run dev` |
| Build frontend | `cd client && npm run build` |
| Deploy frontend | `cd client && vercel --prod` |
| Deploy server | SSH in + docker build + run (see Deploying the Server) |
| Check server logs | `docker logs campus-clash-app --tail 50` (on EC2) |
| SSH into server | `ssh -i "campus-server.pem" ubuntu@ec2-18-226-163-181.us-east-2.compute.amazonaws.com` |
| Login to Vercel | `vercel login` |

