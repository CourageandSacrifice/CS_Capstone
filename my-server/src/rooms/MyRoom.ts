import { Room, Client, CloseCode } from "colyseus";
import { MyRoomState, PlayerState } from "./schema/MyRoomState.js";

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
const RESPAWN_DELAY = 5000;

const PLAYER_COLORS = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12];

export class MyRoom extends Room {
  maxClients = 4;
  state = new MyRoomState();
  private playerIndex = 0;
  private lastAttackTime = new Map<string, number>();
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

    attack: (client: Client, message: { targetId: string }) => {
      const attacker = this.state.players.get(client.sessionId);
      if (!attacker || !attacker.alive) return;

      const targetId = message.targetId;
      const target = this.state.players.get(targetId);
      if (!target || !target.alive) return;

      // Rate limit
      const now = Date.now();
      const last = this.lastAttackTime.get(client.sessionId) ?? 0;
      if (now - last < ATTACK_RATE) return;

      // Distance check
      const dx = attacker.x - target.x;
      const dy = attacker.y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > ATTACK_RANGE) return;

      this.lastAttackTime.set(client.sessionId, now);

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
  }

  onCreate (options: any) {
    console.log("Room created!");
  }

  onJoin (client: Client, options: any) {
    if (!this.hostId) this.hostId = client.sessionId;
    const spawn = SPAWN_POINTS[this.playerIndex % SPAWN_POINTS.length];
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
      : "julz";

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
    console.log(client.sessionId, "left! Players:", this.state.players.size);
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}
