import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { TEXT, makeButton } from '../ui';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('pause');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setInteractive();
    this.add.text(cx, 220, 'Pausa', { ...TEXT, fontSize: '36px', fontStyle: 'bold' }).setOrigin(0.5);
    makeButton(this, cx, 320, 'Continuar', COLORS.thief, () => {
      this.scene.stop();
      this.scene.resume('game');
    });
    makeButton(this, cx, 390, 'Menú', COLORS.wall, () => {
      this.scene.stop('game');
      this.scene.start('menu');
    });
  }
}
