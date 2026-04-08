import Phaser from 'phaser';
import {
  TILE_SIZE,
  MAP_W,
  MAP_H,
  setGamePhase,
  setBitmask,
  getBitmask,
  buildBitmaskFromImageData,
  findSafeSpawn,
} from '../map/CampusMap';
import { ClassData, DEFAULT_CLASS, CHARACTERS } from '../data/Classes';
import { Player } from '../entities/Player';
import { RemotePlayer } from '../entities/RemotePlayer';
import { sendPosition, sendAttack, sendSwing, sendEndGame, sendFireball, sendFireballLaunched, sendPickupCollect, sendPickupRespawnPos } from '../network/Network';
import { Room, getStateCallbacks } from '@colyseus/sdk';

interface ActiveProjectile {
  sprite: Phaser.GameObjects.Sprite;
  dirX: number;
  dirY: number;
  traveled: number;
  flickering: boolean;
  flickerTimer: number;
}

interface PickupItem {
  sprite: Phaser.GameObjects.Image;
  active: boolean;
  worldX: number;
  worldY: number;
  tween?: Phaser.Tweens.Tween;
}

export class GameScene extends Phaser.Scene {
  player!: Player;

  private classData!: ClassData;
  private cursors!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private arrowKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private attackKey!: Phaser.Input.Keyboard.Key;

  private room?: Room;
  private remotePlayers: Map<string, RemotePlayer> = new Map();
  private lastSendTime = 0;
  private static readonly SEND_INTERVAL = 50; // ~20fps

  private eliminatedText?: Phaser.GameObjects.Text;
  private eliminatedOverlay?: Phaser.GameObjects.Graphics;
  private mapLayer?: Phaser.GameObjects.Graphics;
  private campusMapGraphics?: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image;
  private buildingImages: Phaser.GameObjects.Image[] = [];
  private gamePhase: 'waiting' | 'playing' = 'waiting';
  private countdownActive = false;
  private pKey!: Phaser.Input.Keyboard.Key;
  private fireballCount = 0;
  private readonly MAX_FIREBALLS = 3;
  private readonly FIREBALL_SPEED = 495;
  private readonly FIREBALL_RANGE_PX = 240;
  private readonly FIREBALL_FLICKER_PX = 208;
  private activeProjectiles: ActiveProjectile[] = [];
  private remoteProjectiles: ActiveProjectile[] = [];
  private pickupItems: PickupItem[] = [];
  private healthPickups: PickupItem[] = [];
  private validPickupTiles: { wx: number; wy: number }[] = [];
  private pickupRng: (() => number) | null = null;

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

    // Scout + Lancer — 48×64 frames (8 frames per sheet), spear weapon
    for (const sk of ['scout', 'lancer']) {
      for (const state of ['idle', 'run', 'attack', 'dash', 'death']) {
        for (const dir of ['down', 'up', 'left', 'right']) {
          this.load.spritesheet(`${sk}_${state}_${dir}`,
            `/characters/${sk}_${state}_${dir}.png`,
            { frameWidth: 48, frameHeight: 64 });
        }
      }
    }

    this.load.image('campus-map', '/campus-map.png');
    this.load.spritesheet('fireball', '/fireball-sheet.png', { frameWidth: 64, frameHeight: 32 });
    this.load.image('fireball-pickup', '/fireball-pickup.png');
    this.load.image('health-pickup', '/health-pickup.png');

