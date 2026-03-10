import Phaser from 'phaser';
import {
  MAP_DATA,
  BUILDINGS,
  TILE_SIZE,
  TILE,
  MAP_W,
  MAP_H,
  setGamePhase,
} from '../map/CampusMap';
import { ClassData, DEFAULT_CLASS, CHARACTERS } from '../data/Classes';
import { Player } from '../entities/Player';
import { RemotePlayer } from '../entities/RemotePlayer';
import { sendPosition, sendAttack, sendEndGame } from '../network/Network';
import { drawSlash } from '../entities/Player';
import { Room, getStateCallbacks } from '@colyseus/sdk';

export class GameScene extends Phaser.Scene {
  player!: Player;

  private classData!: ClassData;
  private cursors!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private attackKey!: Phaser.Input.Keyboard.Key;

  private room?: Room;
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private lastSendTime = 0;
  private static readonly SEND_INTERVAL = 50; // ~20fps

  private eliminatedText?: Phaser.GameObjects.Text;
  private eliminatedOverlay?: Phaser.GameObjects.Graphics;
  private mapLayer?: Phaser.GameObjects.Graphics;
  private gamePhase: 'waiting' | 'playing' = 'waiting';

  constructor() {
    super('GameScene');
  }

  preload(): void {
    // Adventurer — one texture per state+direction; all frames are 96px wide
    for (const state of ['idle', 'run', 'attack']) {
      for (const dir of ['down', 'up', 'left', 'right']) {
        this.load.spritesheet(`adventurer_${state}_${dir}`,
          `/characters/adventurer_${state}_${dir}.png`,
          { frameWidth: 96, frameHeight: 80 });
      }
    }
  }

  init(data?: { classData?: ClassData }): void {
    this.classData = data?.classData ?? this.registry.get('classData') ?? DEFAULT_CLASS;
  }

  create(): void {
    this.createCharacterAnimations();

    // Start in waiting room (30×30 tiles)
    const waitW = 30 * TILE_SIZE;
    const waitH = 30 * TILE_SIZE;
    this.drawWaitingRoom();

    // Spawn at center of waiting room; server will update position on first state sync
    const spawnX = waitW / 2;
    const spawnY = waitH / 2;
    this.player = new Player(this, spawnX, spawnY, this.classData);

    // Camera — zoom to show ~20 tiles across
    this.cameras.main.setZoom(this.cameras.main.width / (20 * TILE_SIZE));
    this.cameras.main.setBounds(0, 0, waitW, waitH);
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
    this.cameras.main.setBackgroundColor('#1a1a2e');

    // Input
    const kb = this.input.keyboard!;
    this.cursors = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.attackKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.O);

    // HUD
    this.scene.launch('HUDScene', {
      classData: this.classData,
      gameScene: this,
    });

