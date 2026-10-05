import { Cell, Dir, Maze } from './maze';

// Un cuadro que se mueve de celda en celda con desplazamiento suave.
export class Mover {
  cell: Cell;
  target: Cell | null = null;
  progress = 0;
  dir: Dir | null = null;

  constructor(start: Cell) {
    this.cell = { ...start };
  }

  // Posición continua en unidades de celda (para dibujar y para detectar choques).
  get pos(): { x: number; y: number } {
    if (!this.target) return { x: this.cell.x, y: this.cell.y };
    return {
      x: this.cell.x + (this.target.x - this.cell.x) * this.progress,
      y: this.cell.y + (this.target.y - this.cell.y) * this.progress,
    };
  }

  // Celda más cercana a la posición actual.
  get nearestCell(): Cell {
    return this.target && this.progress >= 0.5 ? this.target : this.cell;
  }

  // Avanza `speed` celdas por segundo. `chooseNext` decide la siguiente celda al llegar.
  advance(dt: number, speed: number, maze: Maze, chooseNext: () => Dir | null): void {
    let budget = speed * dt;
    while (budget > 0) {
      if (!this.target) {
        const d = chooseNext();
        if (!d || !maze.canMove(this.cell.x, this.cell.y, d)) {
          this.dir = null;
          return;
        }
        this.dir = d;
        this.target = { x: this.cell.x + d.dx, y: this.cell.y + d.dy };
        this.progress = 0;
      }
      const remaining = 1 - this.progress;
      if (budget >= remaining) {
        budget -= remaining;
        this.cell = this.target;
        this.target = null;
        this.progress = 0;
      } else {
        this.progress += budget;
        budget = 0;
      }
    }
  }

  // Permite dar media vuelta en medio de un pasillo sin esperar a llegar a la celda.
  reverse(): void {
    if (!this.target || !this.dir) return;
    const from = this.cell;
    this.cell = this.target;
    this.target = from;
    this.progress = 1 - this.progress;
    this.dir = { bit: this.dir.opposite, dx: -this.dir.dx, dy: -this.dir.dy, opposite: this.dir.bit };
  }
}
