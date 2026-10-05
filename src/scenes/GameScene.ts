import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, HUD_HEIGHT, LevelConfig, PANEL_HEIGHT, RULES, levelConfig, levelTimeSeconds } from '../config';
import { Cell, DIRS, Dir, Maze, dirFromDelta, generateMaze } from '../maze';
import { Mover } from '../mover';

type ItemKind = 'hourglass';

interface Pickup {
  kind: ItemKind;
  cell: Cell;
  sprite: Phaser.GameObjects.Graphics;
}

interface Cop {
  mover: Mover;
  rect: Phaser.GameObjects.Rectangle;
  stunnedUntil: number;
}

export interface GameResult {
  won: boolean;
  level: number;
  timeLeft: number;
  captures: number;
}

const SWIPE_MIN = 18;

export class GameScene extends Phaser.Scene {
  private cfg!: LevelConfig;
  private maze!: Maze;
  private cellSize = 0;
  private originX = 0;
  private originY = 0;

  private thief!: Mover;
  private thiefRect!: Phaser.GameObjects.Rectangle;
  private wanted: Dir | null = null;
  private slowedUntil = 0;
  private cops: Cop[] = [];
  private pickups: Pickup[] = [];
  private inventory: ItemKind[] = [];

  private timeLeft = 0; // segundos del reloj del nivel
  private bonusLeft = 0; // segundos del reloj de arena (mientras corre, el del nivel se detiene)
  private elapsed = 0; // reloj interno de la escena en ms (se detiene con la pausa)
  private captures = 0;
  private finished = false;

  private clockText!: Phaser.GameObjects.Text;
  private bonusText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private slotGroup: Phaser.GameObjects.Container[] = [];
  private swipeStart: Phaser.Math.Vector2 | null = null;

  constructor() {
    super('game');
  }

  init(data: { level?: number }): void {
    this.cfg = levelConfig(data.level ?? 1);
    this.cops = [];
    this.pickups = [];
    this.inventory = [];
    this.wanted = null;
    this.slowedUntil = 0;
    this.bonusLeft = 0;
    this.elapsed = 0;
    this.captures = 0;
    this.finished = false;
    this.slotGroup = [];
    this.swipeStart = null;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.maze = generateMaze(this.cfg.cols, this.cfg.rows);

    const areaW = GAME_WIDTH - 16;
    const areaH = GAME_HEIGHT - HUD_HEIGHT - PANEL_HEIGHT - 8;
    this.cellSize = Math.floor(Math.min(areaW / this.maze.cols, areaH / this.maze.rows));
    this.originX = Math.floor((GAME_WIDTH - this.cellSize * this.maze.cols) / 2);
    this.originY = HUD_HEIGHT + Math.floor((areaH - this.cellSize * this.maze.rows) / 2) + 4;

    this.drawMaze();

    const shortest = this.maze.distancesFrom(this.maze.entrance)[this.maze.exit.y][this.maze.exit.x];
    this.timeLeft = levelTimeSeconds(shortest);

    this.placePickups();

    const size = this.cellSize * 0.62;
    this.thief = new Mover(this.maze.entrance);
    this.thiefRect = this.add.rectangle(0, 0, size, size, COLORS.thief).setStrokeStyle(2, 0x000000, 0.4).setDepth(5);
    this.spawnCops(size);

    this.createHud();
    this.createPanel();
    this.setupInput();
    this.syncSprites();
  }

  // ---------- Construcción del nivel ----------

  private cellCenter(x: number, y: number): { x: number; y: number } {
    return {
      x: this.originX + (x + 0.5) * this.cellSize,
      y: this.originY + (y + 0.5) * this.cellSize,
    };
  }

