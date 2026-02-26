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
}

const WARRIOR: Pick<ClassData, 'maxHp' | 'speed' | 'attackDamage' | 'attackRange' | 'attackRate'> = {
  maxHp: 120, speed: 100, attackDamage: 30, attackRange: 35, attackRate: 500,
};
const GUARD: Pick<ClassData, 'maxHp' | 'speed' | 'attackDamage' | 'attackRange' | 'attackRate'> = {
  maxHp: 150, speed: 90, attackDamage: 25, attackRange: 32, attackRate: 500,
};

export const CHARACTERS: ClassData[] = [
  // Warriors
  { name: 'Archer',         color: 0xe9c46a, ...WARRIOR, weaponName: 'Bow',            spriteKey: 'archer'         },
  { name: 'Shield Fighter', color: 0x264653, ...WARRIOR, weaponName: 'Sword & Shield', spriteKey: 'shield_fighter' },
  // Guards
  { name: 'Guard Archer',   color: 0x9eb0c2, ...GUARD,   weaponName: 'Bow',            spriteKey: 'guard_archer'   },
  { name: 'Guard Spearman', color: 0x7a8fa6, ...GUARD,   weaponName: 'Spear',          spriteKey: 'guard_spearman' },
  { name: 'Guard Swordsman', color: 0x6b7fa8, ...GUARD,  weaponName: 'Sword',          spriteKey: 'guard_swordsman' },
];

export const DEFAULT_CLASS: ClassData = CHARACTERS[0];
