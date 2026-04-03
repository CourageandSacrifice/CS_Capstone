import { Room, Client, CloseCode } from "colyseus";
import { MyRoomState, PlayerState } from "./schema/MyRoomState.js";

// Generate a short memorable room code like "FIRE" or "WOLF"
const WORDS = [
  "FIRE","WOLF","BEAR","HAWK","LION","TIGER","STORM","BLADE",
  "IRON","GOLD","MOON","STAR","ROCK","BOLT","FROST","RAGE",
  "CROW","VIPER","DUKE","ACE","NOVA","DUSK","PIKE","ZEAL",
];
function makeRoomCode(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)] +
         Math.floor(Math.random() * 100).toString().padStart(2, '0');
}

const TILE_SIZE = 16;
const MAP_W = 150;
const MAP_H = 100;
const WORLD_W = MAP_W * TILE_SIZE;
const WORLD_H = MAP_H * TILE_SIZE;

// Safe spawn zone for respawns: center of map, clear of buildings.
const SPAWN_ZONE = { xMin: 68, xMax: 82, yMin: 44, yMax: 58 };

const SPAWN_ZONE_BLOCKED = new Set<string>([
    "81,48", "81,49",
  ]);

function isSpawnTileWalkable(tx: number, ty: number): boolean {
  return !SPAWN_ZONE_BLOCKED.has(`${tx},${ty}`);
}

function gameSpawnPoint(): { x: number; y: number } {
  let tx: number, ty: number;
  let attempts = 0;
  do {
    tx = SPAWN_ZONE.xMin + Math.floor(Math.random() * (SPAWN_ZONE.xMax - SPAWN_ZONE.xMin + 1));
    ty = SPAWN_ZONE.yMin + Math.floor(Math.random() * (SPAWN_ZONE.yMax - SPAWN_ZONE.yMin + 1));
    attempts++;
  } while (!isSpawnTileWalkable(tx, ty) && attempts < 100);
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
}

/**
 * Generate spread-out spawn points for game start using a jittered grid.
 * Divides the playable map into a grid of cells and picks one random point
 * per cell, guaranteeing players start far from each other.
 */
function gameStartSpawnPoints(count: number): { x: number; y: number }[] {
  const MARGIN = 8; // tile margin from map edges
  const usableW = MAP_W - 2 * MARGIN; // 134 tiles
  const usableH = MAP_H - 2 * MARGIN; // 84 tiles

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = Math.floor(usableW / cols);
  const cellH = Math.floor(usableH / rows);

  // Build a shuffled list of grid cells
  const cells: { col: number; row: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ col: c, row: r });
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, count).map(({ col, row }) => {
    // Pick a random tile within the cell (with 1-tile inner padding)
    const tx = MARGIN + col * cellW + 1 + Math.floor(Math.random() * Math.max(1, cellW - 2));
    const ty = MARGIN + row * cellH + 1 + Math.floor(Math.random() * Math.max(1, cellH - 2));
    return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
  });
}

const ATTACK_DAMAGE = 20;
const ATTACK_RANGE = 38;
const ATTACK_RATE = 450;
const HIT_COOLDOWN = 200; // how often a player can be hit
const RESPAWN_DELAY = 5000;
const FIREBALL_DAMAGE = 50;
const FIREBALL_RANGE  = 600; // generous buffer for network latency — client validates visual hit

const PLAYER_COLORS = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12];

const VALID_MAX_PLAYERS = [5, 10, 20, 30];
const WAITING_TILE_SIZE = 16;

function waitingSpawn(): { x: number; y: number } {
  const tx = 2 + Math.floor(Math.random() * 16); // tiles 2..17 inside 20×20 room
  const ty = 2 + Math.floor(Math.random() * 16);
  return { x: tx * WAITING_TILE_SIZE + 8, y: ty * WAITING_TILE_SIZE + 8 };
}

export class MyRoom extends Room {
  state = new MyRoomState();
  private playerIndex = 0;
  private lastAttackTime = new Map<string, number>();
  private lastHitTime = new Map<string, number>();
  private lastSwingTime = new Map<string, number>();
  private hostId = '';
  private joinOrder: string[] = []; // tracks join order for host migration
  private autoEndTimer?: ReturnType<typeof this.clock.setTimeout>;
  private tickInterval?: ReturnType<typeof this.clock.setInterval>;

  private transferHost(): void {
    const next = this.joinOrder[0];
    if (next) {
      this.hostId = next;
      this.state.hostSessionId = next;
      console.log(`Host transferred to ${next}`);
    }
  }

