/**
 * SoundManager.ts
 * High-Fidelity Procedural Sound Management System using Web Audio API
 * Generates cinematic SFX for weapon fires, impacts, explosions, engine hum, and UI cues.
 */

export enum SoundType {
  SHOOT_PLAYER = 'SHOOT_PLAYER',
  SHOOT_DRONE = 'SHOOT_DRONE',
  SHOOT_ENEMY = 'SHOOT_ENEMY',
  SHOOT_BOSS = 'SHOOT_BOSS',
  DAMAGE_SHIELD = 'DAMAGE_SHIELD',
  DAMAGE_HULL = 'DAMAGE_HULL',
  EXPLOSION_SMALL = 'EXPLOSION_SMALL',
  EXPLOSION_MEDIUM = 'EXPLOSION_MEDIUM',
  EXPLOSION_LARGE = 'EXPLOSION_LARGE',
  CRITICAL_HIT = 'CRITICAL_HIT',
  WAVE_START = 'WAVE_START',
  WARP_SURGE = 'WARP_SURGE',
  COMBO_UP = 'COMBO_UP',
  UPGRADE_BOUGHT = 'UPGRADE_BOUGHT',
  REGEN_PULSE = 'REGEN_PULSE',
  GAME_OVER = 'GAME_OVER',
  UI_CLICK = 'UI_CLICK',
  // Backward compatibility aliases
  SHOOT = 'SHOOT_PLAYER',
  ENEMY_SHOOT = 'SHOOT_ENEMY',
  EXPLOSION = 'EXPLOSION_MEDIUM',
  HIT = 'DAMAGE_HULL',
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  
  private isMutedState: boolean = false;
  private masterVolume: number = 0.4;
  private sfxVolume: number = 0.8;
  private ambientVolume: number = 0.25;
  
  // Ambient engine / space drone nodes
  private ambientOsc1: OscillatorNode | null = null;
  private ambientOsc2: OscillatorNode | null = null;
  private ambientNoise: AudioBufferSourceNode | null = null;
  private isAmbientRunning: boolean = false;

  constructor() {
    // Lazy initialized on first user interaction to comply with browser autoplay policies
  }

