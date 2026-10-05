import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { dailySeed } from '../maze';
import { persist, save } from '../storage';
import { TEXT, makeButton } from '../ui';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    const cx = GAME_WIDTH / 2;
    const s = save();

    this.add.rectangle(cx - 30, 62, 38, 38, COLORS.thief);
    this.add.rectangle(cx + 30, 62, 38, 38, COLORS.cop).setStrokeStyle(4, COLORS.siren);
    this.add.text(cx, 100, 'Policías y Ladrones', { ...TEXT, fontSize: '30px', fontStyle: 'bold' }).setOrigin(0.5, 0);
    this.add.text(cx, 142, 'Llega a la salida antes de que se acabe el tiempo.\nSi te atrapan, vas más lento.', {
      ...TEXT, fontSize: '13px', color: '#b7bedb', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5, 0);
    this.add.text(cx, 190, `Monedas: ${s.coins}`, { ...TEXT, fontSize: '13px', color: '#ffd84d' }).setOrigin(0.5, 0);

    let y = 248;
    const step = 58;
    makeButton(this, cx, y, `Jugar nivel ${s.bestLevel}`, COLORS.thief, () => this.scene.start('game', { mode: 'levels', level: s.bestLevel }));
    makeButton(this, cx, (y += step), 'Elegir nivel', COLORS.thief, () => this.scene.start('levels'));
    makeButton(this, cx, (y += step), 'Laberinto del día', COLORS.exit, () => this.scene.start('game', { mode: 'daily', seed: dailySeed() }));
    makeButton(this, cx, (y += step), 'Modo infinito', COLORS.exit, () => this.scene.start('game', { mode: 'infinite', level: 1 }));
    makeButton(this, cx, (y += step), 'Apariencia', 0xb7bedb, () => this.scene.start('skins'));
    const dpad = makeButton(this, cx, (y += step), '', 0xb7bedb, () => {
      s.dpad = !s.dpad;
      persist();
      label();
    });
    const label = () => (dpad.list[1] as Phaser.GameObjects.Text).setText(`Cruceta: ${s.dpad ? 'sí' : 'no'}`);
    label();
  }
}
