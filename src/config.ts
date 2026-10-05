// Tamaño lógico del juego (vertical, pensado para celular). Phaser lo escala a la pantalla.
export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 640;

export const HUD_HEIGHT = 64;
export const PANEL_HEIGHT = 96;

export const COLORS = {
  background: 0x14161f,
  floor: 0x1e2130,
  wall: 0x8a93b8,
  thief: 0xffc83d,
  thiefSlow: 0x9c7a26,
  cop: 0x3d7dff,
  copStunned: 0x5a5f78,
  entrance: 0x3a3f55,
  exit: 0x2ecc71,
  hourglass: 0xf5a623,
  slot: 0x262a3d,
  slotBorder: 0x4a5070,
};

// Reglas acordadas en el documento de diseño.
export const RULES = {
  thiefSpeed: 5, // celdas por segundo
  slowFactor: 0.5, // al ser atrapado, el ladrón va a mitad de velocidad
  slowMs: 3000,
  copStunMs: 1500, // el policía queda aturdido tras atrapar para no repetir la captura
  hourglassSeconds: 15, // tiempo extra que consume el segundo reloj
  maxHourglassesPerMaze: 2,
  disguiseMs: 8000, // el disfraz de policía dura 8 s y se cae si un policía choca con el ladrón
  inventorySlots: 3,
};

export interface LevelConfig {
  level: number;
  cols: number;
  rows: number;
  cops: number;
  copSpeed: number;
  detectRange: number; // a cuántos pasos el policía "ve" al ladrón y lo persigue
  hourglasses: number;
  disguises: number;
}

export function levelConfig(level: number): LevelConfig {
  const step = Math.min(level - 1, 6);
  return {
    level,
    cols: 9 + step,
    rows: 15 + Math.round(step * 1.6),
    cops: level < 3 ? 1 : level < 6 ? 2 : 3,
    copSpeed: Math.min(3.6 + 0.2 * (level - 1), 4.6),
    detectRange: Math.min(7 + level, 14),
    hourglasses: RULES.maxHourglassesPerMaze,
    disguises: 1,
  };
}

// Tiempo del nivel según el largo del camino más corto entre entrada y salida.
export function levelTimeSeconds(shortestPath: number): number {
  return Math.ceil((shortestPath / RULES.thiefSpeed) * 3 + 15);
}
