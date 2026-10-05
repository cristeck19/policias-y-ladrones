import Phaser from 'phaser';

// Botón rectangular simple con texto.
export function makeButton(scene: Phaser.Scene, x: number, y: number, label: string, color: number, onClick: () => void): Phaser.GameObjects.Container {
  const w = 220;
  const h = 52;
  const bg = scene.add.rectangle(0, 0, w, h, color).setStrokeStyle(2, 0xffffff, 0.25);
  const text = scene.add.text(0, 0, label, { fontFamily: 'sans-serif', fontSize: '20px', fontStyle: 'bold', color: '#14161f' }).setOrigin(0.5);
  const c = scene.add.container(x, y, [bg, text]).setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => c.setScale(0.96));
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => {
    c.setScale(1);
    onClick();
  });
  return c;
}

export const TEXT = { fontFamily: 'sans-serif', color: '#e6e9f5' };
