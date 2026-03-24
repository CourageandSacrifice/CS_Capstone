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
  // Left: bleacher strip (solid collision, sits beside the field)
  { name: 'Stadium',     x: 4,  y: 5,  w: 16, h: 10, color: 0x7a5c3a },
  // Left: sports field — walkable, not a wall
  { name: 'Field',       x: 4,  y: 16, w: 16, h: 52, color: 0x2d8a4e },
  // Upper center: academic hall
  { name: 'Craton',      x: 38, y: 5,  w: 14, h: 12, color: 0x556b2f },
  // Upper right: large arena
  { name: 'Arena',       x: 57, y: 3,  w: 40, h: 22, color: 0x8b4513 },
  // Center-left: Robey
  { name: 'Robey',       x: 25, y: 40, w: 9,  h: 14, color: 0x6b4226 },
  // Center: Round Table
  { name: 'Round Table', x: 57, y: 44, w: 10, h: 9,  color: 0x8b6914 },
  // Center-right: PAC
  { name: 'PAC',         x: 100,y: 52, w: 10, h: 18, color: 0x4b0082 },
  // Bottom-left: Library
  { name: 'Library',     x: 4,  y: 74, w: 16, h: 14, color: 0x4a708b },
  // Bottom-center: Academic
  { name: 'Academic',    x: 30, y: 70, w: 18, h: 14, color: 0x5f6b4e },
  // Bottom-right: Main Hall (largest building)
  { name: 'Main Hall',   x: 60, y: 68, w: 35, h: 26, color: 0x8b0000 },
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