    this.events.emit('playerHpChanged', this.player.hp, this.player.maxHp);
  }

  /** Called by HUDScene once a room is joined/created */
  onRoomConnected(room: Room): void {
    this.room = room;

    // Wait for the first state sync before setting up listeners
    room.onStateChange.once((state: any) => {
      this.setupMultiplayer(room, state);
    });
  }

  private drawWaitingRoom(): void {
    if (this.mapLayer) { this.mapLayer.destroy(); this.mapLayer = undefined; }
    const g = this.add.graphics();
    const size = 30;

    // Interior — walkable ground
    g.fillStyle(0x4a5568, 1);
    g.fillRect(TILE_SIZE, TILE_SIZE, (size - 2) * TILE_SIZE, (size - 2) * TILE_SIZE);

    // Walls (border)
    g.fillStyle(0x2d3748, 1);
    for (let i = 0; i < size; i++) {
      g.fillRect(0, i * TILE_SIZE, TILE_SIZE, TILE_SIZE);                           // left
      g.fillRect((size - 1) * TILE_SIZE, i * TILE_SIZE, TILE_SIZE, TILE_SIZE);     // right
      g.fillRect(i * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);                           // top
      g.fillRect(i * TILE_SIZE, (size - 1) * TILE_SIZE, TILE_SIZE, TILE_SIZE);     // bottom
    }

    // Subtle grid
    g.lineStyle(1, 0x000000, 0.08);
    for (let y = 0; y <= size; y++) g.lineBetween(0, y * TILE_SIZE, size * TILE_SIZE, y * TILE_SIZE);
    for (let x = 0; x <= size; x++) g.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, size * TILE_SIZE);

    g.setDepth(0);
    this.mapLayer = g;
    setGamePhase('waiting');
  }

  startFullGame(): void {
    setGamePhase('playing');
    this.gamePhase = 'playing';

    if (this.mapLayer) { this.mapLayer.destroy(); this.mapLayer = undefined; }
    this.drawMap();
    this.drawBuildingLabels();

    const worldW = MAP_W * TILE_SIZE;
    const worldH = MAP_H * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setZoom(this.cameras.main.width / (40 * TILE_SIZE));

    // Sync local player to server-assigned spawn position
    if (this.room) {
      const myState = (this.room.state as any).players.get(this.room.sessionId);
      if (myState) {
        this.player.sprite.x = myState.x;
        this.player.sprite.y = myState.y;
      }
    }

    this.events.emit('gameStarted');
  }

  private setupMultiplayer(room: Room, state: any): void {
    const $ = getStateCallbacks(room) as any;

    // Move local player to server-assigned spawn position and show name
    const myState = state.players.get(room.sessionId);
    if (myState) {
      this.player.sprite.x = myState.x;
      this.player.sprite.y = myState.y;
      this.player.setNameLabel(myState.name);
    }

    $(state.players).onAdd((playerState: any, sessionId: string) => {
      if (sessionId === room.sessionId) {
        // Local player state listeners
        $(playerState).listen("hp", () => {
          const prevHp = this.player.hp;
          this.player.hp = playerState.hp;
          this.player.maxHp = playerState.maxHp;
          this.events.emit('playerHpChanged', playerState.hp, playerState.maxHp);
          if (playerState.hp < prevHp) {
            this.player.takeDamage(0); // flash only, no additional HP reduction
          }
        });

        $(playerState).listen("kills", () => {
          this.events.emit('playerKillsChanged', playerState.kills);
        });

        $(playerState).listen("alive", () => {
          this.player.alive = playerState.alive;
          if (!playerState.alive) {
            this.player.playDeath();
            this.showEliminatedOverlay();
          } else {
            this.player.playRespawn();
            this.hideEliminatedOverlay();
            this.player.sprite.x = playerState.x;
            this.player.sprite.y = playerState.y;
          }
        });
        return;
      }

      const resolvedClassData = CHARACTERS.find(c => c.spriteKey === playerState.spriteKey)
        ?? CHARACTERS[0];
      const remote = new RemotePlayer(
        this,
        playerState.x,
        playerState.y,
        playerState.name || sessionId.slice(0, 4),
        playerState.color,
        resolvedClassData,
      );
      remote.updateHp(playerState.hp, playerState.maxHp);
      remote.setAlive(playerState.alive);
      this.remotePlayers.set(sessionId, remote);

      $(playerState).listen("x", () => {
        const rp = this.remotePlayers.get(sessionId);
        if (rp) rp.updatePosition(playerState.x, playerState.y);
      });

      $(playerState).listen("y", () => {
        const rp = this.remotePlayers.get(sessionId);
        if (rp) rp.updatePosition(playerState.x, playerState.y);
      });

      $(playerState).listen("hp", () => {
        const rp = this.remotePlayers.get(sessionId);
        if (rp) {
          const prevHp = rp.hp;
          rp.updateHp(playerState.hp, playerState.maxHp);
          if (playerState.hp < prevHp) {
            rp.takeDamageFlash();
          }
        }
      });

      $(playerState).listen("alive", () => {
        const rp = this.remotePlayers.get(sessionId);
        if (!rp) return;
        rp.setAlive(playerState.alive);
        if (!playerState.alive) {
          rp.playDeath();
        } else {
          rp.playRespawn();
        }
      });
    }, true);

    $(state.players).onRemove((_playerState: any, sessionId: string) => {
      const remote = this.remotePlayers.get(sessionId);
      if (remote) {
        remote.destroy();
        this.remotePlayers.delete(sessionId);
      }
    });

    $(state).listen('phase', (value: string) => {
      if (value === 'playing') this.startFullGame();
    });

    $(state).listen('gameOver', () => {
      if (!state.gameOver) return;
      const scores: { name: string; kills: number }[] = [];
      state.players.forEach((p: any) => {
        scores.push({ name: p.name, kills: p.kills });
      });
      scores.sort((a, b) => b.kills - a.kills);
      this.events.emit('gameOver', scores);
    });

    room.onMessage('attackEffect', (data: {
      attackerId: string;
      targetId: string;
      x: number;
      y: number;
      dirX: number;
      dirY: number;
    }) => {
      if (data.attackerId === room.sessionId) {
        // Local player's own attack — show at their current position with facing direction
        drawSlash(this, this.player.x, this.player.y, data.dirX, data.dirY);
      } else {
        const rp = this.remotePlayers.get(data.attackerId);
        if (rp) rp.showAttackEffect(data.dirX, data.dirY);
      }
    });
  }

  getRemotePlayers(): Map<string, RemotePlayer> {
    return this.remotePlayers;
  }

  sendEndGame(): void {
    sendEndGame();
  }

  private showEliminatedOverlay(): void {
    if (this.eliminatedText) return;
    const { width, height } = this.cameras.main;

    this.eliminatedOverlay = this.add.graphics();
    this.eliminatedOverlay.fillStyle(0x000000, 0.55);
    this.eliminatedOverlay.fillRect(0, 0, width, height);
    this.eliminatedOverlay.setScrollFactor(0).setDepth(99);

    this.eliminatedText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      'ELIMINATED',
      {
        fontFamily: 'Courier New, monospace',
        fontSize: '48px',
        color: '#ff0000',
        stroke: '#000000',
        strokeThickness: 6,
        fontStyle: 'bold',
      },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(100);
  }

  private hideEliminatedOverlay(): void {
    if (this.eliminatedText) {
      this.eliminatedText.destroy();
      this.eliminatedText = undefined;
    }
    if (this.eliminatedOverlay) {
      this.eliminatedOverlay.destroy();
      this.eliminatedOverlay = undefined;
    }
  }

  private createCharacterAnimations(): void {
    const dirs = ['down', 'up', 'left', 'right'];

    // ADVENTURER — separate texture per state+direction
    const advDefs = [
      { state: 'idle',   srcState: 'idle',   fps: 8,  repeat: -1 },
      { state: 'run',    srcState: 'run',    fps: 10, repeat: -1 },
      { state: 'sprint', srcState: 'run',    fps: 14, repeat: -1 },
      { state: 'attack', srcState: 'attack', fps: 12, repeat: 0  },
    ];
    for (const def of advDefs) {
      for (const dir of dirs) {
        const key = `adventurer_${def.state}_${dir}`;
        if (this.anims.exists(key)) this.anims.remove(key);
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(`adventurer_${def.srcState}_${dir}`, { start: 0, end: 7 }),
          frameRate: def.fps,
          repeat: def.repeat,
        });
      }
    }
  }

  private drawMap(): void {
    const g = this.add.graphics();

    const tileColors: Record<number, number> = {
      [TILE.GRASS]: 0x3a7d44,
      [TILE.PATH]: 0xc2b280,
      [TILE.BUILDING]: 0x555555,
      [TILE.FIELD]: 0x4caf50,
    };

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const tile = MAP_DATA[y][x];
        let color = tileColors[tile] ?? 0x3a7d44;

        if (tile === TILE.BUILDING) {
          for (const b of BUILDINGS) {
            if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
              color = b.color;
              break;
            }
          }
        }

        g.fillStyle(color, 1);
        g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // Subtle grid
    g.lineStyle(1, 0x000000, 0.06);
    for (let y = 0; y <= MAP_H; y++) {
      g.lineBetween(0, y * TILE_SIZE, MAP_W * TILE_SIZE, y * TILE_SIZE);
    }
    for (let x = 0; x <= MAP_W; x++) {
      g.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, MAP_H * TILE_SIZE);
    }

    g.setDepth(0);
  }

  private drawBuildingLabels(): void {
    for (const b of BUILDINGS) {
      const cx = (b.x + b.w / 2) * TILE_SIZE;
      const cy = (b.y + b.h / 2) * TILE_SIZE;

      this.add
        .text(cx, cy, b.name, {
          fontFamily: 'Courier New, monospace',
          fontSize: '20px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(1);
    }
  }

  update(time: number, delta: number): void {
    if (!this.player.alive) return;

    this.player.update(time, delta, this.cursors);

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.player.dash(time);
    }
    if (this.gamePhase === 'playing' && Phaser.Input.Keyboard.JustDown(this.attackKey)) {
      this.player.tryAttack(time, this.remotePlayers, sendAttack);
    }

    // Smoothly interpolate all remote players toward their latest server position
    this.remotePlayers.forEach(rp => rp.interpolate(delta));

    // Send position to server throttled to ~20fps
    if (this.room && time - this.lastSendTime > GameScene.SEND_INTERVAL) {
      sendPosition(this.player.x, this.player.y);
      this.lastSendTime = time;
    }
  }
}
