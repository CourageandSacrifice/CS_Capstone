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
  flipForRight?: boolean;
  defaultTexture: string;
  frameWidth: number;
  frameHeight: number;
}

export const CHARACTERS: ClassData[] = [
  {
    name: 'Adventurer',
    color: 0x4a9eff,
    maxHp: 100, speed: 137, attackDamage: 25, attackRange: 64, attackRate: 450,
    weaponName: 'Daggers',
    spriteKey: 'adventurer',
    scale: 1.521, flipForLeft: false,
    defaultTexture: 'adventurer_idle_down',
    frameWidth: 96, frameHeight: 80,
  },
  {
    name: 'Scout',
    color: 0xff6b6b,
    maxHp: 85, speed: 165, attackDamage: 18, attackRange: 90, attackRate: 550,
    weaponName: 'Spear',
    spriteKey: 'scout',
    scale: 2.0, flipForLeft: false,
    defaultTexture: 'scout_idle_down',
    frameWidth: 48, frameHeight: 64,
  },
  {
    name: 'Lancer',
    color: 0xe8a230,
    maxHp: 120, speed: 115, attackDamage: 42, attackRange: 90, attackRate: 600,
    weaponName: 'Spear',
    spriteKey: 'lancer',
    scale: 2.0, flipForLeft: false,
    defaultTexture: 'lancer_idle_down',
    frameWidth: 48, frameHeight: 64,
  },
];

export const DEFAULT_CLASS: ClassData = CHARACTERS[0];
