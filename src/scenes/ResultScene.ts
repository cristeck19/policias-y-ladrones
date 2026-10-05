import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { saveBestLevel } from '../storage';
import { TEXT, makeButton } from '../ui';
import type { GameResult } from './GameScene';

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('result');
  }

  create(r: GameResult): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    const cx = GAME_WIDTH / 2;

    if (r.won) {
      saveBestLevel(r.level + 1);
      this.add.text(cx, 170, '¡Escapaste!', { ...TEXT, fontSize: '40px', fontStyle: 'bold', color: '#2ecc71' }).setOrigin(0.5);
      this.add.text(cx, 240, `Nivel ${r.level} superado\nTiempo restante: ${r.timeLeft} s\nVeces atrapado: ${r.captures}`, {
        ...TEXT, fontSize: '18px', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5, 0);
      makeButton(this, cx, 420, 'Siguiente nivel', COLORS.exit, () => this.scene.start('game', { level: r.level + 1 }));
    } else {
      this.add.text(cx, 170, 'Se acabó el tiempo', { ...TEXT, fontSize: '32px', fontStyle: 'bold', color: '#ff6b6b' }).setOrigin(0.5);
      this.add.text(cx, 240, `Nivel ${r.level}\nVeces atrapado: ${r.captures}`, {
        ...TEXT, fontSize: '18px', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5, 0);
      makeButton(this, cx, 420, 'Reintentar', COLORS.thief, () => this.scene.start('game', { level: r.level }));
    }
    makeButton(this, cx, 490, 'Menú', COLORS.wall, () => this.scene.start('menu'));
  }
}
