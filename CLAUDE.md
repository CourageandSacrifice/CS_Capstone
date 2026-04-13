# Campus Clash

## Overview
Campus Clash is a top-down multiplayer arena game set on a college campus. Players log in via Clerk authentication, choose a character in the locker, then host or join a room from the lobby. Two game modes: **Freeplay** (free-for-all deathmatch) and **Kill Confirmed** (collect tags dropped on kills to score). The game uses sprite-based character rendering with multiple animated classes. Fully deployed and playable across devices.

---

## Tech Stack

### Frontend — `client/`
- **Phaser 3** — game engine (scenes, sprites, input, camera)
- **TypeScript** — strict mode, ES modules
- **Vite** — dev server and bundler (`npm run dev` → `localhost:5173`)
- **Colyseus SDK** (`@colyseus/sdk` v0.17) — WebSocket client connecting to the game server
- **Clerk** — authentication (via `src/auth.ts`)
- **CSS** — `src/style.css` imported via Vite, handles lobby and login screens

### Backend — `my-server/`
- **Colyseus 0.17** — WebSocket game server (rooms, state sync, schema)
- **Node.js 22 + TypeScript** — compiled with `tsc`, run with `node build/index.js`
- **Express** — HTTP layer (CORS, monitor route, `/hi` health check, `/api/rooms`, `/api/stats`)
- **Prisma** — database ORM for player stats persistence
- **`@colyseus/tools`** — `defineServer`, `listen`, `monitor`, `playground` utilities
- **`@colyseus/schema`** — typed state schema synced to all clients

### Deployment
- **Frontend → Vercel** — deployed from project root (Vercel root dir = `client/`)
  - Production URL: `https://cscapstone-one.vercel.app`
  - Vercel project ID: `prj_ngLa8Tu1kkdi0qtp0GSDtkRth8DC`
  - Org/team ID: `team_Mphd4bwb4tIzNdGBe1NbUbhA`
  - **Deploy from project root**: `cd "Campus Clash" && vercel --prod` (NOT from `client/`)
- **Backend → AWS EC2** — deployed via Docker + SSH (`my-server/`)
  - Production URL: `wss://campusclash.duckdns.org`
  - Domain: DuckDNS (`campusclash.duckdns.org`) → EC2 IP `18.226.163.181` (us-east-2)
  - Instance: SSH as `ubuntu`, port 2567
  - Repo path on EC2: `~/CS_Capstone` (NOT `~/Campus-Clash`)

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
# Opens at http://localhost:5173 (or next available port)
# Connects to wss://campusclash.duckdns.org automatically
```

## Deploying the Server

```bash
ssh -i "/Users/carsonhoward6/Downloads/campus-server.pem" ubuntu@ec2-18-226-163-181.us-east-2.compute.amazonaws.com
cd ~/CS_Capstone
git pull origin feature/fireball-improvements   # or main after merge
cd my-server
docker build -t campus-clash .
docker stop campus-clash-app && docker rm campus-clash-app
docker run -d --restart unless-stopped --name campus-clash-app -p 2567:2567 campus-clash
docker logs campus-clash-app --tail 20
```

If git pull fails with divergent branches:
```bash
git reset --hard origin/feature/fireball-improvements
```

## Deploying the Frontend

```bash
cd "Campus Clash"
vercel --prod
# IMPORTANT: run from project root, NOT from client/ subdirectory
```

---

## Project Structure

```
Campus Clash/
├── client/                         # Vercel frontend (Phaser 3 + Vite)
│   ├── index.html                  # Entry HTML, login + lobby + locker screens
│   ├── vite.config.ts              # Vite config
│   ├── tsconfig.json               # TypeScript config
│   ├── package.json
│   ├── .env                        # Production server URL
│   ├── .env.local                  # Local overrides (gitignored)
│   ├── public/
│   │   ├── favicon.png             # Red 16x16 favicon
│   │   ├── lobby-bg.jpg            # Campus building photo (lobby background)
│   │   ├── lobby-pixel-bg.png      # Pixel art lobby background
│   │   ├── campus-map.png          # Full campus map image
│   │   ├── kill-tag.png            # Gold knight coin (Kill Confirmed tag)
│   │   ├── fireball-pickup.png     # Fireball pickup sprite
│   │   ├── fireball-sheet.png      # Fireball animation spritesheet
│   │   ├── health-pickup.png       # Health pickup sprite
│   │   └── characters/             # Character spritesheets (per state+direction)
│   │       ├── adventurer_*.png    # Adventurer: idle/run/attack × 4 dirs (96×80 frames)
│   │       ├── scout_*.png         # Scout: idle/run/attack/dash/death × 4 dirs (48×64 frames)
│   │       └── lancer_*.png        # Lancer: idle/run/attack/dash/death × 4 dirs (48×64 frames)
│   └── src/
│       ├── main.ts                 # Phaser game config, boot after lobby resolves
│       ├── lobby.ts                # Login + lobby + locker + room browser logic
│       ├── auth.ts                 # Clerk authentication
│       ├── style.css               # All CSS (login, lobby, locker, game container, room browser)
│       ├── scenes/
│       │   ├── GameScene.ts        # Main gameplay: map, players, combat, pickups, tags, state sync
│       │   └── HUDScene.ts         # Overlay: HP bar, kills, confirmed kills, dash, timer, minimap, kill feed
│       ├── entities/
│       │   ├── Player.ts           # Local player: movement, dash (3 charges), attack, sprite animations
│       │   └── RemotePlayer.ts     # Network players: sprite-based rendering from server state
│       ├── map/
│       │   └── CampusMap.ts        # 150×100 tile grid (16px tiles = 2400×1600 world), bitmask collision
│       ├── data/
│       │   └── Classes.ts          # 3 character class definitions (ClassData interface)
│       └── network/
│           └── Network.ts          # Colyseus client: room management, message senders, room listing
│
└── my-server/                      # AWS EC2 backend (Colyseus WebSocket server)
    ├── Dockerfile                  # node:22-alpine, npm install, prisma generate, tsc build
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.build.json
    ├── prisma/
    │   └── schema.prisma           # Database schema (User, PlayerStats)
    ├── prisma.config.ts            # Prisma config
    └── src/
        ├── index.ts                # Entry: listen on 0.0.0.0:2567
        ├── db.ts                   # Prisma client initialization
        ├── app.config.ts           # defineServer: rooms, API routes, CORS, monitor
        └── rooms/
            ├── MyRoom.ts           # Game room: join/leave, movement, combat, kills, tags, endGame
            └── schema/
                └── MyRoomState.ts  # Colyseus schema: PlayerState + MyRoomState
