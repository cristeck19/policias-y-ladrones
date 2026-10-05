// localStorage puede fallar (modo privado, sin permisos); el juego funciona igual sin él.
const KEY = 'pyl-mejor-nivel';

export function getBestLevel(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBestLevel(level: number): void {
  try {
    if (level > getBestLevel()) localStorage.setItem(KEY, String(level));
  } catch {
    // sin almacenamiento disponible
  }
}
