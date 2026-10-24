import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Trophy,
  CircleDot,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { GameEngine, GameEngineState } from './game/engine';
import { SpriteRenderer } from './game/sprites';
import { soundFX } from './game/audio';
import { CANVAS_WIDTH, CANVAS_HEIGHT, BONUS_ITEMS } from './game/constants';
import { Direction } from './game/types';
import toreroImg from './assets/images/torero_trimmed.png';
import bullImg from './assets/images/bull_trimmed.png';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<SpriteRenderer | null>(null);
  const animFrameId = useRef<number | null>(null);

  const [gameState, setGameState] = useState<GameEngineState | null>(null);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    try {
      const doc = document as any;
      const docEl = document.documentElement as any;
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen error:', err);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const arenaRef = useRef<HTMLDivElement | null>(null);

  // Initialize engine and High-DPI canvas
  useEffect(() => {
    const engine = new GameEngine((state) => {
      setGameState(state);
    });
    engineRef.current = engine;
    setGameState(engine.state);

    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = CANVAS_WIDTH * dpr;
      canvas.height = CANVAS_HEIGHT * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        rendererRef.current = new SpriteRenderer(ctx);
      }
    }

    // High-performance fixed-timestep animation loop (Zero slow-motion on mobile & 120Hz screens)
    let lastTime = performance.now();
    let accumulator = 0;
    const STEP = 1000 / 60; // 16.667ms fixed physics tick

    const loop = (currentTime: number) => {
      let delta = currentTime - lastTime;
      if (delta > 200) delta = 200; // Cap large lags to avoid death spiral
      lastTime = currentTime;
      accumulator += delta;

      // Update physics at fixed 60 ticks/sec regardless of display refresh rate
      while (accumulator >= STEP) {
        if (engineRef.current) {
          engineRef.current.update();
        }
        accumulator -= STEP;
      }

      // Render on every screen refresh
      if (canvasRef.current && rendererRef.current && engineRef.current) {
        const eng = engineRef.current;
        const ren = rendererRef.current;
        const tick = eng.state.tick;

        // Draw all game elements with strict arena canvas clipping
        ren.ctx.save();
        ren.ctx.beginPath();
        ren.ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ren.ctx.clip();

        ren.drawMap(eng.grid, tick);
        ren.drawBonus(eng.bonus);
        ren.drawTorero(eng.torero, eng.ghosts, tick);
        eng.ghosts.forEach((ghost) => ren.drawGhost(ghost, tick));
        ren.drawPopups(eng.popups);

        ren.ctx.restore();
      }

      animFrameId.current = requestAnimationFrame(loop);
    };

    animFrameId.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameId.current) {
        cancelAnimationFrame(animFrameId.current);
      }
    };
  }, []);

  // Handle Keyboard Input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!engineRef.current) return;

      let dir: Direction | null = null;
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          dir = 'UP';
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          dir = 'DOWN';
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          dir = 'LEFT';
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          dir = 'RIGHT';
          break;
        case ' ':
        case 'p':
        case 'P':
          if (engineRef.current.state.status === 'VICTORY') {
            engineRef.current.advanceToNextLevel();
            e.preventDefault();
            return;
          }
          engineRef.current.pauseToggle();
          e.preventDefault();
          return;
        case 'Enter':
          if (engineRef.current.state.status === 'VICTORY') {
            engineRef.current.advanceToNextLevel();
            e.preventDefault();
            return;
          }
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          e.preventDefault();
          return;
      }

      if (dir) {
        if (engineRef.current.state.status === 'VICTORY') {
          engineRef.current.advanceToNextLevel();
        }
        engineRef.current.setNextDirection(dir);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Touch Swipe Gesture Control for Mobile (Full-Screen Touchpad, Zero-Scroll, Calibrated Sensitivity)
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // Don't intercept touches on interactive buttons/links (e.g. Pause, Fullscreen, Mute, Restart)
      const target = e.target as HTMLElement | null;
      if (target?.closest('button') || target?.closest('a')) {
        touchStartPos.current = null;
        return;
      }

      if (e.touches.length === 1) {
        touchStartPos.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartPos.current || e.touches.length !== 1) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const dx = currentX - touchStartPos.current.x;
      const dy = currentY - touchStartPos.current.y;
      const dist = Math.hypot(dx, dy);

      // Calibrated 15px threshold for instant, responsive swipe across entire screen
      if (dist >= 15) {
        let dir: Direction;
        if (Math.abs(dx) > Math.abs(dy)) {
          dir = dx > 0 ? 'RIGHT' : 'LEFT';
        } else {
          dir = dy > 0 ? 'DOWN' : 'UP';
        }

        if (engineRef.current) {
          engineRef.current.setNextDirection(dir);
        }

        // Reset touch start to current pos so continuous dragging turns corners smoothly
        touchStartPos.current = { x: currentX, y: currentY };
      }

      // Crucial: Prevent pull-to-refresh & screen scrolling on iOS & Android
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      touchStartPos.current = null;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  const handleDirectionPress = useCallback((dir: Direction) => {
    if (engineRef.current) {
      engineRef.current.setNextDirection(dir);
    }
  }, []);

  const handleStartOrRestart = () => {
    if (!engineRef.current) return;
    if (gameState?.status === 'READY') {
      engineRef.current.startGame();
    } else {
      engineRef.current.restartFullGame();
    }
  };

  const handleToggleMute = () => {
    soundFX.enabled = !soundFX.enabled;
    setMuted(!soundFX.enabled);
  };

  return (
    <div className="min-h-screen h-[100dvh] bg-slate-950 text-slate-100 flex flex-col items-center justify-between font-mono selection:bg-amber-400 selection:text-black overflow-hidden">
      {/* Top Arcade Header */}
      <header className={`w-full bg-gradient-to-r from-red-950 via-slate-950 to-red-950 border-b border-red-900/60 shadow-lg shrink-0 transition-all ${
        isFullscreen ? 'px-3 py-1' : 'px-3 sm:px-4 py-1.5 sm:py-2'
      }`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            {/* Emojis from attachments */}
            <div className="flex items-center gap-1 bg-slate-900/80 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg sm:rounded-xl border border-red-900/60">
              <img
                src={toreroImg}
                alt="Torero Emoji"
                className="w-6 h-6 sm:w-8 sm:h-8 object-contain drop-shadow-md"
              />
              <img
                src={bullImg}
                alt="Toro Emoji"
                className="w-6 h-6 sm:w-8 sm:h-8 object-contain drop-shadow-md"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-2xl font-black tracking-widest text-yellow-300 drop-shadow-[0_0_12px_rgba(253,224,71,0.6)]">
                  TORO RUSH!
                </span>
              </div>
            </div>
          </div>

          {/* Quick Toolbar */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Salir de Pantalla Completa (F)' : 'Pantalla Completa (F)'}
              className={`p-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs flex items-center gap-1 border transition-colors ${
                isFullscreen
                  ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                  : 'bg-slate-900 border-slate-800 hover:border-amber-400 text-slate-300 hover:text-white'
              }`}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-slate-950" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{isFullscreen ? 'Ventana' : 'Pantalla Completa'}</span>
            </button>

            <button
              onClick={handleToggleMute}
              title={muted ? 'Activar Sonido' : 'Silenciar'}
              className="p-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs flex items-center gap-1 bg-slate-900 border border-slate-800 hover:border-amber-400 text-slate-300 hover:text-white transition-colors"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              <span className="hidden md:inline">{muted ? 'Mudo' : 'Audio'}</span>
            </button>

            <button
              onClick={() => engineRef.current?.pauseToggle()}
              title="Pausar / Reanudar"
              className="p-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs flex items-center gap-1 bg-slate-900 border border-slate-800 hover:border-amber-400 text-slate-300 hover:text-white transition-colors"
            >
              {gameState?.status === 'PAUSED' ? <Play className="w-3.5 h-3.5 text-amber-400" /> : <Pause className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{gameState?.status === 'PAUSED' ? 'Seguir' : 'Pausa'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Game Screen */}
      <main className="w-full flex-1 flex flex-col items-center justify-start pt-1 sm:pt-2 px-1 sm:px-2 max-w-6xl overflow-hidden min-h-0">
        {/* Sleek Bullring & Coliseum Arena Container (Dynamic Viewport Scale, No Text) */}
        <div
          ref={arenaRef}
          className={`w-full ${
            isFullscreen
              ? 'max-w-[min(99vw,calc((100dvh-70px)*0.84),900px)]'
              : 'max-w-[min(99vw,calc((100dvh-110px)*0.84),840px)]'
          } flex flex-col items-center shadow-2xl transition-all shrink-0`}
        >
          {/* Top Scoreboard Bar (Amphitheater Presidential Balcony) */}
          <div className="w-full bg-gradient-to-r from-[#1c0d08] via-[#26120b] to-[#1c0d08] border-2 border-b-0 border-[#7c2d12]/70 rounded-t-xl px-2.5 sm:px-4 py-1 sm:py-1.5 flex items-center justify-between text-xs sm:text-sm shadow-md">
            {/* 1UP Score */}
            <div className="flex flex-col">
              <span className="text-[10px] text-rose-400 font-bold tracking-wider">1UP FAENA</span>
              <span className="text-white font-black text-base sm:text-lg tracking-wider font-mono">
                {String(gameState?.score || 0).padStart(6, '0')}
              </span>
            </div>

            {/* Récord y Nivel */}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-amber-400 tracking-wider font-bold flex items-center gap-0.5">
                  <Trophy className="w-3 h-3 text-amber-400" /> RÉCORD
                </span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-extrabold border border-amber-500/30">
                  NV.{gameState?.level || 1}
                </span>
              </div>
              <span className="text-yellow-300 font-black text-base sm:text-lg tracking-wider font-mono">
                {String(gameState?.highScore || 0).padStart(6, '0')}
              </span>
            </div>

            {/* Monedas y Vidas */}
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-yellow-400 font-bold flex items-center gap-1">
                <CircleDot className="w-3 h-3 text-yellow-400" /> {gameState?.dotsRemaining || 0}
              </span>
              <div className="flex items-center gap-1 mt-0.5" title={`${gameState?.lives ?? 3} vidas restantes`}>
                {Array.from({ length: Math.max(0, gameState?.lives ?? 3) }).map((_, i) => (
                  <img
                    key={i}
                    src={toreroImg}
                    alt="Vida Torero"
                    className="w-4 h-4 sm:w-5 sm:h-5 object-contain drop-shadow"
                  />
                ))}
                {(gameState?.lives ?? 0) <= 0 && <span className="text-rose-500 font-bold text-xs">¡Última!</span>}
              </div>
            </div>
          </div>

          {/* Thin Bullring Amphitheater Frame (Gradas concéntricas de piedra, callejón y barrera roja) */}
          <div className="w-full p-1 sm:p-1.5 rounded-b-xl bg-gradient-to-b from-[#2a130b] via-[#1a0a05] to-[#100502] border-2 border-t-0 border-[#7c2d12]/70 shadow-[0_15px_35px_rgba(0,0,0,0.85)] relative">
            {/* Graderío / Tendidos concéntricos de piedra (Coliseum stone tiers - 3px) */}
            <div className="p-1 rounded-lg bg-[#220e07] border border-[#521e0b]/60 relative">
              {/* Textura sutil de micro-arcos de piedra sin texto */}
              <div
                className="absolute inset-0 rounded-lg opacity-15 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(circle at 50% 0%, #f59e0b 1px, transparent 1px)',
                  backgroundSize: '10px 6px',
                }}
              />

              {/* El Callejón perimetral oscuro de arena (2px) */}
              <div className="p-0.5 rounded bg-[#100502] border border-[#3b1507]">
                {/* Barrera roja del ruedo con pasamanos de oro (Red wood barrier with gold rails) */}
                <div className="rounded border-2 border-[#881313] bg-black p-[1px] relative shadow-[inset_0_0_12px_rgba(0,0,0,0.95)]">
                  {/* Pasamanos dorado superior de barrera */}
                  <div className="absolute -top-[2px] inset-x-2 h-[2px] bg-gradient-to-r from-amber-700 via-yellow-400 to-amber-700 rounded-full opacity-90 pointer-events-none" />

                  {/* 4 Remaches de bronce de burladero en las 4 esquinas */}
                  <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-gradient-to-br from-amber-300 to-amber-700 border border-amber-900 shadow-sm pointer-events-none z-10" />
                  <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-gradient-to-br from-amber-300 to-amber-700 border border-amber-900 shadow-sm pointer-events-none z-10" />
                  <div className="absolute -bottom-1 -left-1 w-2 h-2 rounded-full bg-gradient-to-br from-amber-300 to-amber-700 border border-amber-900 shadow-sm pointer-events-none z-10" />
                  <div className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-gradient-to-br from-amber-300 to-amber-700 border border-amber-900 shadow-sm pointer-events-none z-10" />

                  {/* Pasamanos dorado inferior de barrera */}
                  <div className="absolute -bottom-[2px] inset-x-2 h-[2px] bg-gradient-to-r from-amber-700 via-yellow-400 to-amber-700 rounded-full opacity-90 pointer-events-none" />

                  {/* Viewport Frame with Pure Game Canvas & Touch Swipe Listener */}
                  <div
                    ref={arenaRef}
                    className="w-full relative overflow-hidden bg-black rounded flex items-center justify-center select-none touch-none"
                    style={{ touchAction: 'none' }}
                  >
                    <canvas
                      ref={canvasRef}
                      width={CANVAS_WIDTH}
                      height={CANVAS_HEIGHT}
                      className={`w-full h-auto ${
                        isFullscreen
                          ? 'max-h-[calc(100dvh-75px)]'
                          : 'max-h-[min(54vh,calc(100dvh-170px))] sm:max-h-[calc(100dvh-115px)]'
                      } block select-none touch-none aspect-[21/25]`}
                      style={{ touchAction: 'none' }}
                    />

                {/* Ready Overlay */}
                {gameState?.status === 'READY' && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-[3px] flex flex-col items-center justify-center p-3 sm:p-5 text-center space-y-2 sm:space-y-3 overflow-y-auto z-30 select-none">
                    <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                      <img
                        src={toreroImg}
                        alt="Torero"
                        className="w-12 h-12 sm:w-16 sm:h-16 object-contain drop-shadow-xl animate-pulse"
                      />
                      <span className="text-lg sm:text-2xl font-black text-amber-400">VS</span>
                      <img
                        src={bullImg}
                        alt="Toro"
                        className="w-12 h-12 sm:w-16 sm:h-16 object-contain drop-shadow-xl animate-pulse"
                      />
                    </div>

                    <div className="shrink-0">
                      <h2 className="text-lg sm:text-2xl font-black text-amber-400 tracking-wider">
                        ¡A POR ELLOS, MAESTRO!
                      </h2>
                      <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                        Laberinto de burladeros con <strong>237 monedas de oro</strong>.
                      </p>
                    </div>

                    <div className="bg-slate-900/90 border border-red-900/60 rounded-lg sm:rounded-xl p-2.5 sm:p-3 text-left text-[11px] sm:text-xs text-slate-300 space-y-1.5 sm:space-y-2 max-w-xs sm:max-w-sm w-full shadow-inner shrink-0">
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 text-center shrink-0 flex items-center justify-center text-sm leading-none select-none">
                          🟡
                        </span>
                        <span><strong>Monedas:</strong> 10 pts cada una</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 text-center shrink-0 flex items-center justify-center text-sm leading-none select-none">
                          ✨
                        </span>
                        <span><strong>Monedón de Oro:</strong> Aturde a los 5 toros</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 text-center shrink-0 flex items-center justify-center text-sm leading-none select-none">
                          🚪
                        </span>
                        <span><strong>Ruedo Cerrado:</strong> Recorre los burladeros y esquiva a los toros</span>
                      </div>
                    </div>

                    <button
                      onClick={handleStartOrRestart}
                      className="bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black px-5 py-2 sm:px-6 sm:py-2.5 rounded-lg sm:rounded-xl shadow-lg shadow-amber-500/30 text-xs sm:text-sm tracking-wider uppercase flex items-center gap-2 transform active:scale-95 transition-all shrink-0 mt-1"
                    >
                      <Play className="w-4 h-4 fill-current" /> Comenzar Corrida
                    </button>
                  </div>
                )}

                {/* Game Over Overlay */}
                {gameState?.status === 'GAMEOVER' && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-3 sm:p-6 text-center space-y-2.5 sm:space-y-3.5 overflow-y-auto animate-fade-in z-30 select-none">
                    <img
                      src={bullImg}
                      alt="Toro Victorioso"
                      className="w-14 h-14 sm:w-18 sm:h-18 object-contain drop-shadow-2xl animate-pulse shrink-0"
                    />
                    <div className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-rose-500/20 border border-rose-500/50 rounded-full text-rose-400 text-[10px] sm:text-xs font-bold tracking-widest uppercase shrink-0">
                      ¡COGIDA EN EL RUEDO!
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-rose-500 tracking-wider shrink-0">
                      FIN DE LA CORRIDA
                    </h2>

                    <div className="bg-slate-900 border border-red-900/60 rounded-xl p-3 sm:p-4 w-60 sm:w-64 space-y-1.5 sm:space-y-2 text-xs shrink-0">
                      <div className="flex justify-between text-slate-400">
                        <span>Puntos obtenidos:</span>
                        <span className="text-white font-bold text-xs sm:text-sm">{gameState.score} pts</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Récord (High Score):</span>
                        <span className="text-amber-400 font-bold text-xs sm:text-sm">{gameState.highScore} pts</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Plaza alcanzada:</span>
                        <span className="text-sky-400 font-bold text-xs sm:text-sm">Nivel {gameState.level}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Plazas superadas:</span>
                        <span className="text-emerald-400 font-bold text-xs sm:text-sm">{Math.max(0, gameState.level - 1)}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleStartOrRestart}
                      className="bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black px-5 py-2 sm:px-6 sm:py-2.5 rounded-lg sm:rounded-xl shadow-lg shadow-amber-500/30 text-xs sm:text-sm tracking-wider uppercase flex items-center gap-2 transform active:scale-95 transition-all shrink-0"
                    >
                      <RotateCcw className="w-4 h-4" /> Volver al Ruedo
                    </button>
                  </div>
                )}

                {/* Paused Overlay */}
                {gameState?.status === 'PAUSED' && (
                  <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center space-y-3 z-30 select-none">
                    <h3 className="text-xl sm:text-2xl font-black text-amber-400 tracking-widest">EN EL BURLADERO (PAUSA)</h3>
                    <button
                      onClick={() => engineRef.current?.pauseToggle()}
                      className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-5 py-2 rounded-lg text-xs uppercase transition-all"
                    >
                      Reanudar
                    </button>
                  </div>
                )}

                {/* Victory / Level Clear Overlay (Fast 1.8s Arcade Transition) */}
                {gameState?.status === 'VICTORY' && (
                  <div
                    onClick={() => engineRef.current?.advanceToNextLevel()}
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-[3px] flex flex-col items-center justify-center p-4 text-center space-y-2.5 z-30 select-none cursor-pointer animate-fade-in"
                  >
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-amber-500/20 border-2 border-amber-400/60 flex items-center justify-center text-2xl sm:text-3xl animate-bounce shadow-[0_0_20px_rgba(251,191,36,0.4)]">
                      🎺
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] sm:text-xs font-black tracking-widest text-amber-400 uppercase bg-amber-500/20 px-3 py-0.5 rounded-full border border-amber-500/30">
                        ¡PLAZA SUPERADA!
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-black text-yellow-300 tracking-wider drop-shadow-[0_2px_12px_rgba(253,224,71,0.6)]">
                        ¡PUERTA GRANDE!
                      </h2>
                    </div>

                    <div className="bg-slate-900/95 border border-amber-500/50 rounded-xl px-4 py-2.5 max-w-xs w-full shadow-xl space-y-1">
                      <p className="text-xs sm:text-sm font-black text-sky-400 uppercase tracking-widest">
                        PASANDO A NIVEL {gameState.level + 1}
                      </p>
                      {BONUS_ITEMS[Math.min(gameState.level, BONUS_ITEMS.length - 1)] && (
                        <div className="flex items-center justify-center gap-2 text-xs text-amber-200">
                          <span className="text-base select-none">
                            {BONUS_ITEMS[Math.min(gameState.level, BONUS_ITEMS.length - 1)].icon}
                          </span>
                          <span className="font-semibold">
                            {BONUS_ITEMS[Math.min(gameState.level, BONUS_ITEMS.length - 1)].name} (+{BONUS_ITEMS[Math.min(gameState.level, BONUS_ITEMS.length - 1)].points} pts)
                          </span>
                        </div>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-400 animate-pulse">
                      Comenzando en breves instantes...
                    </p>
                  </div>
                )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sleek Mobile & Desktop Control Bar (Zero Scroll) */}
        <div
          className={`w-full ${
            isFullscreen
              ? 'max-w-[min(99vw,calc((100dvh-70px)*0.84),900px)]'
              : 'max-w-[min(99vw,calc((100dvh-110px)*0.84),840px)]'
          } mt-1 sm:mt-1.5 flex items-center justify-between px-2.5 sm:px-3 py-1 bg-gradient-to-r from-slate-900/90 via-slate-900/95 to-slate-900/90 border border-red-900/50 rounded-lg sm:rounded-xl shadow text-[11px] sm:text-xs shrink-0`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="text-base select-none shrink-0">👆</span>
            <span className="text-slate-300 font-medium truncate">
              Desliza en cualquier lugar para torear
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => engineRef.current?.pauseToggle()}
              className="px-2.5 sm:px-3 py-1 bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-amber-400 font-bold rounded-lg border border-slate-700 text-xs uppercase active:scale-95 transition-all shadow shrink-0"
            >
              {gameState?.status === 'PAUSED' ? 'Reanudar' : 'Pausa'}
            </button>
          </div>
        </div>

        {/* Generous Mobile Touchpad Zone (Maximizes full vertical space from arena to screen bottom) */}
        <div
          className={`w-full flex-1 min-h-[60px] flex flex-col items-stretch justify-stretch mt-1 mb-1 select-none pointer-events-none ${
            isFullscreen
              ? 'max-w-[min(99vw,calc((100dvh-70px)*0.84),900px)]'
              : 'max-w-[min(99vw,calc((100dvh-110px)*0.84),840px)]'
          }`}
        >
          <div className="w-full h-full flex-1 border-2 border-dashed border-amber-500/30 bg-gradient-to-b from-amber-950/25 via-slate-900/40 to-black/70 rounded-xl sm:rounded-2xl flex items-center justify-center p-2 text-center shadow-inner">
            <span className="text-xs sm:text-sm font-black tracking-widest text-amber-400/90 uppercase">
              ZONA TÁCTIL
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
