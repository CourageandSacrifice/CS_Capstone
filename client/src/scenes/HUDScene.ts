import Phaser from 'phaser';
import { ClassData } from '../data/Classes';
import type { GameScene } from './GameScene';
import { createRoom, joinAnyRoom, reconnect, hasReconnectionToken, clearReconnectionData, leaveRoom } from '../network/Network';

export class HUDScene extends Phaser.Scene {
  private classData!: ClassData;
  private gameScene!: GameScene;
  private hpBarFill!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private dashText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;

  private hpBarW = 420;
  private hpBarH = 34;
  private hpBarX = 0;
  private hpBarY = 46;

  private isHost = false;
  private endGameBtn?: Phaser.GameObjects.Container;

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

    // Title
    this.add.text(width / 2, 16, 'CAMPUS CLASH', {
      fontFamily: 'Courier New, monospace',
      fontSize: '32px',
      color: '#e63946',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // HP bar background
    const hpBg = this.add.graphics();
    hpBg.fillStyle(0x333333, 1);
    hpBg.fillRoundedRect(this.hpBarX, this.hpBarY, this.hpBarW, this.hpBarH, 4);
    hpBg.lineStyle(2, 0x000000, 1);
    hpBg.strokeRoundedRect(this.hpBarX, this.hpBarY, this.hpBarW, this.hpBarH, 4);

    // HP bar fill
    this.hpBarFill = this.add.graphics();
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
    ).setOrigin(0.5);

    // Class name + weapon
    this.add.text(width / 2, this.hpBarY + this.hpBarH + 12,
      `${this.classData.name} - ${this.classData.weaponName}`, {
        fontFamily: 'Courier New, monospace',
        fontSize: '18px',
        color: '#f1faee',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5);

    // Dash status
    this.dashText = this.add.text(width / 2, this.hpBarY + this.hpBarH + 38, 'DASH: ●●●', {
      fontFamily: 'Courier New, monospace',
      fontSize: '17px',
      color: '#2a9d8f',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // Controls legend
    this.add.text(width / 2, height - 28, 'WASD: Move  |  O: Attack  |  SPACE: Dash', {
      fontFamily: 'Courier New, monospace',
      fontSize: '18px',
      color: '#a8dadc',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Kill counter
    this.add.text(16, 16, 'KILLS', {
      fontFamily: 'Courier New, monospace',
      fontSize: '16px',
      color: '#a8dadc',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.killText = this.add.text(16, 38, '0', {
      fontFamily: 'Courier New, monospace',
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    });

    // Room status (bottom left)
    this.roomCodeText = this.add.text(16, height - 56, '', {
      fontFamily: 'Courier New, monospace',
      fontSize: '16px',
      color: '#00ff00',
      stroke: '#000000',
      strokeThickness: 3,
    });

    // Return to lobby button (bottom right)
    this.createButton(width - 172, height - 60, '← LOBBY', 0x1a3a7a, async () => {
      await leaveRoom();
      window.location.reload();
    });

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
      this.onConnected(room.roomId);
      this.gameScene.onRoomConnected(room);
    } catch (err) {
      console.warn('Auto-reconnect failed:', err);
      clearReconnectionData();
      this.roomCodeText.setText('Reconnect failed').setColor('#ff0000');
    }
  }

  private async handleConnect(mode: 'host' | 'join'): Promise<void> {
    const username = this.registry.get('username') as string ?? 'Player';
    try {
      this.roomCodeText.setText('Connecting...').setColor('#ffff00');
      const room = mode === 'host'
        ? await createRoom(username)
        : await joinAnyRoom(username);
      this.isHost = mode === 'host';
      this.onConnected(room.roomId);
      this.gameScene.onRoomConnected(room);
    } catch (err) {
      console.error('Connection failed:', err);
      this.roomCodeText.setText('Connection failed').setColor('#ff0000');
    }
  }

  private onConnected(roomId: string): void {
    this.roomCodeText.setText(`Room: ${roomId}`).setColor('#00ff00');

    if (this.isHost) {
      const { width } = this.scale;
      this.endGameBtn = this.createButton(width - 116, 16, 'END GAME', 0x880000, () => {
        this.gameScene.sendEndGame();
        if (this.endGameBtn) this.endGameBtn.setVisible(false);
      });
      this.add.existing(this.endGameBtn);
    }
  }

  private createButton(
    x: number, y: number, label: string, color: number, onClick: () => void,
  ): Phaser.GameObjects.Container {
    const btnW = 100; const btnH = 36;
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
    const { dashCharges, dashRechargeCooldown } = this.gameScene.player;
    const pips = '●'.repeat(dashCharges) + '○'.repeat(3 - dashCharges);

    if (dashCharges < 3 && dashRechargeCooldown > 0) {
      this.dashText.setText(`DASH: ${pips}  ${(dashRechargeCooldown / 1000).toFixed(1)}s`);
      this.dashText.setColor(dashCharges === 0 ? '#cc0000' : '#ccaa00');
    } else {
      this.dashText.setText(`DASH: ${pips}`);
      this.dashText.setColor('#2a9d8f');
    }
  }
}
