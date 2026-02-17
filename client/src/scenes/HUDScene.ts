import Phaser from 'phaser';
import { ClassData } from '../data/Classes';
import type { GameScene } from './GameScene';
import { createRoom, joinAnyRoom, reconnect, hasReconnectionToken, clearReconnectionData } from '../network/Network';

export class HUDScene extends Phaser.Scene {
  private classData!: ClassData;
  private gameScene!: GameScene;
  private hpBarFill!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private dashText!: Phaser.GameObjects.Text;

  private hpBarW = 300;
  private hpBarH = 24;
  private hpBarX = 0; // set in create
  private hpBarY = 38;

  // Lobby UI elements
  private lobbyContainer!: Phaser.GameObjects.Container;
  private roomCodeText!: Phaser.GameObjects.Text;
  private joinInput = '';

  constructor() {
    super('HUDScene');
  }

  init(data: { classData: ClassData; gameScene: GameScene }): void {
    this.classData = data.classData;
    this.gameScene = data.gameScene;
  }

  create(): void {
    const { width, height } = this.scale;

    // Center the HP bar horizontally
    this.hpBarX = Math.floor((width - this.hpBarW) / 2);

    // Title
    this.add
      .text(width / 2, 14, 'CAMPUS CLASH', {
        fontFamily: 'Courier New, monospace',
        fontSize: '24px',
        color: '#e63946',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // HP bar background
    const hpBg = this.add.graphics();
    hpBg.fillStyle(0x333333, 1);
    hpBg.fillRoundedRect(this.hpBarX, this.hpBarY, this.hpBarW, this.hpBarH, 4);
    hpBg.lineStyle(2, 0x000000, 1);
    hpBg.strokeRoundedRect(this.hpBarX, this.hpBarY, this.hpBarW, this.hpBarH, 4);

    // HP bar fill
    this.hpBarFill = this.add.graphics();
    this.drawHpBar(1);

    // HP text centered on bar
    this.hpText = this.add
      .text(
        width / 2,
        this.hpBarY + this.hpBarH / 2,
        `${this.classData.maxHp} / ${this.classData.maxHp}`,
        {
          fontFamily: 'Courier New, monospace',
          fontSize: '14px',
          color: '#ffffff',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3,
        },
      )
      .setOrigin(0.5);

    // Class name + weapon centered below HP bar
    this.add
      .text(width / 2, this.hpBarY + this.hpBarH + 8, `${this.classData.name} - ${this.classData.weaponName}`, {
        fontFamily: 'Courier New, monospace',
        fontSize: '14px',
        color: '#f1faee',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    // Dash cooldown centered below class name
    this.dashText = this.add
      .text(width / 2, this.hpBarY + this.hpBarH + 28, 'DASH: READY', {
        fontFamily: 'Courier New, monospace',
        fontSize: '13px',
        color: '#2a9d8f',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    // Controls legend at bottom center
    this.add
      .text(width / 2, height - 24, 'WASD: Move  |  O: Attack  |  SPACE: Dash', {
        fontFamily: 'Courier New, monospace',
        fontSize: '14px',
        color: '#a8dadc',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // Listen for HP changes
    this.gameScene.events.on('playerHpChanged', (hp: number, maxHp: number) => {
      this.drawHpBar(hp / maxHp);
      this.hpText.setText(`${hp} / ${maxHp}`);
    });

    // Build lobby UI in bottom-left
    this.buildLobbyUI(height);

    // Attempt auto-reconnect if we have a stored token
    if (hasReconnectionToken()) {
      this.attemptReconnect();
    }
  }

  private async attemptReconnect(): Promise<void> {
    this.roomCodeText.setText('Reconnecting...').setColor('#ffff00');
    // Hide buttons during reconnect attempt
    this.lobbyContainer.each((child: Phaser.GameObjects.GameObject) => {
      if (child !== this.roomCodeText) {
        (child as Phaser.GameObjects.Container).setVisible(false);
      }
    });

    try {
      const room = await reconnect();
      this.onConnected(room.roomId);
      this.gameScene.onRoomConnected(room);
    } catch (err) {
      console.warn('Auto-reconnect failed:', err);
      clearReconnectionData();
      this.roomCodeText.setText('').setColor('#00ff00');
      // Show buttons again
      this.lobbyContainer.each((child: Phaser.GameObjects.GameObject) => {
        (child as Phaser.GameObjects.Container).setVisible(true);
      });
    }
  }

  private buildLobbyUI(height: number): void {
    const baseX = 12;
    const baseY = height - 60;

    this.lobbyContainer = this.add.container(baseX, baseY);

    // Room code display (hidden until connected)
    this.roomCodeText = this.add
      .text(0, -24, '', {
        fontFamily: 'Courier New, monospace',
        fontSize: '13px',
        color: '#00ff00',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5);
    this.lobbyContainer.add(this.roomCodeText);

    // CREATE button — host a new game
    const createBtn = this.createButton(0, 0, 'CREATE', 0xe63946, () => this.handleCreate());
    this.lobbyContainer.add(createBtn);

    // PLAY button — join an existing game
    const playBtn = this.createButton(86, 0, 'PLAY', 0x2a9d8f, () => this.handleJoin());
    this.lobbyContainer.add(playBtn);
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    color: number,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const btnW = 78;
    const btnH = 26;
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(0, 0, btnW, btnH, 4);
    bg.lineStyle(1, 0x000000, 1);
    bg.strokeRoundedRect(0, 0, btnW, btnH, 4);
    container.add(bg);

    const txt = this.add
      .text(btnW / 2, btnH / 2, label, {
        fontFamily: 'Courier New, monospace',
        fontSize: '12px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    container.add(txt);

    // Hit zone for interaction
    const zone = this.add
      .zone(btnW / 2, btnH / 2, btnW, btnH)
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

  private promptName(): string | null {
    const name = window.prompt('Enter your name:');
    if (!name || name.trim() === '') return null;
    return name.trim().slice(0, 16);
  }

  private async handleCreate(): Promise<void> {
    const name = this.promptName();
    if (!name) return;

    try {
      this.roomCodeText.setText('Creating...').setColor('#ffff00');
      const room = await createRoom(name);
      this.onConnected(room.roomId);
      this.gameScene.onRoomConnected(room);
    } catch (err) {
      console.error('Failed to create room:', err);
      this.roomCodeText.setText('Create failed').setColor('#ff0000');
    }
  }

  private async handleJoin(): Promise<void> {
    const name = this.promptName();
    if (!name) return;

    try {
      this.roomCodeText.setText('Finding game...').setColor('#ffff00');
      const room = await joinAnyRoom(name);
      this.onConnected(room.roomId);
      this.gameScene.onRoomConnected(room);
    } catch (err) {
      console.error('Failed to join room:', err);
      this.roomCodeText.setText('No games found').setColor('#ff0000');
    }
  }

  private onConnected(roomId: string): void {
    this.roomCodeText.setText(`Room: ${roomId}`).setColor('#00ff00');

    // Hide buttons after connecting
    this.lobbyContainer.each((child: Phaser.GameObjects.GameObject) => {
      if (child !== this.roomCodeText) {
        (child as Phaser.GameObjects.Container).setVisible(false);
      }
    });
  }

  private drawHpBar(ratio: number): void {
    this.hpBarFill.clear();
    const color =
      ratio > 0.5 ? 0x00cc44 : ratio > 0.25 ? 0xcccc00 : 0xcc0000;
    this.hpBarFill.fillStyle(color, 1);
    this.hpBarFill.fillRoundedRect(
      this.hpBarX,
      this.hpBarY,
      Math.floor(this.hpBarW * ratio),
      this.hpBarH,
      4,
    );
  }

  update(): void {
    if (!this.gameScene.player) return;
    const cd = this.gameScene.player.dashCooldown;
    if (cd > 0) {
      this.dashText.setText(`DASH: ${(cd / 1000).toFixed(1)}s`);
      this.dashText.setColor('#cc0000');
    } else {
      this.dashText.setText('DASH: READY');
      this.dashText.setColor('#2a9d8f');
    }
  }
}
