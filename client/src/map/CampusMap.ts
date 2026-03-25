export const TILE_SIZE = 16;
export const MAP_W = 150;
export const MAP_H = 100;

let _gamePhase: 'waiting' | 'playing' = 'waiting';
let _walkBitmask: boolean[][] | null = null;

export function setGamePhase(p: 'waiting' | 'playing'): void {
  _gamePhase = p;
}

export function setBitmask(mask: boolean[][]): void {
  _walkBitmask = mask;
}

function isWalkableColor(r: number, g: number, b: number): boolean {
  const lum = r + g + b;
  // Grass green: green dominant over red and blue, bright enough to exclude dark tree canopy
  if (g > 100 && g > r * 1.1 && g > b * 1.1 && lum > 200) return true;
  // Tan/beige/yellow path: warm-toned, red & green dominant over blue, bright enough
  if (r > 130 && g > 100 && r > b * 1.15 && lum > 350) return true;
  return false;
}

/** One erosion pass: a tile stays walkable only if ≥ threshold of its 3×3 neighbors are walkable. */
function erodeBitmask(mask: boolean[][], threshold: number): boolean[][] {
  const next: boolean[][] = [];
  for (let ty = 0; ty < MAP_H; ty++) {
    next[ty] = [];
    for (let tx = 0; tx < MAP_W; tx++) {
      if (!mask[ty][tx]) { next[ty][tx] = false; continue; }
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = ty + dy, nx = tx + dx;
          if (ny >= 0 && ny < MAP_H && nx >= 0 && nx < MAP_W && mask[ny][nx]) count++;
        }
      }
      next[ty][tx] = count >= threshold;
    }
  }
  return next;
}

export function buildBitmaskFromImageData(imageData: ImageData, imgW: number, imgH: number): boolean[][] {
  let mask: boolean[][] = [];
  const offsets: [number, number][] = [[0.5, 0.5], [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]];
  for (let ty = 0; ty < MAP_H; ty++) {
    mask[ty] = [];
    for (let tx = 0; tx < MAP_W; tx++) {
      let walkCount = 0;
      for (const [fx, fy] of offsets) {
        const px = Math.floor((tx + fx) / MAP_W * imgW);
        const py = Math.floor((ty + fy) / MAP_H * imgH);
        const i = (py * imgW + px) * 4;
        if (isWalkableColor(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2])) walkCount++;
      }
      mask[ty][tx] = walkCount >= 3;
    }
  }
  mask = erodeBitmask(mask, 6);
  mask = erodeBitmask(mask, 6);
  return mask;
}

const MAP_BORDER = 3;

export function isWalkable(tileX: number, tileY: number): boolean {
  if (_gamePhase === 'waiting') {
    return tileX > 0 && tileX < 19 && tileY > 0 && tileY < 19;
  }
  if (tileX < MAP_BORDER || tileX >= MAP_W - MAP_BORDER ||
      tileY < MAP_BORDER || tileY >= MAP_H - MAP_BORDER) return false;
  if (_walkBitmask === null) return false;
  return _walkBitmask[tileY][tileX];
}

/** Spiral outward from a world position until a walkable tile is found. */
export function findSafeSpawn(worldX: number, worldY: number): { x: number; y: number } {
  const startTX = Math.floor(worldX / TILE_SIZE);
  const startTY = Math.floor(worldY / TILE_SIZE);
  if (isWalkable(startTX, startTY)) return { x: worldX, y: worldY };
  for (let r = 1; r <= 30; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = startTX + dx;
        const ty = startTY + dy;
        if (isWalkable(tx, ty)) {
          return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
        }
      }
    }
  }
  return { x: worldX, y: worldY };
}
