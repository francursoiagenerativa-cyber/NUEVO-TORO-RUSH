export const TILE_SIZE = 28;
export const COLS = 21;
export const ROWS = 25;

export const CANVAS_WIDTH = COLS * TILE_SIZE; // 588
export const CANVAS_HEIGHT = ROWS * TILE_SIZE; // 700

export const TUNNEL_ROWS: number[] = [];

// Perfectly balanced, less extensive 21x25 arcade bullring
// 100% enclosed perimeter with zero exits, spacious corridors, and 237 yellow coins.
export const INITIAL_MAP: string[] = [
  'WWWWWWWWWWWWWWWWWWWWW', // 0
  'W.........W.........W', // 1
  'WoWW.WWWW.W.WWWW.WWoW', // 2 - power pellets
  'W.WW.WWWW.W.WWWW.WW.W', // 3
  'W...................W', // 4
  'W.WW.W.WWWWWWW.W.WW.W', // 5
  'W....W....W....W....W', // 6
  'WWWW.WWWW.W.WWWW.WWWW', // 7
  'WWWW.W.........W.WWWW', // 8
  'WWWW.W.WW===WW.W.WWWW', // 9 - Toril Door (col 9..11, row 9)
  'W......W-----W......W', // 10
  'W.WWWW.W-----W.WWWW.W', // 11
  'W.WWWW.WWWWWWW.WWWW.W', // 12
  'W....W.........W....W', // 13 - Bonus Item at (10, 13)
  'WWWW.W.WWWWWWW.W.WWWW', // 14
  'WWWW.W.WWWWWWW.W.WWWW', // 15
  'W.........W.........W', // 16 - Torero Spawn at (10, 16)
  'W.WW.WWWW.W.WWWW.WW.W', // 17
  'Wo.W.W.........W.W.oW', // 18 - power pellets
  'WW.W.W.WWWWWWW.W.W.WW', // 19
  'W....W....W....W....W', // 20
  'W.WWWWWWW.W.WWWWWWW.W', // 21
  'W.........W.........W', // 22
  'W...................W', // 23
  'WWWWWWWWWWWWWWWWWWWWW', // 24
];

export const GHOST_CONFIGS = [
  {
    id: 'blinky' as const,
    name: 'Bravo',
    alias: 'El Rojo',
    color: '#ef4444', // Red
    scaredColor: '#3b82f6',
    scatterCol: 19,
    scatterRow: 0,
    spawnCol: 10,
    spawnRow: 8,
    startInHouse: false,
    houseTimer: 0,
  },
  {
    id: 'pinky' as const,
    name: 'Veloz',
    alias: 'La Rosa',
    color: '#f43f5e', // Pink
    scaredColor: '#3b82f6',
    scatterCol: 1,
    scatterRow: 0,
    spawnCol: 10,
    spawnRow: 11,
    startInHouse: true,
    houseTimer: 60,
  },
  {
    id: 'inky' as const,
    name: 'Listo',
    alias: 'El Cian',
    color: '#06b6d4', // Cyan
    scaredColor: '#3b82f6',
    scatterCol: 19,
    scatterRow: 24,
    spawnCol: 9,
    spawnRow: 11,
    startInHouse: true,
    houseTimer: 160,
  },
  {
    id: 'clyde' as const,
    name: 'Pasmado',
    alias: 'El Naranja',
    color: '#f97316', // Orange
    scaredColor: '#3b82f6',
    scatterCol: 1,
    scatterRow: 24,
    spawnCol: 11,
    spawnRow: 11,
    startInHouse: true,
    houseTimer: 270,
  },
  {
    id: 'morlaco' as const,
    name: 'Morlaco',
    alias: 'El Quinto Malo',
    color: '#a855f7', // Majestic Purple / Capote de Paseo
    scaredColor: '#3b82f6',
    scatterCol: 19,
    scatterRow: 1,
    spawnCol: 10,
    spawnRow: 10,
    startInHouse: true,
    houseTimer: 360,
  },
];

export const TORERO_SPAWN = {
  col: 10,
  row: 16,
};

export const TORIL_DOOR = {
  col: 10,
  row: 8, // Walkable tile directly outside the gate
};

export const BONUS_SPAWN = {
  col: 10,
  row: 13,
};

export const SPEED_BASE = 2.0; // Velocidad original preferida por el usuario
export const SPEED_GHOST_NORMAL = 1.85;
export const SPEED_GHOST_FRIGHTENED = 1.15;
export const SPEED_GHOST_EATEN = 4.0;
export const SPEED_GHOST_TUNNEL = 1.0;

export const FRIGHTENED_DURATION_TICKS = 480; // 8 seconds
export const FRIGHTENED_FLASH_TICKS = 140;

export const BONUS_ITEMS = [
  { name: 'Montera de Oro', points: 100, icon: '👑' },
  { name: 'Banderillas Reales', points: 300, icon: '🗡️' },
  { name: 'Bota de Jerez', points: 500, icon: '🍷' },
  { name: 'Gran Jamón', points: 700, icon: '🍖' },
  { name: 'Capote Bordado', points: 1000, icon: '✨' },
  { name: 'Trofeo Ruedo de Oro', points: 2000, icon: '🏆' },
];
