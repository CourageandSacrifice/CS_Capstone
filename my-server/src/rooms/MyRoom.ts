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
const MAP_H = 105;
const WORLD_W = MAP_W * TILE_SIZE;
const WORLD_H = MAP_H * TILE_SIZE;

// Spawn positions on known path tiles (between buildings, not inside them)
const SPAWN_POINTS = [
  { x: 22 * TILE_SIZE + TILE_SIZE / 2, y: 28 * TILE_SIZE + TILE_SIZE / 2 }, // path west of Craton
  { x: 22 * TILE_SIZE + TILE_SIZE / 2, y: 42 * TILE_SIZE + TILE_SIZE / 2 }, // path south of Stadium
  { x: 22 * TILE_SIZE + TILE_SIZE / 2, y: 60 * TILE_SIZE + TILE_SIZE / 2 }, // path near Library
  { x: 55 * TILE_SIZE + TILE_SIZE / 2, y: 42 * TILE_SIZE + TILE_SIZE / 2 }, // path between Craton & Round Table
];

const ATTACK_DAMAGE = 20;
const ATTACK_RANGE = 30;
const ATTACK_RATE = 500;
const HIT_COOLDOWN = ATTACK_RATE / 2; // 250ms — how often a player can be hit
const RESPAWN_DELAY = 5000;

const PLAYER_COLORS = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12];

const VALID_MAX_PLAYERS = [5, 10, 20, 30];
const WAITING_ROOM_SIZE = 30; // 30×30 tile waiting room
const WAITING_TILE_SIZE = 16;

function waitingSpawn(): { x: number; y: number } {
  const tx = 4 + Math.floor(Math.random() * 22); // tiles 4..25
  const ty = 4 + Math.floor(Math.random() * 22);
  return { x: tx * WAITING_TILE_SIZE + 8, y: ty * WAITING_TILE_SIZE + 8 };
}

export class MyRoom extends Room {
  state = new MyRoomState();
  private playerIndex = 0;
  private lastAttackTime = new Map<string, number>();
  private lastHitTime = new Map<string, number>();
  private hostId = '';

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

      // Directional check — target must be within 120° cone in front of attacker
      const dirX = typeof message.dirX === 'number' ? message.dirX : 0;
      const dirY = typeof message.dirY === 'number' ? message.dirY : 1;
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dist > 0 && dirLen > 0) {
        const dot = (dx / dist) * (dirX / dirLen) + (dy / dist) * (dirY / dirLen);
        if (dot < 0.5) return; // outside 120° cone (cos 60° = 0.5)
      }

      this.lastAttackTime.set(client.sessionId, now);
      this.lastHitTime.set(targetId, now);

      // Broadcast attack visual to all clients
      this.broadcast('attackEffect', {
        attackerId: client.sessionId,
        targetId,
        x: attacker.x,
        y: attacker.y,
        dirX,
        dirY,
      });

      target.hp -= ATTACK_DAMAGE;
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        attacker.kills += 1;
        attacker.hp = attacker.maxHp;

        this.clock.setTimeout(() => {
          const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
          target.x = spawn.x;
          target.y = spawn.y;
          target.hp = target.maxHp;
          target.alive = true;
        }, RESPAWN_DELAY);
      }
    },

    endGame: (client: Client) => {
      if (client.sessionId !== this.hostId) return;
      this.state.gameOver = true;
      // Disconnect all clients after a short delay so clients can show the screen
      this.clock.setTimeout(() => {
        this.disconnect();
      }, 5000);
    },

    startGame: (client: Client) => {
      if (client.sessionId !== this.hostId) return;
      if (this.state.phase !== "waiting") return;
      this.state.phase = "playing";
      this.lock(); // block new joins
      let i = 0;
      this.state.players.forEach((player) => {
        const spawn = SPAWN_POINTS[i++ % SPAWN_POINTS.length];
        player.x = spawn.x;
        player.y = spawn.y;
        player.hp = player.maxHp;
        player.alive = true;
      });
      console.log(`Room ${this.roomId}: game started with ${this.state.players.size} players`);
    },
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
    if (!this.hostId) this.hostId = client.sessionId;
    const spawn = this.state.phase === "waiting"
      ? waitingSpawn()
      : SPAWN_POINTS[this.playerIndex % SPAWN_POINTS.length];
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
      this.state.players.delete(client.sessionId);
      console.log("Players remaining:", this.state.players.size);
    }
  }

  onLeave (client: Client, code: CloseCode) {
    this.state.players.delete(client.sessionId);
    this.lastAttackTime.delete(client.sessionId);
    this.lastHitTime.delete(client.sessionId);
    console.log(client.sessionId, "left! Players:", this.state.players.size);
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
