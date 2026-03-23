export const TILE = {
  GRASS: 0,
  PATH: 1,
  BUILDING: 2,
  FIELD: 3,
} as const;

export const TILE_SIZE = 16;
export const MAP_W = 150;
export const MAP_H = 100;

export interface Building {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

export const BUILDINGS: Building[] = [
  // Top-left: bleacher strip above the soccer field
  { name: 'Stadium',     x: 10, y: 5,  w: 28, h: 6,  color: 0x5a5a6e },
  // Left column: soccer/football field — marked TILE.FIELD so it stays walkable
  { name: 'Field',       x: 8,  y: 12, w: 35, h: 60, color: 0x2d8a4e },
  // Upper center-left: white columned academic building
  { name: 'Craton Hall', x: 57, y: 5,  w: 22, h: 17, color: 0xd4c5a0 },
  // Upper right: large brick / slate-roof arena
  { name: 'Arena',       x: 83, y: 4,  w: 60, h: 21, color: 0x8b4513 },
  // Center: Robey building
  { name: 'Robey',       x: 49, y: 37, w: 19, h: 16, color: 0x6b4226 },
  // Center-right: small red building
  { name: 'Eliot Hall',  x: 83, y: 37, w: 17, h: 13, color: 0x8b3a3a },
  // Bottom-left: Library
  { name: 'Library',     x: 5,  y: 75, w: 23, h: 17, color: 0x4a708b },
  // Bottom-center: academic/residential hall
  { name: 'Whitman Hall',x: 49, y: 68, w: 32, h: 22, color: 0x5f6b4e },
  // Bottom-right: large Victorian main hall
  { name: 'Main Hall',   x: 83, y: 60, w: 55, h: 33, color: 0x8b0000 },
];

function generateMap(): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < MAP_H; y++) {
    grid[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      grid[y][x] = TILE.GRASS;
    }
  }

  // Place buildings — Field uses TILE.FIELD so it remains walkable
  for (const b of BUILDINGS) {
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const tx = b.x + dx;
        const ty = b.y + dy;
        if (tx < MAP_W && ty < MAP_H) {
          grid[ty][tx] = b.name === 'Field' ? TILE.FIELD : TILE.BUILDING;
        }
      }
    }
  }

  return grid;
}

export const MAP_DATA: number[][] = generateMap();

let _gamePhase: 'waiting' | 'playing' = 'waiting';

export function setGamePhase(p: 'waiting' | 'playing'): void {
  _gamePhase = p;
}

export function isWalkable(tileX: number, tileY: number): boolean {
  if (_gamePhase === 'waiting') {
    // Interior tiles only — wall at 0 and 19 (20×20 room)
    return tileX > 0 && tileX < 19 && tileY > 0 && tileY < 19;
  }
  // Block outer tree border (~5 tiles from each edge)
  if (tileX < 5 || tileX >= 145 || tileY < 5 || tileY >= 95) {
    return false;
  }
  const tile = MAP_DATA[tileY][tileX];
  return tile === TILE.GRASS || tile === TILE.PATH || tile === TILE.FIELD;
}
