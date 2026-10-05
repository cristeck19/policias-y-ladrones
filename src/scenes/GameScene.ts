import Phaser from 'phaser';
import {
  COLORS, FOLLOW_CELL, GAME_HEIGHT, GAME_WIDTH, HUD_HEIGHT, LevelConfig, MIN_CELL, PANEL_HEIGHT, RULES,
  levelConfig, levelTimeSeconds, starsFor,
} from '../config';
import { EFFECT_MS, ITEMS, ItemKind, drawItem, pickItems } from '../items';
import { Cell, DIRS, Dir, Maze, dirFromBit, dirFromDelta, generateLevelMaze, randomSeed, sameCell, seededRng, shuffle } from '../maze';
import { Mover } from '../mover';
import { skinById } from '../skins';
import { save } from '../storage';

export type GameMode = 'levels' | 'daily' | 'infinite';

export interface GameStart {
  mode?: GameMode;
  level?: number; // nivel (modo niveles) o profundidad (modo infinito)
  seed?: number;
}

export interface GameResult {
  mode: GameMode;
  won: boolean;
  level: number;
  seed: number;
  timeLeft: number;
  totalTime: number;
  playSeconds: number;
  captures: number;
  itemsUsed: number;
  coins: number;
  stars: number;
}

type CopState = 'patrol' | 'chase' | 'search' | 'guard' | 'intercept';

interface Cop {
  mover: Mover;
  rect: Phaser.GameObjects.Rectangle;
  state: CopState;
  stunnedUntil: number;
  target: Cell | null;
  searchUntil: number;
  clone: boolean;
  expiresAt: number;
}

interface Pickup {
  kind: ItemKind;
  cell: Cell;
  sprite: Phaser.GameObjects.Graphics;
}

interface Hazard {
  kind: 'smoke' | 'oil';
  cell: Cell;
  sprite: Phaser.GameObjects.GameObject;
  until: number;
}

interface TempWall {
  cell: Cell;
  dir: Dir;
  until: number;
}

const SWIPE_MIN = 18;
const DAILY_LEVEL = 8;

export class GameScene extends Phaser.Scene {
  private mode: GameMode = 'levels';
  private seed = 0;
  private cfg!: LevelConfig;
  private maze!: Maze;
  private rng!: () => number;

  // Vista del laberinto
  private world!: Phaser.GameObjects.Container;
  private cs = 0;
  private view = { x: 0, y: 0, w: 0, h: 0 };
  private follow = false;
  private wallGfx!: Phaser.GameObjects.Graphics;
  private overlayGfx!: Phaser.GameObjects.Graphics; // ruta del mapa
  private miniGfx: Phaser.GameObjects.Graphics | null = null;
  private dark: boolean[][] = [];
  private tempWalls: TempWall[] = [];
  private mapShown = false;

  // Ladrón
  private thief!: Mover;
  private thiefRect!: Phaser.GameObjects.Rectangle;
  private wanted: Dir | null = null;
  private lastDir: Dir | null = null;
  private heldKeys: Array<{ keys: Phaser.Input.Keyboard.Key[]; dir: Dir }> = [];
  private dpadHeld: Dir | null = null;
  private slowedUntil = 0;
  private shoesUntil = 0;
  private cloakUntil = 0;
  private mapUntil = 0;
  private disguisedUntil = 0;
  private keyArmed = false;
  private lastTrail = 0;
  private lastBump = 0;

  // Policías
  private cops: Cop[] = [];
  private lastKnown: Cell | null = null;
  private lastAlert = -9999;
  private decoy: { cell: Cell; sprite: Phaser.GameObjects.Rectangle } | null = null;
  private hazards: Hazard[] = [];
  private patrolCells: Cell[] = [];
  private guardCells: Cell[] = [];
  private shortest = 0;

  // Objetos y progreso
  private pickups: Pickup[] = [];
  private coins: Array<{ cell: Cell; sprite: Phaser.GameObjects.Rectangle }> = [];
  private coinsCollected = 0;
  private inventory: ItemKind[] = [];
  private itemsUsed = 0;
  private cooldownUntil = 0;
  private hintedItems = false;

  private timeLeft = 0; // segundos del reloj del nivel
  private totalTime = 0;
  private bonusLeft = 0; // segundos del reloj de arena (mientras corre, el del nivel se detiene)
  private elapsed = 0; // reloj interno de la escena en ms (se detiene con la pausa)
  private captures = 0;
  private finished = false;

  // Interfaz
  private clockText!: Phaser.GameObjects.Text;
  private bonusText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private alertFrame!: Phaser.GameObjects.Rectangle;
  private slots: Array<{ container: Phaser.GameObjects.Container; icon: Phaser.GameObjects.Graphics; cover: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }> = [];
  private swipeStart: Phaser.Math.Vector2 | null = null;
  private flashCount = 0;

  constructor() {
    super('game');
  }

