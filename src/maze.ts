// Generación de laberintos y búsqueda de caminos. Sin dependencias de Phaser para poder probarlo.

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export interface Cell {
  x: number;
  y: number;
}

export interface Dir {
  bit: number;
  dx: number;
  dy: number;
  opposite: number;
}

export const DIRS: Dir[] = [
  { bit: N, dx: 0, dy: -1, opposite: S },
  { bit: E, dx: 1, dy: 0, opposite: W },
  { bit: S, dx: 0, dy: 1, opposite: N },
  { bit: W, dx: -1, dy: 0, opposite: E },
];

export function dirFromDelta(dx: number, dy: number): Dir | undefined {
  return DIRS.find((d) => d.dx === dx && d.dy === dy);
}

export type Rng = () => number;

// Generador pseudoaleatorio con semilla (mulberry32), útil para pruebas reproducibles.
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Maze {
  readonly cols: number;
  readonly rows: number;
  // walls[y][x]: máscara de bits con las paredes que tiene la celda (N, E, S, W).
  readonly walls: number[][];
  readonly entrance: Cell;
  readonly exit: Cell;

  constructor(cols: number, rows: number, walls: number[][]) {
    this.cols = cols;
    this.rows = rows;
    this.walls = walls;
    // Entrada y salida en esquinas opuestas.
    this.entrance = { x: 0, y: rows - 1 };
    this.exit = { x: cols - 1, y: 0 };
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  canMove(x: number, y: number, dir: Dir): boolean {
    return this.inBounds(x, y) && this.inBounds(x + dir.dx, y + dir.dy) && (this.walls[y][x] & dir.bit) === 0;
  }

  neighbors(c: Cell): Cell[] {
    const out: Cell[] = [];
    for (const d of DIRS) {
      if (this.canMove(c.x, c.y, d)) out.push({ x: c.x + d.dx, y: c.y + d.dy });
    }
    return out;
  }

  // Distancias en pasos desde una celda a todas las demás (BFS).
  distancesFrom(start: Cell): number[][] {
    const dist = Array.from({ length: this.rows }, () => new Array<number>(this.cols).fill(-1));
    const queue: Cell[] = [start];
    dist[start.y][start.x] = 0;
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      for (const n of this.neighbors(c)) {
        if (dist[n.y][n.x] === -1) {
          dist[n.y][n.x] = dist[c.y][c.x] + 1;
          queue.push(n);
        }
      }
    }
    return dist;
  }

  // Primer paso del camino más corto de `from` a `to`, o undefined si ya está ahí.
  nextStepTowards(from: Cell, to: Cell): Cell | undefined {
    if (from.x === to.x && from.y === to.y) return undefined;
    const dist = this.distancesFrom(to);
    let best: Cell | undefined;
    for (const n of this.neighbors(from)) {
      if (dist[n.y][n.x] >= 0 && (!best || dist[n.y][n.x] < dist[best.y][best.x])) best = n;
    }
    return best;
  }

  deadEnds(): Cell[] {
    const out: Cell[] = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.neighbors({ x, y }).length === 1) out.push({ x, y });
      }
    }
    return out;
  }
}

// Laberinto perfecto con "backtracking" recursivo y luego se abren algunos muros extra
// (`loopFactor`) para que haya rutas alternativas y el ladrón pueda esquivar al policía.
export function generateMaze(cols: number, rows: number, rng: Rng = Math.random, loopFactor = 0.12): Maze {
  const walls = Array.from({ length: rows }, () => new Array<number>(cols).fill(N | E | S | W));
  const visited = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;

  const stack: Cell[] = [{ x: 0, y: rows - 1 }];
  visited[rows - 1][0] = true;
  while (stack.length > 0) {
    const c = stack[stack.length - 1];
    const options = DIRS.filter((d) => inBounds(c.x + d.dx, c.y + d.dy) && !visited[c.y + d.dy][c.x + d.dx]);
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const d = options[Math.floor(rng() * options.length)];
    const nx = c.x + d.dx;
    const ny = c.y + d.dy;
    walls[c.y][c.x] &= ~d.bit;
    walls[ny][nx] &= ~d.opposite;
    visited[ny][nx] = true;
    stack.push({ x: nx, y: ny });
  }

  // Abrir muros interiores al azar para crear ciclos.
  const interior: Array<[number, number, Dir]> = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      for (const d of [DIRS[1], DIRS[2]]) {
        if (inBounds(x + d.dx, y + d.dy) && walls[y][x] & d.bit) interior.push([x, y, d]);
      }
    }
  }
  const extra = Math.floor(interior.length * loopFactor);
  for (let i = 0; i < extra && interior.length > 0; i++) {
    const idx = Math.floor(rng() * interior.length);
    const [x, y, d] = interior.splice(idx, 1)[0];
    walls[y][x] &= ~d.bit;
    walls[y + d.dy][x + d.dx] &= ~d.opposite;
  }

  return new Maze(cols, rows, walls);
}
