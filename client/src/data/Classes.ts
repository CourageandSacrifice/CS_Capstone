export interface ClassData {
  name: string;
  color: number;
  maxHp: number;
  speed: number;
  attackDamage: number;
  attackRange: number;
  attackRate: number;
  weaponName: string;
  spriteKey: string;
  scale: number;
  flipForLeft: boolean;
  defaultTexture: string;
  frameWidth: number;
  frameHeight: number;
}

export const CHARACTERS: ClassData[] = [
  {
    name: 'Knight',
    color: 0x888888,
    maxHp: 150, speed: 90, attackDamage: 35, attackRange: 40, attackRate: 500,
    weaponName: 'Sword',
    spriteKey: 'knight',
    scale: 0.38, flipForLeft: true,
    defaultTexture: 'knight_idle',
    frameWidth: 84, frameHeight: 84,
  },
  {
    name: 'Adventurer',
    color: 0x4a9eff,
    maxHp: 100, speed: 120, attackDamage: 25, attackRange: 32, attackRate: 400,
    weaponName: 'Daggers',
    spriteKey: 'adventurer',
    scale: 0.40, flipForLeft: false,
    defaultTexture: 'adventurer_idle_down',
    frameWidth: 80, frameHeight: 80,
  },
  {
    name: 'Warrior',
    color: 0xd4a017,
    maxHp: 130, speed: 105, attackDamage: 28, attackRange: 36, attackRate: 450,
    weaponName: 'Battle Axe',
    spriteKey: 'rpgm',
    scale: 0.50, flipForLeft: true,
    defaultTexture: 'rpgm_down_idle',
    frameWidth: 64, frameHeight: 128,
  },
];

export const DEFAULT_CLASS: ClassData = CHARACTERS[0];
