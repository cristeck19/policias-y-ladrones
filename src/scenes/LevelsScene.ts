import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { save } from '../storage';
import { TEXT, makeButton } from '../ui';

const PER_PAGE = 30;

export class LevelsScene extends Phaser.Scene {
  private page = 0;

  constructor() {
    super('levels');
  }

  init(data: { page?: number }): void {
    this.page = data.page ?? Math.floor((save().bestLevel - 1) / PER_PAGE);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    const cx = GAME_WIDTH / 2;
    const s = save();
    this.add.text(cx, 40, 'Elegir nivel', { ...TEXT, fontSize: '26px', fontStyle: 'bold' }).setOrigin(0.5);

    const cols = 5;
    const size = 54;
    const gap = 10;
    const x0 = (GAME_WIDTH - (cols * size + (cols - 1) * gap)) / 2 + size / 2;
    for (let i = 0; i < PER_PAGE; i++) {
      const level = this.page * PER_PAGE + i + 1;
      const x = x0 + (i % cols) * (size + gap);
      const y = 100 + Math.floor(i / cols) * (size + gap);
      const open = level <= s.bestLevel;
      const r = this.add.rectangle(x, y, size, size, open ? COLORS.slot : 0x1a1c27).setStrokeStyle(2, open ? COLORS.slotBorder : 0x262a3d);
      this.add.text(x, y - 6, String(level), { ...TEXT, fontSize: '18px', fontStyle: 'bold', color: open ? '#e6e9f5' : '#4a5070' }).setOrigin(0.5);
      const stars = s.stars[level] ?? 0;
      if (open) this.add.text(x, y + 15, '★'.repeat(stars) + '☆'.repeat(3 - stars), { ...TEXT, fontSize: '10px', color: '#ffd84d' }).setOrigin(0.5);
      if (open) r.setInteractive({ useHandCursor: true }).on('pointerup', () => this.scene.start('game', { mode: 'levels', level }));
    }

    const lastPage = Math.floor((s.bestLevel - 1) / PER_PAGE);
    if (this.page > 0) makeButton(this, 70, 510, '◀', 0xb7bedb, () => this.scene.restart({ page: this.page - 1 }), { w: 80 });
    if (this.page < lastPage) makeButton(this, GAME_WIDTH - 70, 510, '▶', 0xb7bedb, () => this.scene.restart({ page: this.page + 1 }), { w: 80 });
    makeButton(this, cx, 580, 'Menú', COLORS.wall, () => this.scene.start('menu'));
  }
}
