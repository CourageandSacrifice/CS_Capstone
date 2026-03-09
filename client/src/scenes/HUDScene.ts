import Phaser from 'phaser';
import { ClassData, CHARACTERS } from '../data/Classes';
import type { GameScene } from './GameScene';
import { joinRoom, reconnect, hasReconnectionToken, clearReconnectionData, leaveRoom, getRoom, sendStartGame } from '../network/Network';
import { MAP_W, MAP_H, TILE_SIZE, BUILDINGS } from '../map/CampusMap';

export class HUDScene extends Phaser.Scene {
  private classData!: ClassData;
  private gameScene!: GameScene;
  private hpBarFill!: Phaser.GameObjects.Graphics;
  private hpBg!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private dashText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private killLabel!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private classInfoText!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;
  private mmContainer!: Phaser.GameObjects.Container;
  private lobbyBtn!: Phaser.GameObjects.Container;

  private hpBarW = 420;
  private hpBarH = 34;
  private hpBarX = 0;
  private hpBarY = 46;

  private isHost = false;
  private endGameBtn?: Phaser.GameObjects.Container;
  private gamePhase: 'waiting' | 'playing' = 'waiting';

  // Waiting room UI
  private waitingTitle!: Phaser.GameObjects.Text;
  private waitingCountText!: Phaser.GameObjects.Text;
  private waitingStatusText!: Phaser.GameObjects.Text;
  private startGameBtn?: Phaser.GameObjects.Container;

  private readonly MINIMAP_W = 160;
  private readonly MINIMAP_H = 120;
  private readonly MINIMAP_Y = 10;
  private minimapX = 0;
  private minimapDots!: Phaser.GameObjects.Graphics;

  constructor() {
    super('HUDScene');
  }

  init(data: { classData: ClassData; gameScene: GameScene }): void {
    this.classData = data.classData;
    this.gameScene = data.gameScene;
  }

