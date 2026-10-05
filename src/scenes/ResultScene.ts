import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { addCoins, persist, recordLevel, save } from '../storage';
import { TEXT, drawStars, makeButton } from '../ui';
import type { GameResult } from './GameScene';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('result');
  }

  create(r: GameResult): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    const cx = GAME_WIDTH / 2;
    const s = save();
    addCoins(r.coins);
    if (r.won && r.mode === 'levels') recordLevel(r.level, r.stars);

    const title = r.won ? '¡Escapaste!' : 'Se acabó el tiempo';
    this.add.text(cx, 110, title, { ...TEXT, fontSize: r.won ? '38px' : '30px', fontStyle: 'bold', color: r.won ? '#2ecc71' : '#ff6b6b' }).setOrigin(0.5);
    if (r.won) drawStars(this, cx, 172, r.stars, 26);

    const lines: string[] = [];
    if (r.mode === 'levels') lines.push(`Nivel ${r.level}`);
    if (r.mode === 'daily') {
      lines.push('Laberinto del día');
      if (r.won) {
        const key = String(r.seed);
        const best = s.daily[key];
        if (!best || r.playSeconds < best) {
          s.daily[key] = r.playSeconds;
          persist();
        }
        lines.push(`Tu tiempo: ${r.playSeconds} s · Mejor: ${s.daily[key]} s`);
      }
    }
    if (r.mode === 'infinite') {
      const reached = r.won ? r.level : r.level - 1;
      if (reached > s.bestInfinite) {
        s.bestInfinite = reached;
        persist();
      }
      lines.push(`Laberintos superados: ${reached} · Récord: ${s.bestInfinite}`);
    }
    if (r.won) lines.push(`Tiempo restante: ${r.timeLeft} s`);
    lines.push(`Artefactos usados: ${r.itemsUsed}`, `Veces atrapado: ${r.captures}`, `Monedas: +${r.coins}`);
    this.add.text(cx, 218, lines.join('\n'), { ...TEXT, fontSize: '16px', align: 'center', lineSpacing: 7 }).setOrigin(0.5, 0);

    let y = 430;
    const next = (label: string, color: number, fn: () => void) => {
      makeButton(this, cx, y, label, color, fn);
      y += 60;
    };
    if (r.mode === 'levels') {
      if (r.won) next('Siguiente nivel', COLORS.exit, () => this.scene.start('game', { mode: 'levels', level: r.level + 1 }));
      else {
        next('Mismo laberinto', COLORS.thief, () => this.scene.start('game', { mode: 'levels', level: r.level, seed: r.seed }));
        next('Laberinto nuevo', COLORS.thief, () => this.scene.start('game', { mode: 'levels', level: r.level }));
      }
    } else if (r.mode === 'daily') {
      next('Reintentar', COLORS.thief, () => this.scene.start('game', { mode: 'daily', seed: r.seed }));
    } else if (r.won) {
      // Modo infinito: cada salida lleva a un laberinto más difícil.
      next('Continuar', COLORS.exit, () => this.scene.start('game', { mode: 'infinite', level: r.level + 1 }));
    } else {
      next('Empezar de nuevo', COLORS.thief, () => this.scene.start('game', { mode: 'infinite', level: 1 }));
    }
    next('Menú', COLORS.wall, () => this.scene.start('menu'));
  }
}
