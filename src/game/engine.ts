import {
  Direction,
  Ghost,
  Torero,
  GhostMode,
  ScorePopup,
  BonusItem,
  GameStatus,
} from './types';
import {
  INITIAL_MAP,
  TILE_SIZE,
  COLS,
  ROWS,
  GHOST_CONFIGS,
  TORERO_SPAWN,
  SPEED_BASE,
  SPEED_GHOST_NORMAL,
  SPEED_GHOST_FRIGHTENED,
  SPEED_GHOST_EATEN,
  FRIGHTENED_DURATION_TICKS,
  BONUS_ITEMS,
  TORIL_DOOR,
  BONUS_SPAWN,
} from './constants';
import { soundFX } from './audio';

export interface GameEngineState {
  score: number;
  highScore: number;
  lives: number;
  level: number;
  dotsRemaining: number;
  totalDots: number;
  status: GameStatus;
  tick: number;
  globalMode: 'CHASE' | 'SCATTER';
  globalModeTimer: number;
  ghostsEatenChain: number;
}

export class GameEngine {
  public grid: string[][];
  public torero: Torero;
  public ghosts: Ghost[];
  public popups: ScorePopup[] = [];
  public bonus: BonusItem;
  public state: GameEngineState;
  private levelClearTimer = 0;

  private onStateChange?: (state: GameEngineState) => void;

