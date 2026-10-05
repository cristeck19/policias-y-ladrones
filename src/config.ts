// Tamaño lógico del juego (vertical, pensado para celular). Phaser lo escala a la pantalla.
export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 640;

export const HUD_HEIGHT = 64;
export const PANEL_HEIGHT = 112;

// Tamaño mínimo de celda: si el laberinto no cabe entero, la cámara sigue al ladrón.
export const MIN_CELL = 18;
export const FOLLOW_CELL = 24;

export const COLORS = {
  background: 0x14161f,
  floor: 0x1e2130,
  wall: 0x8a93b8,
  tempWall: 0xff9f43,
  thief: 0xffc83d,
  thiefSlow: 0x9c7a26,
  cop: 0x3d7dff,
  siren: 0xff3b3b,
  copStunned: 0x5a5f78,
  entrance: 0x3a3f55,
  exit: 0x2ecc71,
  coin: 0xffd84d,
  slot: 0x262a3d,
  slotBorder: 0x4a5070,
  cooldown: 0xc0392b,
  mapPath: 0x2ecc71,
  dark: 0x0d0f16,
};

// Reglas del documento de diseño.
export const RULES = {
  thiefSpeed: 5, // celdas por segundo
  slowFactor: 0.5, // al ser atrapado, el ladrón va a mitad de velocidad
  slowMs: 3000,
  copStunMs: 1500, // el policía queda aturdido tras atrapar para no atraparlo otra vez en el acto
  copStartDelayMs: 3000, // ventaja inicial: el policía espera 3 s
  chaseSpeedBonus: 1.1, // en persecución el policía va un 10 % más rápido
  inventorySlots: 2,
  maxHourglassesPerMaze: 2,
  itemCooldownMs: 5000, // espera entre artefactos; usar otro antes divide al policía en dos
  cloneLifeMs: 15000,
  maxCops: 3,
};

export interface LevelConfig {
  level: number;
  cols: number;
  rows: number;
  loopFactor: number; // fracción de muros internos que se abren para crear ciclos
  cops: number;
  copSpeed: number;
  vision: number; // celdas que ve en línea recta
  hearing: number; // celdas (por el camino) a las que lo oye
  searchMs: number; // cuánto busca antes de rendirse
  timeFactor: number; // multiplica el tiempo mínimo de recorrido
  timeBase: number; // segundos extra fijos
  itemCount: number;
  coins: number;
  darkFraction: number; // parte del laberinto con muros invisibles (zonas oscuras)
}

// Progresión: 1-5 (9×15, policía lento), 6-15 (13×21), 16-30 (17×27, 2 policías, menos ciclos),
// 31+ (21×35, 2 o 3 policías, menos tiempo y zonas oscuras).
export function levelConfig(level: number): LevelConfig {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
  if (level <= 5) {
    const t = (level - 1) / 4;
    return {
      level, cols: 9, rows: 15, loopFactor: 0.15, cops: 1,
      copSpeed: lerp(3.4, 3.9, t), vision: Math.round(lerp(4, 6, t)), hearing: Math.round(lerp(2, 3, t)), searchMs: lerp(3000, 5000, t),
      timeFactor: 4, timeBase: 30, itemCount: level <= 2 ? 3 : 4, coins: 6, darkFraction: 0,
    };
  }
  if (level <= 15) {
    const t = (level - 6) / 9;
    return {
      level, cols: 13, rows: 21, loopFactor: 0.12, cops: 1,
      copSpeed: lerp(4.0, 4.4, t), vision: Math.round(lerp(6, 8, t)), hearing: 3, searchMs: 5000,
      timeFactor: 3.6, timeBase: 30, itemCount: 5, coins: 8, darkFraction: 0,
    };
  }
  if (level <= 30) {
    const t = (level - 16) / 14;
    return {
      level, cols: 17, rows: 27, loopFactor: 0.08, cops: 2,
      copSpeed: lerp(4.2, 4.6, t), vision: Math.round(lerp(8, 9, t)), hearing: 3, searchMs: lerp(5000, 6000, t),
      timeFactor: 3.3, timeBase: 25, itemCount: 6, coins: 10, darkFraction: 0,
    };
  }
  const t = (level - 31) / 20;
  return {
    level, cols: 21, rows: 35, loopFactor: 0.08, cops: level < 41 ? 2 : 3,
    copSpeed: 4.6, vision: 10, hearing: 3, searchMs: 6000,
    timeFactor: 2.9, timeBase: 20, itemCount: 6, coins: 12, darkFraction: lerp(0.2, 0.5, t),
  };
}

// Tiempo del nivel según el largo del camino más corto entre entrada y salida.
export function levelTimeSeconds(cfg: LevelConfig, shortestPath: number): number {
  return Math.ceil((shortestPath / RULES.thiefSpeed) * cfg.timeFactor + cfg.timeBase);
}

// Estrellas: 1 por escapar, 1 si sobra al menos un tercio del tiempo, 1 por no ser atrapado.
export function starsFor(won: boolean, timeLeft: number, totalTime: number, captures: number): number {
  if (!won) return 0;
  return 1 + (timeLeft >= totalTime / 3 ? 1 : 0) + (captures === 0 ? 1 : 0);
}
