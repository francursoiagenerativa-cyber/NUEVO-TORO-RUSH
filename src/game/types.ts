export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'NONE';

export type GhostType = 'blinky' | 'pinky' | 'inky' | 'clyde' | 'morlaco';

export type GhostMode = 'CHASE' | 'SCATTER' | 'FRIGHTENED' | 'EATEN';

export interface Position {
  x: number; // in pixel coordinates
  y: number;
}

export interface GridCoord {
  col: number; // column index 0..27
  row: number; // row index 0..30
}

export interface Ghost {
  id: GhostType;
  name: string;
  alias: string;
  color: string;
  scaredColor: string;
  x: number;
  y: number;
  targetCol: number;
  targetRow: number;
  scatterCol: number;
  scatterRow: number;
  direction: Direction;
  nextDirection: Direction;
  mode: GhostMode;
  speed: number;
  inHouse: boolean;
  houseTimer: number;
  frightenedTimer: number;
}

export interface Torero {
  x: number;
  y: number;
  direction: Direction;
  nextDirection: Direction;
  speed: number;
  mouthFrame: number;
  isDead: boolean;
  deathFrame: number;
}

export interface ScorePopup {
  x: number;
  y: number;
  points: number;
  timer: number;
}

export interface BonusItem {
  col: number;
  row: number;
  name: string;
  points: number;
  icon: string;
  active: boolean;
  timer: number;
}

export type GameStatus = 'READY' | 'PLAYING' | 'PAUSED' | 'DYING' | 'VICTORY' | 'GAMEOVER';
