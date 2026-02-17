# Campus Clash

## Overview
Campus Clash is a top-down multiplayer arena game set on a college campus. Players choose a class, explore the campus map, and battle each other. Currently a single-player demo with procedural graphics.

## Tech Stack
- **Frontend:** Phaser 3 + TypeScript, bundled with Vite
- **Server:** Colyseus (in `my-server/`, not used in current demo)
- **CSS:** `src/style.css` imported via Vite

## Running the Game
```bash
cd "Campus Clash/Campus Clash"
npm install
npm run dev
# Opens at http://localhost:5173
```

## Build
```bash
npm run build    # Output in dist/
npm run preview  # Preview production build
```

## Project Structure
```
Campus Clash/
├── Campus Clash/          # Phaser frontend (Vite + TypeScript)
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts            # Phaser game config & entry point
│       ├── style.css          # Global styles
│       ├── map/
│       │   └── CampusMap.ts   # 200x150 tile grid, building data
│       ├── data/
│       │   └── Classes.ts     # 7 character class definitions
│       ├── entities/
│       │   ├── Player.ts      # Player sprite, movement, combat
│       │   └── Dummy.ts       # Stationary attack targets
│       └── scenes/
│           ├── MenuScene.ts   # Title screen + class selection
│           ├── GameScene.ts   # Main gameplay scene
│           └── HUDScene.ts    # HP bar + controls overlay
├── my-server/             # Colyseus multiplayer server (future)
└── package.json
```

## Conventions
- TypeScript with strict mode enabled
- All rendering is procedural (Graphics API) — no image assets for gameplay
- 16px tile size, 200x150 grid = 3200x2400 world
- ES module imports (`import`/`export`)
- Tile collision via grid lookup, no physics engine
- HUD runs as a parallel Phaser scene (fixed overlay)
- CSS imported through Vite's CSS pipeline
