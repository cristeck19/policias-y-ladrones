// Apariencias del cuadrado del ladrón: solo estética, nada que dé ventaja.
export interface Skin {
  id: string;
  name: string;
  cost: number;
  color: number;
  border?: number;
  trail?: boolean;
}

export const SKINS: Skin[] = [
  { id: 'amarillo', name: 'Amarillo', cost: 0, color: 0xffc83d },
  { id: 'naranja', name: 'Naranja', cost: 15, color: 0xff8a3d },
  { id: 'rosa', name: 'Rosa', cost: 30, color: 0xff6fb5 },
  { id: 'verde', name: 'Verde lima', cost: 45, color: 0xa6e22e },
  { id: 'borde', name: 'Borde blanco', cost: 60, color: 0xffc83d, border: 0xffffff },
  { id: 'estela', name: 'Estela', cost: 80, color: 0xffc83d, trail: true },
  { id: 'blanco', name: 'Blanco con estela', cost: 120, color: 0xf2f2f2, border: 0xffc83d, trail: true },
];

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
