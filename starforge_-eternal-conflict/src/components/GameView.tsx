/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Engine } from '../game/Engine';
import { Renderer } from '../game/Renderer';
import { Vector, ShipCustomization, ShipPattern, DroneCustomization, DronePattern } from '../game/types';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Target, Shield, Trophy, RefreshCw, Play, Palette, Command, Volume2, VolumeX, Volume1, Radio, Sparkles } from 'lucide-react';
import { GAME_CONFIG } from '../game/constants';
import { SoundType } from '../game/SoundManager';

export default function Game() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const requestRef = useRef<number>(0);
  
  const [isMuted, setIsMuted] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.4);
  const [bloomEnabled, setBloomEnabled] = useState(true);

  const handleToggleMute = () => {
    if (engineRef.current) {
      const muted = engineRef.current.getSoundManager().toggleMute();
      setIsMuted(muted);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setAudioVolume(newVol);
    if (engineRef.current) {
      engineRef.current.getSoundManager().setMasterVolume(newVol);
    }
  };

  const handleToggleBloom = () => {
    setBloomEnabled(prev => {
      const next = !prev;
      rendererRef.current?.setBloomEnabled(next);
      return next;
    });
  };

  const playUiClick = () => {
    engineRef.current?.getSoundManager().init();
    engineRef.current?.getSoundManager().play(SoundType.UI_CLICK);
  };

  const [gameState, setGameState] = useState<{
    score: number;
    health: number;
    isRegenerating: boolean;
    isGameOver: boolean;
    level: number;
    wave: number;
    waveEnemiesRemaining: number;
    isWaveActive: boolean;
    warpFactor: number;
    credits: number;
    droneUpgrades: {
        damage: number;
        speed: number;
        health: number;
        fireRate: number;
    };
    combo: number;
    multiplier: number;
  }>({
    score: 0,
    health: 100,
    isRegenerating: false,
    isGameOver: false,
    level: 1,
    wave: 0,
    waveEnemiesRemaining: 0,
    isWaveActive: false,
    warpFactor: 1,
    credits: 0,
    droneUpgrades: {
        damage: 1,
        speed: 1,
        health: 1,
        fireRate: 1,
    },
    combo: 0,
    multiplier: 1,
  });

  const inputRef = useRef({ 
    mouse: { x: 0, y: 0 }, 
    isMouseDown: false 
  });
  const [gameStarted, setGameStarted] = useState(false);
  
  const [shipCustomization, setShipCustomization] = useState<ShipCustomization>({
    color: GAME_CONFIG.COLORS.PLAYER,
    pattern: ShipPattern.SLICK,
  });

  const [droneCustomization, setDroneCustomization] = useState<DroneCustomization>({
    color: '#22d3ee',
    pattern: DronePattern.SCOUT,
  });

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const { clientWidth, clientHeight } = container;
      canvas.width = clientWidth;
      canvas.height = clientHeight;

      if (!engineRef.current) {
        engineRef.current = new Engine(clientWidth, clientHeight, shipCustomization, droneCustomization);
        rendererRef.current = new Renderer(ctx);
        rendererRef.current.setBloomEnabled(bloomEnabled);
      } else {
        engineRef.current.updateDimensions(clientWidth, clientHeight);
      }
    };

    window.addEventListener('resize', resize);
    resize();

    const animate = (time: number) => {
      if (engineRef.current && rendererRef.current) {
        const deltaTime = 16.67; 
        
        if (gameStarted) {
          engineRef.current.update(deltaTime, inputRef.current);
        } else {
          // Idle update for preview
          engineRef.current.updateCustomization(shipCustomization, droneCustomization);
          engineRef.current.previewUpdate(deltaTime, inputRef.current);
        }

        const state = engineRef.current.getState();
        rendererRef.current.render(state);
        
        if (gameStarted) {
          setGameState({
            score: state.score,
            health: state.player.health,
            isRegenerating: !!state.player.isRegenerating,
            isGameOver: state.isGameOver,
            level: state.level,
            wave: state.wave,
            waveEnemiesRemaining: state.waveEnemiesRemaining,
            isWaveActive: state.isWaveActive,
            warpFactor: state.warpFactor,
            credits: state.credits,
            droneUpgrades: { ...state.droneUpgrades },
            combo: state.combo,
            multiplier: state.multiplier,
          });
        }
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(requestRef.current);
    };
  }, [gameStarted]); // Removed fast-changing dependencies

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    inputRef.current.mouse = { x, y };
  };

  const resetGame = () => {
    engineRef.current?.reset(shipCustomization, droneCustomization);
    setGameState({ 
      score: 0, 
      health: 100, 
      isRegenerating: false, 
      isGameOver: false, 
      level: 1, 
      wave: 0, 
      waveEnemiesRemaining: 0, 
      isWaveActive: false, 
      warpFactor: 1,
      credits: 0,
      droneUpgrades: {
          damage: 1,
          speed: 1,
          health: 1,
          fireRate: 1,
      },
      combo: 0, 
      multiplier: 1 
    });
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-[#02040a] overflow-hidden cursor-crosshair select-none font-sans"
      onMouseMove={handleMouseMove}
      onTouchMove={handleMouseMove}
      onMouseDown={() => inputRef.current.isMouseDown = true}
      onMouseUp={() => inputRef.current.isMouseDown = false}
      onTouchStart={() => inputRef.current.isMouseDown = true}
      onTouchEnd={() => inputRef.current.isMouseDown = false}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Starfield & Nebula Overlays */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-purple-900/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-[100px]"></div>
      </div>

      {gameState.warpFactor > 2 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-white/5 backdrop-blur-[1px]">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center"
              >
                  <span className="text-4xl font-black italic tracking-[1em] text-white/40 mb-2">WARP DRIVE</span>
                  <div className="w-96 h-0.5 bg-gradient-to-r from-transparent via-white/50 to-transparent"></div>
              </motion.div>
          </div>
      )}

      {/* Top HUD Bar */}
      <div className="absolute top-0 left-0 w-full h-16 px-8 flex justify-between items-center bg-black/40 backdrop-blur-md border-b border-cyan-900/50 z-20 pointer-events-none">
        <div className="flex items-center space-x-6">
          <div className="flex flex-col">
            <span className="text-[10px] tracking-widest text-cyan-600 uppercase font-bold">System Status</span>
            <span className="text-sm font-medium text-cyan-100">VALKYRIE-7 // ACTIVE</span>
          </div>
          <div className="h-8 w-px bg-cyan-900/50"></div>
          <div className="flex flex-col">
            <span className="text-[10px] tracking-widest text-cyan-600 uppercase font-bold">Location</span>
            <span className="text-sm font-medium text-cyan-100 italic font-mono flex items-center gap-3">
              SECTOR // {gameState.wave > 0 ? `WAVE ${gameState.wave}` : 'SYNCING...'}
              {gameState.wave > 0 && gameState.wave % 3 === 0 && (
                <motion.span 
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="text-[9px] text-red-400 font-bold tracking-tight bg-red-950/30 px-1 border border-red-900/50"
                >
                  [ HAZARD: ASTEROID FIELD ]
                </motion.span>
              )}
            </span>
          </div>
          <div className="h-8 w-px bg-cyan-900/50"></div>
          <div className="flex flex-col">
            <span className="text-[10px] tracking-widest text-cyan-600 uppercase font-bold">Credits</span>
            <span className="text-sm font-medium text-cyan-100 font-mono italic">CRC // {gameState.credits.toLocaleString()}</span>
          </div>
        </div>
        
        {/* Wave Progress */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
            {gameState.isWaveActive && gameState.waveEnemiesRemaining > 0 && (
                <>
                    <span className="text-[8px] tracking-[0.4em] text-cyan-500 uppercase font-bold mb-1">Incoming Hostiles</span>
                    <div className="flex gap-1">
                        {Array.from({ length: Math.min(10, gameState.waveEnemiesRemaining) }).map((_, i) => (
                            <div key={i} className="w-4 h-1 bg-cyan-400 shadow-[0_0_5px_cyan]"></div>
                        ))}
                        {gameState.waveEnemiesRemaining > 10 && (
                            <span className="text-[8px] text-cyan-400 font-bold">+{gameState.waveEnemiesRemaining - 10}</span>
                        )}
                    </div>
                </>
            )}
            {!gameState.isWaveActive && (
                <span className="text-[10px] tracking-[0.5em] text-cyan-400 uppercase font-black animate-pulse">Scanning Next Sector...</span>
            )}
        </div>

        <div className="flex items-center space-x-6">
          {/* Bloom Shader FX Control */}
          <button
            id="bloom-shader-toggle"
            onClick={() => {
              handleToggleBloom();
              playUiClick();
            }}
            className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded border transition-all text-xs font-mono font-bold ${
              bloomEnabled 
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.35)]' 
                : 'bg-black/40 border-cyan-950/60 text-cyan-800 opacity-60 hover:opacity-90'
            }`}
            title={bloomEnabled ? "Cinematic Bloom Shader: ENABLED" : "Cinematic Bloom Shader: DISABLED"}
          >
            <Sparkles size={14} className={bloomEnabled ? "text-cyan-300 animate-pulse" : "text-cyan-800"} />
            <span className="text-[10px] tracking-wider uppercase">BLOOM</span>
          </button>

          {/* Audio Controls */}
          <div className="pointer-events-auto flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded border border-cyan-900/40">
            <button
              id="audio-mute-toggle"
              onClick={() => {
                handleToggleMute();
                playUiClick();
              }}
              className="text-cyan-400 hover:text-cyan-200 transition-colors p-1"
              title={isMuted ? "Unmute Audio" : "Mute Audio"}
            >
              {isMuted ? <VolumeX size={15} /> : audioVolume > 0.5 ? <Volume2 size={15} /> : <Volume1 size={15} />}
            </button>
            <input
              id="audio-volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : audioVolume}
              onChange={(e) => {
                if (isMuted) handleToggleMute();
                handleVolumeChange(parseFloat(e.target.value));
              }}
              className="w-16 h-1 bg-cyan-950 accent-cyan-400 rounded cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
            />
          </div>

          {gameState.combo > 0 && (
            <div className="text-right flex flex-col items-end">
              <span className="text-[10px] tracking-widest text-orange-600 uppercase font-bold italic">Combat Combo</span>
              <div className="flex items-center gap-2">
                <div className="h-1 w-12 bg-orange-950 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-orange-500"
                    animate={{ width: `${(gameState.combo % 5) * 20}%` }}
                  />
                </div>
                <div className="text-xl font-black text-orange-400 italic">x{gameState.multiplier}</div>
              </div>
            </div>
          )}
          <div className="text-right">
            <span className="text-[10px] tracking-widest text-cyan-600 uppercase font-bold italic">Kill Streak</span>
            <div className="text-xl font-bold tracking-tighter text-white">x{Math.floor(gameState.score / 500)}</div>
          </div>
          <div className="text-right">
            <span className="text-[10px] tracking-widest text-cyan-600 uppercase font-bold">Tactical Score</span>
            <div className="text-2xl font-black text-white tracking-tight drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">{gameState.score.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Left Overlay: Shield & Hull */}
      <div className="absolute left-8 bottom-12 space-y-6 pointer-events-none z-20">
        <div className="space-y-1">
          <div className="flex justify-between items-end text-[10px] font-bold uppercase tracking-widest">
            <span className="text-cyan-400">Deflector Shields</span>
            <div className="flex items-center gap-2">
              {gameState.isRegenerating && (
                <motion.span 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="text-[8px] text-cyan-500 italic"
                >
                  Regenerating...
                </motion.span>
              )}
              <span className="text-cyan-100">{Math.max(0, Math.floor(gameState.health))}%</span>
            </div>
          </div>
          <div className="w-48 h-1.5 bg-cyan-950 border border-cyan-900/50 relative overflow-hidden">
            <motion.div 
              className="h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
              animate={{ width: `${gameState.health}%` }}
            />
            {gameState.isRegenerating && (
              <motion.div 
                className="absolute inset-0 bg-white/20"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            )}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-emerald-500">
            <span>Hull Integrity</span>
            <span>100%</span>
          </div>
          <div className="w-48 h-1.5 bg-emerald-950 border border-emerald-900/50">
            <div className="h-full bg-emerald-500 w-full"></div>
          </div>
        </div>
      </div>

      {/* Right Overlay: Weapons & Energy */}
      <div className="absolute right-8 bottom-12 space-y-6 text-right pointer-events-none z-20">
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-600">Energy Output</div>
          <div className="flex space-x-1 justify-end">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`w-3 h-5 ${i <= 4 ? 'bg-cyan-400' : 'bg-cyan-950'}`}></div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-orange-400">Ordnance System</div>
          <div className="flex flex-col space-y-1">
            <div className="bg-orange-500/20 border border-orange-500/40 px-3 py-1 text-[10px] text-orange-200 uppercase font-bold tracking-wider">
              PHOTON CANNON [READY]
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 px-3 py-1 text-[10px] text-slate-400 uppercase tracking-wider">
              HEAVY TORPEDO [LOCKED]
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Center: Tactical Radar Overlay */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-20">
        <div className="relative w-24 h-24 border border-cyan-900/50 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm overflow-hidden">
          <div className="absolute inset-0 border border-cyan-900/20 rounded-full scale-75"></div>
          <div className="absolute h-full w-px bg-cyan-900/20"></div>
          <div className="absolute w-full h-px bg-cyan-900/20"></div>
          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_5px_cyan] z-10"></div>
          <motion.div 
            className="absolute top-0 bottom-1/2 left-1/2 w-0.5 bg-gradient-to-t from-cyan-400 to-transparent origin-bottom"
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        </div>
        <div className="mt-2 text-[8px] font-bold tracking-[0.3em] text-cyan-600 uppercase italic">Tactical Proximity</div>
      </div>

      {/* Bottom Warning Ticker */}
      <div className="absolute bottom-0 left-0 w-full h-6 bg-red-950/20 backdrop-blur-sm flex items-center overflow-hidden border-t border-red-900/30 z-20">
        <motion.div 
          animate={{ x: [0, -1000] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="flex space-x-12 whitespace-nowrap text-[8px] font-bold text-red-500 uppercase tracking-widest"
        >
          <span>[ WARN ] PROXIMITY ALERT: MULTIPLE UNIDENTIFIED SIGNATURES DETECTED</span>
          <span>[ INFO ] SHIELDS REGENERATING @ 4.5 MW/S</span>
          <span>[ WARN ] ENGINE TEMPERATURE REACHING CRITICAL LEVELS</span>
          <span>[ WARN ] PROXIMITY ALERT: MULTIPLE UNIDENTIFIED SIGNATURES DETECTED</span>
        </motion.div>
      </div>

      {/* Start / Game Over Screen */}
      <AnimatePresence>
        {(!gameStarted || gameState.isGameOver) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl"
          >
            <div className="max-w-md w-full p-8 text-center space-y-8">
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="w-24 h-24 mx-auto relative flex items-center justify-center mb-8">
                  <div className="absolute inset-0 border border-cyan-500/20 rounded-full animate-pulse"></div>
                  <div className="absolute inset-4 border border-cyan-500/40 rounded-full"></div>
                  <Zap size={32} className="text-cyan-400 relative z-10" />
                </div>
                <h1 className="text-6xl font-sans font-black text-white tracking-tighter uppercase italic bg-clip-text text-transparent bg-gradient-to-b from-white to-cyan-500">
                  Starforge
                </h1>
                <p className="text-cyan-600 font-mono text-[10px] uppercase tracking-[0.5em] font-bold">
                  Eternal Conflict // Protocol 7
                </p>
              </motion.div>

              {gameState.isGameOver && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-6 bg-red-950/20 border border-red-900/50 backdrop-blur-md space-y-3"
                >
                  <div className="text-red-500 text-[10px] font-bold uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                    <Target size={14} /> Mission Compromised
                  </div>
                  <div className="text-5xl font-sans font-black text-white tracking-tighter">
                    {gameState.score.toLocaleString()}
                  </div>
                  <p className="text-red-900/80 text-[9px] uppercase font-bold tracking-widest italic">Neural link severed in Sector {gameState.level}</p>
                </motion.div>
              )}

              <div className="space-y-4">
                <button
                  onClick={() => {
                    playUiClick();
                    if (gameState.isGameOver) resetGame();
                    else setGameStarted(true);
                  }}
                  className="w-full py-4 bg-transparent border border-cyan-500/50 text-cyan-400 font-sans font-black uppercase tracking-[0.3em] text-xs hover:bg-cyan-500/10 hover:border-cyan-400 transition-all flex items-center justify-center gap-3 active:scale-95 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-cyan-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                  {gameState.isGameOver ? (
                    <><RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-700" /> Re-Initialize Neural Link</>
                  ) : (
                    <><Play size={16} /> Engage Propulsion</>
                  )}
                </button>
                
                {!gameState.isGameOver && (
                  <div className="space-y-6 pt-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-600 uppercase tracking-widest italic">
                        <Palette size={12} /> Hull Pigmentation
                      </div>
                      <div className="flex justify-center gap-3">
                        {['#22d3ee', '#818cf8', '#f472b6', '#fbbf24', '#34d399'].map((col) => (
                          <button
                            key={col}
                            onClick={() => {
                              playUiClick();
                              setShipCustomization({ ...shipCustomization, color: col });
                            }}
                            className={`w-8 h-8 rounded-full border-2 transition-all ${
                              shipCustomization.color === col ? 'border-white scale-125 shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'border-white/10 opacity-60 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: col }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-600 uppercase tracking-widest italic">
                        <Command size={12} /> Aero-Frame Configuration
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {Object.values(ShipPattern).map((pattern) => (
                          <button
                            key={pattern}
                            onClick={() => {
                              playUiClick();
                              setShipCustomization({ ...shipCustomization, pattern });
                            }}
                            className={`px-3 py-2 text-[9px] font-bold uppercase tracking-widest border transition-all ${
                              shipCustomization.pattern === pattern 
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-100' 
                                : 'bg-transparent border-cyan-900/40 text-cyan-900 hover:border-cyan-700'
                            }`}
                          >
                            {pattern}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* DRONE CUSTOMIZATION */}
                    <div className="pt-4 border-t border-white/5 space-y-4">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-600 uppercase tracking-widest italic">
                                <Palette size={12} /> Drone Swarm Palette
                            </div>
                            <div className="flex justify-center gap-3">
                                {['#22d3ee', '#34d399', '#f87171', '#d946ef', '#fb923c'].map((col) => (
                                <button
                                    key={col}
                                    onClick={() => {
                                      playUiClick();
                                      setDroneCustomization({ ...droneCustomization, color: col });
                                    }}
                                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                                        droneCustomization.color === col ? 'border-white scale-125 shadow-[0_0_10px_rgba(255,255,255,0.4)]' : 'border-white/10 opacity-60 hover:opacity-100'
                                    }`}
                                    style={{ backgroundColor: col }}
                                />
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-cyan-600 uppercase tracking-widest italic">
                                <Zap size={12} /> Drone Function Core
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {Object.values(DronePattern).map((pattern) => (
                                <button
                                    key={pattern}
                                    onClick={() => {
                                      playUiClick();
                                      setDroneCustomization({ ...droneCustomization, pattern });
                                    }}
                                    className={`px-2 py-1.5 text-[8px] font-bold uppercase tracking-widest border transition-all ${
                                        droneCustomization.pattern === pattern 
                                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-100' 
                                            : 'bg-transparent border-cyan-900/40 text-cyan-900 hover:border-cyan-700'
                                    }`}
                                >
                                    {pattern}
                                </button>
                                ))}
                            </div>
                        </div>

                        {/* UPGRADES */}
                        <div className="space-y-3 pt-2 border-t border-white/5">
                            <div className="flex items-center justify-between text-[10px] font-bold text-cyan-600 uppercase tracking-widest italic">
                                <div className="flex items-center gap-2"><Trophy size={12} /> Tech Upgrades</div>
                                <span className="text-cyan-400 font-mono">{gameState.credits} CRC</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {(['damage', 'fireRate', 'health'] as const).map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => {
                                          playUiClick();
                                          engineRef.current?.buyDroneUpgrade(type);
                                        }}
                                        disabled={gameState.credits < 100}
                                        className={`group relative flex flex-col items-center justify-center py-2 border transition-all ${
                                            gameState.credits >= 100 
                                                ? 'bg-blue-600/10 border-blue-500/50 hover:bg-blue-600/20 hover:border-blue-400' 
                                                : 'bg-white/5 border-white/10 opacity-50 cursor-not-allowed'
                                        }`}
                                    >
                                        <span className="text-[8px] font-black uppercase tracking-tighter text-white/80 group-hover:text-white">{type}</span>
                                        <span className="text-[7px] text-cyan-400/60 font-mono mt-0.5">Lv.{(gameState.droneUpgrades[type] - 1) / 0.2 + 1 < 10 ? '0' : ''}{Math.round((gameState.droneUpgrades[type] - 1) / 0.2 + 1)}</span>
                                        <div className="absolute top-0 right-1 text-[7px] font-mono text-white/30 group-hover:text-cyan-400">100</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="pt-8 border-t border-white/5">
                <p className="text-[9px] text-slate-600 uppercase tracking-[0.3em] italic">
                   Warning: Unauthorized replication of neural interface prohibited
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorative Overlay */}
      <div className="absolute inset-0 pointer-events-none border-[1px] border-white/5 m-4"></div>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none">
         <div className="px-4 py-1 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full">
            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-[0.5em] font-bold">Terminal Interface Active</span>
         </div>
      </div>
    </div>
  );
}
