import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { getBestLevel } from '../storage';
import { TEXT, makeButton } from '../ui';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    const cx = GAME_WIDTH / 2;

    this.add.rectangle(cx - 34, 100, 44, 44, COLORS.thief);
    this.add.rectangle(cx + 34, 100, 44, 44, COLORS.cop);
    this.add.text(cx, 150, 'Policías\ny Ladrones', { ...TEXT, fontSize: '40px', fontStyle: 'bold', align: 'center' }).setOrigin(0.5, 0);

    const help = [
      'Eres el cuadro amarillo.',
      'Escapa del laberinto antes de que se acabe el tiempo.',
      'Si un policía te atrapa, irás más lento un rato.',
      'Recoge relojes de arena: al usarlos detienen el reloj.',
      '',
      'Desliza el dedo para moverte.',
    ].join('\n');
    this.add.text(cx, 270, help, { ...TEXT, fontSize: '14px', color: '#b7bedb', align: 'center', lineSpacing: 6, wordWrap: { width: 320 } }).setOrigin(0.5, 0);

    makeButton(this, cx, 520, 'Jugar', COLORS.thief, () => this.scene.start('game', { level: 1 }));

    const best = getBestLevel();
    if (best > 1) {
      makeButton(this, cx, 586, `Seguir en nivel ${best}`, COLORS.exit, () => this.scene.start('game', { level: best }));
    }
  }
}