```

---

## Game Modes

### Freeplay (FFA)
- Default mode. Kill other players to score.
- Winner determined by K/D ratio at game end.
- Game duration: 5 minutes.

### Kill Confirmed
- On kill, a gold coin tag drops at the death location.
- **Any player** can pick up any tag for +1 confirmed kill score.
- Tags expire after **15 seconds** if not collected.
- First to **20 confirmed kills** wins, or highest at time limit.
- Server validates tag collection with **64px** distance check.
- Tags are server-authoritative (server tracks positions, ownership, expiry timers).
- HUD shows gold coin icon + "CONFIRMED" label + large counter (52px font).

---

## Schema (MyRoomState.ts)

### PlayerState
| Field | Type | Description |
|-------|------|-------------|
| x, y | number | World position |
| color | number | Player color |
| name | string | Display name (max 16 chars) |
| hp | number | Current health |
| maxHp | number | Max health (class-based) |
| alive | boolean | Is player alive |
| kills | number | Total kills this round |
| deaths | number | Total deaths this round |
| spriteKey | string | Character class key |
| confirmedKills | number | Kill Confirmed score |

### MyRoomState
| Field | Type | Description |
|-------|------|-------------|
| players | Map<PlayerState> | All connected players |
| gameOver | boolean | Game over flag |
| phase | string | "waiting" or "playing" |
| maxPlayers | number | Room capacity (5/10/20/30) |
| roomCode | string | Room code (e.g., "FIRE42") |
| hostSessionId | string | Session ID of room host |
| gameEndTime | number | Unix timestamp of game end |
| timeRemaining | number | Seconds left in game |
| timeLimitReached | boolean | Did timer trigger end |
| pickupSeed | number | Seeded RNG for pickup spawns |
| gameMode | string | "ffa" or "killConfirmed" |
| scoreLimit | number | KC win threshold (20) |

---

## Character Classes

| Class | spriteKey | HP | Speed | Damage | Range | Rate | Frames | Scale |
|-------|-----------|-----|-------|--------|-------|------|--------|-------|
| Adventurer | adventurer | 100 | 137 | 22 | 64 | 450ms | 96×80 | 1.521 |
| Scout | scout | 75 | 165 | 15 | 90 | 550ms | 48×64 | 2.0 |
| Lancer | lancer | 125 | 110 | 30 | 90 | 550ms | 48×64 | 2.0 |

Server-side class stats (`CLASS_STATS` in MyRoom.ts):
- adventurer: maxHp=100, attackDamage=22
- scout: maxHp=75, attackDamage=15
- lancer: maxHp=125, attackDamage=30

---

## Game Architecture

### Lobby Flow
1. `index.html` loads login and lobby screens (hidden divs)
2. `lobby.ts` → `initLobby()` runs first — authenticates via Clerk, shows lobby
3. Username saved to `localStorage`, Clerk ID used for stats persistence
4. Three lobby tabs: **LOBBY** (host/join), **LOCKER** (character select), **STATS** (K/D, wins)
5. **Host options**: Public/Private toggle, Game Mode (Freeplay/Kill Confirmed), Max Players (5/10/20/30)
6. **Join options**: Random, Code, or **Browse** (room browser)
7. Room connects INSIDE lobby.ts before game canvas shows
8. `main.ts` starts Phaser, sets registry: username, clerkId, mode, isPrivate, roomCode, classData, gameMode
9. `HUDScene` and `GameScene` read from registry

### Room Browser
- **Browse** button in Join options fetches `GET /api/rooms` from server
- Server endpoint uses `matchMaker.query({ name: "my_room" })` to list rooms
- Client renders cards showing: game mode, room code, player count, status (OPEN/IN GAME), time remaining
- Private rooms filtered out client-side via `metadata.isPrivate`
- Auto-refreshes every 5 seconds while Browse tab is active
- Click card → join via `joinRoomById(roomId)`

### Pre-Game Waiting Room
- Room connects in lobby, players enter a 30×30 tile waiting room
- Host sees START GAME button (enabled when ≥2 players)
- `startGame` message: locks room, teleports players to spread spawn points, starts 5-min timer
- Attacks blocked server-side while phase !== "playing"

### Multiplayer Flow
- `Network.ts` connects via Colyseus SDK to `wss://campusclash.duckdns.org`
- Room name: `my_room`, filterBy: `['isPrivate', 'gameMode']`
- `GameScene` listens to server state changes and syncs remote players
- Local player sends position updates at ~20fps via `room.send('move', {x, y})`
- Server broadcasts state to all clients using Colyseus schema

