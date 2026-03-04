# Campus Clash

## Overview
Campus Clash is a top-down multiplayer arena game set on a college campus. Players log in with a username, choose to host or join a room from the lobby, then battle other players in real time. The game is fully deployed and playable across different devices and networks.

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
- **Backend → Fly.io** — deployed via Docker (`my-server/`)
  - Production URL: `https://campus-clash.fly.dev`
  - App name: `campus-clash`, region: `iad` (Ashburn, VA)
  - Deploy command: `fly deploy --app campus-clash` (run from `my-server/`)
  - Machine: shared-cpu-1x, 1GB RAM, `auto_stop_machines = stop`, `auto_start_machines = true`

---

## Environment Variables

### `client/.env` (committed, used in Vercel production)
```
VITE_SERVER_URL=wss://campus-clash.fly.dev
```

### `client/.env.local` (gitignored, used for local dev)
```
VITE_SERVER_URL=wss://campus-clash.fly.dev
VERCEL_OIDC_TOKEN=...  (added by Vercel CLI, do not remove)
```
> Both local dev and production connect to the Fly.io server. Never run the server locally.

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
# Connects to wss://campus-clash.fly.dev automatically
```

## Deploying the Server

```bash
cd "Campus Clash/my-server"
fly deploy --app campus-clash
fly logs --app campus-clash   # check for errors
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
│   │   ├── lobby-bg.jpg            # Campus building photo (lobby background)
│   │   └── characters/             # 26 sprite PNGs (knight, adventurer, rpgm — separate file per anim state)
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
│       │   └── Classes.ts          # 3 character class definitions (Knight, Adventurer, Warrior)
│       └── network/
│           └── Network.ts          # Colyseus client: createRoom, joinAnyRoom, reconnect, leaveRoom, sendEndGame
│
└── my-server/                      # Fly.io backend (Colyseus WebSocket server)
    ├── Dockerfile                  # node:20-alpine, npm install, tsc build, node build/index.js
    ├── fly.toml                    # Fly.io config (app=campus-clash, port=2567, http_service)
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
- `Network.ts` connects via Colyseus SDK to `wss://campus-clash.fly.dev`
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

## Character Sprite System

### 3 Characters
| Name | spriteKey | Frame size | Directional |
|------|-----------|-----------|-------------|
| Knight | `knight` | 84×84 | flipX for left |
| Adventurer | `adventurer` | 80×80 | true 4-dir sprites |
| Warrior | `rpgm` | 64×128 | down/up/side (flipX for left/right) |

### Architecture
- Separate PNG per animation state (+ direction for Adventurer): 26 total files in `client/public/characters/`
- Phaser auto-switches textures via frame data — **no `setTexture()` calls anywhere**
- Animation key convention: `{spriteKey}_{state}_{dir}` (e.g. `knight_run_down`, `adventurer_attack_left`)
- Knight anims: all 4 dirs reference same texture; `flipForLeft: true` handles left visually
- Adventurer anims: each dir references its own texture (e.g. `adventurer_run_left`); `flipForLeft: false`
- RPGM anims: left+right both reference `side` texture; `flipForLeft: true`
- Death anim exists only for Knight; Adventurer/Warrior hide sprite on death instead
- `ClassData` fields: `scale`, `flipForLeft`, `defaultTexture`, `frameWidth`, `frameHeight`

---

## Conventions
- TypeScript strict mode, ES module imports (`import`/`export`)
- Map rendering is procedural (Phaser Graphics API); characters use sprite sheets
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
| Deploy server | `cd my-server && fly deploy --app campus-clash` |
| Check server logs | `fly logs --app campus-clash` |
| Check server status | `fly status --app campus-clash` |
| Login to Fly.io | `fly auth login` |
| Login to Vercel | `vercel login` |
