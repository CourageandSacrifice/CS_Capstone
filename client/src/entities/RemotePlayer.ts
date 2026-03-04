import Phaser from 'phaser';
import { drawSlash } from './Player';

export class RemotePlayer {
  sprite: Phaser.GameObjects.Container;
  alive = true;
  hp = 100;
  maxHp = 100;

  private body: Phaser.GameObjects.Sprite;
  private label: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Graphics;
  private hpBarFill: Phaser.GameObjects.Graphics;
  private spriteKey: string;
  private facingX = 0;
  private facingY = 1; // default facing down
  private currentAnim = '';
  private isMoving = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name: string,
    _color: number,
    spriteKey = 'archer',
  ) {
    this.spriteKey = spriteKey;

    this.sprite = scene.add.container(x, y);
    this.sprite.setSize(30, 30);

    this.body = scene.add.sprite(0, 0, spriteKey);
    this.body.setScale(2); // 16px frame × 2 = 32px = 2 tiles
    this.sprite.add(this.body);

    // HP bar background — positioned above 2x sprite (top edge at y=-16)
    this.hpBarBg = scene.add.graphics();
    this.hpBarBg.fillStyle(0x333333, 1);
    this.hpBarBg.fillRect(-10, -22, 20, 3);
    this.sprite.add(this.hpBarBg);

    // HP bar fill
    this.hpBarFill = scene.add.graphics();
    this.drawHpBar();
    this.sprite.add(this.hpBarFill);

    this.label = scene.add.text(0, -28, name, {
      fontFamily: 'Courier New, monospace',
      fontSize: '9px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.sprite.add(this.label);

    this.sprite.setDepth(10);

    // Start idle-down animation immediately
    this.playAnim(`${spriteKey}_idle_down`);
  }

  private getDirection(): string {
    if (this.facingY > 0) return 'down';
    if (this.facingY < 0) return 'up';
    if (this.facingX < 0) return 'left';
    return 'right';
  }

  private playAnim(key: string): void {
    if (this.currentAnim === key) return;
    this.currentAnim = key;
    this.body.play(key);
  }

  private drawHpBar(): void {
    this.hpBarFill.clear();
    const ratio = this.hp / this.maxHp;
    const color = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffff00 : 0xff0000;
    this.hpBarFill.fillStyle(color, 1);
    this.hpBarFill.fillRect(-10, -22, Math.floor(20 * ratio), 3);
  }

  updateHp(hp: number, maxHp: number): void {
    this.hp = hp;
    this.maxHp = maxHp;
    this.drawHpBar();
  }

  takeDamageFlash(): void {
    this.body.setTint(0xff0000);
    this.sprite.scene.time.delayedCall(100, () => {
      this.body.clearTint();
    });
  }

  showAttackEffect(dirX: number, dirY: number): void {
    // Play attack sprite animation (once), then resume idle/run
    const dir = this.dirToString(dirX, dirY);
    const key = `${this.spriteKey}_attack_${dir}`;
    this.currentAnim = key;
    this.body.play({ key, repeat: 0 });
    this.body.once('animationcomplete', () => {
      this.currentAnim = ''; // allow updatePosition to resume normal anim
    });
    drawSlash(this.sprite.scene, this.sprite.x, this.sprite.y, dirX, dirY);
  }

  private dirToString(dirX: number, dirY: number): string {
    if (dirY > 0) return 'down';
    if (dirY < 0) return 'up';
    if (dirX < 0) return 'left';
    return 'right';
  }

  setAlive(alive: boolean): void {
    this.alive = alive;
    this.sprite.setVisible(alive);
  }

  updatePosition(x: number, y: number): void {
    const dx = x - this.sprite.x;
    const dy = y - this.sprite.y;
    const dist = Math.abs(dx) + Math.abs(dy);

    if (dist > 0.5) {
      // Update facing — Y-axis priority matches Player.getDirection()
      this.facingX = dx !== 0 ? Math.sign(dx) : 0;
      this.facingY = dy !== 0 ? Math.sign(dy) : 0;
      this.isMoving = true;
    } else {
      this.isMoving = false;
    }

    const dir = this.getDirection();
    const state = this.isMoving ? 'run' : 'idle';
    this.playAnim(`${this.spriteKey}_${state}_${dir}`);

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
