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

export function dirFromBit(bit: number): Dir {
  return DIRS.find((d) => d.bit === bit)!;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export type Rng = () => number;

// Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da el mismo laberinto.
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

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export class Maze {
  readonly cols: number;
  readonly rows: number;
  // walls[y][x]: máscara de bits con las paredes que tiene la celda (N, E, S, W).
  readonly walls: number[][];
  readonly entrance: Cell;
  readonly exit: Cell;

  constructor(cols: number, rows: number, walls: number[][], entrance?: Cell, exit?: Cell) {
    this.cols = cols;
    this.rows = rows;
    this.walls = walls;
    this.entrance = entrance ?? { x: 0, y: rows - 1 };
    this.exit = exit ?? { x: cols - 1, y: 0 };
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  canMove(x: number, y: number, dir: Dir): boolean {
    return this.inBounds(x, y) && this.inBounds(x + dir.dx, y + dir.dy) && (this.walls[y][x] & dir.bit) === 0;
  }

  setWall(x: number, y: number, dir: Dir, present: boolean): void {
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    if (!this.inBounds(x, y) || !this.inBounds(nx, ny)) return;
    if (present) {
      this.walls[y][x] |= dir.bit;
      this.walls[ny][nx] |= dir.opposite;
    } else {
      this.walls[y][x] &= ~dir.bit;
      this.walls[ny][nx] &= ~dir.opposite;
    }
  }

  neighbors(c: Cell): Cell[] {
    const out: Cell[] = [];
    for (const d of DIRS) {
      if (this.canMove(c.x, c.y, d)) out.push({ x: c.x + d.dx, y: c.y + d.dy });
    }
    return out;
  }

  // Distancias en pasos desde una celda a todas las demás (búsqueda en anchura).
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

  // Camino más corto de `from` a `to` (incluye ambos extremos), o [] si no hay.
  path(from: Cell, to: Cell): Cell[] {
    const dist = this.distancesFrom(to);
    if (dist[from.y][from.x] < 0) return [];
    const out: Cell[] = [from];
    let c = from;
    while (!sameCell(c, to)) {
      const next = this.neighbors(c).find((n) => dist[n.y][n.x] === dist[c.y][c.x] - 1);
      if (!next) break;
      out.push(next);
      c = next;
    }
    return out;
  }

  // Primer paso del camino más corto de `from` a `to`, o undefined si ya está ahí.
  nextStepTowards(from: Cell, to: Cell): Cell | undefined {
    if (sameCell(from, to)) return undefined;
    const dist = this.distancesFrom(to);
    let best: Cell | undefined;
    for (const n of this.neighbors(from)) {
      if (dist[n.y][n.x] >= 0 && (!best || dist[n.y][n.x] < dist[best.y][best.x])) best = n;
    }
    return best;
  }

  // ¿Se ven en línea recta por un pasillo sin muros, a `range` celdas o menos?
  lineOfSight(a: Cell, b: Cell, range: number): boolean {
    if (a.x !== b.x && a.y !== b.y) return false;
    const steps = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (steps > range) return false;
    if (steps === 0) return true;
    const d = dirFromDelta(Math.sign(b.x - a.x), Math.sign(b.y - a.y))!;
    let c = a;
    for (let i = 0; i < steps; i++) {
      if (!this.canMove(c.x, c.y, d)) return false;
      c = { x: c.x + d.dx, y: c.y + d.dy };
    }
    return true;
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

// Laberinto con retroceso recursivo y después ciclos: se abre una fracción (`loopFactor`) de los
// muros internos restantes, sobre todo en callejones sin salida, para que haya rutas alternativas.
export function generateMaze(
  cols: number,
  rows: number,
  rng: Rng = Math.random,
  loopFactor = 0.12,
  entrance: Cell = { x: 0, y: rows - 1 },
  exit: Cell = { x: cols - 1, y: 0 },
): Maze {
  const walls = Array.from({ length: rows }, () => new Array<number>(cols).fill(N | E | S | W));
  const maze = new Maze(cols, rows, walls, entrance, exit);
  const visited = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));

  // Tallado desde la entrada.
  const stack: Cell[] = [entrance];
  visited[entrance.y][entrance.x] = true;
  while (stack.length > 0) {
    const c = stack[stack.length - 1];
    const options = DIRS.filter((d) => maze.inBounds(c.x + d.dx, c.y + d.dy) && !visited[c.y + d.dy][c.x + d.dx]);
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const d = options[Math.floor(rng() * options.length)];
    maze.setWall(c.x, c.y, d, false);
    visited[c.y + d.dy][c.x + d.dx] = true;
    stack.push({ x: c.x + d.dx, y: c.y + d.dy });
  }

  // Ciclos: primero en callejones sin salida, luego en muros al azar.
  let interiorWalls = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x < cols - 1 && walls[y][x] & E) interiorWalls++;
      if (y < rows - 1 && walls[y][x] & S) interiorWalls++;
    }
  }
  let toOpen = Math.floor(interiorWalls * loopFactor);
  const deadEnds = maze.deadEnds().filter((c) => !sameCell(c, entrance) && !sameCell(c, exit));
  shuffle(deadEnds, rng);
  for (const c of deadEnds) {
    if (toOpen <= 0) break;
    if (maze.neighbors(c).length !== 1) continue;
    const closed = DIRS.filter((d) => maze.inBounds(c.x + d.dx, c.y + d.dy) && walls[c.y][c.x] & d.bit);
    if (closed.length === 0) continue;
    // Solo una parte de los ciclos sale de callejones; el resto queda para muros al azar.
    if (rng() < 0.3) continue;
    maze.setWall(c.x, c.y, closed[Math.floor(rng() * closed.length)], false);
    toOpen--;
  }
  const interior: Array<[number, number, Dir]> = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x < cols - 1 && walls[y][x] & E) interior.push([x, y, DIRS[1]]);
      if (y < rows - 1 && walls[y][x] & S) interior.push([x, y, DIRS[2]]);
    }
  }
  shuffle(interior, rng);
  for (let i = 0; i < toOpen && i < interior.length; i++) {
    const [x, y, d] = interior[i];
    maze.setWall(x, y, d, false);
  }
  return maze;
}

// Laberinto de nivel: entrada en el borde inferior y salida en el superior, en columnas al azar
// pero en mitades opuestas. Se regenera si el camino entre ambas queda demasiado corto
// (menos del 60 % de la mayor distancia posible desde la entrada).
export function generateLevelMaze(cols: number, rows: number, seed: number, loopFactor: number): Maze {
  const rng = seededRng(seed);
  let best: Maze | null = null;
  let bestRatio = -1;
  for (let attempt = 0; attempt < 30; attempt++) {
    const half = Math.floor(cols / 2);
    const leftEntrance = rng() < 0.5;
    const pick = (fromLeft: boolean) => (fromLeft ? Math.floor(rng() * half) : cols - 1 - Math.floor(rng() * half));
    const entrance = { x: pick(leftEntrance), y: rows - 1 };
    const exit = { x: pick(!leftEntrance), y: 0 };
    const maze = generateMaze(cols, rows, rng, loopFactor, entrance, exit);
    const dist = maze.distancesFrom(entrance);
    const max = Math.max(...dist.flat());
    const ratio = dist[exit.y][exit.x] / max;
    if (ratio >= 0.6) return maze;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = maze;
    }
  }
  return best!;
}

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Semilla del "laberinto del día": la misma para todos en la misma fecha.
export function dailySeed(date = new Date()): number {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
