import Phaser from 'phaser';
import { drawSlash } from './Player';
import { ClassData } from '../data/Classes';

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
  private flipForLeft: boolean;
  private flipForRight: boolean;
  private facingX = 0;
  private facingY = 1; // default facing down
  private currentAnim = '';
  private isMoving = false;
  private isAttacking = false;
  private idleTimer?: Phaser.Time.TimerEvent;
  private targetX: number;
  private targetY: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name: string,
    _color: number,
    classData: ClassData,
  ) {
    this.spriteKey = classData.spriteKey;
    this.flipForLeft = classData.flipForLeft;
    this.flipForRight = classData.flipForRight ?? false;

    this.targetX = x;
    this.targetY = y;
    this.sprite = scene.add.container(x, y);
    this.sprite.setSize(30, 30);

    this.body = scene.add.sprite(0, 0, classData.defaultTexture);
    this.body.setScale(classData.scale);
    this.sprite.add(this.body);

    // HP bar background — positioned above sprite
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
    this.playAnim(`${classData.spriteKey}_idle_down`);
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
    this.body.setTint(0xff4444);
    this.sprite.scene.time.delayedCall(250, () => {
      this.body.clearTint();
    });
  }

  showAttackEffect(dirX: number, dirY: number): void {
    this.isAttacking = true;
    const dir = this.dirToString(dirX, dirY);
    const key = `${this.spriteKey}_attack_${dir}`;
    this.currentAnim = key;
    this.body.stop();
    if (this.flipForLeft) this.body.setFlipX(dirX < 0);
    else if (this.flipForRight) this.body.setFlipX(dirX > 0);
    this.body.play(key);

    // Clear any stale ANIMATION_COMPLETE listeners before adding a fresh one
    this.body.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
    this.body.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.isAttacking = false;
      this.currentAnim = '';
    });

    // Safety fallback — reset isAttacking if ANIMATION_COMPLETE never fires (e.g. sprite hidden on death)
    const scene = this.sprite.scene;
    scene.time.delayedCall(800, () => {
      if (this.isAttacking && this.currentAnim === key) {
        this.isAttacking = false;
        this.currentAnim = '';
      }
    });

    drawSlash(scene, this.sprite.x, this.sprite.y, dirX, dirY);
  }

  private dirToString(dirX: number, dirY: number): string {
    if (dirY > 0) return 'down';
    if (dirY < 0) return 'up';
    if (dirX < 0) return 'left';
    return 'right';
  }

  setAlive(alive: boolean): void {
    this.alive = alive;
    // Visibility managed by playDeath / playRespawn — not toggled directly here
  }

  playDeath(): void {
    this.isAttacking = false;
    this.body.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
    const dir = this.getDirection();
    this.currentAnim = '';
    this.body.stop();
    const deathKey = `${this.spriteKey}_death_${dir}`;
    const scene = this.sprite.scene;
    if (scene.anims.exists(deathKey)) {
      this.body.play(deathKey);
    } else {
      this.sprite.setVisible(false);
    }
  }

  playRespawn(): void {
    this.isAttacking = false;
    this.body.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
    this.currentAnim = '';
    this.sprite.setVisible(true);
    this.body.play(`${this.spriteKey}_idle_down`);
  }

  updatePosition(x: number, y: number): void {
    const dx = x - this.targetX;
    const dy = y - this.targetY;
    const dist = Math.abs(dx) + Math.abs(dy);
    const scene = this.sprite.scene;

    // Teleport threshold — snap instantly instead of lerping across the map on spawn/respawn
    if (dist > 200) {
      this.sprite.x = x;
      this.sprite.y = y;
    }

    if (dist > 0.5) {
      this.facingX = dx !== 0 ? Math.sign(dx) : 0;
      this.facingY = dy !== 0 ? Math.sign(dy) : 0;
      this.isMoving = true;

      // Reset idle timer — switch to idle if no position update arrives within 150ms
      if (this.idleTimer) { this.idleTimer.destroy(); this.idleTimer = undefined; }
      this.idleTimer = scene.time.delayedCall(150, () => {
        this.isMoving = false;
        this.idleTimer = undefined;
        if (!this.alive) return;
        if (this.isAttacking) return;
        const dir = this.getDirection();
        this.playAnim(`${this.spriteKey}_idle_${dir}`);
      });
    }

    this.targetX = x;
    this.targetY = y;

    if (!this.alive) return;

    if (this.flipForLeft) this.body.setFlipX(this.facingX < 0);
    else if (this.flipForRight) this.body.setFlipX(this.facingX > 0);
    if (!this.isAttacking) {
      const dir = this.getDirection();
      this.playAnim(`${this.spriteKey}_${this.isMoving ? 'run' : 'idle'}_${dir}`);
    }
  }

  /** Called every frame from GameScene.update(). Smoothly lerps toward the latest target. */
  interpolate(delta: number): void {
    // Exponential lerp — half-life ~40ms gives smooth but responsive catch-up
    const alpha = 1 - Math.pow(0.5, delta / 40);
    this.sprite.x += (this.targetX - this.sprite.x) * alpha;
    this.sprite.y += (this.targetY - this.sprite.y) * alpha;
  }

  destroy(): void {
    if (this.idleTimer) { this.idleTimer.destroy(); this.idleTimer = undefined; }
    this.sprite.destroy();
  }
}
