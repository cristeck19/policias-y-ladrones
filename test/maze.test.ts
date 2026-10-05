import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));
import { levelConfig, starsFor } from '../src/config';
import { pickItems } from '../src/items';
import { DIRS, Maze, N, S, W, E, generateLevelMaze, generateMaze, seededRng } from '../src/maze';

describe('generateMaze', () => {
  it('conecta todas las celdas y la entrada con la salida', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const m = generateMaze(9 + (seed % 7), 15 + (seed % 9), seededRng(seed));
      const dist = m.distancesFrom(m.entrance);
      expect(dist.flat().every((d) => d >= 0)).toBe(true);
      expect(dist[m.exit.y][m.exit.x]).toBeGreaterThan(0);
    }
  });

  it('pone la entrada y la salida en esquinas opuestas', () => {
    const m = generateMaze(9, 15, seededRng(3));
    expect(m.entrance).toEqual({ x: 0, y: 14 });
    expect(m.exit).toEqual({ x: 8, y: 0 });
  });

  it('mantiene el borde exterior cerrado y las paredes simétricas', () => {
    const m = generateMaze(10, 16, seededRng(7));
    for (let y = 0; y < m.rows; y++) {
      for (let x = 0; x < m.cols; x++) {
        const w = m.walls[y][x];
        if (y === 0) expect(w & 1).toBe(1);
        if (x === m.cols - 1) expect(w & 2).toBe(2);
        if (y === m.rows - 1) expect(w & 4).toBe(4);
        if (x === 0) expect(w & 8).toBe(8);
        if (x < m.cols - 1) expect(Boolean(w & 2)).toBe(Boolean(m.walls[y][x + 1] & 8));
        if (y < m.rows - 1) expect(Boolean(w & 4)).toBe(Boolean(m.walls[y + 1][x] & 1));
      }
    }
  });

  it('el siguiente paso acerca al objetivo', () => {
    const m = generateMaze(9, 15, seededRng(11));
    const dist = m.distancesFrom(m.exit);
    const step = m.nextStepTowards(m.entrance, m.exit)!;
    expect(dist[step.y][step.x]).toBe(dist[m.entrance.y][m.entrance.x] - 1);
  });
});

describe('generateLevelMaze', () => {
  it('pone la entrada abajo y la salida arriba, en mitades opuestas y con camino largo', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = generateLevelMaze(13, 21, seed, 0.12);
      expect(m.entrance.y).toBe(20);
      expect(m.exit.y).toBe(0);
      const half = Math.floor(13 / 2);
      expect(m.entrance.x < half).not.toBe(m.exit.x < half);
      const dist = m.distancesFrom(m.entrance);
      expect(dist.flat().every((d) => d >= 0)).toBe(true);
    }
  });

  it('la misma semilla da el mismo laberinto', () => {
    const a = generateLevelMaze(9, 15, 1234, 0.15);
    const b = generateLevelMaze(9, 15, 1234, 0.15);
    expect(a.walls).toEqual(b.walls);
    expect(a.entrance).toEqual(b.entrance);
  });
});

describe('lineOfSight', () => {
  it('ve por un pasillo recto y no a través de muros', () => {
    const open = new Maze(4, 1, [[N | S | W, N | S, N | S, N | S | E]]);
    expect(open.lineOfSight({ x: 0, y: 0 }, { x: 3, y: 0 }, 5)).toBe(true);
    expect(open.lineOfSight({ x: 0, y: 0 }, { x: 3, y: 0 }, 2)).toBe(false);
    open.setWall(1, 0, DIRS[1], true);
    expect(open.lineOfSight({ x: 0, y: 0 }, { x: 3, y: 0 }, 5)).toBe(false);
  });
});

describe('progresión', () => {
  it('sigue la tabla de tamaños y policías del documento', () => {
    expect(levelConfig(1)).toMatchObject({ cols: 9, rows: 15, cops: 1 });
    expect(levelConfig(10)).toMatchObject({ cols: 13, rows: 21, cops: 1 });
    expect(levelConfig(20)).toMatchObject({ cols: 17, rows: 27, cops: 2 });
    expect(levelConfig(35).cols).toBe(21);
    expect(levelConfig(35).darkFraction).toBeGreaterThan(0);
  });

  it('da estrellas por escapar, por tiempo y por no ser atrapado', () => {
    expect(starsFor(false, 50, 90, 0)).toBe(0);
    expect(starsFor(true, 10, 90, 2)).toBe(1);
    expect(starsFor(true, 40, 90, 1)).toBe(2);
    expect(starsFor(true, 40, 90, 0)).toBe(3);
  });

  it('solo reparte artefactos desbloqueados y como máximo 2 relojes de arena', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { kinds, rare } = pickItems(1, 4, seededRng(seed));
      expect(kinds.every((k) => ['hourglass', 'shoes', 'smoke'].includes(k))).toBe(true);
      expect(kinds.filter((k) => k === 'hourglass').length).toBeLessThanOrEqual(2);
      expect(rare).toBeNull();
    }
    const { rare } = pickItems(6, 5, seededRng(1));
    expect(['cloak', 'wall', 'key']).toContain(rare);
  });
});
