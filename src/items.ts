import Phaser from 'phaser';
import { COLORS, RULES } from './config';
import { Rng, shuffle } from './maze';

export type ItemKind =
  | 'hourglass'
  | 'shoes'
  | 'smoke'
  | 'map'
  | 'decoy'
  | 'cloak'
  | 'oil'
  | 'wall'
  | 'key'
  | 'disguise';

export interface ItemDef {
  name: string;
  unlock: number; // nivel desde el que aparece
  color: string; // color del aviso en pantalla
  rare?: boolean; // desde el nivel 5 uno raro aparece en un callejón sin salida
}

// Tabla de artefactos del documento de diseño (más el disfraz, decidido después en el hilo).
export const ITEMS: Record<ItemKind, ItemDef> = {
  hourglass: { name: 'Reloj de arena', unlock: 1, color: '#f5a623' },
  shoes: { name: 'Zapatillas', unlock: 1, color: '#4dd0e1' },
  smoke: { name: 'Bomba de humo', unlock: 1, color: '#c8ccd8' },
  map: { name: 'Mapa', unlock: 2, color: '#e8d8a8' },
  decoy: { name: 'Señuelo', unlock: 3, color: '#ffc83d' },
  cloak: { name: 'Capa de invisibilidad', unlock: 4, color: '#b38cff', rare: true },
  oil: { name: 'Mancha de aceite', unlock: 4, color: '#a0896b' },
  wall: { name: 'Pared temporal', unlock: 5, color: '#ff9f43', rare: true },
  key: { name: 'Llave maestra', unlock: 6, color: '#ffd84d', rare: true },
  disguise: { name: 'Disfraz de policía', unlock: 7, color: '#7fa8ff' },
};

export const EFFECT_MS = {
  shoes: 4000, // corre un 50 % más rápido
  shoesFactor: 1.5,
  smokeStun: 3000,
  smokeLife: 12000, // la nube se disipa si nadie entra
  map: 5000,
  cloak: 5000,
  oilStun: 2000,
  wall: 6000,
  disguise: 8000,
  hourglassSeconds: 15,
};

// Qué artefactos trae un laberinto: pocos y simples al principio, y desde el nivel 5 uno raro
// que se coloca en un callejón sin salida.
export function pickItems(level: number, count: number, rng: Rng): { kinds: ItemKind[]; rare: ItemKind | null } {
  const unlocked = (Object.keys(ITEMS) as ItemKind[]).filter((k) => ITEMS[k].unlock <= level);
  const common = unlocked.filter((k) => !ITEMS[k].rare);
  const rarePool = unlocked.filter((k) => ITEMS[k].rare);
  let rare: ItemKind | null = null;
  if (level >= 5 && rarePool.length > 0) rare = rarePool[Math.floor(rng() * rarePool.length)];

  const kinds: ItemKind[] = [];
  // Primero, uno de cada artefacto común desbloqueado (los más nuevos primero), luego al azar.
  const fresh = shuffle([...common], rng).sort((a, b) => ITEMS[b].unlock - ITEMS[a].unlock);
  for (const k of fresh) if (kinds.length < count) kinds.push(k);
  let hourglasses = kinds.filter((k) => k === 'hourglass').length;
  while (kinds.length < count) {
    const k = common[Math.floor(rng() * common.length)];
    if (k === 'hourglass') {
      if (hourglasses >= RULES.maxHourglassesPerMaze) continue;
      hourglasses++;
    }
    kinds.push(k);
  }
  return { kinds: shuffle(kinds, rng), rare };
}

// ---------- Iconos (todo son cuadrados y formas simples), centrados en (0,0) ----------

