# Campus Clash

## Overview
Campus Clash is a top-down multiplayer arena game set on a college campus. Players log in with a username, choose to host or join a room from the lobby, then battle other players in real time. The game is fully deployed and playable across different devices and networks.

---

## Tech Stack

### Frontend — `client/`
- **Phaser 3** — game engine (scenes, graphics, input, camera)
- **TypeScript** — strict mode, ES modules
- **Vite** — dev server and bundler (`npm run dev` → `localhost:5173`)
- **Colyseus SDK** (`@colyseus/sdk@^0.17.31`) — WebSocket client connecting to the game server
- **CSS** — `src/style.css` imported via Vite, handles lobby and login screens

### Backend — `my-server/`
- **Colyseus 0.17** — WebSocket game server (rooms, state sync, schema)
- **Node.js 22 + TypeScript** — compiled with `tsc`, run with `node build/index.js`
- **Express** — HTTP layer (CORS, monitor route, `/hi` health check)
- **`colyseus`** — `defineServer`, `defineRoom`, `monitor`, `playground` utilities
- **`@colyseus/schema`** — typed state schema synced to all clients

### Deployment
- **Frontend → Vercel** — deploy with `vercel --prod` from `client/`
  - Production URL: `https://cscapstone-one.vercel.app`
  - Vercel project ID: `prj_ngLa8Tu1kkdi0qtp0GSDtkRth8DC`
  - Org/team ID: `team_Mphd4bwb4tIzNdGBe1NbUbhA`
- **Backend → AWS EC2** — deployed via Docker (`my-server/`)
  - Production URL: `wss://campusclash.duckdns.org`
  - EC2 public IP: `18.208.196.236` (us-east-1)
  - Domain via DuckDNS dynamic DNS pointing to EC2 instance
  - To deploy server: SSH to EC2, `git pull`, rebuild Docker container

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
# SSH to EC2, then:
git pull
docker build -t campus-clash .
docker stop campus-clash && docker rm campus-clash
docker run -d --name campus-clash -p 2567:2567 campus-clash
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
│       ├── lobby.ts                # Login + lobby HTML logic, returns {username, mode, roomCode, classData}
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
│           └── Network.ts          # Colyseus client: createRoom, joinAnyRoom, joinRoom, reconnect, leaveRoom
│
└── my-server/                      # AWS EC2 backend (Colyseus WebSocket server)
    ├── Dockerfile                  # node:22-alpine, npm install, tsc build, node build/index.js
    ├── nginx.conf                  # nginx reverse proxy config (SSL termination → port 2567)
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.build.json
    └── src/
        ├── index.ts                # Entry: listen(appConfig, PORT) on 0.0.0.0
        ├── app.config.ts           # defineServer: rooms (filterBy isPrivate+roomCode), CORS, /hi, monitor
        └── rooms/
            ├── MyRoom.ts           # Game room: join/leave, movement, combat, kills, endGame, startGame
            └── schema/
                └── MyRoomState.ts  # Colyseus schema: PlayerState + MyRoomState (phase, roomCode, maxPlayers)
```

---

## Game Architecture

### Lobby Flow
1. `index.html` loads login and lobby screens (hidden divs)
2. `lobby.ts` runs first — shows login if no stored username, else goes straight to lobby
3. Username saved to `localStorage`
4. Player selects HOST or JOIN, clicks PLAY
5. **HOST**: `lobby.ts` generates a room code (e.g. "WOLF07"), calls `createRoom()` with it, resolves LobbyResult
6. **JOIN RANDOM**: calls `joinAnyRoom()`, connects to any public room
7. **JOIN BY CODE**: user types code → `joinRoom(code)` uses `c.join()` with `roomCode` filter
8. `main.ts` starts Phaser, stores `username`, `mode`, `roomCode`, `classData` in registry
9. `HUDScene` reuses the already-connected room from `getRoom()`

### Room Code System
- Codes are generated client-side in `lobby.ts` before `createRoom` (e.g. "WOLF07", "BEAR42")
- Passed as a create option → server stores in `this.state.roomCode` and Colyseus `filterBy` indexes it
- Joiners use `c.join('my_room', { roomCode: 'WOLF07' })` — NOT `joinById` (which doesn't work in 0.17)
- `filterBy: ['isPrivate', 'roomCode']` means:
  - Random join (`{ isPrivate: false }`) → matches any public room, ignores roomCode ✓
  - Code join (`{ roomCode: 'WOLF07' }`) → matches that room regardless of privacy ✓
  - Private rooms never appear in random matchmaking ✓

### Multiplayer Flow
- `Network.ts` connects via Colyseus SDK to `wss://campusclash.duckdns.org`
- Room name: `my_room`
- `GameScene` listens to server state changes and syncs remote players
- Local player sends position updates every frame via `room.send('move', {x, y})`
- Server broadcasts state to all clients using Colyseus schema

### Pre-Game Waiting Room
- All players enter a 30×30 tile waiting room before the game starts
- HUD shows: WAITING ROOM title, player count (X / max), room code, COPY CODE button
- **START GAME button** (host only): enabled when ≥ 2 players are connected
- Host sends `startGame` → server locks room, teleports all to spawn points, sets `phase = "playing"`
- Attacks blocked server-side while `phase !== "playing"`

### Combat
- Local player attacks with `O` key
- Hit detection on server: attacker sends `attack` message, server checks distance + direction cone
- On kill: victim HP → 0, attacker `kills++`, victim HP restored to `maxHp`, respawn after 5s
- Host can trigger end game: sends `endGame` → server sets `gameOver = true` → leaderboard → room disposes after 5s

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
- Room codes: generated client-side in lobby.ts, passed as create option, indexed by Colyseus filterBy

---

## Key Commands

| Task | Command |
|------|---------|
| Run frontend locally | `cd client && npm run dev` |
| Build frontend | `cd client && npm run build` |
| Deploy frontend | `cd client && vercel --prod` |
| Build server | `cd my-server && npm run build` |
| SSH to EC2 | `ssh -i <key>.pem ec2-user@18.208.196.236` |
| Login to Vercel | `vercel login` |