  init(data: GameStart): void {
    this.mode = data.mode ?? 'levels';
    const level = this.mode === 'daily' ? DAILY_LEVEL : data.level ?? 1;
    this.cfg = levelConfig(level);
    this.seed = data.seed ?? randomSeed();
    this.rng = seededRng(this.seed ^ 0x9e3779b9);

    this.tempWalls = [];
    this.mapShown = false;
    this.wanted = null;
    this.lastDir = null;
    this.heldKeys = [];
    this.dpadHeld = null;
    this.slowedUntil = this.shoesUntil = this.cloakUntil = this.mapUntil = this.disguisedUntil = 0;
    this.keyArmed = false;
    this.lastTrail = this.lastBump = 0;
    this.cops = [];
    this.lastKnown = null;
    this.lastAlert = -9999;
    this.decoy = null;
    this.hazards = [];
    this.pickups = [];
    this.coins = [];
    this.coinsCollected = 0;
    this.inventory = [];
    this.itemsUsed = 0;
    this.cooldownUntil = 0;
    this.hintedItems = false;
    this.bonusLeft = 0;
    this.elapsed = 0;
    this.captures = 0;
    this.finished = false;
    this.slots = [];
    this.swipeStart = null;
    this.miniGfx = null;
    this.flashCount = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.maze = generateLevelMaze(this.cfg.cols, this.cfg.rows, this.seed, this.cfg.loopFactor);

    this.view = { x: 8, y: HUD_HEIGHT + 4, w: GAME_WIDTH - 16, h: GAME_HEIGHT - HUD_HEIGHT - PANEL_HEIGHT - 8 };
    const fit = Math.floor(Math.min(this.view.w / this.maze.cols, this.view.h / this.maze.rows));
    this.follow = fit < MIN_CELL;
    this.cs = this.follow ? FOLLOW_CELL : fit;

    this.world = this.add.container(0, 0);
    const maskShape = this.make.graphics({}, false);
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(this.view.x, this.view.y, this.view.w, this.view.h);
    this.world.setMask(maskShape.createGeometryMask());

    this.buildDarkZones();
    this.drawFloor();
    this.wallGfx = this.add.graphics();
    this.world.add(this.wallGfx);
    this.redrawWalls();
    this.overlayGfx = this.add.graphics();
    this.world.add(this.overlayGfx);

    const fromStart = this.maze.distancesFrom(this.maze.entrance);
    this.shortest = fromStart[this.maze.exit.y][this.maze.exit.x];
    this.timeLeft = this.totalTime = levelTimeSeconds(this.cfg, this.shortest);

    const fromExit = this.maze.distancesFrom(this.maze.exit);
    const maxFromExit = Math.max(...fromExit.flat());
    for (let y = 0; y < this.maze.rows; y++) {
      for (let x = 0; x < this.maze.cols; x++) {
        if (fromExit[y][x] <= maxFromExit / 2) this.patrolCells.push({ x, y }); // su mitad, cerca de la salida
        if (fromExit[y][x] <= 3) this.guardCells.push({ x, y });
      }
    }

    this.placeItemsAndCoins(fromStart);

    const size = this.cs * 0.62;
    this.thief = new Mover(this.maze.entrance);
    this.thiefRect = this.add.rectangle(0, 0, size, size, COLORS.thief).setDepth(5);
    this.world.add(this.thiefRect);
    this.spawnCop(this.maze.exit, false);
    if (this.cfg.cops > 1) {
      const near = shuffle(this.maze.distancesFrom(this.maze.exit).flatMap((row, y) => row.map((d, x) => ({ x, y, d }))).filter((c) => c.d >= 3 && c.d <= 8), this.rng);
      for (let i = 1; i < this.cfg.cops; i++) this.spawnCop(near[(i - 1) % near.length] ?? this.maze.exit, false);
    }

    this.createHud();
    this.createPanel();
    this.setupInput();
    this.syncSprites();

    if (this.cfg.level === 1 && this.mode === 'levels') this.flashMessage('Desliza el dedo para moverte', '#e6e9f5', 2200);
  }

  // ---------- Construcción del nivel ----------

  private px(c: { x: number; y: number }): { x: number; y: number } {
    return { x: (c.x + 0.5) * this.cs, y: (c.y + 0.5) * this.cs };
  }