  messages = {
    move: (client: Client, message: { x: number; y: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return;

      const x = Number(message.x);
      const y = Number(message.y);
      if (isNaN(x) || isNaN(y)) return;

      // Clamp to world bounds
      player.x = Math.max(0, Math.min(WORLD_W, x));
      player.y = Math.max(0, Math.min(WORLD_H, y));
    },

    attack: (client: Client, message: { targetId: string; dirX?: number; dirY?: number }) => {
      if (this.state.phase !== "playing") return;
      const attacker = this.state.players.get(client.sessionId);
      if (!attacker || !attacker.alive) return;

      const targetId = message.targetId;
      const target = this.state.players.get(targetId);
      if (!target || !target.alive) return;

      // Rate limit attacker
      const now = Date.now();
      const last = this.lastAttackTime.get(client.sessionId) ?? 0;
      if (now - last < ATTACK_RATE) return;

      // Hit cooldown — target can only be hit once every HIT_COOLDOWN ms
      const lastHit = this.lastHitTime.get(targetId) ?? 0;
      if (now - lastHit < HIT_COOLDOWN) return;

      // Distance check
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > ATTACK_RANGE) return;

      // Directional check — target must be within ~150° cone in front of attacker
      const dirX = typeof message.dirX === 'number' ? message.dirX : 0;
      const dirY = typeof message.dirY === 'number' ? message.dirY : 1;
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dist > 0 && dirLen > 0) {
        const dot = (dx / dist) * (dirX / dirLen) + (dy / dist) * (dirY / dirLen);
        if (dot < 0.25) return; // outside ~150° cone (cos 75° ≈ 0.25)
      }

      this.lastAttackTime.set(client.sessionId, now);
      this.lastHitTime.set(targetId, now);

      target.hp -= ATTACK_DAMAGE;
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        target.deaths += 1;
        attacker.kills += 1;
        attacker.hp = attacker.maxHp;

        // Notify all clients who killed whom so they can follow the killer camera
        this.broadcast('killed', { victimId: targetId, killerId: client.sessionId });

        this.clock.setTimeout(() => {
          const spawn = gameSpawnPoint();
          target.x = spawn.x;
          target.y = spawn.y;
          target.hp = target.maxHp;
          target.alive = true;
        }, RESPAWN_DELAY);
      }
    },

    swing: (client: Client, message: { dirX?: number; dirY?: number }) => {
      if (this.state.phase !== "playing") return;
      const attacker = this.state.players.get(client.sessionId);
      if (!attacker || !attacker.alive) return;

      const now = Date.now();
      const last = this.lastSwingTime.get(client.sessionId) ?? 0;
      if (now - last < ATTACK_RATE) return;
      this.lastSwingTime.set(client.sessionId, now);

      const dirX = typeof message.dirX === 'number' ? message.dirX : 0;
      const dirY = typeof message.dirY === 'number' ? message.dirY : 1;

      this.broadcast('attackEffect', {
        attackerId: client.sessionId,
        targetId: '',
        x: attacker.x,
        y: attacker.y,
        dirX,
        dirY,
      });
    },

    fireball: (client: Client, message: { targetId: string; dirX?: number; dirY?: number }) => {
      if (this.state.phase !== 'playing') return;
      const attacker = this.state.players.get(client.sessionId);
      if (!attacker || !attacker.alive) return;
      const target = this.state.players.get(message.targetId);
      if (!target || !target.alive) return;

      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      if (Math.sqrt(dx * dx + dy * dy) > FIREBALL_RANGE) return;

      target.hp -= FIREBALL_DAMAGE;
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        target.deaths += 1;
        attacker.kills += 1;
        attacker.hp = attacker.maxHp;
        this.broadcast('killed', { victimId: message.targetId, killerId: client.sessionId });
        this.clock.setTimeout(() => {
          const spawn = gameSpawnPoint();
          target.x = spawn.x; target.y = spawn.y;
          target.hp = target.maxHp; target.alive = true;
        }, RESPAWN_DELAY);
      }
    },

    endGame: (client: Client) => {
      if (client.sessionId !== this.hostId) return;
      if (this.state.phase !== "playing") return;
      if (this.autoEndTimer) { this.autoEndTimer.clear(); this.autoEndTimer = undefined; }
      this.triggerEndGame();
    },

    startGame: (client: Client) => {
      if (client.sessionId !== this.hostId) return;
      if (this.state.phase !== "waiting") return;
      this.state.phase = "playing";
      this.lock(); // block new joins
      const GAME_DURATION = 304000; // 5 min + ~4s countdown buffer
      const GAME_DURATION_SECS = 300;
      this.state.gameEndTime = Date.now() + GAME_DURATION;
      this.state.timeRemaining = GAME_DURATION_SECS;
      this.autoEndTimer = this.clock.setTimeout(() => this.triggerEndGame(true), GAME_DURATION);
      // Delay tick by 4s to match client countdown so HUD shows 5:00 on reveal
      this.clock.setTimeout(() => {
        this.tickInterval = this.clock.setInterval(() => {
          if (this.state.timeRemaining > 0) this.state.timeRemaining--;
        }, 1000);
      }, 4000);
      const spawnPoints = gameStartSpawnPoints(this.state.players.size);
      let spawnIdx = 0;
      this.state.players.forEach((player) => {
        const spawn = spawnPoints[spawnIdx++] ?? gameSpawnPoint();
        player.x = spawn.x;
        player.y = spawn.y;
        player.hp = player.maxHp;
        player.alive = true;
      });
      console.log(`Room ${this.roomId}: game started with ${this.state.players.size} players`);
    },
  }

  private triggerEndGame(timeLimitReached = false): void {
    if (this.tickInterval) { this.tickInterval.clear(); this.tickInterval = undefined; }
    this.state.timeLimitReached = timeLimitReached;
    this.state.gameOver = true;
    this.state.gameEndTime = 0;
    this.state.timeRemaining = 0;

    // After 5s, reset room to waiting instead of disconnecting
    this.clock.setTimeout(() => {
      this.state.gameOver = false;
      this.state.timeLimitReached = false;
      this.state.phase = "waiting";
      this.unlock(); // allow new players to join again
      this.state.players.forEach((player) => {
        const spawn = waitingSpawn();
        player.x = spawn.x;
        player.y = spawn.y;
        player.hp = player.maxHp;
        player.alive = true;
        player.kills = 0;
        player.deaths = 0;
      });
      console.log(`Room ${this.roomId}: reset to waiting room`);
    }, 35000);
  }

  async onCreate (options: any) {
    this.roomId = makeRoomCode();       // sets the actual room ID used by joinById
    this.state.roomCode = this.roomId;  // synced to clients for display
    if (options?.isPrivate === true) {
      await this.setPrivate(true);
    }
    const requestedMax = Number(options?.maxPlayers);
    const validated = VALID_MAX_PLAYERS.includes(requestedMax) ? requestedMax : 10;
    this.maxClients = validated;
    this.state.maxPlayers = validated;
    console.log(`Room created! ID: ${this.roomId}`, options?.isPrivate ? "(private)" : "(public)", `maxPlayers=${validated}`);
  }

  onJoin (client: Client, options: any) {
    this.joinOrder.push(client.sessionId);
    if (!this.hostId) {
      this.hostId = client.sessionId;
      this.state.hostSessionId = client.sessionId;
    }

    const spawn = this.state.phase === "waiting"
      ? waitingSpawn()
      : gameSpawnPoint();
    const color = PLAYER_COLORS[this.playerIndex % PLAYER_COLORS.length];
    this.playerIndex++;

    const player = new PlayerState();
    player.x = spawn.x;
    player.y = spawn.y;
    player.color = color;
    player.hp = 100;
    player.maxHp = 100;
    player.alive = true;
    player.name = (typeof options?.name === "string" && options.name.trim())
      ? options.name.trim().slice(0, 16)
      : `Player${this.playerIndex}`;
    player.spriteKey = (typeof options?.spriteKey === "string" && options.spriteKey.trim())
      ? options.spriteKey.trim()
      : "archer";

    this.state.players.set(client.sessionId, player);
    console.log(client.sessionId, `joined as "${player.name}"! Players:`, this.state.players.size);
  }

  async onDrop (client: Client, code: CloseCode) {
    console.log(client.sessionId, "dropped! Allowing reconnection for 60s...");
    try {
      await this.allowReconnection(client, 60);
      console.log(client.sessionId, "reconnected!");
    } catch {
      console.log(client.sessionId, "reconnection timed out, removing player.");
      const wasHost = client.sessionId === this.hostId;
      const idx = this.joinOrder.indexOf(client.sessionId);
      if (idx !== -1) this.joinOrder.splice(idx, 1);
      this.state.players.delete(client.sessionId);
      if (wasHost) this.transferHost();
      console.log("Players remaining:", this.state.players.size);
    }
  }

  onLeave (client: Client, code: CloseCode) {
    const wasHost = client.sessionId === this.hostId;
    const idx = this.joinOrder.indexOf(client.sessionId);
    if (idx !== -1) this.joinOrder.splice(idx, 1);

    this.state.players.delete(client.sessionId);
    this.lastAttackTime.delete(client.sessionId);
    this.lastHitTime.delete(client.sessionId);
    this.lastSwingTime.delete(client.sessionId);

    if (wasHost) this.transferHost();
    console.log(client.sessionId, "left! Players:", this.state.players.size);
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