  create(): void {
    const { width, height } = this.scale;

    this.hpBarX = Math.floor((width - this.hpBarW) / 2);

    // Title — always visible
    this.add.text(width / 2, 16, 'CAMPUS CLASH', {
      fontFamily: 'Courier New, monospace',
      fontSize: '32px',
      color: '#e63946',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // HP bar background (hidden until game starts)
    this.hpBg = this.add.graphics();
    this.hpBg.fillStyle(0x333333, 1);
    this.hpBg.fillRoundedRect(this.hpBarX, this.hpBarY, this.hpBarW, this.hpBarH, 4);
    this.hpBg.lineStyle(2, 0x000000, 1);
    this.hpBg.strokeRoundedRect(this.hpBarX, this.hpBarY, this.hpBarW, this.hpBarH, 4);
    this.hpBg.setVisible(false);

    // HP bar fill
    this.hpBarFill = this.add.graphics();
    this.hpBarFill.setVisible(false);
    this.drawHpBar(1);

    // HP text
    this.hpText = this.add.text(
      width / 2,
      this.hpBarY + this.hpBarH / 2,
      `${this.classData.maxHp} / ${this.classData.maxHp}`,
      {
        fontFamily: 'Courier New, monospace',
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      },
    ).setOrigin(0.5).setVisible(false);

    // Class name + weapon
    this.classInfoText = this.add.text(width / 2, this.hpBarY + this.hpBarH + 12,
      `${this.classData.name} - ${this.classData.weaponName}`, {
        fontFamily: 'Courier New, monospace',
        fontSize: '18px',
        color: '#f1faee',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setVisible(false);

    // Dash status
    this.dashText = this.add.text(width / 2, this.hpBarY + this.hpBarH + 38, 'DASH: ●●●', {
      fontFamily: 'Courier New, monospace',
      fontSize: '17px',
      color: '#2a9d8f',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);

    // Controls legend
    this.controlsText = this.add.text(width / 2, height - 28, 'WASD: Move  |  O: Attack  |  SPACE: Dash', {
      fontFamily: 'Courier New, monospace',
      fontSize: '18px',
      color: '#a8dadc',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setVisible(false);

    // Kill counter
    this.killLabel = this.add.text(16, 16, 'KILLS', {
      fontFamily: 'Courier New, monospace',
      fontSize: '16px',
      color: '#a8dadc',
      stroke: '#000000',
      strokeThickness: 3,
    }).setVisible(false);
    this.killText = this.add.text(16, 38, '0', {
      fontFamily: 'Courier New, monospace',
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setVisible(false);

    // Room status (bottom left) — visible during both phases
    this.roomCodeText = this.add.text(16, height - 56, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: '16px',
      color: '#00ff00',
      stroke: '#000000',
      strokeThickness: 3,
    });

    // Minimap container (hidden until game starts)
    this.minimapX = width - this.MINIMAP_W - 10;
    const mmBg = this.add.graphics();
    mmBg.fillStyle(0x000000, 0.6);
    mmBg.fillRect(this.minimapX, this.MINIMAP_Y, this.MINIMAP_W, this.MINIMAP_H);
    for (const b of BUILDINGS) {
      const bx = this.minimapX + (b.x / MAP_W) * this.MINIMAP_W;
      const by = this.MINIMAP_Y + (b.y / MAP_H) * this.MINIMAP_H;
      const bw = (b.w / MAP_W) * this.MINIMAP_W;
      const bh = (b.h / MAP_H) * this.MINIMAP_H;
      mmBg.fillStyle(b.color, 0.85);
      mmBg.fillRect(bx, by, bw, bh);
    }
    mmBg.lineStyle(1, 0xffffff, 0.35);
    mmBg.strokeRect(this.minimapX, this.MINIMAP_Y, this.MINIMAP_W, this.MINIMAP_H);
    const mmLabel = this.add.text(this.minimapX + this.MINIMAP_W / 2, this.MINIMAP_Y + 3, 'MAP', {
      fontFamily: 'Courier New, monospace',
      fontSize: '10px',
      color: '#aaaaaa',
    }).setOrigin(0.5, 0);
    this.minimapDots = this.add.graphics();
    this.mmContainer = this.add.container(0, 0, [mmBg, mmLabel, this.minimapDots]);
    this.mmContainer.setVisible(false);

    // Return to lobby button (always visible)
    this.lobbyBtn = this.createButton(width - 172, height - 60, '← LOBBY', 0x1a3a7a, async () => {
      await leaveRoom();
      window.location.reload();
    });

    // ── Waiting room UI ──
    this.waitingTitle = this.add.text(width / 2, height / 2 - 80, 'WAITING ROOM', {
      fontFamily: 'Courier New, monospace',
      fontSize: '32px',
      color: '#f5c518',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.waitingCountText = this.add.text(width / 2, height / 2 - 30, '1 / 10 players', {
      fontFamily: 'Courier New, monospace',
      fontSize: '20px',
      color: '#a8dadc',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.waitingStatusText = this.add.text(width / 2, height / 2 + 20, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: '16px',
      color: '#7a9abf',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // Event listeners
    this.gameScene.events.on('playerHpChanged', (hp: number, maxHp: number) => {
      this.drawHpBar(hp / maxHp);
      this.hpText.setText(`${hp} / ${maxHp}`);
    });
    this.gameScene.events.on('playerKillsChanged', (kills: number) => {
      this.killText.setText(`${kills}`);
    });
    this.gameScene.events.on('gameOver', (scores: { name: string; kills: number }[]) => {
      this.showGameOverScreen(scores);
    });
    this.gameScene.events.on('gameStarted', () => {
      this.switchToGameHUD();
    });

    // Auto-connect from lobby selection
    if (hasReconnectionToken()) {
      this.attemptReconnect();
    } else {
      const mode = this.registry.get('mode') as 'host' | 'join' | undefined;
      if (mode) {
        this.time.delayedCall(100, () => this.handleConnect(mode));
      }
    }
  }

  private async attemptReconnect(): Promise<void> {
    this.roomCodeText.setText('Reconnecting...').setColor('#ffff00');
    try {
      const room = await reconnect();
      this.isHost = false;
      this.onConnected(room.roomId);
      this.gameScene.onRoomConnected(room);
      this.setupWaitingRoomListeners(room);
    } catch (err) {
      console.warn('Auto-reconnect failed:', err);
      clearReconnectionData();
      this.roomCodeText.setText('Reconnect failed').setColor('#ff0000');
    }
  }

  private async handleConnect(mode: 'host' | 'join'): Promise<void> {
    // Lobby already connected the room — reuse it
    const existing = getRoom();
    if (existing) {
      this.isHost = mode === 'host';
      this.onConnected(existing.roomId);
      this.gameScene.onRoomConnected(existing);
      this.setupWaitingRoomListeners(existing);
      return;
    }

    // Fallback: reconnect path shouldn't reach here, but handle gracefully
    const username = this.registry.get('username') as string ?? 'Player';
    const roomCode = this.registry.get('roomCode') as string ?? '';
    const spriteKey = (this.registry.get('classData') as ClassData | undefined)?.spriteKey ?? CHARACTERS[0].spriteKey;
    try {
      this.roomCodeText.setText('Connecting...').setColor('#ffff00');
      let room;
      if (roomCode) {
        room = await joinRoom(roomCode, username, spriteKey);
      } else {
        this.roomCodeText.setText('Connection failed').setColor('#ff0000');
        return;
      }
      this.isHost = mode === 'host';
      this.onConnected(room.roomId);
      this.gameScene.onRoomConnected(room);
      this.setupWaitingRoomListeners(room);
    } catch (err) {
      console.error('Connection failed:', err);
      this.roomCodeText.setText('Connection failed').setColor('#ff0000');
    }
  }

  private setupWaitingRoomListeners(room: any): void {
    // Update player count whenever players join or leave
    const updateCount = () => {
      const max = room.state?.maxPlayers ?? 10;
      const count = room.state?.players?.size ?? 1;
      this.updateWaitingCount(count, max);
    };

    room.onStateChange.once(() => {
      updateCount();
      room.state.players?.onAdd(() => updateCount());
      room.state.players?.onRemove(() => updateCount());
    });
  }

  private onConnected(roomId: string): void {
    const { height } = this.scale;
    this.roomCodeText.setText(`ROOM: ${roomId}`).setColor('#00ff00');

    if (this.isHost) {
      // Copy code button next to room code
      const copyBtn = this.createButton(140, height - 28, 'COPY CODE', 0x1a4a2a, () => {
        navigator.clipboard.writeText(roomId).then(() => {
          this.roomCodeText.setText('COPIED!').setColor('#f5c518');
          this.time.delayedCall(1500, () => {
            this.roomCodeText.setText(`ROOM: ${roomId}`).setColor('#00ff00');
          });
        }).catch(() => {});
      });
      this.add.existing(copyBtn);

      // START GAME button (center bottom of screen)
      const { width } = this.scale;
      this.startGameBtn = this.createButton(width / 2 - 60, height / 2 + 70, 'START GAME', 0x1a7a3a, () => {
        sendStartGame();
        if (this.startGameBtn) {
          this.startGameBtn.setVisible(false);
        }
      }, 120, 40);
      this.add.existing(this.startGameBtn);
      this.waitingStatusText.setVisible(false);
    } else {
      this.waitingStatusText.setText('Waiting for host to start...').setVisible(true);
    }
  }

  private updateWaitingCount(count: number, max: number): void {
    this.waitingCountText.setText(`${count} / ${max} players`);
  }

  private switchToGameHUD(): void {
    this.gamePhase = 'playing';

    // Hide waiting UI
    this.waitingTitle.setVisible(false);
    this.waitingCountText.setVisible(false);
    this.waitingStatusText.setVisible(false);
    if (this.startGameBtn) this.startGameBtn.setVisible(false);

    // Show game HUD elements
    this.hpBg.setVisible(true);
    this.hpBarFill.setVisible(true);
    this.hpText.setVisible(true);
    this.classInfoText.setVisible(true);
    this.dashText.setVisible(true);
    this.controlsText.setVisible(true);
    this.killLabel.setVisible(true);
    this.killText.setVisible(true);
    this.mmContainer.setVisible(true);

    // END GAME button for host (below minimap)
    if (this.isHost) {
      const { width } = this.scale;
      this.endGameBtn = this.createButton(width - 116, this.MINIMAP_Y + this.MINIMAP_H + 8, 'END GAME', 0x880000, () => {
        this.gameScene.sendEndGame();
        if (this.endGameBtn) this.endGameBtn.setVisible(false);
      });
      this.add.existing(this.endGameBtn);
    }
  }

  private createButton(
    x: number, y: number, label: string, color: number, onClick: () => void,
    btnW = 100, btnH = 36,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(0, 0, btnW, btnH, 4);
    bg.lineStyle(1, 0x000000, 1);
    bg.strokeRoundedRect(0, 0, btnW, btnH, 4);
    container.add(bg);

    const txt = this.add.text(btnW / 2, btnH / 2, label, {
      fontFamily: 'Courier New, monospace',
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(txt);

    const zone = this.add.zone(btnW / 2, btnH / 2, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    container.add(zone);

    zone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(color, 0.7);
      bg.fillRoundedRect(0, 0, btnW, btnH, 4);
      bg.lineStyle(1, 0xffffff, 1);
      bg.strokeRoundedRect(0, 0, btnW, btnH, 4);
    });
    zone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(0, 0, btnW, btnH, 4);
      bg.lineStyle(1, 0x000000, 1);
      bg.strokeRoundedRect(0, 0, btnW, btnH, 4);
    });
    zone.on('pointerdown', onClick);

    return container;
  }

  private showGameOverScreen(scores: { name: string; kills: number }[]): void {
    const { width, height } = this.scale;
    const cx = width / 2; const cy = height / 2;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.75);
    overlay.fillRect(0, 0, width, height);
    overlay.setDepth(200);

    this.add.text(cx, cy - 120, 'GAME OVER', {
      fontFamily: 'Courier New, monospace', fontSize: '52px', color: '#e63946',
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(201);

    this.add.text(cx, cy - 52, '— FINAL SCORES —', {
      fontFamily: 'Courier New, monospace', fontSize: '18px', color: '#a8dadc',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(201);

    scores.forEach((entry, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      this.add.text(cx, cy - 14 + i * 36,
        `${medal}  ${entry.name}  —  ${entry.kills} kills`, {
          fontFamily: 'Courier New, monospace', fontSize: '20px',
          color: i === 0 ? '#f4d03f' : '#ffffff',
          fontStyle: i === 0 ? 'bold' : 'normal',
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(201);
    });

    let countdown = 5;
    const countText = this.add.text(cx, cy + 160,
      `Returning to lobby in ${countdown}s...`, {
        fontFamily: 'Courier New, monospace', fontSize: '16px',
        color: '#aaaaaa', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(201);

    this.time.addEvent({
      delay: 1000, repeat: 4,
      callback: () => {
        countdown--;
        countText.setText(`Returning to lobby in ${countdown}s...`);
        if (countdown <= 0) window.location.reload();
      },
    });
  }

  private drawHpBar(ratio: number): void {
    this.hpBarFill.clear();
    const color = ratio > 0.5 ? 0x00cc44 : ratio > 0.25 ? 0xcccc00 : 0xcc0000;
    this.hpBarFill.fillStyle(color, 1);
    this.hpBarFill.fillRoundedRect(
      this.hpBarX, this.hpBarY,
      Math.floor(this.hpBarW * ratio), this.hpBarH, 4,
    );
  }

  update(): void {
    if (!this.gameScene.player) return;
    if (this.gamePhase !== 'playing') return;

    const { dashCharges, dashRechargeCooldown } = this.gameScene.player;
    const pips = '●'.repeat(dashCharges) + '○'.repeat(3 - dashCharges);

    if (dashCharges < 3 && dashRechargeCooldown > 0) {
      this.dashText.setText(`DASH: ${pips}  ${(dashRechargeCooldown / 1000).toFixed(1)}s`);
      this.dashText.setColor(dashCharges === 0 ? '#cc0000' : '#ccaa00');
    } else {
      this.dashText.setText(`DASH: ${pips}`);
      this.dashText.setColor('#2a9d8f');
    }

    this.updateMinimap();
  }

  private updateMinimap(): void {
    if (!this.gameScene.player || !this.minimapDots) return;
    const worldW = MAP_W * TILE_SIZE;
    const worldH = MAP_H * TILE_SIZE;

    this.minimapDots.clear();

    // Remote players — white dots
    this.gameScene.getRemotePlayers().forEach((rp) => {
      if (!rp.alive) return;
      const mx = this.minimapX + (rp.sprite.x / worldW) * this.MINIMAP_W;
      const my = this.MINIMAP_Y + (rp.sprite.y / worldH) * this.MINIMAP_H;
      this.minimapDots.fillStyle(0xffffff, 1);
      this.minimapDots.fillCircle(mx, my, 2);
    });

    // Local player — red dot
    const { x, y } = this.gameScene.player;
    const mx = this.minimapX + (x / worldW) * this.MINIMAP_W;
    const my = this.MINIMAP_Y + (y / worldH) * this.MINIMAP_H;
    this.minimapDots.fillStyle(0xff0000, 1);
    this.minimapDots.fillCircle(mx, my, 3);
  }
}