  constructor(onStateChange?: (state: GameEngineState) => void) {
    this.onStateChange = onStateChange;
    this.grid = INITIAL_MAP.map((r) => r.split(''));

    const savedHigh = typeof window !== 'undefined' ? localStorage.getItem('ole_pac_highscore') : null;
    const initialHighScore = savedHigh ? parseInt(savedHigh, 10) || 0 : 0;

    let dotCount = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c] === '.' || this.grid[r][c] === 'o') {
          dotCount++;
        }
      }
    }

    this.state = {
      score: 0,
      highScore: initialHighScore,
      lives: 3,
      level: 1,
      dotsRemaining: dotCount,
      totalDots: dotCount,
      status: 'READY',
      tick: 0,
      globalMode: 'SCATTER',
      globalModeTimer: 420, // 7 seconds scatter at 60fps
      ghostsEatenChain: 0,
    };

    this.torero = this.createTorero();
    this.ghosts = this.createGhosts();
    this.bonus = {
      col: BONUS_SPAWN.col,
      row: BONUS_SPAWN.row,
      name: BONUS_ITEMS[0].name,
      points: BONUS_ITEMS[0].points,
      icon: BONUS_ITEMS[0].icon,
      active: false,
      timer: 0,
    };
  }

  private getRandomSafeSpawn(): { col: number; row: number } {
    const candidates: { col: number; row: number }[] = [];
    const minDistanceTiles = 6;

    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        // Must not be wall, door, or inside the bull house
        if (!this.isPassable(c, r, false)) continue;
        if (this.grid[r][c] === '-' || this.grid[r][c] === '=') continue;

        // Keep safe distance from bull pen center and gate (col 10, row 9)
        const distToGate = Math.hypot(c - 10, r - 9);
        if (distToGate < minDistanceTiles) continue;

        // Keep safe distance from Blinky's spawn (col 10, row 8)
        const distToBlinky = Math.hypot(c - 10, r - 8);
        if (distToBlinky < minDistanceTiles) continue;

        candidates.push({ col: c, row: r });
      }
    }

    if (candidates.length > 0) {
      const idx = Math.floor(Math.random() * candidates.length);
      return candidates[idx];
    }

    return TORERO_SPAWN;
  }

  private createTorero(spawnPos?: { col: number; row: number }): Torero {
    const spawn = spawnPos || TORERO_SPAWN;

    // Pick an initial passable direction
    let initialDir: Direction = 'LEFT';
    const directions: Direction[] = ['LEFT', 'RIGHT', 'UP', 'DOWN'];
    for (const d of directions) {
      const nextTile = this.getTileInDir(spawn.col, spawn.row, d);
      if (this.isPassable(nextTile.col, nextTile.row, false)) {
        initialDir = d;
        break;
      }
    }

    return {
      x: spawn.col * TILE_SIZE + TILE_SIZE / 2,
      y: spawn.row * TILE_SIZE + TILE_SIZE / 2,
      direction: initialDir,
      nextDirection: initialDir,
      speed: SPEED_BASE,
      mouthFrame: 0,
      isDead: false,
      deathFrame: 0,
    };
  }

  private getLevelParameters(level: number) {
    // 1. Ghost Normal Speed:
    // Level 1: 1.80 (calm and fair, torero has 2.00)
    // Level 2: 1.88
    // Level 3: 1.96
    // Level 4: 2.02 (slightly faster than torero in long straights!)
    // Level 5+: caps smoothly at 2.08 to prevent any tile desync
    const ghostNormalSpeed = Math.min(1.80 + (level - 1) * 0.08, 2.08);

    // 2. Frightened Duration (ticks at 60 fps):
    // Level 1: 480 ticks (8.0 seconds)
    // Level 2: 390 ticks (6.5 seconds)
    // Level 3: 300 ticks (5.0 seconds)
    // Level 4: 210 ticks (3.5 seconds)
    // Level 5+: 150 ticks (2.5 seconds)
    let frightenedDuration = 480;
    if (level === 2) frightenedDuration = 390;
    else if (level === 3) frightenedDuration = 300;
    else if (level === 4) frightenedDuration = 210;
    else if (level >= 5) frightenedDuration = 150;

    // 3. Frightened ghost speed (calm slowdown during cape effect):
    const ghostFrightenedSpeed = Math.min(1.15 + (level - 1) * 0.04, 1.35);

    // 4. Scatter and Chase cycle durations:
    const scatterTicks = Math.max(180, 420 - (level - 1) * 60); // 7s in lvl 1 down to 3s in lvl 5
    const chaseTicks = Math.min(1380, 1200 + (level - 1) * 45); // 20s up to 23s

    return {
      ghostNormalSpeed,
      frightenedDuration,
      ghostFrightenedSpeed,
      scatterTicks,
      chaseTicks,
    };
  }

  private createGhosts(): Ghost[] {
    const { ghostNormalSpeed } = this.getLevelParameters(this.state.level);
    return GHOST_CONFIGS.map((cfg) => ({
      id: cfg.id,
      name: cfg.name,
      alias: cfg.alias,
      color: cfg.color,
      scaredColor: cfg.scaredColor,
      x: cfg.spawnCol * TILE_SIZE + TILE_SIZE / 2,
      y: cfg.spawnRow * TILE_SIZE + TILE_SIZE / 2,
      targetCol: cfg.scatterCol,
      targetRow: cfg.scatterRow,
      scatterCol: cfg.scatterCol,
      scatterRow: cfg.scatterRow,
      direction: cfg.startInHouse ? 'UP' : 'LEFT',
      nextDirection: cfg.startInHouse ? 'UP' : 'LEFT',
      mode: 'SCATTER',
      speed: ghostNormalSpeed,
      inHouse: cfg.startInHouse,
      houseTimer: cfg.houseTimer,
      frightenedTimer: 0,
    }));
  }

  public startGame(): void {
    if (this.state.status === 'READY') {
      soundFX.playIntro();
      this.state.status = 'PLAYING';
      this.notify();
    } else if (this.state.status === 'GAMEOVER') {
      this.restartFullGame();
    }
  }

  public restartFullGame(): void {
    this.grid = INITIAL_MAP.map((r) => r.split(''));
    let dotCount = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c] === '.' || this.grid[r][c] === 'o') {
          dotCount++;
        }
      }
    }

    this.state.score = 0;
    this.state.lives = 3;
    this.state.level = 1;
    this.state.dotsRemaining = dotCount;
    this.state.totalDots = dotCount;
    this.state.status = 'PLAYING';
    this.state.tick = 0;
    this.state.globalMode = 'SCATTER';
    this.state.globalModeTimer = 420;
    this.state.ghostsEatenChain = 0;

    this.torero = this.createTorero();
    this.ghosts = this.createGhosts();
    this.popups = [];
    this.bonus.active = false;
    this.levelClearTimer = 0;
    soundFX.playIntro();
    this.notify();
  }

  public pauseToggle(): void {
    if (this.state.status === 'PLAYING') {
      this.state.status = 'PAUSED';
    } else if (this.state.status === 'PAUSED') {
      this.state.status = 'PLAYING';
    }
    this.notify();
  }

  public setNextDirection(dir: Direction): void {
    if (this.state.status === 'READY') {
      this.startGame();
    } else if (this.state.status === 'VICTORY') {
      this.advanceToNextLevel();
    }
    this.torero.nextDirection = dir;
  }

  public update(): void {
    if (
      this.state.status !== 'PLAYING' &&
      this.state.status !== 'DYING' &&
      this.state.status !== 'VICTORY'
    ) {
      return;
    }

    this.state.tick++;

    if (this.state.status === 'VICTORY') {
      if (this.levelClearTimer > 0) {
        this.levelClearTimer--;
        if (this.levelClearTimer % 15 === 0) {
          this.notify();
        }
      } else {
        this.advanceToNextLevel();
      }
      return;
    }

    if (this.state.status === 'DYING') {
      this.torero.deathFrame++;
      if (this.torero.deathFrame > 70) {
        if (this.state.lives > 0) {
          this.resetPositionsAfterDeath();
          this.state.status = 'PLAYING';
        } else {
          this.state.status = 'GAMEOVER';
        }
        this.notify();
      }
      return;
    }

    // 1. Update Global Mode Timer (Scatter / Chase Cycles)
    this.updateGlobalTimer();

    // 2. Move Torero with buffer and cornering
    this.updateTorero();

    // 3. Move Ghosts with target calculation
    this.updateGhosts();

    // 4. Check Collisions (Dots, Pellets, Bulls, Bonus)
    this.checkCollisions();

    // 5. Update Popups and Bonus
    this.updatePopups();
    this.updateBonus();

    // 6. Check Win Condition
    if (this.state.dotsRemaining <= 0) {
      this.handleLevelClear();
    }

    if (this.state.tick % 10 === 0) {
      this.notify();
    }
  }

  private updateGlobalTimer(): void {
    const { scatterTicks, chaseTicks } = this.getLevelParameters(this.state.level);
    if (this.state.globalModeTimer > 0) {
      this.state.globalModeTimer--;
    } else {
      if (this.state.globalMode === 'SCATTER') {
        this.state.globalMode = 'CHASE';
        this.state.globalModeTimer = chaseTicks;
      } else {
        this.state.globalMode = 'SCATTER';
        this.state.globalModeTimer = scatterTicks;
      }
      // Reverse directions on mode change
      this.ghosts.forEach((g) => {
        if (g.mode !== 'FRIGHTENED' && g.mode !== 'EATEN' && !g.inHouse) {
          g.mode = this.state.globalMode;
          g.direction = this.getOpposite(g.direction);
        }
      });
    }
  }

  private updateTorero(): void {
    const t = this.torero;
    const curCol = Math.floor(t.x / TILE_SIZE);
    const curRow = Math.floor(t.y / TILE_SIZE);

    const tileCenterX = curCol * TILE_SIZE + TILE_SIZE / 2;
    const tileCenterY = curRow * TILE_SIZE + TILE_SIZE / 2;

    const distToCenter = Math.hypot(t.x - tileCenterX, t.y - tileCenterY);

    // Can turn if buffered direction is opposite immediately, or if near tile center and target tile is open
    const isOpposite = t.nextDirection === this.getOpposite(t.direction);

    if (isOpposite) {
      t.direction = t.nextDirection;
    } else if (distToCenter < 4 && t.nextDirection !== t.direction) {
      const nextTile = this.getTileInDir(curCol, curRow, t.nextDirection);
      if (this.isPassable(nextTile.col, nextTile.row, false)) {
        t.x = tileCenterX;
        t.y = tileCenterY;
        t.direction = t.nextDirection;
      }
    }

    // Move in current direction
    const dirVector = this.getVector(t.direction);
    const nextX = t.x + dirVector.x * t.speed;
    const nextY = t.y + dirVector.y * t.speed;

    // Check forward collision with walls
    const checkCol = Math.floor((nextX + dirVector.x * (TILE_SIZE / 2 - 1)) / TILE_SIZE);
    const checkRow = Math.floor((nextY + dirVector.y * (TILE_SIZE / 2 - 1)) / TILE_SIZE);

    if (this.isPassable(checkCol, checkRow, false)) {
      t.x = nextX;
      t.y = nextY;
    } else {
      // Snap to center when hitting wall
      t.x = tileCenterX;
      t.y = tileCenterY;
    }

    // Strict containment within enclosed arena grid
    if (t.x < 1.5 * TILE_SIZE) t.x = 1.5 * TILE_SIZE;
    if (t.x > (COLS - 1.5) * TILE_SIZE) t.x = (COLS - 1.5) * TILE_SIZE;
    if (t.y < 1.5 * TILE_SIZE) t.y = 1.5 * TILE_SIZE;
    if (t.y > (ROWS - 1.5) * TILE_SIZE) t.y = (ROWS - 1.5) * TILE_SIZE;
  }

  private updateGhosts(): void {
    this.ghosts.forEach((ghost) => {
      // 1. Ghost inside House
      if (ghost.inHouse) {
        if (ghost.houseTimer > 0) {
          ghost.houseTimer--;
          // Bob up and down inside pen
          if (ghost.direction === 'UP' && ghost.y <= 10.5 * TILE_SIZE) {
            ghost.direction = 'DOWN';
          } else if (ghost.direction === 'DOWN' && ghost.y >= 11.5 * TILE_SIZE) {
            ghost.direction = 'UP';
          }
          const v = this.getVector(ghost.direction);
          ghost.y += v.y * 0.8;
          return;
        }

        // Leave house: move toward door center
        const doorX = TORIL_DOOR.col * TILE_SIZE + TILE_SIZE / 2;
        const doorY = TORIL_DOOR.row * TILE_SIZE + TILE_SIZE / 2;

        if (Math.abs(ghost.x - doorX) > 1.5) {
          ghost.x += ghost.x < doorX ? 1.2 : -1.2;
          ghost.direction = ghost.x < doorX ? 'RIGHT' : 'LEFT';
        } else if (ghost.y > doorY) {
          ghost.x = doorX;
          ghost.y -= 1.2;
          ghost.direction = 'UP';
        } else {
          ghost.x = doorX;
          ghost.y = doorY;
          ghost.inHouse = false;
          ghost.direction = 'LEFT';
          ghost.mode = this.state.globalMode;
        }
        return;
      }

      // 2. Frightened timer update
      if (ghost.mode === 'FRIGHTENED') {
        ghost.frightenedTimer--;
        if (ghost.frightenedTimer <= 0) {
          ghost.mode = this.state.globalMode;
        }
      }

      // 3. Speed calculation based on level and mode
      const { ghostNormalSpeed, ghostFrightenedSpeed } = this.getLevelParameters(this.state.level);
      let currentSpeed = ghostNormalSpeed;
      if (ghost.mode === 'FRIGHTENED') {
        currentSpeed = ghostFrightenedSpeed;
      } else if (ghost.mode === 'EATEN') {
        currentSpeed = SPEED_GHOST_EATEN;
      }

      // 4. Ghost Target Determination
      this.calculateGhostTarget(ghost);

      // 5. Classic Pac-Man Grid Navigation
      const curCol = Math.floor(ghost.x / TILE_SIZE);
      const curRow = Math.floor(ghost.y / TILE_SIZE);
      const tileCenterX = curCol * TILE_SIZE + TILE_SIZE / 2;
      const tileCenterY = curRow * TILE_SIZE + TILE_SIZE / 2;

      // Detect if crossing or reaching tile center during this frame
      let reachedCenter = false;
      if (ghost.direction === 'LEFT' && ghost.x >= tileCenterX && ghost.x - currentSpeed <= tileCenterX) {
        reachedCenter = true;
      } else if (ghost.direction === 'RIGHT' && ghost.x <= tileCenterX && ghost.x + currentSpeed >= tileCenterX) {
        reachedCenter = true;
      } else if (ghost.direction === 'UP' && ghost.y >= tileCenterY && ghost.y - currentSpeed <= tileCenterY) {
        reachedCenter = true;
      } else if (ghost.direction === 'DOWN' && ghost.y <= tileCenterY && ghost.y + currentSpeed >= tileCenterY) {
        reachedCenter = true;
      }

      if (reachedCenter) {
        // Snap exactly to the center of intersection
        ghost.x = tileCenterX;
        ghost.y = tileCenterY;
        ghost.direction = this.chooseNextGhostDirection(ghost, curCol, curRow);
      }

      // Lock perpendicular coordinate strictly to corridor center line
      if (ghost.direction === 'LEFT' || ghost.direction === 'RIGHT') {
        ghost.y = tileCenterY;
      } else {
        ghost.x = tileCenterX;
      }

      const v = this.getVector(ghost.direction);
      const nextX = ghost.x + v.x * currentSpeed;
      const nextY = ghost.y + v.y * currentSpeed;

      const nextTileCol = curCol + v.x;
      const nextTileRow = curRow + v.y;

      // Check whether ahead is an obstacle
      if (!this.isPassable(nextTileCol, nextTileRow, ghost.mode === 'EATEN')) {
        // Advance only up to tile center, then pick an open path
        if (ghost.direction === 'LEFT' && nextX < tileCenterX) {
          ghost.x = tileCenterX;
          ghost.direction = this.chooseNextGhostDirection(ghost, curCol, curRow);
        } else if (ghost.direction === 'RIGHT' && nextX > tileCenterX) {
          ghost.x = tileCenterX;
          ghost.direction = this.chooseNextGhostDirection(ghost, curCol, curRow);
        } else if (ghost.direction === 'UP' && nextY < tileCenterY) {
          ghost.y = tileCenterY;
          ghost.direction = this.chooseNextGhostDirection(ghost, curCol, curRow);
        } else if (ghost.direction === 'DOWN' && nextY > tileCenterY) {
          ghost.y = tileCenterY;
          ghost.direction = this.chooseNextGhostDirection(ghost, curCol, curRow);
        } else {
          ghost.x = nextX;
          ghost.y = nextY;
        }
      } else {
        ghost.x = nextX;
        ghost.y = nextY;
      }

      // Strict containment within the black arena grid: 100% inside borders
      if (ghost.x < 1.5 * TILE_SIZE) ghost.x = 1.5 * TILE_SIZE;
      if (ghost.x > (COLS - 1.5) * TILE_SIZE) ghost.x = (COLS - 1.5) * TILE_SIZE;
      if (ghost.y < 1.5 * TILE_SIZE) ghost.y = 1.5 * TILE_SIZE;
      if (ghost.y > (ROWS - 1.5) * TILE_SIZE) ghost.y = (ROWS - 1.5) * TILE_SIZE;

      // Check if EATEN ghost arrived home at the toril door
      if (ghost.mode === 'EATEN' && curRow === TORIL_DOOR.row && Math.abs(curCol - TORIL_DOOR.col) <= 1) {
        ghost.mode = this.state.globalMode;
        ghost.frightenedTimer = 0;
      }
    });
  }

  private calculateGhostTarget(ghost: Ghost): void {
    if (ghost.mode === 'EATEN') {
      ghost.targetCol = TORIL_DOOR.col;
      ghost.targetRow = TORIL_DOOR.row;
      return;
    }

    if (ghost.mode === 'SCATTER') {
      ghost.targetCol = ghost.scatterCol;
      ghost.targetRow = ghost.scatterRow;
      return;
    }

    const tCol = Math.floor(this.torero.x / TILE_SIZE);
    const tRow = Math.floor(this.torero.y / TILE_SIZE);

    if (ghost.id === 'blinky') {
      // Toro Bravo (Rojo): Direct chase to Torero
      ghost.targetCol = tCol;
      ghost.targetRow = tRow;
    } else if (ghost.id === 'pinky') {
      // Toro Veloz (Rosa): Ambush 4 tiles ahead of Torero
      const tVec = this.getVector(this.torero.direction);
      ghost.targetCol = tCol + tVec.x * 4;
      ghost.targetRow = tRow + tVec.y * 4;
    } else if (ghost.id === 'inky') {
      // Toro Listo (Cian): Flanker pinza
      const blinky = this.ghosts.find((g) => g.id === 'blinky');
      const bCol = blinky ? Math.floor(blinky.x / TILE_SIZE) : tCol;
      const bRow = blinky ? Math.floor(blinky.y / TILE_SIZE) : tRow;

      const tVec = this.getVector(this.torero.direction);
      const intermediateCol = tCol + tVec.x * 2;
      const intermediateRow = tRow + tVec.y * 2;

      ghost.targetCol = intermediateCol + (intermediateCol - bCol);
      ghost.targetRow = intermediateRow + (intermediateRow - bRow);
    } else if (ghost.id === 'clyde') {
      // Toro Pasmado (Naranja): Shifty bull
      const curCol = Math.floor(ghost.x / TILE_SIZE);
      const curRow = Math.floor(ghost.y / TILE_SIZE);
      const dist = Math.hypot(curCol - tCol, curRow - tRow);

      if (dist > 8) {
        ghost.targetCol = tCol;
        ghost.targetRow = tRow;
      } else {
        ghost.targetCol = ghost.scatterCol;
        ghost.targetRow = ghost.scatterRow;
      }
    } else if (ghost.id === 'morlaco') {
      // Toro Morlaco (Morado / "El Quinto Malo"): Acechador de corte de escape
      const mirrorCol = COLS - 1 - tCol;
      const mirrorRow = ROWS - 1 - tRow;
      const curCol = Math.floor(ghost.x / TILE_SIZE);
      const curRow = Math.floor(ghost.y / TILE_SIZE);
      const dist = Math.hypot(curCol - tCol, curRow - tRow);

      // Si está a corta/media distancia (< 7 casillas) embiste directo;
      // si está lejos, corta las vías de escape cubriendo el cuadrante opuesto
      if (dist < 7) {
        ghost.targetCol = tCol;
        ghost.targetRow = tRow;
      } else {
        ghost.targetCol = mirrorCol;
        ghost.targetRow = mirrorRow;
      }
    }
  }

  private chooseNextGhostDirection(ghost: Ghost, col: number, row: number): Direction {
    const possibleDirs: Direction[] = ['UP', 'LEFT', 'DOWN', 'RIGHT'];
    const opposite = this.getOpposite(ghost.direction);

    // Filter valid moves (cannot reverse direction unless forced, cannot pass walls)
    const validMoves = possibleDirs.filter((dir) => {
      if (dir === opposite) return false;
      const nextTile = this.getTileInDir(col, row, dir);
      return this.isPassable(nextTile.col, nextTile.row, ghost.mode === 'EATEN');
    });

    if (validMoves.length === 0) {
      return opposite;
    }

    if (ghost.mode === 'FRIGHTENED') {
      // Random direction at intersections
      return validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    // Pick move that minimizes straight Euclidean distance to target tile
    let bestDir = validMoves[0];
    let minDistance = Infinity;

    validMoves.forEach((dir) => {
      const nextTile = this.getTileInDir(col, row, dir);
      const dist = Math.hypot(nextTile.col - ghost.targetCol, nextTile.row - ghost.targetRow);
      if (dist < minDistance) {
        minDistance = dist;
        bestDir = dir;
      }
    });

    return bestDir;
  }

  private checkCollisions(): void {
    const tCol = Math.floor(this.torero.x / TILE_SIZE);
    const tRow = Math.floor(this.torero.y / TILE_SIZE);

    // 1. Check Dot & Pellet
    if (tRow >= 0 && tRow < ROWS && tCol >= 0 && tCol < COLS) {
      const cell = this.grid[tRow][tCol];
      if (cell === '.') {
        this.grid[tRow][tCol] = ' ';
        this.state.score += 10;
        this.state.dotsRemaining--;
        soundFX.playWaka();
        this.checkFruitTrigger();
      } else if (cell === 'o') {
        this.grid[tRow][tCol] = ' ';
        this.state.score += 50;
        this.state.dotsRemaining--;
        soundFX.playPowerPellet();
        this.state.ghostsEatenChain = 0;

        // Trigger Frightened on all non-eaten, active ghosts
        const { frightenedDuration } = this.getLevelParameters(this.state.level);
        this.ghosts.forEach((ghost) => {
          if (ghost.mode !== 'EATEN' && !ghost.inHouse) {
            ghost.mode = 'FRIGHTENED';
            ghost.frightenedTimer = frightenedDuration;
            ghost.direction = this.getOpposite(ghost.direction);
          }
        });
      }
    }

    // 2. Check Bonus collision
    if (this.bonus.active && tCol === this.bonus.col && tRow === this.bonus.row) {
      this.state.score += this.bonus.points;
      soundFX.playBonus();
      this.popups.push({
        x: this.bonus.col * TILE_SIZE + TILE_SIZE / 2,
        y: this.bonus.row * TILE_SIZE + TILE_SIZE / 2,
        points: this.bonus.points,
        timer: 45,
      });
      this.bonus.active = false;
    }

    // 3. Check Ghost Collisions
    for (const ghost of this.ghosts) {
      const dist = Math.hypot(this.torero.x - ghost.x, this.torero.y - ghost.y);
      if (dist < TILE_SIZE * 0.75) {
        if (ghost.mode === 'FRIGHTENED') {
          // Toreo exitoso! Capotazo al toro
          ghost.mode = 'EATEN';
          this.state.ghostsEatenChain++;
          const pointsEarned = 200 * Math.pow(2, this.state.ghostsEatenChain - 1);
          this.state.score += pointsEarned;
          soundFX.playEatGhost();

          this.popups.push({
            x: ghost.x,
            y: ghost.y,
            points: pointsEarned,
            timer: 40,
          });
        } else if (ghost.mode !== 'EATEN') {
          // Cogida! Torero pierde una vida
          this.handleToreroDeath();
          break;
        }
      }
    }

    // Update High Score
    if (this.state.score > this.state.highScore) {
      this.state.highScore = this.state.score;
      if (typeof window !== 'undefined') {
        localStorage.setItem('ole_pac_highscore', String(this.state.highScore));
      }
    }
  }

  private handleToreroDeath(): void {
    this.torero.isDead = true;
    this.torero.deathFrame = 0;
    this.state.status = 'DYING';
    this.state.lives--;
    soundFX.playDeath();
    this.notify();
  }

  private resetPositionsAfterDeath(): void {
    const safeSpawn = this.getRandomSafeSpawn();
    this.torero = this.createTorero(safeSpawn);
    this.ghosts = this.createGhosts();
    this.state.globalMode = 'SCATTER';
    this.state.globalModeTimer = 300;
  }

  private handleLevelClear(): void {
    soundFX.playLevelClear();
    this.state.status = 'VICTORY';
    this.levelClearTimer = 110; // ~1.8 seconds at 60fps
    this.notify();
  }

  public advanceToNextLevel(): void {
    if (this.state.status !== 'VICTORY') return;
    this.state.level++;
    this.state.lives = 3; // Reset to 3 full lives on every new level/plaza
    this.grid = INITIAL_MAP.map((r) => r.split(''));

    let dotCount = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c] === '.' || this.grid[r][c] === 'o') {
          dotCount++;
        }
      }
    }
    this.state.dotsRemaining = dotCount;
    this.state.totalDots = dotCount;

    // Reset bonus item for new level
    const bonusIdx = Math.min(this.state.level - 1, BONUS_ITEMS.length - 1);
    this.bonus = {
      col: 17,
      row: 23,
      name: BONUS_ITEMS[bonusIdx].name,
      points: BONUS_ITEMS[bonusIdx].points,
      icon: BONUS_ITEMS[bonusIdx].icon,
      active: false,
      timer: 0,
    };

    this.resetPositionsAfterDeath();
    this.state.status = 'PLAYING';
    this.notify();
  }

  private checkFruitTrigger(): void {
    const dotsEaten = this.state.totalDots - this.state.dotsRemaining;
    if ((dotsEaten === 100 || dotsEaten === 250 || dotsEaten === 400) && !this.bonus.active) {
      this.bonus.active = true;
      this.bonus.timer = 600; // 10 seconds active
    }
  }

  private updateBonus(): void {
    if (this.bonus.active) {
      this.bonus.timer--;
      if (this.bonus.timer <= 0) {
        this.bonus.active = false;
      }
    }
  }

  private updatePopups(): void {
    this.popups = this.popups.filter((p) => {
      p.timer--;
      p.y -= 0.4;
      return p.timer > 0;
    });
  }

  // Helpers
  private isPassable(col: number, row: number, allowDoor: boolean): boolean {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;

    const cell = this.grid[row][col];
    if (cell === 'W') return false;
    if (cell === '=' && !allowDoor) return false;
    return true;
  }

  private getTileInDir(col: number, row: number, dir: Direction): { col: number; row: number } {
    switch (dir) {
      case 'UP':
        return { col, row: row - 1 };
      case 'DOWN':
        return { col, row: row + 1 };
      case 'LEFT':
        return { col: col - 1, row };
      case 'RIGHT':
        return { col: col + 1, row };
      default:
        return { col, row };
    }
  }

  private getVector(dir: Direction): { x: number; y: number } {
    switch (dir) {
      case 'UP':
        return { x: 0, y: -1 };
      case 'DOWN':
        return { x: 0, y: 1 };
      case 'LEFT':
        return { x: -1, y: 0 };
      case 'RIGHT':
        return { x: 1, y: 0 };
      default:
        return { x: 0, y: 0 };
    }
  }

  private getOpposite(dir: Direction): Direction {
    switch (dir) {
      case 'UP':
        return 'DOWN';
      case 'DOWN':
        return 'UP';
      case 'LEFT':
        return 'RIGHT';
      case 'RIGHT':
        return 'LEFT';
      default:
        return 'NONE';
    }
  }

  private notify(): void {
    if (this.onStateChange) {
      this.onStateChange({ ...this.state });
    }
  }
}
