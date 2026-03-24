import Phaser from 'phaser';
import {
  MAP_DATA,
  TILE_SIZE,
  TILE,
  MAP_W,
  MAP_H,
  setGamePhase,
  BUILDINGS,
} from '../map/CampusMap';
import { ClassData, DEFAULT_CLASS, CHARACTERS } from '../data/Classes';
import { Player } from '../entities/Player';
import { RemotePlayer } from '../entities/RemotePlayer';
import { sendPosition, sendAttack, sendSwing, sendEndGame } from '../network/Network';
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
  private campusMapGraphics?: Phaser.GameObjects.Graphics;
  private gamePhase: 'waiting' | 'playing' = 'waiting';
  private countdownActive = false;

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

    // Start in waiting room (20×20 tiles)
    const waitW = 20 * TILE_SIZE;
    const waitH = 20 * TILE_SIZE;
    this.drawWaitingRoom();

    // Spawn at center of waiting room; server will update position on first state sync
    const spawnX = waitW / 2;
    const spawnY = waitH / 2;
    this.player = new Player(this, spawnX, spawnY, this.classData);

    // Camera — zoom to show full 30-tile waiting room
    this.cameras.main.setZoom(this.cameras.main.width / (22 * TILE_SIZE));
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
    const size = 20;

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

        // Teleport local player when the server assigns a new spawn position.
        // Only applies when the delta is large (>150px) — i.e. a server teleport, not normal movement.
        $(playerState).listen("x", () => {
          if (Math.abs(playerState.x - this.player.sprite.x) > 150) {
            this.player.sprite.x = playerState.x;
          }
        });
        $(playerState).listen("y", () => {
          if (Math.abs(playerState.y - this.player.sprite.y) > 150) {
            this.player.sprite.y = playerState.y;
          }
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
            // Re-attach camera to local player after respawn (may have been following killer)
            this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
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
      else if (value === 'waiting' && this.gamePhase === 'playing') this.revertToWaitingRoom();
    });

    $(state).listen('hostSessionId', (value: string) => {
      this.events.emit('hostChanged', value);
    });

    $(state).listen('gameEndTime', (value: number) => {
      if (value > 0) this.events.emit('gameEndTimeSet', value);
    });

    $(state).listen('gameOver', () => {
      if (!state.gameOver) return;
      const scores: { name: string; kills: number; deaths: number }[] = [];
      state.players.forEach((p: any) => {
        scores.push({ name: p.name, kills: p.kills, deaths: p.deaths });
      });
      scores.sort((a, b) => {
        const kdA = a.kills / Math.max(a.deaths, 1);
        const kdB = b.kills / Math.max(b.deaths, 1);
        if (kdB !== kdA) return kdB - kdA;
        return b.kills - a.kills;
      });
      this.events.emit('gameOver', scores);
    });

    room.onMessage('killed', (data: { victimId: string; killerId: string }) => {
      if (data.victimId !== room.sessionId) return;
      // Camera follows the killer so the dead player can spectate briefly
      const killer = this.remotePlayers.get(data.killerId);
      if (killer) {
        this.cameras.main.stopFollow();
        this.cameras.main.startFollow(killer.sprite, true, 0.08, 0.08);
      }
    });

    room.onMessage('attackEffect', (data: {
      attackerId: string;
      targetId: string;
      x: number;
      y: number;
      dirX: number;
      dirY: number;
    }) => {
      // Local player draws slash immediately in tryAttack — skip to avoid double-slash
      if (data.attackerId === room.sessionId) return;
      const rp = this.remotePlayers.get(data.attackerId);
      if (rp) rp.showAttackEffect(data.dirX, data.dirY);
    });
  }

  setCountdownActive(v: boolean): void {
    this.countdownActive = v;
  }

  revertToWaitingRoom(): void {
    this.gamePhase = 'waiting';
    this.countdownActive = false;

    if (this.campusMapGraphics) {
      this.campusMapGraphics.destroy();
      this.campusMapGraphics = undefined;
    }

    // Redraw waiting room
    this.drawWaitingRoom();

    // Reset camera to waiting room bounds and zoom
    const waitW = 20 * TILE_SIZE;
    const waitH = 20 * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, waitW, waitH);
    this.cameras.main.setZoom(this.cameras.main.width / (22 * TILE_SIZE));

    // Sync player to server-assigned waiting room spawn
    if (this.room) {
      const myState = (this.room.state as any).players.get(this.room.sessionId);
      if (myState) {
        this.player.sprite.x = myState.x;
        this.player.sprite.y = myState.y;
      }
    }

    this.player.playRespawn();
    this.hideEliminatedOverlay();

    // Re-attach camera to local player (may have been following killer)
    this.cameras.main.centerOn(this.player.sprite.x, this.player.sprite.y);
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);

    this.events.emit('revertedToWaiting');
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
    this.eliminatedOverlay.fillStyle(0x000000, 0.30);
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

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const tile = MAP_DATA[y][x];
        let color = 0x4a7c59; // default grass
        if (tile === TILE.PATH) color = 0x8a7a5a;
        if (tile === TILE.BUILDING) {
          // match building color by position
          for (const b of BUILDINGS) {
            if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
              color = b.color;
              break;
            }
          }
        }
        if (tile === TILE.FIELD) color = 0x2d8a4e;
        g.fillStyle(color, 1);
        g.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    // Subtle grid lines
    g.lineStyle(1, 0x000000, 0.06);
    for (let y = 0; y <= MAP_H; y++) g.lineBetween(0, y * TILE_SIZE, MAP_W * TILE_SIZE, y * TILE_SIZE);
    for (let x = 0; x <= MAP_W; x++) g.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, MAP_H * TILE_SIZE);

    g.setDepth(0);
    this.campusMapGraphics = g;
  }

  update(time: number, delta: number): void {
    if (!this.player.alive) return;

    // Block all local input during the pre-game countdown
    if (!this.countdownActive) {
      this.player.update(time, delta, this.cursors);

      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.player.dash(time);
      }
      if (this.gamePhase === 'playing' && Phaser.Input.Keyboard.JustDown(this.attackKey)) {
        this.player.tryAttack(time, this.remotePlayers, sendAttack, sendSwing);
      }

      if (this.room && time - this.lastSendTime > GameScene.SEND_INTERVAL) {
        sendPosition(this.player.x, this.player.y);
        this.lastSendTime = time;
      }

      // Player-to-player collision: push local player out of remote player bodies
      if (this.gamePhase === 'playing') {
        const MIN_DIST = 28; // ~2× the half-size of a player sprite (14px radius each)
        this.remotePlayers.forEach(rp => {
          if (!rp.alive) return;
          const dx = this.player.sprite.x - rp.sprite.x;
          const dy = this.player.sprite.y - rp.sprite.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 0 && distSq < MIN_DIST * MIN_DIST) {
            const dist = Math.sqrt(distSq);
            const push = (MIN_DIST - dist) / dist;
            this.player.sprite.x += dx * push;
            this.player.sprite.y += dy * push;
          }
        });
      }
    }

    // Always interpolate remote players (visible during countdown)
    this.remotePlayers.forEach(rp => rp.interpolate(delta));
  }
}