export function drawItem(g: Phaser.GameObjects.Graphics, kind: ItemKind, size: number): void {
  const h = size / 2;
  const line = Math.max(1.5, size / 14);
  switch (kind) {
    case 'hourglass': {
      const w = size * 0.4;
      g.fillStyle(0xf5a623, 1);
      g.fillTriangle(-w, -h, w, -h, 0, 0);
      g.fillTriangle(-w, h, w, h, 0, 0);
      g.lineStyle(line, 0xffffff, 0.9);
      g.lineBetween(-w - 2, -h, w + 2, -h);
      g.lineBetween(-w - 2, h, w + 2, h);
      break;
    }
    case 'shoes': {
      g.fillStyle(0x4dd0e1, 1);
      g.fillRect(-h, -h * 0.1, size, h * 0.8);
      g.fillRect(-h, -h * 0.7, h * 0.7, h);
      g.lineStyle(line, 0xffffff, 0.9);
      g.lineBetween(h * 0.1, -h * 0.55, h, -h * 0.55);
      g.lineBetween(h * 0.3, -h * 0.25, h, -h * 0.25);
      break;
    }
    case 'smoke': {
      g.fillStyle(0xc8ccd8, 1);
      g.fillRect(-h, -h * 0.2, h * 0.9, h * 0.9);
      g.fillRect(-h * 0.3, -h, h * 1.1, h * 1.1);
      g.fillRect(h * 0.1, -h * 0.1, h * 0.9, h * 0.8);
      break;
    }
    case 'map': {
      g.fillStyle(0xe8d8a8, 1);
      g.fillRect(-h, -h * 0.8, size, h * 1.6);
      g.fillStyle(0xd35454, 1);
      const s = Math.max(2, size / 9);
      for (let i = 0; i < 4; i++) g.fillRect(-h * 0.7 + i * h * 0.45, -h * 0.4 + (i % 2) * h * 0.6, s, s);
      break;
    }
    case 'decoy': {
      g.lineStyle(line * 1.4, 0xffc83d, 1);
      g.strokeRect(-h * 0.8, -h * 0.8, size * 0.8, size * 0.8);
      g.fillStyle(0xffc83d, 0.35);
      g.fillRect(-h * 0.8, -h * 0.8, size * 0.8, size * 0.8);
      break;
    }
    case 'cloak': {
      g.fillStyle(0xb38cff, 0.9);
      g.fillTriangle(0, -h, -h, h, h, h);
      g.fillStyle(0xffffff, 0.8);
      g.fillRect(-h * 0.25, -h * 0.2, h * 0.5, h * 0.25);
      break;
    }
    case 'oil': {
      g.fillStyle(0x3b2f24, 1);
      g.fillRect(-h, -h * 0.4, size, h * 0.9);
      g.fillRect(-h * 0.6, -h * 0.8, h * 1.2, h * 1.6);
      g.fillStyle(0xa0896b, 1);
      g.fillRect(-h * 0.4, -h * 0.5, h * 0.4, h * 0.2);
      break;
    }
    case 'wall': {
      g.fillStyle(0xff9f43, 1);
      g.fillRect(-h, -h * 0.6, size, h * 1.2);
      g.lineStyle(line, 0x7a3f0a, 1);
      g.lineBetween(-h, 0, h, 0);
      g.lineBetween(0, -h * 0.6, 0, 0);
      g.lineBetween(-h * 0.5, 0, -h * 0.5, h * 0.6);
      g.lineBetween(h * 0.5, 0, h * 0.5, h * 0.6);
      break;
    }
    case 'key': {
      g.fillStyle(0xffd84d, 1);
      g.fillRect(-h, -h * 0.5, h * 0.9, h);
      g.fillRect(-h * 0.2, -h * 0.15, h * 1.2, h * 0.3);
      g.fillRect(h * 0.6, 0, h * 0.25, h * 0.45);
      g.fillStyle(COLORS.slot, 1);
      g.fillRect(-h * 0.75, -h * 0.2, h * 0.35, h * 0.4);
      break;
    }
    case 'disguise': {
      g.fillStyle(COLORS.cop, 1);
      g.fillRect(-h, -h, size, size);
      g.lineStyle(line, 0xffffff, 0.9);
      g.strokeRect(-h, -h, size, size);
      g.fillStyle(COLORS.thief, 1);
      g.fillRect(-size / 6, -size / 6, size / 3, size / 3);
      break;
    }
  }
}