### Combat
- Local player attacks with `O` key (melee) or `P` key (fireball)
- Hit detection on server: attacker sends `attack` message, server checks distance + cone
- Melee: class-based damage, 54px range, ~150° cone check
- Fireball: 40 damage, 600px range, max 3 carried, picked up from map
- On kill: victim HP → 0, deaths++, attacker kills++, attacker healed to max
- Kill feed broadcasts to all clients via HUDScene
- ELIMINATED overlay shows "Killed by {name}", camera follows killer during death

### Kill Confirmed Tag System
- Server-authoritative: `activeTags` Map tracks all dropped tags
- On kill in KC mode: server calls `dropTag()` → broadcasts `tagDropped` to all clients
- Client renders gold coin sprite (48×48) with bounce tween at death location
- Proximity check: client sends `collectTag` when within 24px, server validates at 64px
- `tagCollected` broadcast: shows floating "+1" text, updates `confirmedKills` state
- `tagExpired` broadcast: fades out uncollected tags after 15 seconds
- Score limit check: if confirmedKills >= 20 → `triggerEndGame()`

### Pickup System
- **Fireball pickups**: 10 spawned at game start, seeded RNG, 20s respawn, min 320px spacing
- **Health pickups**: 6 spawned, +20 HP on collect
- Collection: client detects proximity (18px), sends `pickupCollect`, server broadcasts to all
- Respawn: host client picks new position via `pickupNeedsRespawn` → `pickupRespawnPos`

### Dash System
- 3 charges max
- 400ms cooldown between individual dashes
- Each used charge recharges in 3s
- If all 3 depleted: 7s penalty before first charge returns

### Game End & Stats
- Host clicks END GAME or 5-min timer expires
- `triggerEndGame()`: saves stats to database via Prisma (kills, deaths, games, wins)
- Winner: highest K/D (Freeplay) or highest confirmedKills (Kill Confirmed)
- Leaderboard shown for 35 seconds, then room resets to waiting phase
- Room unlocks for new players after reset

---

## Server Messages

