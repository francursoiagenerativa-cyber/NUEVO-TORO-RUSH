import { Direction, Ghost, Torero, ScorePopup, BonusItem } from './types';
import { TILE_SIZE, COLS, ROWS } from './constants';
import toreroTrimmedSrc from '../assets/images/torero_trimmed.png';
import bullTrimmedSrc from '../assets/images/bull_trimmed.png';
import bullFrightenedSrc from '../assets/images/bull_frightened.png';
import bullFlashingSrc from '../assets/images/bull_flashing.png';

export class SpriteRenderer {
  public ctx: CanvasRenderingContext2D;
  private toreroImg: HTMLImageElement | null = null;
  private bullImg: HTMLImageElement | null = null;
  private bullFrightenedImg: HTMLImageElement | null = null;
  private bullFlashingImg: HTMLImageElement | null = null;
  private imagesLoaded = false;
  private staticMapCanvas: HTMLCanvasElement | null = null;
  private capoteDeploy = 0; // 0 = fully folded/hidden, 1 = fully deployed in danger
  private swordDeploy = 0; // 0 = hidden, 1 = brandishing sword during power pellet

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.loadAssets();
  }

  private loadAssets() {
    if (typeof window === 'undefined') return;

    let loadedCount = 0;
    const checkAll = () => {
      loadedCount++;
      if (loadedCount >= 4) {
        this.imagesLoaded = true;
      }
    };

    const tImg = new Image();
    tImg.src = toreroTrimmedSrc;
    tImg.onload = () => {
      this.toreroImg = tImg;
      checkAll();
    };

    const bImg = new Image();
    bImg.src = bullTrimmedSrc;
    bImg.onload = () => {
      this.bullImg = bImg;
      checkAll();
    };

    const bfImg = new Image();
    bfImg.src = bullFrightenedSrc;
    bfImg.onload = () => {
      this.bullFrightenedImg = bfImg;
      checkAll();
    };

    const bflImg = new Image();
    bflImg.src = bullFlashingSrc;
    bflImg.onload = () => {
      this.bullFlashingImg = bflImg;
      checkAll();
    };
  }

  // Pre-render the static labyrinth walls ONCE on an offscreen canvas for extreme mobile performance
  private initStaticMap(grid: string[][]) {
    if (typeof document === 'undefined') return;

    const offscreen = document.createElement('canvas');
    offscreen.width = COLS * TILE_SIZE;
    offscreen.height = ROWS * TILE_SIZE;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    // Background: Deep dark bullring arcade black
    offCtx.fillStyle = '#050202';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

    // 1. Draw Pamplona San Fermín Cobblestone Street across all corridor floor tiles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        if (cell === 'W') continue; // Wooden burladero walls will be rendered on top

        const startX = c * TILE_SIZE;
        const startY = r * TILE_SIZE;

        // Base dark asphalt / mortar groove
        offCtx.fillStyle = '#09080a';
        offCtx.fillRect(startX, startY, TILE_SIZE, TILE_SIZE);

        offCtx.save();
        offCtx.beginPath();
        offCtx.rect(startX, startY, TILE_SIZE, TILE_SIZE);
        offCtx.clip();

        // 4 courses of authentic cobblestones per tile (7px height each)
        for (let rowIdx = 0; rowIdx < 4; rowIdx++) {
          const globalRow = r * 4 + rowIdx;
          const sy = startY + rowIdx * 7;
          // Stagger alternating rows by 7px (running bond / hiladas a rompejunta)
          const rowOffset = globalRow % 2 === 1 ? 7 : 0;

          // Draw overlapping cobblestones across the tile
          for (let colIdx = -1; colIdx <= 2; colIdx++) {
            const sx = startX + colIdx * 14 + rowOffset;
            const stoneCol = Math.floor((c * 28 + (colIdx * 14 + rowOffset)) / 14);

            // Deterministic hash for realistic Pamplona granite color variation
            const hash = Math.abs((globalRow * 47 + stoneCol * 83 + (r * 13) ^ (c * 19))) % 100;
            // Palette: dark navarre granite with slate and charcoal tones
            const graniteTones = ['#1d1f25', '#252730', '#20222a', '#2a2d37', '#181a1f'];
            const stoneColor = graniteTones[hash % graniteTones.length];

            const stoneW = 13;
            const stoneH = 6;

            // Main cobblestone body
            offCtx.fillStyle = stoneColor;
            offCtx.fillRect(sx, sy, stoneW, stoneH);

            // Subtle top highlight (worn polished cobblestone edge from encierro)
            offCtx.fillStyle = hash % 2 === 0 ? '#434756' : '#393d4a';
            offCtx.fillRect(sx, sy, stoneW, 1);
            // Subtle left highlight
            offCtx.fillStyle = '#323642';
            offCtx.fillRect(sx, sy + 1, 1, stoneH - 2);

            // Deep bottom shadow (depth into the mortar gap)
            offCtx.fillStyle = '#0d0e12';
            offCtx.fillRect(sx, sy + stoneH - 1, stoneW, 1);
            // Right edge shadow
            offCtx.fillRect(sx + stoneW - 1, sy, 1, stoneH);

            // Subtle mineral quartz speckle on select cobblestones
            if (hash % 4 === 0) {
              offCtx.fillStyle = 'rgba(215, 230, 255, 0.12)';
              offCtx.fillRect(sx + 3 + (hash % 6), sy + 2, 1.5, 1);
            }
          }
        }

        // Contact shadow against adjacent burladero walls for authentic street depth
        const topIsWall = r > 0 && grid[r - 1][c] === 'W';
        const bottomIsWall = r < ROWS - 1 && grid[r + 1][c] === 'W';
        const leftIsWall = c > 0 && grid[r][c - 1] === 'W';
        const rightIsWall = c < COLS - 1 && grid[r][c + 1] === 'W';

        offCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        if (topIsWall) offCtx.fillRect(startX, startY, TILE_SIZE, 2.5);
        if (bottomIsWall) offCtx.fillRect(startX, startY + TILE_SIZE - 2.5, TILE_SIZE, 2.5);
        if (leftIsWall) offCtx.fillRect(startX, startY, 2.5, TILE_SIZE);
        if (rightIsWall) offCtx.fillRect(startX + TILE_SIZE - 2.5, startY, 2.5, TILE_SIZE);

        offCtx.restore();
      }
    }

    // 2. Draw Burladeros (Wooden Walls) and Toril Gates on top

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        if (cell === 'W') {
          // Burladero Tradicional Rojo de Plaza de Toros
          const topW = r > 0 && grid[r - 1][c] === 'W';
          const bottomW = r < ROWS - 1 && grid[r + 1][c] === 'W';
          const leftW = c > 0 && grid[r][c - 1] === 'W';
          const rightW = c < COLS - 1 && grid[r][c + 1] === 'W';

          // 1. Sombra posterior del refugio / callejón del burladero
          offCtx.fillStyle = '#000000';
          offCtx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

          // 2. Tablazón de madera de burladero (Rojo Almagre Taurino)
          offCtx.fillStyle = '#6b1111'; // Base rojo oscuro de madera
          offCtx.fillRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

          // Tablones horizontales de madera roja
          offCtx.fillStyle = '#831818';
          offCtx.fillRect(x + 1, y + 1, TILE_SIZE - 2, 7); // Tablón superior
          offCtx.fillRect(x + 1, y + 10, TILE_SIZE - 2, 8); // Tablón intermedio
          offCtx.fillRect(x + 1, y + 20, TILE_SIZE - 2, 7); // Tablón inferior

          // Ranuras oscuras entre tablas de madera
          offCtx.fillStyle = '#260404';
          offCtx.fillRect(x + 1, y + 9, TILE_SIZE - 2, 1.2);
          offCtx.fillRect(x + 1, y + 19, TILE_SIZE - 2, 1.2);

          // 3. Franja central decorativa de gala (Rojo carmesí con ribete de oro/albero)
          offCtx.fillStyle = '#b91c1c'; // Rojo vivo de barrera
          offCtx.fillRect(x + 0.5, y + 9.5, TILE_SIZE - 1, 9);

          // Fino ribete dorado / albero viejo delimitando la franja
          offCtx.fillStyle = '#d97706';
          offCtx.fillRect(x + 0.5, y + 9.5, TILE_SIZE - 1, 1.2);
          offCtx.fillRect(x + 0.5, y + 17.5, TILE_SIZE - 1, 1.2);

          // Emblema o clavo central de gala dorado en bloques alternos
          if ((r + c) % 3 === 0) {
            offCtx.fillStyle = '#fbbf24'; // Brass/gold center rivet
            offCtx.beginPath();
            offCtx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 2.0, 0, Math.PI * 2);
            offCtx.fill();
          }

          // 4. Pasamanos / Albardilla de remate superior (si tiene camino abierto arriba)
          if (!topW) {
            offCtx.fillStyle = '#dc2626'; // Rojo brillante de remate de barrera
            offCtx.fillRect(x + 0.5, y, TILE_SIZE - 1, 3.5);

            // Borde dorado en el lomo superior del burladero
            offCtx.fillStyle = '#fbbf24';
            offCtx.fillRect(x + 0.5, y, TILE_SIZE - 1, 1.4);
          }

          // Rodapié inferior (si tiene camino abierto abajo)
          if (!bottomW) {
            offCtx.fillStyle = '#450a0a';
            offCtx.fillRect(x + 0.5, y + TILE_SIZE - 2.5, TILE_SIZE - 1, 2.5);
            offCtx.fillStyle = '#1a0303';
            offCtx.fillRect(x + 0.5, y + TILE_SIZE - 1.0, TILE_SIZE - 1, 1.0);
          }

          // 5. Postes / Maderos laterales de anclaje con remaches dorados
          if (!leftW) {
            offCtx.fillStyle = '#ef4444';
            offCtx.fillRect(x, y + 0.5, 2.0, TILE_SIZE - 1);
            offCtx.fillStyle = '#fbbf24';
            offCtx.fillRect(x + 2.5, y + 3, 2.0, 2.0);
            offCtx.fillRect(x + 2.5, y + TILE_SIZE - 5, 2.0, 2.0);
          }

          if (!rightW) {
            offCtx.fillStyle = '#ef4444';
            offCtx.fillRect(x + TILE_SIZE - 2.0, y + 0.5, 2.0, TILE_SIZE - 1);
            offCtx.fillStyle = '#fbbf24';
            offCtx.fillRect(x + TILE_SIZE - 4.5, y + 3, 2.0, 2.0);
            offCtx.fillRect(x + TILE_SIZE - 4.5, y + TILE_SIZE - 5, 2.0, 2.0);
          }

          // Perfilado exterior nítido en rojo bermellón
          offCtx.strokeStyle = '#b91c1c';
          offCtx.lineWidth = 1.0;
          offCtx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1.0, TILE_SIZE - 1.0);
        } else if (cell === '=') {
          // Puerta del toril (Rejas doradas y rojas)
          offCtx.fillStyle = '#eab308';
          offCtx.fillRect(x, y + TILE_SIZE / 2 - 2.5, TILE_SIZE, 5);
          offCtx.fillStyle = '#fde047';
          offCtx.fillRect(x + 5, y + 2, 2.5, TILE_SIZE - 4);
          offCtx.fillRect(x + 20, y + 2, 2.5, TILE_SIZE - 4);
        }
      }
    }

    this.staticMapCanvas = offscreen;
  }

  // Draw Arena: 1 Blit for all static walls + fast dynamic render for active coins
  public drawMap(grid: string[][], tick: number) {
    const ctx = this.ctx;

    if (!this.staticMapCanvas) {
      this.initStaticMap(grid);
    }

    // Blit pre-rendered static arena background in 1 single ultra-fast operation
    if (this.staticMapCanvas) {
      ctx.drawImage(this.staticMapCanvas, 0, 0);
    } else {
      ctx.fillStyle = '#050202';
      ctx.fillRect(0, 0, COLS * TILE_SIZE, ROWS * TILE_SIZE);
    }

    // Dynamic pass: ONLY draw active coins and pulsing power pellets
    const pulse = (Math.sin(tick * 0.18) + 1) / 2; // 0..1
    const pelletRadius = 8 + pulse * 3.5;
    const pelletAlpha = 0.35 + pulse * 0.4;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        if (cell !== '.' && cell !== 'o') continue;

        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        const cx = x + TILE_SIZE / 2;
        const cy = y + TILE_SIZE / 2;

        if (cell === '.') {
          // Moneda Amarilla Clásica
          // Outer yellow glow
          ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
          ctx.beginPath();
          ctx.arc(cx, cy, 6.0, 0, Math.PI * 2);
          ctx.fill();

          // Yellow gold coin body
          ctx.fillStyle = '#eab308'; // Amber-500
          ctx.beginPath();
          ctx.arc(cx, cy, 4.2, 0, Math.PI * 2);
          ctx.fill();

          // Bright center sparkle
          ctx.fillStyle = '#fef08a'; // Yellow-200
          ctx.beginPath();
          ctx.arc(cx - 1, cy - 1, 1.8, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell === 'o') {
          // Monedón de Oro Especial (Power Pellet)
          // Glowing yellow corona
          ctx.fillStyle = `rgba(250, 204, 21, ${pelletAlpha})`;
          ctx.beginPath();
          ctx.arc(cx, cy, pelletRadius + 5, 0, Math.PI * 2);
          ctx.fill();

          // Outer gold rim
          ctx.fillStyle = '#ca8a04';
          ctx.beginPath();
          ctx.arc(cx, cy, pelletRadius, 0, Math.PI * 2);
          ctx.fill();

          // Shiny yellow coin surface
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(cx, cy, pelletRadius - 2, 0, Math.PI * 2);
          ctx.fill();

          // Central sparkle
          ctx.fillStyle = '#fef9c3';
          ctx.beginPath();
          ctx.arc(cx - 1.5, cy - 1.5, pelletRadius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Draw Torero Emoji (High-Performance Hardware Rendering, No Expensive shadowBlur)
  public drawTorero(torero: Torero, ghosts: Ghost[] = [], tick: number = 0) {
    const ctx = this.ctx;
    const cx = torero.x;
    const cy = torero.y;

    // Dimensions scaled up for 28px tiles (natural 810x929 aspect ratio)
    const width = 42;
    const height = 48.2;

    ctx.save();
    ctx.translate(cx, cy);

    // Fast GPU ground shadow on arena sand
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, height / 2 - 2, width * 0.35, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (torero.isDead) {
      this.capoteDeploy = 0;
      this.swordDeploy = 0;
      const progress = torero.deathFrame / 60;
      const angle = progress * Math.PI * 8;
      const scale = Math.max(0, 1 - progress);

      ctx.rotate(angle);
      ctx.scale(scale, scale);

      if (this.toreroImg) {
        ctx.drawImage(this.toreroImg, -width / 2, -height / 2, width, height);
      } else {
        this.drawToreroFallback();
      }

      ctx.restore();
      return;
    }

    // 1. Check if Monedón de Oro is active (frightened bulls fleeing = hunt mode)
    const frightenedGhosts = ghosts ? ghosts.filter((g) => g.mode === 'FRIGHTENED') : [];
    const isEmpowered = frightenedGhosts.length > 0;
    const minFrightenedTimer = isEmpowered
      ? Math.min(...frightenedGhosts.map((g) => g.frightenedTimer))
      : 0;
    const isExpiring = isEmpowered && minFrightenedTimer < 110;

    // Smooth deployment of sword (brandished out front during Monedón de Oro)
    const targetSword = isEmpowered ? 1 : 0;
    const swordSpeed = isEmpowered ? 0.22 : 0.12;
    this.swordDeploy += (targetSword - this.swordDeploy) * swordSpeed;
    if (this.swordDeploy < 0.005) this.swordDeploy = 0;
    else if (this.swordDeploy > 0.995) this.swordDeploy = 1;

    // 2. Check proximity to active chasing/scattering bulls (danger distance ~4.2 tiles = ~118px)
    const DANGER_DISTANCE = 4.2 * TILE_SIZE;
    let isThreatened = false;

    // Only check threat if not empowered with the sword
    if (!isEmpowered && ghosts && ghosts.length > 0) {
      for (const g of ghosts) {
        if (g.mode === 'CHASE' || g.mode === 'SCATTER') {
          const dist = Math.hypot(torero.x - g.x, torero.y - g.y);
          if (dist <= DANGER_DISTANCE) {
            isThreatened = true;
            break;
          }
        }
      }
    }

    // Smooth deployment factor for defensive capote
    const targetDeploy = isThreatened ? 1 : 0;
    const lerpSpeed = isThreatened ? 0.18 : 0.08;
    this.capoteDeploy += (targetDeploy - this.capoteDeploy) * lerpSpeed;
    if (this.capoteDeploy < 0.005) this.capoteDeploy = 0;
    else if (this.capoteDeploy > 0.995) this.capoteDeploy = 1;

    let dirAngle = 0;
    let flipX = false;
    if (torero.direction === 'UP') dirAngle = -Math.PI / 2;
    else if (torero.direction === 'DOWN') dirAngle = Math.PI / 2;
    else if (torero.direction === 'LEFT') flipX = true;
    else if (torero.direction === 'RIGHT') flipX = false;

    // Movement bobbing
    const bob = Math.sin(tick * 0.3) * 1.8;

    // Draw Pure Red Animated Capote trailing behind the torero (ONLY when bulls are close and dangerous)
    this.drawCapote(torero, tick);

    // Draw Torero Emoji Head 100% Opaque with Fast Direct Hardware Blitting
    if (this.toreroImg) {
      ctx.save();
      if (flipX) {
        ctx.scale(-1, 1);
      }
      ctx.globalAlpha = 1.0;
      ctx.drawImage(this.toreroImg, -width / 2, -height / 2 + bob, width, height);
      ctx.restore();
    } else {
      this.drawToreroFallback();
    }

    // Draw Normal Steel Sword out front (held high heroically during Monedón de Oro)
    this.drawSword(torero, tick, dirAngle, flipX, isExpiring);

    ctx.restore();
  }

  // Draw Normal Steel Sword (brandished forward heroically when bulls are frightened)
  private drawSword(
    torero: Torero,
    tick: number,
    dirAngle: number,
    flipX: boolean,
    isExpiring: boolean
  ) {
    if (this.swordDeploy <= 0) return;

    const ctx = this.ctx;

    // Heroic thrusting animation
    const thrust = Math.sin(tick * 0.42) * 2.5;
    const swordTilt = Math.sin(tick * 0.28) * 0.05;

    ctx.save();

    // Flashing cue when power is about to expire
    if (isExpiring && Math.floor(tick / 8) % 2 === 0) {
      ctx.globalAlpha = 0.4 * this.swordDeploy;
    } else {
      ctx.globalAlpha = Math.min(1, this.swordDeploy * 1.25);
    }

    // Orient forward towards the direction of movement
    if (dirAngle !== 0) {
      ctx.rotate(dirAngle);
    } else if (flipX) {
      ctx.scale(-1, 1);
    }

    // Hand position at the forward edge of the torero
    const handX = 7;
    const handY = 6;

    // Smooth equip scale from the hand
    ctx.translate(handX, handY);
    ctx.scale(this.swordDeploy, this.swordDeploy);
    ctx.rotate(swordTilt);
    ctx.translate(-handX, -handY);

    // 1. Steel blade shadow on sand
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(handX + 14 + thrust, handY + 7, 12, 2.0, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Steel Blade (Polished stainless steel estoque with tapered sharp tip)
    const bladeStartX = handX + 5;
    const bladeEndX = handX + 23 + thrust;
    const bladeHalfW = 1.6;

    // Steel gradient
    const bladeGrad = ctx.createLinearGradient(bladeStartX, handY - 2, bladeStartX, handY + 2);
    bladeGrad.addColorStop(0, '#f8fafc'); // Upper edge chrome shine
    bladeGrad.addColorStop(0.45, '#e2e8f0'); // Polished steel body
    bladeGrad.addColorStop(0.55, '#cbd5e1'); // Central fuller line
    bladeGrad.addColorStop(1, '#94a3b8'); // Bottom edge bevel shadow

    ctx.fillStyle = bladeGrad;
    ctx.beginPath();
    ctx.moveTo(bladeStartX, handY - bladeHalfW);
    ctx.lineTo(bladeEndX, handY - 0.9);
    // Sharp sword tip
    ctx.lineTo(bladeEndX + 5, handY);
    ctx.lineTo(bladeEndX, handY + 0.9);
    ctx.lineTo(bladeStartX, handY + bladeHalfW);
    ctx.closePath();
    ctx.fill();

    // Sharp steel outline
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // Central fuller and razor-sharp shine highlight
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(bladeStartX + 1, handY - 0.4);
    ctx.lineTo(bladeEndX + 1, handY - 0.2);
    ctx.stroke();

    // Subtle dark center groove
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(bladeStartX + 2, handY + 0.2);
    ctx.lineTo(bladeEndX - 2, handY + 0.2);
    ctx.stroke();

    // 3. Crossguard / Gavilán de Acero (Traditional steel crossguard)
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.0;

    // Crossguard bar
    ctx.beginPath();
    ctx.roundRect(bladeStartX - 1.5, handY - 7, 2.5, 14, 1.0);
    ctx.fill();
    ctx.stroke();

    // Small protective cazoleta curve
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(bladeStartX - 0.5, handY, 3.8, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.stroke();

    // 4. Grip / Empuñadura (Black leather-wrapped hilt with steel rings)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(handX - 1, handY - 1.5, 6, 3);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(handX - 1, handY - 1.5, 6, 3);

    // Silver wire wraps on the grip
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(handX + 1, handY - 1.4);
    ctx.lineTo(handX + 1, handY + 1.4);
    ctx.moveTo(handX + 3, handY - 1.4);
    ctx.lineTo(handX + 3, handY + 1.4);
    ctx.stroke();

    // 5. Solid Steel Pommel (Pomo de acero pulido)
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(handX - 2.5, handY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // 6. Torero's front hand gripping the sword
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(handX + 2, handY, 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw Pure Red Animated Capote trailing BEHIND the torero (towards the chasing bulls)
  private drawCapote(torero: Torero, tick: number) {
    if (this.capoteDeploy <= 0) return;

    const ctx = this.ctx;

    // Dynamic wave physics for pure red cloth billowing in the wind behind the running torero
    const wave1 = Math.sin(tick * 0.35) * 4.2;
    const wave2 = Math.cos(tick * 0.45) * 3.0;
    const wave3 = Math.sin(tick * 0.25) * 2.2;

    // Cape trailing angle: strictly OPPOSITE to torero movement (facing the bulls chasing from behind)
    let capeAngle = Math.PI; // Default: trails LEFT (opposite to moving RIGHT)
    if (torero.direction === 'RIGHT') capeAngle = Math.PI; // Moving Right -> Trails Left
    else if (torero.direction === 'LEFT') capeAngle = 0; // Moving Left -> Trails Right
    else if (torero.direction === 'UP') capeAngle = Math.PI / 2; // Moving Up -> Trails Downwards
    else if (torero.direction === 'DOWN') capeAngle = -Math.PI / 2; // Moving Down -> Trails Upwards

    // Centrifugal corner tilt: Dynamic whipping of the trailing cape when player queues a turn
    let turnTilt = 0;
    const cur = torero.direction;
    const nxt = torero.nextDirection;
    if (nxt && nxt !== cur && nxt !== 'NONE') {
      if (cur === 'RIGHT') {
        if (nxt === 'UP') turnTilt = 0.22;
        else if (nxt === 'DOWN') turnTilt = -0.22;
      } else if (cur === 'LEFT') {
        if (nxt === 'UP') turnTilt = -0.22;
        else if (nxt === 'DOWN') turnTilt = 0.22;
      } else if (cur === 'UP') {
        if (nxt === 'RIGHT') turnTilt = -0.22;
        else if (nxt === 'LEFT') turnTilt = 0.22;
      } else if (cur === 'DOWN') {
        if (nxt === 'RIGHT') turnTilt = 0.22;
        else if (nxt === 'LEFT') turnTilt = -0.22;
      }
    }

    // Coordinates for the fan-shaped Capote attached at the torero's back/hands
    const startX = 6;
    const topY = -8;
    const bottomY = 8;

    ctx.save();

    // Orient cape trailing directly behind the torero
    ctx.rotate(capeAngle);

    // Dynamic lag tilt into turns
    if (turnTilt !== 0) {
      ctx.rotate(turnTilt);
    }

    // Smooth unfold expansion from the torero's hands
    ctx.translate(startX, 0);
    ctx.scale(this.capoteDeploy, this.capoteDeploy);
    ctx.translate(-startX, 0);
    ctx.globalAlpha = Math.min(1, this.capoteDeploy * 1.25);

    // 1. Capote ground shadow on arena sand behind the torero
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(18, 5, 12, 4.5, turnTilt * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Billowing cape coordinates
    const outerTopX = 25 + wave3;
    const outerTopY = -15 + wave1;
    const outerMidX = 31 + wave2;
    const outerMidY = wave1 * 0.5;
    const outerBottomX = 25 - wave3;
    const outerBottomY = 15 - wave1;

    // 2. BACK LAYER: Deep dark garnet red under-fold (El envés y sombra de la tela roja taurina)
    ctx.fillStyle = '#7f1d1d'; // Deep dark bullring red
    ctx.beginPath();
    ctx.moveTo(startX, topY);
    ctx.quadraticCurveTo(15, -17 + wave1, outerTopX + 1.5, outerTopY - 1);
    ctx.bezierCurveTo(
      outerMidX + 1.5,
      outerMidY - 7,
      outerMidX + 1.5,
      outerMidY + 7,
      outerBottomX + 1.5,
      outerBottomY + 1
    );
    ctx.quadraticCurveTo(15, 17 - wave1, startX, bottomY);
    ctx.closePath();
    ctx.fill();

    // 3. FRONT LAYER: Pure Scarlet Bullfighting Red Cloth (Sin franja amarilla)
    const grad = ctx.createLinearGradient(startX, 0, outerMidX, 0);
    grad.addColorStop(0, '#991b1b'); // Dark carmine red near torero hands
    grad.addColorStop(0.45, '#dc2626'); // Vibrant classic bullfighter red
    grad.addColorStop(1, '#ef4444'); // Sunlit scarlet trailing flutter edge

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(startX + 1, topY);
    // Upper curve fanning out
    ctx.quadraticCurveTo(15, -14 + wave1 * 0.8, outerTopX - 1, outerTopY + 1);
    // Billowing outer hem
    ctx.bezierCurveTo(
      outerMidX - 1.5,
      outerMidY - 6,
      outerMidX - 1.5,
      outerMidY + 6,
      outerBottomX - 1,
      outerBottomY - 1
    );
    // Lower curve returning to torero
    ctx.quadraticCurveTo(15, 14 - wave1 * 0.8, startX + 1, bottomY);
    ctx.quadraticCurveTo(4, 0, startX + 1, topY);
    ctx.closePath();
    ctx.fill();

    // 4. Cloth Folds & Texture in Deep Garnet (Pliegues naturales de tela roja pura)
    ctx.strokeStyle = '#450a0a'; // Dark garnet shadow for deep cloth folds
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';

    // Fold line 1 (upper billow)
    ctx.beginPath();
    ctx.moveTo(startX + 3, -4);
    ctx.quadraticCurveTo(15, -9 + wave1 * 0.6, outerTopX - 4, outerTopY + 4);
    ctx.stroke();

    // Fold line 2 (center crease)
    ctx.beginPath();
    ctx.moveTo(startX + 4, 0);
    ctx.quadraticCurveTo(17, wave1 * 0.4, outerMidX - 4, outerMidY);
    ctx.stroke();

    // Fold line 3 (lower billow)
    ctx.beginPath();
    ctx.moveTo(startX + 3, 4);
    ctx.quadraticCurveTo(15, 9 - wave1 * 0.6, outerBottomX - 4, outerBottomY - 4);
    ctx.stroke();

    // Soft silk sheen highlight on top ridge in bright crimson
    ctx.strokeStyle = 'rgba(254, 202, 202, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(startX + 4, -5);
    ctx.quadraticCurveTo(15, -11 + wave1 * 0.7, outerTopX - 5, outerTopY + 2);
    ctx.stroke();

    // 5. Esclavina (Cuello de gala en rojo oscuro carmesí)
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.arc(startX + 2, 0, 5, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 6. Torero's hands and sleeves holding the cape at his back
    ctx.fillStyle = '#0f172a'; // Chaquetilla sleeve
    ctx.fillRect(startX - 3, topY - 2, 4.5, 3.5);
    ctx.fillStyle = '#b91c1c'; // Crimson cuff
    ctx.fillRect(startX + 0.5, topY - 2, 1.2, 3.5);
    ctx.fillStyle = '#fed7aa'; // Hand
    ctx.beginPath();
    ctx.arc(startX + 2, topY, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a'; // Chaquetilla sleeve
    ctx.fillRect(startX - 3, bottomY - 1.5, 4.5, 3.5);
    ctx.fillStyle = '#b91c1c'; // Crimson cuff
    ctx.fillRect(startX + 0.5, bottomY - 1.5, 1.2, 3.5);
    ctx.fillStyle = '#fed7aa'; // Hand
    ctx.beginPath();
    ctx.arc(startX + 2, bottomY, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw Bull Emoji (High-Performance Hardware Rendering, No Expensive shadowBlur)
  public drawGhost(ghost: Ghost, tick: number) {
    const ctx = this.ctx;
    const cx = ghost.x;
    const cy = ghost.y;

    // Dimensions scaled up for 28px tiles (natural 793x781 aspect ratio)
    const width = 44;
    const height = 43.3;

    ctx.save();
    ctx.translate(cx, cy);

    // Fast GPU ground shadow on arena sand
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(0, height / 2 - 2, width * 0.38, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (ghost.mode === 'EATEN') {
      this.drawBullEyesAndHorns(ghost.direction);
      ctx.restore();
      return;
    }

    const isFrightened = ghost.mode === 'FRIGHTENED';
    const isFlashing =
      isFrightened &&
      ghost.frightenedTimer < 110 &&
      Math.floor(ghost.frightenedTimer / 8) % 2 === 0;

    const flipX = ghost.direction === 'LEFT';

    // Characteristic color badge for each bull
    const badgeColor = isFrightened ? (isFlashing ? '#ffffff' : '#3b82f6') : ghost.color;

    // 1. Crisp solid colored ribbon / divisa on top of the bull
    ctx.save();
    ctx.fillStyle = badgeColor;
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 1.2;

    // Traditional ribbon rosette on top
    ctx.beginPath();
    ctx.arc(0, -height / 2 - 3, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Select the appropriate 100% OPAQUE image
    let targetImg: HTMLImageElement | null = this.bullImg;
    if (isFrightened) {
      targetImg = isFlashing ? this.bullFlashingImg : this.bullFrightenedImg;
    }

    if (targetImg) {
      ctx.save();
      if (flipX) {
        ctx.scale(-1, 1);
      }
      ctx.globalAlpha = 1.0;
      ctx.drawImage(targetImg, -width / 2, -height / 2, width, height);
      ctx.restore();
    } else {
      this.drawBullFallback(ghost);
    }

    ctx.restore();
    ctx.restore();
  }

  private drawBullEyesAndHorns(dir: Direction) {
    const ctx = this.ctx;
    let eyeX = 0;
    let eyeY = 0;
    if (dir === 'LEFT') eyeX = -3;
    else if (dir === 'RIGHT') eyeX = 3;
    else if (dir === 'UP') eyeY = -3;
    else if (dir === 'DOWN') eyeY = 3;

    // Sharp ghostly horns
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(-14, -16);
    ctx.lineTo(-3, -9);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(6, -4);
    ctx.lineTo(14, -16);
    ctx.lineTo(3, -9);
    ctx.fill();

    // Sclera
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-6, 0, 5, 0, Math.PI * 2);
    ctx.arc(6, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.arc(-6 + eyeX, 0 + eyeY, 2.5, 0, Math.PI * 2);
    ctx.arc(6 + eyeX, 0 + eyeY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawToreroFallback() {
    const ctx = this.ctx;
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-10, -14, 20, 8);
  }

  private drawBullFallback(ghost: Ghost) {
    const ctx = this.ctx;
    ctx.fillStyle = ghost.color;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw Bonus Item
  public drawBonus(bonus: BonusItem) {
    if (!bonus.active) return;
    const ctx = this.ctx;
    const x = bonus.col * TILE_SIZE + TILE_SIZE / 2;
    const y = bonus.row * TILE_SIZE + TILE_SIZE / 2;

    ctx.save();
    ctx.font = '26px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bonus.icon, x, y);
    ctx.restore();
  }

  // Floating score popups (+200, +400, etc.)
  public drawPopups(popups: ScorePopup[]) {
    const ctx = this.ctx;
    ctx.save();
    popups.forEach((p) => {
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#260404';
      ctx.lineWidth = 3;
      ctx.strokeText(`+${p.points}`, p.x, p.y);
      ctx.fillStyle = '#fef08a'; // Bright gold text
      ctx.fillText(`+${p.points}`, p.x, p.y);
    });
    ctx.restore();
  }
}