  private drawMaze(): void {
    const g = this.add.graphics();
    const cs = this.cellSize;
    const { cols, rows, walls, entrance, exit } = this.maze;

    g.fillStyle(COLORS.floor, 1);
    g.fillRect(this.originX, this.originY, cols * cs, rows * cs);

    g.fillStyle(COLORS.entrance, 1);
    g.fillRect(this.originX + entrance.x * cs + 2, this.originY + entrance.y * cs + 2, cs - 4, cs - 4);
    g.fillStyle(COLORS.exit, 0.85);
    g.fillRect(this.originX + exit.x * cs + 2, this.originY + exit.y * cs + 2, cs - 4, cs - 4);

    g.lineStyle(Math.max(2, Math.round(cs / 8)), COLORS.wall, 1);
    g.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = this.originX + x * cs;
        const py = this.originY + y * cs;
        const w = walls[y][x];
        if (w & DIRS[0].bit) { g.moveTo(px, py); g.lineTo(px + cs, py); }
        if (w & DIRS[3].bit) { g.moveTo(px, py); g.lineTo(px, py + cs); }
        if (y === rows - 1 && w & DIRS[2].bit) { g.moveTo(px, py + cs); g.lineTo(px + cs, py + cs); }
        if (x === cols - 1 && w & DIRS[1].bit) { g.moveTo(px + cs, py); g.lineTo(px + cs, py + cs); }
      }
    }
    g.strokePath();

    const exitC = this.cellCenter(exit.x, exit.y);
    this.add.text(exitC.x, exitC.y, 'SALIDA', { fontFamily: 'sans-serif', fontSize: `${Math.max(7, Math.floor(cs / 4.6))}px`, color: '#0b3d20', fontStyle: 'bold' }).setOrigin(0.5).setDepth(1);
  }

  private placePickups(): void {
    const fromStart = this.maze.distancesFrom(this.maze.entrance);
    const maxD = fromStart[this.maze.exit.y][this.maze.exit.x];
    const isSpecial = (c: Cell) =>
      (c.x === this.maze.entrance.x && c.y === this.maze.entrance.y) || (c.x === this.maze.exit.x && c.y === this.maze.exit.y);
    // Preferir callejones sin salida a una distancia razonable de la entrada.
    let candidates = this.maze.deadEnds().filter((c) => !isSpecial(c) && fromStart[c.y][c.x] >= maxD * 0.25);
    if (candidates.length < this.cfg.hourglasses) {
      candidates = [];
      for (let y = 0; y < this.maze.rows; y++) for (let x = 0; x < this.maze.cols; x++) if (!isSpecial({ x, y })) candidates.push({ x, y });
    }
    Phaser.Utils.Array.Shuffle(candidates);
    const count = Math.min(this.cfg.hourglasses, RULES.maxHourglassesPerMaze, candidates.length);
    for (let i = 0; i < count; i++) {
      const cell = candidates[i];
      const c = this.cellCenter(cell.x, cell.y);
      const sprite = this.add.graphics({ x: c.x, y: c.y }).setDepth(3);
      drawHourglass(sprite, this.cellSize * 0.5);
      this.tweens.add({ targets: sprite, scale: { from: 0.85, to: 1.1 }, duration: 600, yoyo: true, repeat: -1 });
      this.pickups.push({ kind: 'hourglass', cell, sprite });
    }
  }

  private spawnCops(size: number): void {
    const fromExit = this.maze.distancesFrom(this.maze.exit);
    // El primer policía empieza en la salida; los demás, cerca de ella.
    const near: Cell[] = [];
    for (let y = 0; y < this.maze.rows; y++) {
      for (let x = 0; x < this.maze.cols; x++) {
        const d = fromExit[y][x];
        if (d >= 3 && d <= 8) near.push({ x, y });
      }
    }
    Phaser.Utils.Array.Shuffle(near);
    for (let i = 0; i < this.cfg.cops; i++) {
      const start = i === 0 || near.length === 0 ? this.maze.exit : near[(i - 1) % near.length];
      const rect = this.add.rectangle(0, 0, size, size, COLORS.cop).setStrokeStyle(2, 0xffffff, 0.5).setDepth(4);
      this.cops.push({ mover: new Mover(start), rect, stunnedUntil: 0 });
    }
  }

  // ---------- Interfaz ----------

  private createHud(): void {
    const font = { fontFamily: 'sans-serif', color: '#e6e9f5' };
    this.add.text(12, 14, `Nivel ${this.cfg.level}`, { ...font, fontSize: '18px', fontStyle: 'bold' });
    this.add.text(12, 38, `Policías: ${this.cfg.cops}`, { ...font, fontSize: '12px', color: '#9aa3c7' });
    this.clockText = this.add.text(GAME_WIDTH / 2, 30, '', { ...font, fontSize: '28px', fontStyle: 'bold' }).setOrigin(0.5);
    this.bonusText = this.add.text(GAME_WIDTH - 12, 16, '', { ...font, fontSize: '16px', color: '#f5a623', fontStyle: 'bold' }).setOrigin(1, 0);
    this.statusText = this.add.text(GAME_WIDTH - 12, 40, '', { ...font, fontSize: '12px', color: '#ff7a7a' }).setOrigin(1, 0);

    const pause = this.add.text(GAME_WIDTH / 2 + 64, 30, 'II', { ...font, fontSize: '18px', fontStyle: 'bold', color: '#9aa3c7' })
      .setOrigin(0.5).setPadding(8, 4, 8, 4).setInteractive({ useHandCursor: true });
    pause.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      void p;
      this.togglePause();
    });
  }

  private createPanel(): void {
    const top = GAME_HEIGHT - PANEL_HEIGHT;
    this.add.text(GAME_WIDTH / 2, top + 10, 'Artefactos (toca para usar)', { fontFamily: 'sans-serif', fontSize: '11px', color: '#9aa3c7' }).setOrigin(0.5, 0);
    const slotSize = 56;
    const gap = 14;
    const totalW = RULES.inventorySlots * slotSize + (RULES.inventorySlots - 1) * gap;
    for (let i = 0; i < RULES.inventorySlots; i++) {
      const x = (GAME_WIDTH - totalW) / 2 + i * (slotSize + gap) + slotSize / 2;
      const y = top + 30 + slotSize / 2;
      const bg = this.add.rectangle(0, 0, slotSize, slotSize, COLORS.slot).setStrokeStyle(2, COLORS.slotBorder);
      const icon = this.add.graphics();
      const container = this.add.container(x, y, [bg, icon]).setSize(slotSize, slotSize);
      container.setInteractive({ useHandCursor: true });
      container.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.useItem(i);
      });
      this.slotGroup.push(container);
    }
    this.refreshPanel();
  }

  private refreshPanel(): void {
    this.slotGroup.forEach((slot, i) => {
      const icon = slot.list[1] as Phaser.GameObjects.Graphics;
      icon.clear();
      if (this.inventory[i] === 'hourglass') drawHourglass(icon, 30);
    });
  }

  private flashMessage(text: string, color: string): void {
    const t = this.add.text(GAME_WIDTH / 2, HUD_HEIGHT + 40, text, {
      fontFamily: 'sans-serif', fontSize: '22px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  // ---------- Controles ----------

  private setupInput(): void {
    // Deslizar el dedo en cualquier parte cambia la dirección del ladrón.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.swipeStart = new Phaser.Math.Vector2(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.swipeStart || !p.isDown) return;
      const dx = p.x - this.swipeStart.x;
      const dy = p.y - this.swipeStart.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
      const d = Math.abs(dx) > Math.abs(dy) ? dirFromDelta(Math.sign(dx), 0) : dirFromDelta(0, Math.sign(dy));
      if (d) this.setWanted(d);
      this.swipeStart.set(p.x, p.y); // permite encadenar giros sin levantar el dedo
    });
    this.input.on('pointerup', () => {
      this.swipeStart = null;
    });

    const kb = this.input.keyboard;
    if (kb) {
      const bind = (keys: string[], dx: number, dy: number) =>
        keys.forEach((k) => kb.on(`keydown-${k}`, () => { const d = dirFromDelta(dx, dy); if (d) this.setWanted(d); }));
      bind(['UP', 'W'], 0, -1);
      bind(['DOWN', 'S'], 0, 1);
      bind(['LEFT', 'A'], -1, 0);
      bind(['RIGHT', 'D'], 1, 0);
      kb.on('keydown-SPACE', () => this.useItem(0));
      kb.on('keydown-P', () => this.togglePause());
      kb.on('keydown-ESC', () => this.togglePause());
    }
  }

  private setWanted(d: Dir): void {
    this.wanted = d;
    // Dar media vuelta es inmediato aunque esté entre dos celdas.
    if (this.thief.dir && this.thief.dir.bit === d.opposite) this.thief.reverse();
  }

  private togglePause(): void {
    if (this.finished) return;
    this.scene.pause();
    this.scene.launch('pause', { from: 'game' });
  }

  private useItem(index: number): void {
    if (this.finished || index >= this.inventory.length) return;
    const kind = this.inventory[index];
    this.inventory.splice(index, 1);
    if (kind === 'hourglass') {
      this.bonusLeft += RULES.hourglassSeconds;
      this.flashMessage('¡Tiempo detenido!', '#f5a623');
    }
    this.refreshPanel();
  }

  // ---------- Bucle principal ----------

  update(_time: number, deltaMs: number): void {
    if (this.finished) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed += dt * 1000;
    const now = this.elapsed;

    // Relojes: el reloj de arena consume primero su tiempo y mientras tanto el del nivel no avanza.
    if (this.bonusLeft > 0) {
      this.bonusLeft = Math.max(0, this.bonusLeft - dt);
    } else {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
    }

    // Ladrón
    const slowed = now < this.slowedUntil;
    const thiefSpeed = RULES.thiefSpeed * (slowed ? RULES.slowFactor : 1);
    this.thief.advance(dt, thiefSpeed, this.maze, () => {
      const c = this.thief.cell;
      if (this.wanted && this.maze.canMove(c.x, c.y, this.wanted)) return this.wanted;
      if (this.thief.dir && this.maze.canMove(c.x, c.y, this.thief.dir)) return this.thief.dir;
      return null;
    });

    // Recoger artefactos
    const tc = this.thief.nearestCell;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.cell.x === tc.x && p.cell.y === tc.y && this.inventory.length < RULES.inventorySlots) {
        this.inventory.push(p.kind);
        p.sprite.destroy();
        this.pickups.splice(i, 1);
        this.refreshPanel();
        this.flashMessage('+ Reloj de arena', '#f5a623');
      }
    }

    // Policías
    const toThief = this.maze.distancesFrom(tc);
    for (const cop of this.cops) {
      if (now < cop.stunnedUntil) continue;
      cop.mover.advance(dt, this.cfg.copSpeed, this.maze, () => this.copChoose(cop, toThief));
    }

    // Capturas: atrapar ralentiza al ladrón; no hay vidas.
    const tp = this.thief.pos;
    for (const cop of this.cops) {
      if (now < cop.stunnedUntil) continue;
      const cp = cop.mover.pos;
      if (Math.abs(cp.x - tp.x) < 0.7 && Math.abs(cp.y - tp.y) < 0.7) this.onCaught(cop, now);
    }

    this.syncSprites();
    this.updateHud(now);

    const t = this.thief.cell;
    if (!this.thief.target && t.x === this.maze.exit.x && t.y === this.maze.exit.y) {
      this.finish(true);
    } else if (this.timeLeft <= 0) {
      this.finish(false);
    }
  }

  private copChoose(cop: Cop, toThief: number[][]): Dir | null {
    const c = cop.mover.cell;
    const options = this.maze.neighbors(c);
    if (options.length === 0) return null;
    const d = toThief[c.y][c.x];
    if (d >= 0 && d <= this.cfg.detectRange) {
      // Persecución: tomar el vecino más cercano al ladrón.
      let best = options[0];
      for (const n of options) if (toThief[n.y][n.x] < toThief[best.y][best.x]) best = n;
      return dirFromDelta(best.x - c.x, best.y - c.y) ?? null;
    }
    // Patrulla: seguir por el pasillo y elegir al azar en los cruces, sin dar media vuelta salvo en callejones.
    const prev = cop.mover.dir;
    const forward = options.filter((n) => !prev || !(n.x - c.x === -prev.dx && n.y - c.y === -prev.dy));
    const pool = forward.length > 0 ? forward : options;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return dirFromDelta(pick.x - c.x, pick.y - c.y) ?? null;
  }

  private onCaught(cop: Cop, now: number): void {
    this.captures++;
    this.slowedUntil = now + RULES.slowMs;
    cop.stunnedUntil = now + RULES.copStunMs;
    this.cameras.main.shake(200, 0.01);
    let msg = '¡Atrapado! Vas más lento';
    if (this.inventory.length > 0) {
      // El policía se queda con un artefacto al azar.
      this.inventory.splice(Math.floor(Math.random() * this.inventory.length), 1);
      this.refreshPanel();
      msg = '¡Atrapado! Te quitó un artefacto';
    }
    this.flashMessage(msg, '#ff6b6b');
  }

  private syncSprites(): void {
    const place = (rect: Phaser.GameObjects.Rectangle, m: Mover) => {
      const p = m.pos;
      rect.setPosition(this.originX + (p.x + 0.5) * this.cellSize, this.originY + (p.y + 0.5) * this.cellSize);
    };
    place(this.thiefRect, this.thief);
    for (const cop of this.cops) place(cop.rect, cop.mover);
  }

  private updateHud(now: number): void {
    const secs = Math.ceil(this.timeLeft);
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    this.clockText.setText(`${mm}:${ss}`);
    const paused = this.bonusLeft > 0;
    this.clockText.setColor(paused ? '#7d84a3' : secs <= 10 ? '#ff6b6b' : '#e6e9f5');
    this.bonusText.setText(paused ? `⏳ ${Math.ceil(this.bonusLeft)}s` : '');

    const slowed = now < this.slowedUntil;
    this.thiefRect.setFillStyle(slowed ? COLORS.thiefSlow : COLORS.thief);
    this.statusText.setText(slowed ? 'Ralentizado' : '');
    for (const cop of this.cops) {
      const stunned = now < cop.stunnedUntil;
      cop.rect.setFillStyle(stunned ? COLORS.copStunned : COLORS.cop);
    }
  }

  private finish(won: boolean): void {
    this.finished = true;
    const result: GameResult = { won, level: this.cfg.level, timeLeft: Math.ceil(this.timeLeft), captures: this.captures };
    this.time.delayedCall(400, () => this.scene.start('result', result));
  }
}

// Reloj de arena dibujado con dos triángulos, centrado en (0,0).
export function drawHourglass(g: Phaser.GameObjects.Graphics, size: number): void {
  const h = size / 2;
  const w = size * 0.4;
  g.fillStyle(COLORS.hourglass, 1);
  g.fillTriangle(-w, -h, w, -h, 0, 0);
  g.fillTriangle(-w, h, w, h, 0, 0);
  g.lineStyle(Math.max(1.5, size / 14), 0xffffff, 0.9);
  g.lineBetween(-w - 2, -h, w + 2, -h);
  g.lineBetween(-w - 2, h, w + 2, h);
}