    this.load.audio('sfx_attack',    '/audio/attack.mp3');
    this.load.audio('sfx_dash',      '/audio/dash.mp3');
    this.load.audio('sfx_hit',       '/audio/hit.mp3');
    this.load.audio('sfx_dead',      '/audio/dead.mp3');
    this.load.audio('sfx_countdown', '/audio/countdown.mp3');
    this.load.audio('sfx_menu',      '/audio/menu_hover.mp3');
  }

  init(data?: { classData?: ClassData }): void {
    this.classData = data?.classData ?? this.registry.get('classData') ?? DEFAULT_CLASS;
  }

  create(): void {
    this.createCharacterAnimations();

    this.anims.create({
      key: 'fireball_fly',
      frames: this.anims.generateFrameNumbers('fireball', { start: 0, end: 4 }),
      frameRate: 12,
      repeat: -1,
    });


    // Build walkability bitmask now — image is guaranteed decoded after preload
    const tex = this.textures.get('campus-map');
    const src = tex.getSourceImage() as HTMLImageElement;
    const offscreen = document.createElement('canvas');
    offscreen.width = src.naturalWidth;
    offscreen.height = src.naturalHeight;
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    setBitmask(buildBitmaskFromImageData(
      ctx.getImageData(0, 0, offscreen.width, offscreen.height),
      offscreen.width, offscreen.height,
    ));
    this.buildValidPickupTiles();

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
    this.arrowKeys = kb.createCursorKeys();
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.attackKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.O);
    this.pKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.P);

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

    // If the lobby already synced state, set up immediately.
    // Otherwise wait for the first patch (handles fresh joins where state isn't ready yet).
    const state = room.state as any;
    if (state && state.players && state.players.size >= 0) {
      this.setupMultiplayer(room, state);
    } else {
      room.onStateChange.once((s: any) => {
        this.setupMultiplayer(room, s);
      });
    }
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
    this.cameras.main.setZoom(this.cameras.main.width / (60 * TILE_SIZE));

    // Sync local player to server-assigned spawn, snapped to nearest walkable tile.
    // Use a delayedCall(0) as backup so position is read after all state patches settle.
    const syncSpawn = () => {
      if (this.room) {
        const myState = (this.room.state as any).players.get(this.room.sessionId);
        if (myState) {
          const safe = findSafeSpawn(myState.x, myState.y);
          this.player.sprite.x = safe.x;
          this.player.sprite.y = safe.y;
        }
      }
    };
    syncSpawn();
    this.time.delayedCall(0, syncSpawn);

    const seed = (this.room?.state as any)?.pickupSeed ?? (Date.now() & 0xFFFFFF);
    this.pickupRng = GameScene.makeSeededRng(seed);
    this.spawnPickupItems();
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
            this.sound.play('sfx_hit', { volume: 0.7 });
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
            this.sound.play('sfx_dead', { volume: 0.8 });
          } else {
            this.player.playRespawn();
            this.hideEliminatedOverlay();
            const safe = findSafeSpawn(playerState.x, playerState.y);
            this.player.sprite.x = safe.x;
            this.player.sprite.y = safe.y;
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

    $(state).listen('timeRemaining', (value: number) => {
      this.events.emit('timeRemainingUpdated', value);
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
      this.events.emit('gameOver', scores, state.timeLimitReached ?? false);
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

    room.onMessage('fireballEffect', (data: {
      shooterId: string;
      x: number;
      y: number;
      dirX: number;
      dirY: number;
    }) => {
      const angle = Math.atan2(data.dirY, data.dirX) * (180 / Math.PI);
      const sprite = this.add.sprite(data.x, data.y, 'fireball');
      sprite.setDisplaySize(104, 52).setDepth(12).setAngle(angle);
      sprite.play('fireball_fly');
      this.remoteProjectiles.push({
        sprite, dirX: data.dirX, dirY: data.dirY,
        traveled: 0, flickering: false, flickerTimer: 0,
      });
    });

    room.onMessage('pickupCollected', (data: { type: string; idx: number; collectorId: string }) => {
      const items = data.type === 'fireball' ? this.pickupItems : this.healthPickups;
      const item = items[data.idx];
      if (!item) return;
      item.active = false;
      item.tween?.stop();
      item.sprite.setVisible(false);
      // Only apply the effect to the player who picked it up
      if (data.collectorId === room.sessionId) {
        if (data.type === 'fireball') {
          this.fireballCount = Math.min(this.fireballCount + 1, this.MAX_FIREBALLS);
          this.events.emit('inventoryChanged', this.fireballCount);
        } else {
          this.player.hp = Math.min(this.player.hp + 20, this.player.maxHp);
          this.events.emit('playerHpChanged', this.player.hp, this.player.maxHp);
        }
      }
    });

    room.onMessage('pickupNeedsRespawn', (data: { type: string; idx: number }) => {
      // Only the host handles this message — pick a new position and send it back
      const pos = this.randomWalkableTile();
      sendPickupRespawnPos(data.type, data.idx, pos.wx, pos.wy);
    });

    room.onMessage('pickupRespawned', (data: { type: string; idx: number; wx: number; wy: number }) => {
      const items = data.type === 'fireball' ? this.pickupItems : this.healthPickups;
      const item = items[data.idx];
      if (!item) return;
      item.worldX = data.wx;
      item.worldY = data.wy;
      item.sprite.setPosition(data.wx, data.wy);
      item.sprite.setVisible(true);
      item.active = true;
      item.tween = this.tweens.add({
        targets: item.sprite,
        y: data.wy - 5,
        duration: 900,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    });
  }

  setCountdownActive(v: boolean): void {
    this.countdownActive = v;
  }

  revertToWaitingRoom(): void {
    this.activeProjectiles.forEach(p => p.sprite.destroy());
    this.activeProjectiles = [];
    this.remoteProjectiles.forEach(p => p.sprite.destroy());
    this.remoteProjectiles = [];
    this.pickupItems.forEach(p => { p.tween?.stop(); p.sprite.destroy(); });
    this.pickupItems = [];
    this.healthPickups.forEach(p => { p.tween?.stop(); p.sprite.destroy(); });
    this.healthPickups = [];
    this.fireballCount = 0;
    this.events.emit('inventoryChanged', 0);

    this.gamePhase = 'waiting';
    this.countdownActive = false;

    if (this.campusMapGraphics) {
      this.campusMapGraphics.destroy();
      this.campusMapGraphics = undefined;
    }

    this.buildingImages.forEach(img => img.destroy());
    this.buildingImages = [];

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

    // SCOUT + LANCER — 48×64 frames, 8 frames per sheet
    const spearDefs = [
      { state: 'idle',   srcState: 'idle',   fps: 8,  repeat: -1 },
      { state: 'run',    srcState: 'run',    fps: 10, repeat: -1 },
      { state: 'sprint', srcState: 'run',    fps: 16, repeat: -1 },
      { state: 'attack', srcState: 'attack', fps: 14, repeat: 0  },
      { state: 'dash',   srcState: 'dash',   fps: 18, repeat: 0  },
      { state: 'death',  srcState: 'death',  fps: 8,  repeat: 0  },
    ];
    for (const sk of ['scout', 'lancer']) {
      for (const def of spearDefs) {
        for (const dir of dirs) {
          const key = `${sk}_${def.state}_${dir}`;
          if (this.anims.exists(key)) this.anims.remove(key);
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(`${sk}_${def.srcState}_${dir}`, { start: 0, end: 7 }),
            frameRate: def.fps,
            repeat: def.repeat,
          });
        }
      }
    }

  }

  private drawMap(): void {
    const worldW = MAP_W * TILE_SIZE;
    const worldH = MAP_H * TILE_SIZE;

    const img = this.add.image(worldW / 2, worldH / 2, 'campus-map');
    img.setDisplaySize(worldW, worldH);
    img.setDepth(0);
    this.campusMapGraphics = img;
  }

  update(time: number, delta: number): void {
    if (!this.player.alive) return;

    // Block all local input during the pre-game countdown
    if (!this.countdownActive) {
      this.player.update(time, delta, {
        up:    { isDown: this.cursors.up.isDown    || this.arrowKeys.up.isDown    },
        down:  { isDown: this.cursors.down.isDown  || this.arrowKeys.down.isDown  },
        left:  { isDown: this.cursors.left.isDown  || this.arrowKeys.left.isDown  },
        right: { isDown: this.cursors.right.isDown || this.arrowKeys.right.isDown },
      });

      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.player.dash(time);
      }
      if (this.gamePhase === 'playing' && Phaser.Input.Keyboard.JustDown(this.attackKey)) {
        this.player.tryAttack(time, this.remotePlayers, sendAttack, sendSwing);
      }
      if (this.gamePhase === 'playing' && Phaser.Input.Keyboard.JustDown(this.pKey)) {
        this.tryFireProjectile();
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

    // Sync state directly from server every frame — bypasses unreliable listen() callbacks
    if (this.room) {
      const st = this.room.state as any;
      if (st) {
        // Phase transition: waiting → playing
        if (st.phase === 'playing' && this.gamePhase !== 'playing') {
          this.startFullGame();
        } else if (st.phase === 'waiting' && this.gamePhase === 'playing') {
          this.revertToWaitingRoom();
        }
        // Remote player positions
        if (st.players) {
          st.players.forEach((ps: any, sid: string) => {
            if (sid === this.room!.sessionId) return;
            const rp = this.remotePlayers.get(sid);
            if (rp) rp.updatePosition(ps.x, ps.y);
          });
        }
      }
    }

    // Update local projectiles
    if (this.activeProjectiles.length > 0) {
      this.updateProjectiles(delta);
    }

    // Update remote projectiles independently
    if (this.remoteProjectiles.length > 0) {
      this.updateRemoteProjectiles(delta);
    }

    // Pickup collision
    if (this.gamePhase === 'playing') {
      this.checkPickupCollisions();
    }

    // Always interpolate remote players (visible during countdown)
    this.remotePlayers.forEach(rp => rp.interpolate(delta));

    // Y-sort: sprites lower on screen render in front of sprites higher up
    this.player.sprite.setDepth(this.player.y);
    this.remotePlayers.forEach(rp => rp.sprite.setDepth(rp.sprite.y));
  }

  private spawnPickupItems(): void {
    this.pickupItems.forEach(p => { p.tween?.stop(); p.sprite.destroy(); });
    this.pickupItems = [];
    this.healthPickups.forEach(p => { p.tween?.stop(); p.sprite.destroy(); });
    this.healthPickups = [];

    for (let i = 0; i < 10; i++) {
      this.spawnPickupAt(this.randomWalkableTile());
    }
    for (let i = 0; i < 6; i++) {
      this.spawnHealthPickupAt(this.randomWalkableTile());
    }
  }

  private randomWalkableTile(): { wx: number; wy: number } {
    if (this.validPickupTiles.length > 0 && this.pickupRng) {
      const idx = Math.floor(this.pickupRng() * this.validPickupTiles.length);
      return this.validPickupTiles[idx];
    }
    // Fallback: rough center of map
    return { wx: (MAP_W / 2) * TILE_SIZE, wy: (MAP_H / 2) * TILE_SIZE };
  }

  private buildValidPickupTiles(): void {
    const mask = getBitmask();
    if (!mask) return;
    const clearance = 3;
    const valid: { wx: number; wy: number }[] = [];
    for (let ty = clearance; ty < MAP_H - clearance; ty++) {
      for (let tx = clearance; tx < MAP_W - clearance; tx++) {
        if (!mask[ty]?.[tx]) continue;
        let ok = true;
        outer: for (let dy = -clearance; dy <= clearance; dy++) {
          for (let dx = -clearance; dx <= clearance; dx++) {
            if (!mask[ty + dy]?.[tx + dx]) { ok = false; break outer; }
          }
        }
        if (ok) valid.push({ wx: tx * TILE_SIZE + TILE_SIZE / 2, wy: ty * TILE_SIZE + TILE_SIZE / 2 });
      }
    }
    this.validPickupTiles = valid;
  }

  private static makeSeededRng(seed: number): () => number {
    let s = seed | 0;
    return () => {
      s ^= s << 13; s ^= s >> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  private spawnPickupAt(pos: { wx: number; wy: number }): PickupItem {
    const sprite = this.add.image(pos.wx, pos.wy, 'fireball-pickup');
    sprite.setDisplaySize(28, 28).setDepth(8);

    const tween = this.tweens.add({
      targets: sprite,
      y: pos.wy - 5,
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      delay: Math.random() * 900, // stagger so they don't all bounce in sync
    });

    const item: PickupItem = { sprite, active: true, worldX: pos.wx, worldY: pos.wy, tween };
    this.pickupItems.push(item);
    return item;
  }

  private spawnHealthPickupAt(pos: { wx: number; wy: number }): void {
    const sprite = this.add.image(pos.wx, pos.wy, 'health-pickup');
    sprite.setDisplaySize(84, 84).setDepth(8);

    const tween = this.tweens.add({
      targets: sprite,
      y: pos.wy - 5,
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
      delay: Math.random() * 900,
    });

    this.healthPickups.push({ sprite, active: true, worldX: pos.wx, worldY: pos.wy, tween });
  }

  private tryFireProjectile(): void {
    if (this.fireballCount <= 0) return;
    this.fireballCount--;
    this.events.emit('inventoryChanged', this.fireballCount);

    const dirX = this.player.facingX;
    const dirY = this.player.facingY;
    const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const nx = dirX / len;
    const ny = dirY / len;

    const angle = Math.atan2(ny, nx) * (180 / Math.PI);
    const sprite = this.add.sprite(this.player.x, this.player.y, 'fireball');
    sprite.setDisplaySize(104, 52).setDepth(12).setAngle(angle);
    sprite.play('fireball_fly');

    sendFireballLaunched(this.player.x, this.player.y, nx, ny);

    this.activeProjectiles.push({
      sprite, dirX: nx, dirY: ny,
      traveled: 0, flickering: false, flickerTimer: 0,
    });
  }

  private updateProjectiles(delta: number): void {
    const step = this.FIREBALL_SPEED * (delta / 1000);
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const p = this.activeProjectiles[i];
      p.sprite.x += p.dirX * step;
      p.sprite.y += p.dirY * step;
      p.traveled += step;

      if (p.traveled >= this.FIREBALL_FLICKER_PX) {
        p.flickering = true;
        p.flickerTimer += delta;
        p.sprite.setVisible(Math.floor(p.flickerTimer / 80) % 2 === 0);
      }

      if (p.traveled >= this.FIREBALL_RANGE_PX) {
        p.sprite.destroy();
        this.activeProjectiles.splice(i, 1);
        continue;
      }

      let hit = false;
      this.remotePlayers.forEach((rp, sessionId) => {
        if (hit) return;
        if (!rp.alive) return;
        const dist = Phaser.Math.Distance.Between(
          p.sprite.x, p.sprite.y, rp.sprite.x, rp.sprite.y,
        );
        if (dist < 40) {
          sendFireball(sessionId, p.dirX, p.dirY);
          p.sprite.destroy();
          this.activeProjectiles.splice(i, 1);
          hit = true;
        }
      });
    }
  }

  private updateRemoteProjectiles(delta: number): void {
    const step = this.FIREBALL_SPEED * (delta / 1000);
    for (let i = this.remoteProjectiles.length - 1; i >= 0; i--) {
      const p = this.remoteProjectiles[i];
      p.sprite.x += p.dirX * step;
      p.sprite.y += p.dirY * step;
      p.traveled += step;

      if (p.traveled >= this.FIREBALL_FLICKER_PX) {
        p.flickering = true;
        p.flickerTimer += delta;
        p.sprite.setVisible(Math.floor(p.flickerTimer / 80) % 2 === 0);
      }

      if (p.traveled >= this.FIREBALL_RANGE_PX) {
        p.sprite.destroy();
        this.remoteProjectiles.splice(i, 1);
      }
    }
  }

  private checkPickupCollisions(): void {
    if (this.fireballCount < this.MAX_FIREBALLS) {
      for (let i = 0; i < this.pickupItems.length; i++) {
        const item = this.pickupItems[i];
        if (!item.active) continue;
        const dist = Phaser.Math.Distance.Between(
          this.player.x, this.player.y, item.worldX, item.worldY,
        );
        if (dist < 18) {
          sendPickupCollect('fireball', i);
          break; // server will broadcast back to all clients
        }
      }
    }

    for (let i = 0; i < this.healthPickups.length; i++) {
      const item = this.healthPickups[i];
      if (!item.active) continue;
      if (this.player.hp >= this.player.maxHp) continue;
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, item.worldX, item.worldY,
      );
      if (dist < 18) {
        sendPickupCollect('health', i);
        break;
      }
    }
  }
}
