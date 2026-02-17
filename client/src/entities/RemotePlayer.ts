import Phaser from 'phaser';

export class RemotePlayer {
  sprite: Phaser.GameObjects.Container;
  alive = true;
  hp = 100;
  maxHp = 100;

  private body: Phaser.GameObjects.Graphics;
  private eyes: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Graphics;
  private hpBarFill: Phaser.GameObjects.Graphics;
  private color: number;
  private facingX = 0;
  private facingY = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, name: string, color: number) {
    this.color = color;
    this.sprite = scene.add.container(x, y);
    this.sprite.setSize(14, 14);

    this.body = scene.add.graphics();
    this.drawBody(color);
    this.sprite.add(this.body);

    this.eyes = scene.add.graphics();
    this.drawEyes();
    this.sprite.add(this.eyes);

    // HP bar background
    this.hpBarBg = scene.add.graphics();
    this.hpBarBg.fillStyle(0x333333, 1);
    this.hpBarBg.fillRect(-10, -18, 20, 3);
    this.sprite.add(this.hpBarBg);

    // HP bar fill
    this.hpBarFill = scene.add.graphics();
    this.drawHpBar();
    this.sprite.add(this.hpBarFill);

    this.label = scene.add.text(0, -24, name, {
      fontFamily: 'Courier New, monospace',
      fontSize: '9px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.sprite.add(this.label);

    this.sprite.setDepth(10);
  }

  private drawBody(color: number): void {
    this.body.clear();
    this.body.fillStyle(color, 1);
    this.body.fillRect(-7, -7, 14, 14);
    this.body.lineStyle(1, 0x000000, 1);
    this.body.strokeRect(-7, -7, 14, 14);
  }

  private drawEyes(): void {
    this.eyes.clear();
    this.eyes.fillStyle(0xffffff, 1);

    let ex1: number, ey1: number, ex2: number, ey2: number;

    if (this.facingY < 0) {
      ex1 = -3; ey1 = -4; ex2 = 3; ey2 = -4;
    } else if (this.facingY > 0) {
      ex1 = -3; ey1 = 2; ex2 = 3; ey2 = 2;
    } else if (this.facingX < 0) {
      ex1 = -4; ey1 = -2; ex2 = -4; ey2 = 3;
    } else {
      ex1 = 4; ey1 = -2; ex2 = 4; ey2 = 3;
    }

    this.eyes.fillCircle(ex1, ey1, 1.5);
    this.eyes.fillCircle(ex2, ey2, 1.5);
  }

  private drawHpBar(): void {
    this.hpBarFill.clear();
    const ratio = this.hp / this.maxHp;
    const color = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffff00 : 0xff0000;
    this.hpBarFill.fillStyle(color, 1);
    this.hpBarFill.fillRect(-10, -18, Math.floor(20 * ratio), 3);
  }

  updateHp(hp: number, maxHp: number): void {
    this.hp = hp;
    this.maxHp = maxHp;
    this.drawHpBar();
  }

  takeDamageFlash(): void {
    this.drawBody(0xff0000);
    this.sprite.scene.time.delayedCall(100, () => {
      if (this.alive) this.drawBody(this.color);
    });
  }

  setAlive(alive: boolean): void {
    this.alive = alive;
    this.sprite.setVisible(alive);
  }

  updatePosition(x: number, y: number): void {
    const dx = x - this.sprite.x;
    const dy = y - this.sprite.y;

    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      this.facingX = dx !== 0 ? Math.sign(dx) : 0;
      this.facingY = dy !== 0 ? Math.sign(dy) : 0;
      this.drawEyes();
    }

    const scene = this.sprite.scene;
    scene.tweens.add({
      targets: this.sprite,
      x,
      y,
      duration: 50,
      ease: 'Linear',
      overwrite: true,
    });
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
