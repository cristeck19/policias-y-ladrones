import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { SKINS } from '../skins';
import { persist, save } from '../storage';
import { TEXT, makeButton } from '../ui';

// Apariencias del cuadrado: se desbloquean con monedas y no dan ventaja.
export class SkinsScene extends Phaser.Scene {
  constructor() {
    super('skins');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    const cx = GAME_WIDTH / 2;
    const s = save();
    this.add.text(cx, 36, 'Apariencia', { ...TEXT, fontSize: '26px', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(cx, 68, `Monedas: ${s.coins}`, { ...TEXT, fontSize: '14px', color: '#ffd84d' }).setOrigin(0.5);

    SKINS.forEach((skin, i) => {
      const y = 112 + i * 62;
      const owned = s.owned.includes(skin.id);
      const selected = s.skin === skin.id;
      this.add.rectangle(cx, y, GAME_WIDTH - 32, 54, selected ? 0x2c3350 : COLORS.slot).setStrokeStyle(2, selected ? COLORS.thief : COLORS.slotBorder);
      const sq = this.add.rectangle(44, y, 30, 30, skin.color);
      if (skin.border) sq.setStrokeStyle(3, skin.border);
      if (skin.trail) {
        this.add.rectangle(24, y, 14, 14, skin.color, 0.5);
        this.add.rectangle(12, y, 8, 8, skin.color, 0.25);
      }
      this.add.text(72, y, skin.name, { ...TEXT, fontSize: '16px' }).setOrigin(0, 0.5);
      const label = selected ? 'Usando' : owned ? 'Usar' : `${skin.cost} monedas`;
      const canBuy = owned || s.coins >= skin.cost;
      makeButton(this, GAME_WIDTH - 82, y, label, selected ? 0x4a5070 : canBuy ? COLORS.exit : 0x4a5070, () => {
        if (selected) return;
        if (!owned) {
          if (s.coins < skin.cost) return;
          s.coins -= skin.cost;
          s.owned.push(skin.id);
        }
        s.skin = skin.id;
        persist();
        this.scene.restart();
      }, { w: 116, h: 36, fontSize: 14 });
    });
    makeButton(this, cx, 600, 'Menú', COLORS.wall, () => this.scene.start('menu'));
  }
}
