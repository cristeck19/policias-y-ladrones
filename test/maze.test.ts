import { describe, expect, it } from 'vitest';
import { DIRS, E, Maze, N, S, W, generateMaze, seededRng } from '../src/maze';
import { Mover } from '../src/mover';

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

describe('Mover.tryTurn', () => {
  // Laberinto de 3x2: pasillo inferior de 3 celdas con salida hacia arriba solo en la celda del medio.
  const maze = new Maze(3, 2, [
    [N | W | S, N | E | W, N | E | S],
    [N | W | S, S, N | E | S],
  ]);

  it('gira aunque la tecla llegue un poco tarde', () => {
    const m = new Mover({ x: 1, y: 1 });
    m.target = { x: 2, y: 1 };
    m.dir = DIRS[1]; // derecha
    m.progress = 0.3;
    expect(m.tryTurn(maze, DIRS[0], 0.45)).toBe(true);
    expect(m.cell).toEqual({ x: 1, y: 1 });
    expect(m.target).toBeNull();
  });

  it('gira aunque la tecla llegue un poco antes', () => {
    const m = new Mover({ x: 0, y: 1 });
    m.target = { x: 1, y: 1 };
    m.dir = DIRS[1];
    m.progress = 0.7;
    expect(m.tryTurn(maze, DIRS[0], 0.45)).toBe(true);
    expect(m.cell).toEqual({ x: 1, y: 1 });
  });

  it('no gira donde hay pared', () => {
    const m = new Mover({ x: 1, y: 1 });
    m.target = { x: 2, y: 1 };
    m.dir = DIRS[1];
    m.progress = 0.7;
    expect(m.tryTurn(maze, DIRS[0], 0.45)).toBe(false);
  });
});
