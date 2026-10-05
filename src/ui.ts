import Phaser from 'phaser';

// Botón rectangular simple con texto.
export function makeButton(
  scene: Phaser.Scene, x: number, y: number, label: string, color: number, onClick: () => void,
  opts: { w?: number; h?: number; fontSize?: number } = {},
): Phaser.GameObjects.Container {
  const w = opts.w ?? 240;
  const h = opts.h ?? 48;
  const bg = scene.add.rectangle(0, 0, w, h, color).setStrokeStyle(2, 0xffffff, 0.25);
  const text = scene.add.text(0, 0, label, { fontFamily: 'sans-serif', fontSize: `${opts.fontSize ?? 18}px`, fontStyle: 'bold', color: '#14161f' }).setOrigin(0.5);
  const c = scene.add.container(x, y, [bg, text]).setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => c.setScale(0.96));
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => {
    c.setScale(1);
    onClick();
  });
  return c;
}

// Estrellas como cuadrados: llenos los ganados, vacíos los que faltan.
export function drawStars(scene: Phaser.Scene, x: number, y: number, stars: number, size = 22): void {
  for (let i = 0; i < 3; i++) {
    const r = scene.add.rectangle(x + (i - 1) * (size + 8), y, size, size, 0xffd84d, i < stars ? 1 : 0).setAngle(45);
    r.setStrokeStyle(2, 0xffd84d);
  }
}

export const TEXT = { fontFamily: 'sans-serif', color: '#e6e9f5' };
