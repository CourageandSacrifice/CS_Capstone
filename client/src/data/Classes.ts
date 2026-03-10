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
    maxHp: 100, speed: 105, attackDamage: 25, attackRange: 32, attackRate: 400,
    weaponName: 'Daggers',
    spriteKey: 'adventurer',
    scale: 0.78, flipForLeft: false,
    defaultTexture: 'adventurer_idle_down',
    frameWidth: 96, frameHeight: 80,
  },
];

export const DEFAULT_CLASS: ClassData = CHARACTERS[0];