  public init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Master dynamics compressor to prevent clipping during intense combat
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMutedState ? 0 : this.masterVolume, this.ctx.currentTime);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(this.ambientVolume, this.ctx.currentTime);

      // Routing: sfx / ambient -> masterGain -> compressor -> destination
      this.sfxGain.connect(this.masterGain);
      this.ambientGain.connect(this.masterGain);
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      // Start subtle ambient space drone
      this.startAmbientDrone();
    } catch (e) {
      console.warn('Web Audio API initialization failed:', e);
    }
  }

  public setMasterVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.isMutedState) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.02);
    }
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public toggleMute(): boolean {
    this.init();
    this.isMutedState = !this.isMutedState;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMutedState ? 0 : this.masterVolume, this.ctx.currentTime, 0.02);
    }
    return this.isMutedState;
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  /**
   * Play procedural sound with optional stereo panning (-1 to 1)
   */
  public play(type: SoundType | keyof typeof SoundType, pan: number = 0, pitchVariation: number = 0) {
    this.init();
    if (!this.ctx || !this.sfxGain || this.isMutedState) return;

    // Normalize SoundType string/enum
    const soundKey = (typeof type === 'string' && SoundType[type as keyof typeof SoundType]) ? SoundType[type as keyof typeof SoundType] : type;

    // Create localized panning node
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, pan)), this.ctx.currentTime);
      panner.connect(this.sfxGain);
    }
    const outputNode: AudioNode = panner || this.sfxGain;

    switch (soundKey) {
      case SoundType.SHOOT_PLAYER:
        this.synthPlayerLaser(outputNode, pitchVariation);
        break;
      case SoundType.SHOOT_DRONE:
        this.synthDroneLaser(outputNode, pitchVariation);
        break;
      case SoundType.SHOOT_ENEMY:
        this.synthEnemyLaser(outputNode, pitchVariation);
        break;
      case SoundType.SHOOT_BOSS:
        this.synthBossCannon(outputNode);
        break;
      case SoundType.DAMAGE_SHIELD:
        this.synthShieldDamage(outputNode);
        break;
      case SoundType.DAMAGE_HULL:
        this.synthHullDamage(outputNode);
        break;
      case SoundType.EXPLOSION_SMALL:
        this.synthSmallExplosion(outputNode);
        break;
      case SoundType.EXPLOSION_MEDIUM:
        this.synthMediumExplosion(outputNode);
        break;
      case SoundType.EXPLOSION_LARGE:
        this.synthLargeExplosion(outputNode);
        break;
      case SoundType.CRITICAL_HIT:
        this.synthCriticalHit(outputNode);
        break;
      case SoundType.WAVE_START:
        this.synthWaveStart(outputNode);
        break;
      case SoundType.WARP_SURGE:
        this.synthWarpSurge(outputNode);
        break;
      case SoundType.COMBO_UP:
        this.synthComboUp(outputNode, pitchVariation);
        break;
      case SoundType.UPGRADE_BOUGHT:
        this.synthUpgradeSuccess(outputNode);
        break;
      case SoundType.REGEN_PULSE:
        this.synthRegenPulse(outputNode);
        break;
      case SoundType.GAME_OVER:
        this.synthGameOver(outputNode);
        break;
      case SoundType.UI_CLICK:
        this.synthUiClick(outputNode);
        break;
      default:
        this.synthPlayerLaser(outputNode, 0);
        break;
    }
  }

  public playPositional(type: SoundType, x: number, screenWidth: number) {
    if (screenWidth <= 0) {
      this.play(type, 0);
      return;
    }
    const pan = ((x / screenWidth) * 2 - 1) * 0.75;
    this.play(type, pan);
  }

  // --- PROCEDURAL SYNTHESIS ENGINES ---

  /**
   * High-tech Punchy Player Laser (FM synthesis + sub punch + sharp decay)
   */
  private synthPlayerLaser(dest: AudioNode, pitchMod: number = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 0.14;
    const baseFreq = 880 * Math.pow(2, pitchMod / 12);

    // Main carrier oscillator
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + duration);

    // Lowpass filter for smooth laser warmth
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + duration);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Sub thump for punchy mechanical kick
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(220, now);
    sub.frequency.exponentialRampToValueAtTime(40, now + 0.08);

    subGain.gain.setValueAtTime(0.22, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    sub.connect(subGain);
    subGain.connect(dest);

    osc.start(now);
    osc.stop(now + duration);
    sub.start(now);
    sub.stop(now + 0.08);
  }

  /**
   * Lightweight drone pulse laser
   */
  private synthDroneLaser(dest: AudioNode, pitchMod: number = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 0.09;
    const baseFreq = 1250 * Math.pow(2, pitchMod / 12);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + duration);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Heavy Alien / Hostile Plasma Bolt
   */
  private synthEnemyLaser(dest: AudioNode, pitchMod: number = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 0.22;
    const baseFreq = 420 * Math.pow(2, pitchMod / 12);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + duration);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Massive Boss Plasma Cannon
   */
  private synthBossCannon(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 0.55;

    // Low sub blast
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + duration);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + duration);

    // Add noise discharge crackle
    this.createNoiseBurst(dest, 0.3, 300, 0.25);
  }

  /**
   * High-tech Crystalline Shield Absorption / Deflection Shimmer
   */
  private synthShieldDamage(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 0.25;

    // Harmonic ring
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + duration);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(4, now);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Heavy Hull Impact (Metallic crunch + bass shock)
   */
  private synthHullDamage(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 0.28;

    // Low metallic thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + duration);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + duration);

    // Metallic crunch noise
    this.createNoiseBurst(dest, 0.18, 900, 0.3);
  }

  /**
   * Small Explosion (Asteroid break, drone destruction, small missile)
   */
  private synthSmallExplosion(dest: AudioNode) {
    if (!this.ctx) return;
    this.createNoiseBurst(dest, 0.22, 600, 0.35);

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  /**
   * Medium Cinematic Explosion (Enemy ship destruction)
   */
  private synthMediumExplosion(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 0.55;

    // 1. Heavy low-frequency punch
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + duration);

    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    subOsc.connect(subGain);
    subGain.connect(dest);
    subOsc.start(now);
    subOsc.stop(now + duration);

    // 2. Filtered noise rumble + debris crackle
    this.createNoiseBurst(dest, duration, 750, 0.45);
  }

  /**
   * Large Detonation (Boss kill / Player Game Over)
   */
  private synthLargeExplosion(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 1.4;

    // 1. Sub-bass earthquake rumble
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(80, now);
    sub.frequency.exponentialRampToValueAtTime(18, now + duration);

    const subFilter = this.ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(220, now);
    subFilter.frequency.exponentialRampToValueAtTime(40, now + duration);

    subGain.gain.setValueAtTime(0.65, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    sub.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(dest);

    sub.start(now);
    sub.stop(now + duration);

    // 2. Cascading noise bursts
    this.createNoiseBurst(dest, 1.0, 950, 0.55);
    setTimeout(() => {
      if (this.ctx) this.createNoiseBurst(dest, 0.8, 500, 0.35);
    }, 150);
    setTimeout(() => {
      if (this.ctx) this.createNoiseBurst(dest, 0.6, 350, 0.25);
    }, 320);
  }

  /**
   * Critical Weak Point Hit Ping
   */
  private synthCriticalHit(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = [1046.5, 1318.5, 1567.98]; // High C chord sparkle
    
    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.02);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.18);

      gain.gain.setValueAtTime(0.18, now + idx * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(now + idx * 0.02);
      osc.stop(now + 0.25);
    });
  }

  /**
   * Wave start fanfare / Alert
   */
  private synthWaveStart(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const chord = [330, 440, 554.37, 659.25]; // Ascending triumphant sci-fi synth
    
    chord.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      gain.gain.setValueAtTime(0, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.08 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.4);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.45);
    });
  }

  /**
   * Warp Speed Hyperspace Surge Whoosh
   */
  private synthWarpSurge(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 1.0;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(4500, now + duration * 0.7);
    filter.frequency.exponentialRampToValueAtTime(200, now + duration);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Dynamic Combo Multiplier Arpeggio
   */
  private synthComboUp(dest: AudioNode, multiplier: number = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const baseFreq = 440 + Math.min(multiplier, 10) * 55;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.12);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Tech Upgrade Confirmation
   */
  private synthUpgradeSuccess(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const tones = [523.25, 659.25, 783.99, 1046.50]; // C Major chord

    tones.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.2, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.25);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.28);
    });
  }

  /**
   * Ethereal Shield Regen Pulse
   */
  private synthRegenPulse(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Game Over Doom Progression
   */
  private synthGameOver(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = [349.23, 293.66, 220.00, 146.83]; // Dramatic descending minor doom

    freqs.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.22);

      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now + i * 0.22);
      filter.frequency.exponentialRampToValueAtTime(100, now + i * 0.22 + 0.6);

      gain.gain.setValueAtTime(0.28, now + i * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.22 + 0.7);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc.start(now + i * 0.22);
      osc.stop(now + i * 0.22 + 0.75);
    });

    // Deep sub bass finale
    this.createNoiseBurst(dest, 1.2, 280, 0.4);
  }

  /**
   * Futuristic Tactile UI Click
   */
  private synthUiClick(dest: AudioNode) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  /**
   * Helper: Generate a filtered white noise burst for explosions/impacts
   */
  private createNoiseBurst(dest: AudioNode, duration: number, cutoff: number, volume: number) {
    if (!this.ctx) return;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    noise.start();
    noise.stop(this.ctx.currentTime + duration);
  }

  /**
   * Subtle ambient deep space / engine rumble generator
   */
  private startAmbientDrone() {
    if (this.isAmbientRunning || !this.ctx || !this.ambientGain) return;
    try {
      this.isAmbientRunning = true;
      const now = this.ctx.currentTime;

      // Sub drone 1: 55Hz (A1)
      this.ambientOsc1 = this.ctx.createOscillator();
      this.ambientOsc1.type = 'sine';
      this.ambientOsc1.frequency.setValueAtTime(55, now);

      // Sub drone 2: 55.4Hz (slight detune beating)
      this.ambientOsc2 = this.ctx.createOscillator();
      this.ambientOsc2.type = 'triangle';
      this.ambientOsc2.frequency.setValueAtTime(55.5, now);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(120, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, now);

      this.ambientOsc1.connect(filter);
      this.ambientOsc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.ambientGain);

      this.ambientOsc1.start();
      this.ambientOsc2.start();
    } catch (e) {
      console.warn('Ambient drone could not start:', e);
    }
  }
}