  private buildDarkZones(): void {
    const { cols, rows } = this.maze;
    this.dark = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
    const target = Math.floor(cols * rows * this.cfg.darkFraction);
    let count = 0;
    let guard = 0;
    while (count < target && guard++ < 200) {
      const cx = Math.floor(this.rng() * cols);
      const cy = Math.floor(this.rng() * rows);
      const r = 2 + Math.floor(this.rng() * 3);
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (!this.maze.inBounds(x, y) || this.dark[y][x] || Math.abs(x - cx) + Math.abs(y - cy) > r) continue;
          this.dark[y][x] = true;
          count++;
        }
      }
    }
    // La entrada y la salida siempre quedan visibles.
    for (const c of [this.maze.entrance, this.maze.exit]) {
      for (let y = c.y - 1; y <= c.y + 1; y++) for (let x = c.x - 1; x <= c.x + 1; x++) if (this.maze.inBounds(x, y)) this.dark[y][x] = false;
    }
  }

  private drawFloor(): void {
    const g = this.add.graphics();
    const cs = this.cs;
    const { cols, rows, entrance, exit } = this.maze;
    g.fillStyle(COLORS.floor, 1);
    g.fillRect(0, 0, cols * cs, rows * cs);
    g.fillStyle(COLORS.dark, 1);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (this.dark[y][x]) g.fillRect(x * cs, y * cs, cs, cs);
    g.fillStyle(COLORS.entrance, 1);
    g.fillRect(entrance.x * cs + 2, entrance.y * cs + 2, cs - 4, cs - 4);
    g.fillStyle(COLORS.exit, 0.85);
    g.fillRect(exit.x * cs + 2, exit.y * cs + 2, cs - 4, cs - 4);
    const label = this.add.text((exit.x + 0.5) * cs, (exit.y + 0.5) * cs, 'SALIDA', {
      fontFamily: 'sans-serif', fontSize: `${Math.max(7, Math.floor(cs / 4.6))}px`, color: '#0b3d20', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.world.add([g, label]);
  }

  // Muros: los de las zonas oscuras no se ven (salvo con el Mapa) y las paredes temporales van en naranja.
  private redrawWalls(): void {
    const g = this.wallGfx;
    const cs = this.cs;
    const { cols, rows, walls, entrance, exit } = this.maze;
    const reveal = this.mapShown;
    const hidden = (x: number, y: number, nx: number, ny: number) =>
      !reveal && this.dark[y][x] && (!this.maze.inBounds(nx, ny) || this.dark[ny][nx]);
    const isTemp = (x: number, y: number, d: Dir) =>
      this.tempWalls.some((t) => (sameCell(t.cell, { x, y }) && t.dir.bit === d.bit) || (t.cell.x === x + d.dx && t.cell.y === y + d.dy && t.dir.bit === d.opposite));
    g.clear();
    const draw = (color: number, temp: boolean) => {
      g.lineStyle(Math.max(2, Math.round(cs / 8)), color, 1);
      g.beginPath();
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const w = walls[y][x];
          const px = x * cs;
          const py = y * cs;
          const edge = (d: Dir, x1: number, y1: number, x2: number, y2: number) => {
            if (!(w & d.bit) || isTemp(x, y, d) !== temp || hidden(x, y, x + d.dx, y + d.dy)) return;
            g.moveTo(x1, y1);
            g.lineTo(x2, y2);
          };
          if (!(y === 0 && x === exit.x)) edge(DIRS[0], px, py, px + cs, py);
          edge(DIRS[3], px, py, px, py + cs);
          if (y === rows - 1 && x !== entrance.x) edge(DIRS[2], px, py + cs, px + cs, py + cs);
          if (x === cols - 1) edge(DIRS[1], px + cs, py, px + cs, py + cs);
        }
      }
      g.strokePath();
    };
    draw(COLORS.wall, false);
    if (this.tempWalls.length > 0) draw(COLORS.tempWall, true);
  }

  private placeItemsAndCoins(fromStart: number[][]): void {
    const { kinds, rare } = pickItems(this.cfg.level, this.cfg.itemCount, this.rng);
    const used = new Set<string>();
    const key = (c: Cell) => `${c.x},${c.y}`;
    used.add(key(this.maze.entrance));
    used.add(key(this.maze.exit));
    const all: Cell[] = [];
    for (let y = 0; y < this.maze.rows; y++) for (let x = 0; x < this.maze.cols; x++) all.push({ x, y });
    const take = (pool: Cell[]): Cell | null => {
      const free = shuffle(pool.filter((c) => !used.has(key(c))), this.rng);
      const c = free[0] ?? shuffle(all.filter((a) => !used.has(key(a))), this.rng)[0] ?? null;
      if (c) used.add(key(c));
      return c;
    };
    const near = all.filter((c) => fromStart[c.y][c.x] >= 2 && fromStart[c.y][c.x] <= 6);
    const middle = all.filter((c) => fromStart[c.y][c.x] >= this.shortest * 0.3 && fromStart[c.y][c.x] <= this.shortest * 0.75);
    const deadEnds = this.maze.deadEnds().filter((c) => fromStart[c.y][c.x] > 4);

    // Uno cerca de la entrada, otros a mitad de camino y alguno en un callejón, como premio.
    kinds.forEach((kind, i) => {
      const cell = take(i === 0 ? near : i === kinds.length - 1 ? deadEnds : middle);
      if (cell) this.addPickup(kind, cell);
    });
    if (rare) {
      const cell = take(deadEnds);
      if (cell) this.addPickup(rare, cell);
    }
    for (let i = 0; i < this.cfg.coins; i++) {
      const cell = take(all);
      if (!cell) break;
      const p = this.px(cell);
      const s = Math.max(5, this.cs * 0.22);
      const sprite = this.add.rectangle(p.x, p.y, s, s, COLORS.coin).setAngle(45);
      this.world.add(sprite);
      this.coins.push({ cell, sprite });
    }
  }

  private addPickup(kind: ItemKind, cell: Cell): void {
    const p = this.px(cell);
    const sprite = this.add.graphics({ x: p.x, y: p.y });
    drawItem(sprite, kind, this.cs * 0.5);
    this.tweens.add({ targets: sprite, scale: { from: 0.85, to: 1.1 }, duration: 600, yoyo: true, repeat: -1 });
    this.world.add(sprite);
    this.pickups.push({ kind, cell, sprite });
  }

  private spawnCop(start: Cell, clone: boolean): Cop {
    const size = this.cs * 0.62;
    const rect = this.add.rectangle(0, 0, size, size, clone ? 0x6f9bff : COLORS.cop).setStrokeStyle(Math.max(2, this.cs / 10), COLORS.siren);
    this.world.add(rect);
    const cop: Cop = {
      mover: new Mover(start), rect, state: clone ? 'intercept' : 'patrol', stunnedUntil: 0, target: null,
      searchUntil: 0, clone, expiresAt: clone ? this.elapsed + RULES.cloneLifeMs : Infinity,
    };
    this.cops.push(cop);
    return cop;
  }

  // ---------- Interfaz ----------

  private createHud(): void {
    const font = { fontFamily: 'sans-serif', color: '#e6e9f5' };
    const title = this.mode === 'daily' ? 'Laberinto del día' : this.mode === 'infinite' ? `Infinito · ${this.cfg.level}` : `Nivel ${this.cfg.level}`;
    this.add.text(12, 12, title, { ...font, fontSize: '17px', fontStyle: 'bold' });
    this.infoText = this.add.text(12, 37, '', { ...font, fontSize: '11px', color: '#9aa3c7' });
    this.clockText = this.add.text(GAME_WIDTH / 2 + 8, 30, '', { ...font, fontSize: '28px', fontStyle: 'bold' }).setOrigin(0.5);
    this.bonusText = this.add.text(GAME_WIDTH - 52, 12, '', { ...font, fontSize: '14px', color: '#f5a623', fontStyle: 'bold' }).setOrigin(1, 0);
    this.statusText = this.add.text(GAME_WIDTH - 52, 34, '', { ...font, fontSize: '10px', color: '#ffb0b0', align: 'right' }).setOrigin(1, 0);

    const pause = this.add.text(GAME_WIDTH - 24, 26, 'II', { ...font, fontSize: '18px', fontStyle: 'bold', color: '#9aa3c7' })
      .setOrigin(0.5).setPadding(10, 6, 10, 6).setInteractive({ useHandCursor: true });
    pause.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.togglePause();
    });

    this.countdownText = this.add.text(GAME_WIDTH / 2, this.view.y + this.view.h / 2, '', {
      fontFamily: 'sans-serif', fontSize: '64px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(30);

    this.alertFrame = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 4, GAME_HEIGHT - 4)
      .setStrokeStyle(6, COLORS.siren).setFillStyle().setAlpha(0).setDepth(40);

    if (this.follow) {
      // Minimapa: muestra la salida y al ladrón; a los policías solo con el Mapa.
      this.miniGfx = this.add.graphics().setDepth(20);
    }
  }

  private createPanel(): void {
    const top = GAME_HEIGHT - PANEL_HEIGHT;
    const slotSize = 62;
    const gap = 12;
    const right = GAME_WIDTH - 12;
    this.add.text(right - slotSize - gap / 2, top + 6, 'Artefactos', { fontFamily: 'sans-serif', fontSize: '11px', color: '#9aa3c7' }).setOrigin(0.5, 0);
    for (let i = 0; i < RULES.inventorySlots; i++) {
      const x = right - slotSize / 2 - (RULES.inventorySlots - 1 - i) * (slotSize + gap);
      const y = top + 24 + slotSize / 2;
      const bg = this.add.rectangle(0, 0, slotSize, slotSize, COLORS.slot).setStrokeStyle(2, COLORS.slotBorder);
      const icon = this.add.graphics();
      const cover = this.add.rectangle(0, slotSize / 2, slotSize, slotSize, COLORS.cooldown, 0.55).setOrigin(0.5, 1).setVisible(false);
      const label = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
      const container = this.add.container(x, y, [bg, icon, cover, label]).setSize(slotSize, slotSize);
      container.setInteractive({ useHandCursor: true });
      container.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.useItem(i);
      });
      this.slots.push({ container, icon, cover, label });
    }
    if (save().dpad) this.createDpad(top);
    else {
      this.add.text(14, top + 40, 'Desliza para moverte', { fontFamily: 'sans-serif', fontSize: '12px', color: '#5d6487' });
    }
    this.refreshPanel();
  }

  // Cruceta virtual (opcional, se activa en Ajustes).
  private createDpad(top: number): void {
    const b = 34;
    const cx = 14 + b * 1.5;
    const cy = top + 12 + b * 1.5;
    const make = (dx: number, dy: number, label: string) => {
      const d = dirFromDelta(dx, dy)!;
      const r = this.add.rectangle(cx + dx * b, cy + dy * b, b - 4, b - 4, COLORS.slot).setStrokeStyle(2, COLORS.slotBorder).setInteractive();
      this.add.text(cx + dx * b, cy + dy * b, label, { fontFamily: 'sans-serif', fontSize: '14px', color: '#c8cde6' }).setOrigin(0.5);
      r.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        this.dpadHeld = d;
        this.setWanted(d);
      });
      r.on('pointerout', () => { if (this.dpadHeld === d) this.dpadHeld = null; });
      r.on('pointerup', () => { if (this.dpadHeld === d) this.dpadHeld = null; });
    };
    make(0, -1, '▲');
    make(0, 1, '▼');
    make(-1, 0, '◀');
    make(1, 0, '▶');
  }

  private refreshPanel(): void {
    this.slots.forEach((slot, i) => {
      slot.icon.clear();
      const kind = this.inventory[i];
      if (kind) drawItem(slot.icon, kind, 34);
    });
  }

  private flashMessage(text: string, color: string, duration = 1300): void {
    // Los avisos simultáneos se apilan hacia abajo para no taparse.
    const slot = this.flashCount++;
    const t = this.add.text(GAME_WIDTH / 2, this.view.y + 30 + (slot % 4) * 30, text, {
      fontFamily: 'sans-serif', fontSize: '19px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 4,
      align: 'center', wordWrap: { width: GAME_WIDTH - 40 },
    }).setOrigin(0.5).setDepth(25);
    this.tweens.add({ targets: t, y: t.y - 20, alpha: 0, delay: duration * 0.4, duration: duration * 0.6, onComplete: () => { t.destroy(); this.flashCount--; } });
  }

  private vibrate(ms: number): void {
    try {
      navigator.vibrate?.(ms);
    } catch {
      // sin vibración
    }
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
      this.dpadHeld = null;
    });

    const kb = this.input.keyboard;
    if (kb) {
      const bind = (keys: string[], dx: number, dy: number) => {
        const d = dirFromDelta(dx, dy);
        if (!d) return;
        keys.forEach((k) => kb.on(`keydown-${k}`, () => this.setWanted(d)));
        // Mantener la tecla presionada también sirve: el ladrón gira en el siguiente cruce posible.
        this.heldKeys.push({ keys: keys.map((k) => kb.addKey(k)), dir: d });
      };
      bind(['UP', 'W'], 0, -1);
      bind(['DOWN', 'S'], 0, 1);
      bind(['LEFT', 'A'], -1, 0);
      bind(['RIGHT', 'D'], 1, 0);
      kb.on('keydown-ONE', () => this.useItem(0));
      kb.on('keydown-TWO', () => this.useItem(1));
      kb.on('keydown-SPACE', () => this.useItem(0));
      kb.on('keydown-P', () => this.togglePause());
      kb.on('keydown-ESC', () => this.togglePause());
    }
  }

  // El gesto se guarda: si llega un poco antes de un cruce, se aplica al llegar.
  private setWanted(d: Dir): void {
    this.wanted = d;
    // Dar media vuelta es inmediato aunque esté entre dos celdas (si no hay una pared temporal detrás).
    const t = this.thief.target;
    if (this.thief.dir && t && this.thief.dir.bit === d.opposite && this.maze.canMove(t.x, t.y, d)) this.thief.reverse();
  }

  private togglePause(): void {
    if (this.finished) return;
    this.scene.pause();
    this.scene.launch('pause');
  }

  // ---------- Artefactos ----------

  private useItem(index: number): void {
    if (this.finished || index >= this.inventory.length) return;
    const kind = this.inventory[index];
    const now = this.elapsed;
    if (!this.applyItem(kind, now)) return;
    this.inventory.splice(index, 1);
    this.itemsUsed++;
    if (now < this.cooldownUntil) this.splitCop();
    this.cooldownUntil = now + RULES.itemCooldownMs;
    this.refreshPanel();
  }

  private applyItem(kind: ItemKind, now: number): boolean {
    const here = this.thief.nearestCell;
    const color = ITEMS[kind].color;
    switch (kind) {
      case 'hourglass':
        this.bonusLeft += EFFECT_MS.hourglassSeconds;
        this.flashMessage('¡Tiempo detenido!', color);
        break;
      case 'shoes':
        this.shoesUntil = now + EFFECT_MS.shoes;
        this.flashMessage('¡Más rápido!', color);
        break;
      case 'smoke': {
        const p = this.px(here);
        const cloud = this.add.rectangle(p.x, p.y, this.cs * 0.95, this.cs * 0.95, 0xc8ccd8, 0.55);
        this.world.add(cloud);
        this.tweens.add({ targets: cloud, alpha: { from: 0.7, to: 0.4 }, duration: 500, yoyo: true, repeat: -1 });
        this.hazards.push({ kind: 'smoke', cell: { ...here }, sprite: cloud, until: now + EFFECT_MS.smokeLife });
        this.flashMessage('Bomba de humo', color);
        break;
      }
      case 'map':
        this.mapUntil = now + EFFECT_MS.map;
        this.flashMessage('Mapa: ruta a la salida', color);
        break;
      case 'decoy': {
        this.decoy?.sprite.destroy();
        const p = this.px(here);
        const s = this.cs * 0.62;
        const sprite = this.add.rectangle(p.x, p.y, s, s, skinById(save().skin).color, 0.75).setStrokeStyle(2, 0xffffff, 0.6);
        this.world.add(sprite);
        this.decoy = { cell: { ...here }, sprite };
        this.flashMessage('Señuelo colocado', color);
        break;
      }
      case 'cloak':
        this.cloakUntil = now + EFFECT_MS.cloak;
        this.flashMessage('¡Invisible!', color);
        break;
      case 'oil': {
        const p = this.px(here);
        const g = this.add.graphics({ x: p.x, y: p.y });
        drawItem(g, 'oil', this.cs * 0.7);
        g.setAlpha(0.85);
        this.world.add(g);
        this.hazards.push({ kind: 'oil', cell: { ...here }, sprite: g, until: Infinity });
        this.flashMessage('Mancha de aceite', color);
        break;
      }
      case 'wall':
        if (!this.placeTempWall(here, now)) {
          this.flashMessage('Aquí no cabe una pared', '#ff9f43');
          return false;
        }
        this.flashMessage('¡Pared temporal!', color);
        break;
      case 'key':
        this.keyArmed = true;
        this.flashMessage('Llave lista: choca con un muro', color);
        break;
      case 'disguise':
        this.disguisedUntil = now + EFFECT_MS.disguise;
        this.flashMessage('¡Disfrazado de policía!', color);
        break;
    }
    return true;
  }

  // Levanta un muro en el pasillo de atrás (o, si no se ha movido, hacia el policía más cercano).
  private placeTempWall(here: Cell, now: number): boolean {
    let dir: Dir | null = this.lastDir ? dirFromBit(this.lastDir.opposite) : null;
    if (!dir || !this.maze.canMove(here.x, here.y, dir)) {
      const open = DIRS.filter((d) => this.maze.canMove(here.x, here.y, d));
      if (open.length === 0) return false;
      const copPos = this.cops[0]?.mover.cell ?? this.maze.exit;
      open.sort((a, b) => {
        const da = Math.abs(here.x + a.dx - copPos.x) + Math.abs(here.y + a.dy - copPos.y);
        const db = Math.abs(here.x + b.dx - copPos.x) + Math.abs(here.y + b.dy - copPos.y);
        return da - db;
      });
      dir = open[0];
    }
    this.maze.setWall(here.x, here.y, dir, true);
    this.tempWalls.push({ cell: { ...here }, dir, until: now + EFFECT_MS.wall });
    this.redrawWalls();
    return true;
  }

  // Penalización por usar artefactos seguidos: el policía se divide en dos (máximo 3 a la vez).
  private splitCop(): void {
    if (this.cops.length >= RULES.maxCops) return;
    const source = this.cops.find((c) => !c.clone) ?? this.cops[0];
    if (!source) return;
    this.spawnCop(source.mover.nearestCell, true);
    this.flashMessage('¡Muy seguido! El policía se dividió', '#ff6b6b');
  }

  // ---------- Bucle principal ----------

  update(_time: number, deltaMs: number): void {
    if (this.finished) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed += dt * 1000;
    const now = this.elapsed;

    // Relojes: el reloj de arena consume primero su tiempo y mientras tanto el del nivel no avanza.
    if (this.bonusLeft > 0) this.bonusLeft = Math.max(0, this.bonusLeft - dt);
    else this.timeLeft = Math.max(0, this.timeLeft - dt);

    this.updateTimedThings(now);
    this.updateThief(dt, now);
    this.collect();
    this.updateCops(dt, now);
    this.checkCaptures(now);

    this.syncSprites();
    this.updateHud(now);

    const t = this.thief.cell;
    if (!this.thief.target && sameCell(t, this.maze.exit)) this.finish(true);
    else if (this.timeLeft <= 0) this.finish(false);
  }

  private updateTimedThings(now: number): void {
    const before = this.tempWalls.length;
    this.tempWalls = this.tempWalls.filter((w) => {
      if (now < w.until) return true;
      this.maze.setWall(w.cell.x, w.cell.y, w.dir, false);
      return false;
    });
    const showMap = now < this.mapUntil;
    if (before !== this.tempWalls.length || showMap !== this.mapShown) {
      this.mapShown = showMap;
      this.redrawWalls();
    }
    this.hazards = this.hazards.filter((h) => {
      if (now < h.until) return true;
      h.sprite.destroy();
      return false;
    });

    // Cuenta regresiva de la ventaja inicial.
    if (now < RULES.copStartDelayMs) this.countdownText.setText(String(Math.ceil((RULES.copStartDelayMs - now) / 1000)));
    else if (this.countdownText.text && this.countdownText.text !== '¡Corre!') {
      this.countdownText.setText('¡Corre!');
      this.tweens.add({ targets: this.countdownText, alpha: 0, duration: 700, onComplete: () => this.countdownText.setText('') });
    }
  }

  private updateThief(dt: number, now: number): void {
    // Una tecla mantenida (o la cruceta) pide su dirección continuamente.
    for (const h of this.heldKeys) {
      if (h.keys.some((k) => k.isDown) && (!this.thief.dir || h.dir.bit !== this.thief.dir.bit)) this.wanted = h.dir;
    }
    if (this.dpadHeld && (!this.thief.dir || this.dpadHeld.bit !== this.thief.dir.bit)) this.wanted = this.dpadHeld;

    let speed = RULES.thiefSpeed;
    if (now < this.slowedUntil) speed *= RULES.slowFactor;
    if (now < this.shoesUntil) speed *= EFFECT_MS.shoesFactor;
    this.thief.advance(dt, speed, this.maze, () => this.thiefChoose(now));
    if (this.thief.dir) this.lastDir = this.thief.dir;

    // Estela (apariencia)
    if (skinById(save().skin).trail && this.thief.target && now - this.lastTrail > 60) {
      this.lastTrail = now;
      const s = this.cs * 0.4;
      const r = this.add.rectangle(this.thiefRect.x, this.thiefRect.y, s, s, skinById(save().skin).color, 0.5);
      this.world.addAt(r, this.world.getIndex(this.thiefRect));
      this.tweens.add({ targets: r, alpha: 0, scale: 0.3, duration: 400, onComplete: () => r.destroy() });
    }
  }

  private thiefChoose(now: number): Dir | null {
    const c = this.thief.cell;
    if (this.wanted && this.maze.canMove(c.x, c.y, this.wanted)) return this.wanted;
    if (this.thief.dir && this.maze.canMove(c.x, c.y, this.thief.dir)) return this.thief.dir;
    const facing = this.wanted ?? this.lastDir;
    if (!facing || !this.maze.inBounds(c.x + facing.dx, c.y + facing.dy)) return null;
    if (this.keyArmed) {
      // Llave maestra: atraviesa este muro una sola vez.
      this.keyArmed = false;
      this.maze.setWall(c.x, c.y, facing, false);
      this.tempWalls = this.tempWalls.filter((w) => !(sameCell(w.cell, c) && w.dir.bit === facing.bit) && !(w.cell.x === c.x + facing.dx && w.cell.y === c.y + facing.dy && w.dir.bit === facing.opposite));
      this.redrawWalls();
      this.flashMessage('¡Muro abierto!', ITEMS.key.color);
      return facing;
    }
    // En las zonas oscuras, chocar ilumina el muro un instante y el celular vibra.
    if (this.dark[c.y][c.x] && !this.mapShown && now - this.lastBump > 600) {
      this.lastBump = now;
      this.flashWall(c, facing);
      this.vibrate(40);
    }
    return null;
  }

  private flashWall(c: Cell, d: Dir): void {
    const g = this.add.graphics();
    const cs = this.cs;
    const cx = (c.x + 0.5) * cs;
    const cy = (c.y + 0.5) * cs;
    g.lineStyle(Math.max(2, Math.round(cs / 8)), 0xffffff, 1);
    if (d.dx === 0) g.lineBetween(cx - cs / 2, cy + (d.dy * cs) / 2, cx + cs / 2, cy + (d.dy * cs) / 2);
    else g.lineBetween(cx + (d.dx * cs) / 2, cy - cs / 2, cx + (d.dx * cs) / 2, cy + cs / 2);
    this.world.add(g);
    this.tweens.add({ targets: g, alpha: 0, duration: 500, onComplete: () => g.destroy() });
  }

  private collect(): void {
    const tc = this.thief.nearestCell;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      // Si el inventario está lleno, el artefacto se queda en el suelo.
      if (sameCell(p.cell, tc) && this.inventory.length < RULES.inventorySlots) {
        this.inventory.push(p.kind);
        p.sprite.destroy();
        this.pickups.splice(i, 1);
        this.refreshPanel();
        this.flashMessage(`+ ${ITEMS[p.kind].name}`, ITEMS[p.kind].color);
        if (!this.hintedItems && this.cfg.level <= 2 && this.mode === 'levels') {
          this.hintedItems = true;
          this.time.delayedCall(1400, () => this.flashMessage('Tócalo abajo a la derecha para usarlo', '#e6e9f5', 2200));
        }
      }
    }
    for (let i = this.coins.length - 1; i >= 0; i--) {
      if (sameCell(this.coins[i].cell, tc)) {
        this.coins[i].sprite.destroy();
        this.coins.splice(i, 1);
        this.coinsCollected++;
      }
    }
  }

  // ---------- Policías ----------

  private updateCops(dt: number, now: number): void {
    if (now < RULES.copStartDelayMs) return;
    const tc = this.thief.nearestCell;
    const toThief = this.maze.distancesFrom(tc);
    const disguised = now < this.disguisedUntil;
    const cloaked = now < this.cloakUntil;

    // Los clones desaparecen a los 15 s.
    this.cops = this.cops.filter((c) => {
      if (now < c.expiresAt) return true;
      c.rect.destroy();
      return false;
    });

    // Percepción: lo ve en línea recta por un pasillo, o lo oye cerca. Con la capa solo lo oye muy de cerca;
    // con el disfraz lo ignora.
    let anyChase = false;
    for (const cop of this.cops) {
      if (now < cop.stunnedUntil) continue;
      const cc = cop.mover.nearestCell;
      let sees = false;
      if (!disguised) {
        const hear = cloaked ? 1 : this.cfg.hearing;
        sees = toThief[cc.y][cc.x] <= hear || (!cloaked && this.maze.lineOfSight(cc, tc, this.cfg.vision));
      }
      if (sees) {
        if (cop.state !== 'chase') this.onChaseStart(now);
        cop.state = 'chase';
        this.lastKnown = { ...tc }; // lo comparten por radio
      } else if (cop.state === 'chase') {
        this.startSearch(cop, now);
      }
      if (cop.state === 'chase') anyChase = true;
    }
    for (const cop of this.cops) {
      if (cop.state === 'chase' || now < cop.stunnedUntil) continue;
      if (anyChase && cop.state !== 'intercept') cop.state = 'intercept';
      else if (!anyChase && cop.state === 'intercept') this.startSearch(cop, now);
    }

    const pathToExit = anyChase ? this.maze.path(tc, this.maze.exit) : [];
    const grids = new Map<string, number[][]>();
    const gridTo = (t: Cell) => {
      const k = `${t.x},${t.y}`;
      let g = grids.get(k);
      if (!g) grids.set(k, (g = this.maze.distancesFrom(t)));
      return g;
    };

    this.cops.forEach((cop, idx) => {
      if (now < cop.stunnedUntil) return;
      const speed = this.cfg.copSpeed * (cop.state === 'chase' ? RULES.chaseSpeedBonus : 1);
      cop.mover.advance(dt, speed, this.maze, () => {
        const c = cop.mover.cell;
        // El señuelo atrae a los policías que no están persiguiendo.
        if (this.decoy && cop.state !== 'chase') return this.stepToward(c, gridTo(this.decoy.cell)) ?? this.wander(cop);
        switch (cop.state) {
          case 'chase':
            return this.stepToward(c, toThief);
          case 'intercept': {
            // Cada policía corta un camino distinto: apunta más adelante en la ruta del ladrón a la salida.
            const ahead = pathToExit[Math.min(pathToExit.length - 1, 3 + 3 * idx)] ?? tc;
            return this.stepToward(c, gridTo(ahead)) ?? this.wander(cop);
          }
          case 'search': {
            if (cop.target && !sameCell(c, cop.target)) return this.stepToward(c, gridTo(cop.target)) ?? this.wander(cop);
            cop.target = null;
            if (now < cop.searchUntil) return this.wander(cop); // revisa los pasillos vecinos
            // Búsqueda fallida: si el ladrón está a menos de un tercio del camino de la salida, vuelve a vigilarla.
            const thiefToExit = this.maze.distancesFrom(this.maze.exit)[tc.y][tc.x];
            cop.state = thiefToExit <= this.shortest / 3 ? 'guard' : 'patrol';
            return this.wander(cop);
          }
          case 'guard':
          case 'patrol': {
            const pool = cop.state === 'guard' ? this.guardCells : this.patrolCells;
            if (!cop.target || sameCell(c, cop.target)) cop.target = pool[Math.floor(Math.random() * pool.length)];
            return this.stepToward(c, gridTo(cop.target)) ?? this.wander(cop);
          }
        }
      });

      // Trampas: el humo aturde 3 s y el aceite 2 s. El señuelo desaparece cuando lo alcanza.
      const cc = cop.mover.nearestCell;
      const hz = this.hazards.findIndex((h) => sameCell(h.cell, cc));
      if (hz >= 0) {
        const h = this.hazards[hz];
        cop.stunnedUntil = now + (h.kind === 'smoke' ? EFFECT_MS.smokeStun : EFFECT_MS.oilStun);
        h.sprite.destroy();
        this.hazards.splice(hz, 1);
        if (cop.state === 'chase') this.startSearch(cop, now);
        this.flashMessage(h.kind === 'smoke' ? '¡El policía se ahoga en el humo!' : '¡El policía resbaló!', '#c8ccd8');
      }
      if (this.decoy && sameCell(this.decoy.cell, cc)) {
        this.decoy.sprite.destroy();
        this.decoy = null;
        this.startSearch(cop, now);
      }
    });
  }

  private startSearch(cop: Cop, now: number): void {
    cop.state = 'search';
    cop.target = this.lastKnown ? { ...this.lastKnown } : null;
    cop.searchUntil = now + this.cfg.searchMs;
  }

  private stepToward(c: Cell, grid: number[][]): Dir | null {
    let best: Cell | null = null;
    for (const n of this.maze.neighbors(c)) {
      if (grid[n.y][n.x] >= 0 && (!best || grid[n.y][n.x] < grid[best.y][best.x])) best = n;
    }
    if (!best || grid[best.y][best.x] >= grid[c.y][c.x]) return null;
    return dirFromDelta(best.x - c.x, best.y - c.y) ?? null;
  }

  // Avanza por el pasillo y elige al azar en los cruces, sin dar media vuelta salvo en callejones.
  private wander(cop: Cop): Dir | null {
    const c = cop.mover.cell;
    const options = this.maze.neighbors(c);
    if (options.length === 0) return null;
    const prev = cop.mover.dir;
    const forward = options.filter((n) => !prev || !(n.x - c.x === -prev.dx && n.y - c.y === -prev.dy));
    const pool = forward.length > 0 ? forward : options;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return dirFromDelta(pick.x - c.x, pick.y - c.y) ?? null;
  }

  // Aviso de persecución: el borde de la pantalla parpadea en rojo y el celular vibra.
  private onChaseStart(now: number): void {
    if (now - this.lastAlert < 2000) return;
    this.lastAlert = now;
    this.tweens.killTweensOf(this.alertFrame);
    this.alertFrame.setAlpha(0);
    this.tweens.add({ targets: this.alertFrame, alpha: 1, duration: 150, yoyo: true, repeat: 2 });
    this.vibrate(200);
  }

  private checkCaptures(now: number): void {
    const tp = this.thief.pos;
    for (const cop of this.cops) {
      if (now < cop.stunnedUntil) continue;
      const cp = cop.mover.pos;
      if (Math.abs(cp.x - tp.x) >= 0.7 || Math.abs(cp.y - tp.y) >= 0.7) continue;
      if (now < this.disguisedUntil) {
        // Con el disfraz no hay captura: el choque solo hace caer el disfraz.
        this.disguisedUntil = 0;
        cop.stunnedUntil = now + RULES.copStunMs;
        this.flashMessage('¡Se cayó el disfraz!', ITEMS.disguise.color);
        continue;
      }
      // Captura: no hay vidas. El ladrón va a mitad de velocidad 3 s, el policía queda aturdido
      // 1,5 s y le roba un artefacto al azar si lleva alguno.
      this.captures++;
      this.slowedUntil = now + RULES.slowMs;
      cop.stunnedUntil = now + RULES.copStunMs;
      this.cameras.main.shake(200, 0.01);
      this.vibrate(120);
      let msg = '¡Atrapado! Vas más lento';
      if (this.inventory.length > 0) {
        this.inventory.splice(Math.floor(Math.random() * this.inventory.length), 1);
        this.refreshPanel();
        msg = '¡Atrapado! Te quitó un artefacto';
      }
      this.flashMessage(msg, '#ff6b6b');
    }
  }

  // ---------- Dibujo ----------

  private syncSprites(): void {
    const place = (rect: Phaser.GameObjects.Rectangle, m: Mover) => {
      const p = m.pos;
      rect.setPosition((p.x + 0.5) * this.cs, (p.y + 0.5) * this.cs);
    };
    place(this.thiefRect, this.thief);
    for (const cop of this.cops) place(cop.rect, cop.mover);

    // Cámara: los laberintos pequeños caben enteros; en los grandes se sigue al ladrón.
    const ww = this.maze.cols * this.cs;
    const wh = this.maze.rows * this.cs;
    if (this.follow) {
      const tx = this.view.x + this.view.w / 2 - this.thiefRect.x;
      const ty = this.view.y + this.view.h / 2 - this.thiefRect.y;
      this.world.setPosition(
        Phaser.Math.Clamp(tx, this.view.x + this.view.w - ww, this.view.x),
        Phaser.Math.Clamp(ty, this.view.y + this.view.h - wh, this.view.y),
      );
    } else {
      this.world.setPosition(this.view.x + Math.floor((this.view.w - ww) / 2), this.view.y + Math.floor((this.view.h - wh) / 2));
    }
  }

  private updateHud(now: number): void {
    const secs = Math.ceil(this.timeLeft);
    this.clockText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    const paused = this.bonusLeft > 0;
    this.clockText.setColor(paused ? '#7d84a3' : secs <= 10 ? '#ff6b6b' : '#e6e9f5');
    this.bonusText.setText(paused ? `⌛ ${Math.ceil(this.bonusLeft)}s` : '');
    this.infoText.setText(`Policías: ${this.cops.length} · Monedas: ${this.coinsCollected}`);

    const left = (t: number) => `${Math.ceil((t - now) / 1000)}s`;
    const status: string[] = [];
    if (now < this.shoesUntil) status.push(`Zapatillas ${left(this.shoesUntil)}`);
    if (now < this.cloakUntil) status.push(`Invisible ${left(this.cloakUntil)}`);
    if (now < this.disguisedUntil) status.push(`Disfraz ${left(this.disguisedUntil)}`);
    if (now < this.mapUntil) status.push(`Mapa ${left(this.mapUntil)}`);
    if (this.keyArmed) status.push('Llave lista');
    if (now < this.slowedUntil) status.push('Ralentizado');
    this.statusText.setText(status.slice(0, 3).join('\n'));

    // Ladrón: apariencia elegida y efectos activos.
    const skin = skinById(save().skin);
    const disguised = now < this.disguisedUntil;
    const slowed = now < this.slowedUntil;
    this.thiefRect.setFillStyle(disguised ? COLORS.cop : skin.color, slowed && !disguised ? 0.55 : 1);
    if (disguised) this.thiefRect.setStrokeStyle(Math.max(2, this.cs / 10), COLORS.siren);
    else if (now < this.shoesUntil) this.thiefRect.setStrokeStyle(2, 0x4dd0e1);
    else if (skin.border) this.thiefRect.setStrokeStyle(2, skin.border);
    else this.thiefRect.setStrokeStyle(2, 0x000000, 0.4);
    this.thiefRect.setAlpha(now < this.cloakUntil ? 0.35 : 1);

    // Policías: borde rojo que parpadea como sirena; gris si están aturdidos.
    const sirenOn = Math.floor(now / 250) % 2 === 0;
    for (const cop of this.cops) {
      const stunned = now < cop.stunnedUntil;
      cop.rect.setFillStyle(stunned ? COLORS.copStunned : cop.clone ? 0x6f9bff : COLORS.cop, cop.clone ? 0.85 : 1);
      cop.rect.setStrokeStyle(Math.max(2, this.cs / 10), stunned ? COLORS.copStunned : sirenOn ? COLORS.siren : COLORS.cop);
    }

    // Espera entre artefactos: los botones se ven en rojo con la cuenta regresiva.
    const cd = this.cooldownUntil - now;
    for (const slot of this.slots) {
      const on = cd > 0;
      slot.cover.setVisible(on);
      slot.label.setText(on ? String(Math.ceil(cd / 1000)) : '');
      if (on) slot.cover.setScale(1, cd / RULES.itemCooldownMs);
    }

    // Ruta del Mapa
    this.overlayGfx.clear();
    if (now < this.mapUntil) {
      const s = Math.max(3, this.cs * 0.18);
      this.overlayGfx.fillStyle(COLORS.mapPath, 0.85);
      for (const c of this.maze.path(this.thief.nearestCell, this.maze.exit).slice(1, -1)) {
        this.overlayGfx.fillRect((c.x + 0.5) * this.cs - s / 2, (c.y + 0.5) * this.cs - s / 2, s, s);
      }
    }
    this.drawMinimap(now);
  }

  private drawMinimap(now: number): void {
    const g = this.miniGfx;
    if (!g) return;
    const scale = 3;
    const w = this.maze.cols * scale;
    const h = this.maze.rows * scale;
    const x0 = this.view.x + this.view.w - w - 6;
    const y0 = this.view.y + 6;
    g.clear();
    g.fillStyle(0x000000, 0.85);
    g.fillRect(x0 - 3, y0 - 3, w + 6, h + 6);
    g.lineStyle(1, COLORS.wall, 0.8);
    g.strokeRect(x0, y0, w, h);
    g.fillStyle(COLORS.exit, 1);
    g.fillRect(x0 + this.maze.exit.x * scale - 1, y0 + this.maze.exit.y * scale - 1, scale + 2, scale + 2);
    const tp = this.thief.pos;
    g.fillStyle(skinById(save().skin).color, 1);
    g.fillRect(x0 + tp.x * scale - 1, y0 + tp.y * scale - 1, scale + 2, scale + 2);
    if (now < this.mapUntil) {
      g.fillStyle(COLORS.siren, 1);
      for (const cop of this.cops) {
        const cp = cop.mover.pos;
        g.fillRect(x0 + cp.x * scale - 1, y0 + cp.y * scale - 1, scale + 2, scale + 2);
      }
    }
  }

  private finish(won: boolean): void {
    this.finished = true;
    const timeLeft = Math.ceil(this.timeLeft);
    const result: GameResult = {
      mode: this.mode,
      won,
      level: this.cfg.level,
      seed: this.seed,
      timeLeft,
      totalTime: this.totalTime,
      playSeconds: Math.round(this.elapsed / 100) / 10,
      captures: this.captures,
      itemsUsed: this.itemsUsed,
      coins: this.coinsCollected,
      stars: starsFor(won, this.timeLeft, this.totalTime, this.captures),
    };
    this.time.delayedCall(400, () => this.scene.start('result', result));
  }
}