### Client → Server
| Message | Data | Description |
|---------|------|-------------|
| move | {x, y} | Position update |
| attack | {targetId, dirX, dirY} | Melee attack |
| swing | {dirX, dirY} | Attack animation (no target) |
| fireball | {targetId, dirX, dirY} | Fireball hit |
| fireballLaunched | {x, y, dirX, dirY} | Fireball visual effect |
| pickupCollect | {type, idx} | Collect fireball/health pickup |
| pickupRespawnPos | {type, idx, wx, wy} | Host sends new pickup position |
| collectTag | {tagId} | Collect a Kill Confirmed tag |
| startGame | — | Host starts the game |
| endGame | — | Host ends the game |

### Server → Client
| Message | Data | Description |
|---------|------|-------------|
| killed | {victimId, killerId, victimName, killerName, weapon} | Kill notification + feed |
| damageDealt | {x, y, damage, type} | Floating damage number |
| attackEffect | {attackerId, targetId, x, y, dirX, dirY} | Melee slash visual |
| fireballEffect | {shooterId, x, y, dirX, dirY} | Fireball projectile visual |
| pickupCollected | {type, idx, collectorId} | Pickup collected |
| pickupNeedsRespawn | {type, idx} | Request host for new position |
| pickupRespawned | {type, idx, wx, wy} | Pickup respawned at new position |
| tagDropped | {tagId, x, y, killerId, victimId} | KC tag dropped |
| tagCollected | {tagId, collectorId, collectorName} | KC tag collected |
| tagExpired | {tagId} | KC tag expired |

---

## Server API Routes

| Route | Method | Description |
|-------|--------|-------------|
| /hi | GET | Health check |
| /api/rooms | GET | List all active rooms (for room browser) |
| /api/users/sync | POST | Sync Clerk user on login |
| /api/stats/:clerkId | GET | Fetch player cumulative stats |
| /monitor | GET | Colyseus monitor dashboard |

---

## Movement & Spawn Restrictions
- All characters share the same movement bounds and spawn zones
- **Movement clamp**: 5 tiles padding on sides/bottom, 15 tiles on top
- **Game spawn points**: 5 fixed positions spread across the map
- **Waiting room spawn**: random within 20×20 tile area
- **Respawn delay**: 5 seconds after death

---

## Conventions
- TypeScript strict mode, ES module imports (`import`/`export`)
- Character rendering uses Phaser spritesheets (not procedural) — per state+direction PNGs
- 16px tile size, 150×100 grid = 2400×1600 world
- Tile collision via bitmask lookup from campus-map.png — no physics engine
- HUD runs as a parallel Phaser scene (fixed camera overlay) — kill feed renders here
- CSS imported through Vite pipeline
- No Redis — Colyseus uses in-memory presence/driver (single server)
- CORS: `Access-Control-Allow-Origin: *` set in Express middleware
- Colyseus 0.17 SDK has NO `getAvailableRooms()` — room listing uses custom `/api/rooms` endpoint with `matchMaker.query()`

---

## Key Commands

| Task | Command |
|------|---------|
| Run frontend locally | `cd client && npm run dev` |
| Build frontend | `cd client && npm run build` |
| Deploy frontend | `cd "Campus Clash" && vercel --prod` (from project root!) |
| Deploy server | SSH in → git pull → docker build + run (see Deploying the Server) |
| Check server logs | `docker logs campus-clash-app --tail 50` (on EC2) |
| SSH into server | `ssh -i "/Users/carsonhoward6/Downloads/campus-server.pem" ubuntu@ec2-18-226-163-181.us-east-2.compute.amazonaws.com` |
| EC2 repo path | `~/CS_Capstone` (not ~/Campus-Clash) |
| Type-check client | `cd client && npx tsc --noEmit` |
| Type-check server | `cd my-server && npx tsc --noEmit` (ignore Prisma/pg errors) |
| Login to Vercel | `vercel login` |

---

## Server Constants (MyRoom.ts)
| Constant | Value | Description |
|----------|-------|-------------|
| ATTACK_RANGE | 54px | Melee hit distance |
| ATTACK_RATE | 450ms | Melee cooldown |
| HIT_COOLDOWN | 200ms | Per-target hit rate limit |
| RESPAWN_DELAY | 5000ms | Death respawn time |
| FIREBALL_DAMAGE | 40 | Fireball hit damage |
| FIREBALL_RANGE | 600px | Max fireball hit distance |
| TAG_EXPIRE_TIME | 15000ms | KC tag lifetime |
| TAG_COLLECT_RANGE | 64px | Server-side tag pickup distance |
| KC_SCORE_LIMIT | 20 | Confirmed kills to win |
| GAME_DURATION | 304000ms | 5 min + 4s countdown buffer |
| VALID_MAX_PLAYERS | [5,10,20,30] | Allowed room sizes |
