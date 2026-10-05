// Progreso guardado en el navegador. localStorage puede fallar (modo privado, sin permisos):
// el juego funciona igual sin él, solo que no recuerda nada.

interface SaveData {
  bestLevel: number;
  stars: Record<string, number>; // estrellas por nivel
  coins: number;
  owned: string[]; // apariencias compradas
  skin: string;
  dpad: boolean; // cruceta virtual en lugar de deslizar
  daily: Record<string, number>; // mejor tiempo (s) por semilla del laberinto del día
  bestInfinite: number;
}

const KEY = 'pyl-progreso';
const DEFAULTS: SaveData = { bestLevel: 1, stars: {}, coins: 0, owned: ['amarillo'], skin: 'amarillo', dpad: false, daily: {}, bestInfinite: 0 };

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    const old = Number(localStorage.getItem('pyl-mejor-nivel')) || 1; // versión anterior
    const data = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS, bestLevel: old };
    return data;
  } catch {
    return { ...DEFAULTS };
  }
}

let cache: SaveData | null = null;

export function save(): SaveData {
  if (!cache) cache = load();
  return cache;
}

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save()));
  } catch {
    // sin almacenamiento disponible
  }
}

export function recordLevel(level: number, stars: number): void {
  const s = save();
  s.bestLevel = Math.max(s.bestLevel, level + 1);
  s.stars[level] = Math.max(s.stars[level] ?? 0, stars);
  persist();
}

export function addCoins(n: number): void {
  save().coins += n;
  persist();
}
