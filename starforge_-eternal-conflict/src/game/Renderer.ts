/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Entity, EntityType, EnemyType, GameState, ShipPattern, DronePattern } from './types';
import { GAME_CONFIG } from './constants';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bloomCanvas: HTMLCanvasElement | null = null;
  private bloomCtx: CanvasRenderingContext2D | null = null;
  private stars: Array<{ x: number; y: number; s: number; o: number; speed: number }> = [];
  
  // Bloom Shader Configuration
  private bloomEnabled: boolean = true;
  private bloomIntensity: number = 0.85;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.initStars();
    this.initBloomBuffer();
  }

  private initBloomBuffer() {
    if (typeof document !== 'undefined') {
      this.bloomCanvas = document.createElement('canvas');
      this.bloomCtx = this.bloomCanvas.getContext('2d', { alpha: true });
    }
  }

  public setBloomEnabled(enabled: boolean) {
    this.bloomEnabled = enabled;
  }

  public isBloomEnabled(): boolean {
    return this.bloomEnabled;
  }

  public setBloomIntensity(intensity: number) {
    this.bloomIntensity = Math.max(0, Math.min(2, intensity));
  }

  public getBloomIntensity(): number {
    return this.bloomIntensity;
  }

  private initStars() {
    this.stars = [];
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        s: Math.random() * 2.2 + 0.8,
        o: Math.random() * 0.6 + 0.3,
        speed: Math.random() * 0.5 + 0.5,
      });
    }
  }

  public render(state: GameState) {
    const { ctx } = this;
    const { width, height } = state.dimensions;
    const now = performance.now();

    // Ensure offscreen bloom buffer matches dimensions
    if (this.bloomCanvas && (this.bloomCanvas.width !== width || this.bloomCanvas.height !== height)) {
      this.bloomCanvas.width = width;
      this.bloomCanvas.height = height;
    }

    // 1. Clear main scene with deep cosmic background
    ctx.fillStyle = GAME_CONFIG.COLORS.BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    // Clear bloom offscreen buffer
    if (this.bloomCtx && this.bloomCanvas) {
      this.bloomCtx.clearRect(0, 0, width, height);
    }

    ctx.save();
    
    // Apply camera shake transform
    if (state.cameraShake > 0) {
      const sx = (Math.random() * 2 - 1) * state.cameraShake;
      const sy = (Math.random() * 2 - 1) * state.cameraShake;
      ctx.translate(sx, sy);
      if (this.bloomCtx) {
        this.bloomCtx.save();
        this.bloomCtx.translate(sx, sy);
      }
    }

    // 2. Parallax Starfield
    this.renderStars(width, height, state.warpFactor);

    // 3. Deep Space Nebulae
    this.renderNebulae(state);

    // 4. Render Non-Emissive Base Entities (Asteroids, solid structural enemy hulls)
    state.entities.forEach(entity => {
      if (entity.type === EntityType.ASTEROID) {
        this.drawAsteroid(entity);
      } else if (entity.type === EntityType.ENEMY) {
        this.drawEnemyHull(entity);
      }
    });

    // 5. Render Player Base Hull
    if (!state.isGameOver) {
      this.drawPlayerHull(state.player);
    }

    // 6. RENDER EMISSIVE GLOW LAYERS (Lasers, Thrusters, Explosions, Shields, Cores)
    // We draw onto the main canvas, and also replicate emissive lights onto bloomCtx
    this.renderEmissiveLayer(state, now);

    if (state.cameraShake > 0 && this.bloomCtx) {
      this.bloomCtx.restore();
    }
    ctx.restore();

    // 7. APPLY MULTI-PASS BLOOM SHADER POST-PROCESSING
    if (this.bloomEnabled && this.bloomCanvas && this.bloomCtx) {
      this.applyBloomShader(width, height);
    }

    // 8. Draw HUD & Cinematic Overlays (Boss bar, scanlines, vignette)
    state.entities.forEach(entity => {
      if (entity.isBoss) {
        this.drawBossHUD(entity, state.dimensions.width);
      }
    });

    this.renderHUD(state);
  }

  /**
   * Multi-Stage Gaussian Bloom Shader
   * Extracts glowing energy cores, lasers, thruster plumes, and sparks into soft, radiant neon halos.
   */
  private applyBloomShader(width: number, height: number) {
    if (!this.bloomCanvas) return;
    const { ctx } = this;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Pass 1: Tight, high-intensity core radiance (crisp laser edges and spark cores)
    try {
      ctx.filter = 'blur(4px)';
      ctx.globalAlpha = 0.65 * this.bloomIntensity;
      ctx.drawImage(this.bloomCanvas, 0, 0);

      // Pass 2: Medium atmospheric bloom (thruster fire & explosion fireball glow)
      ctx.filter = 'blur(12px)';
      ctx.globalAlpha = 0.45 * this.bloomIntensity;
      ctx.drawImage(this.bloomCanvas, 0, 0);

      // Pass 3: Wide ambient aura (fills dark space with cinematic energy bloom)
      ctx.filter = 'blur(26px)';
      ctx.globalAlpha = 0.30 * this.bloomIntensity;
      ctx.drawImage(this.bloomCanvas, 0, 0);

      // Reset filter
      ctx.filter = 'none';
    } catch (e) {
      // Fallback if browser canvas filter is restricted
      ctx.globalAlpha = 0.4 * this.bloomIntensity;
      ctx.drawImage(this.bloomCanvas, 0, 0);
    }

    ctx.restore();
  }

  /**
   * Centralized emissive renderer for all high-luminance glowing components
   */
  private renderEmissiveLayer(state: GameState, now: number) {
    const contexts = [this.ctx];
    if (this.bloomCtx) {
      contexts.push(this.bloomCtx);
    }

    // Draw on all active contexts (Main Context + Bloom Extraction Context)
    contexts.forEach(targetCtx => {
      targetCtx.save();

      // Render Player Thrusters, Shield, and Energy Cores
      if (!state.isGameOver) {
        this.drawPlayerEmissives(targetCtx, state.player, now);
      }

      // Render Projectiles, Thrusters, Particles, Drone Cores, Text
      state.entities.forEach(entity => {
        switch (entity.type) {
          case EntityType.PROJECTILE:
            this.drawProjectile(targetCtx, entity, now);
            break;
          case EntityType.PARTICLE:
            this.drawParticle(targetCtx, entity);
            break;
          case EntityType.DRONE:
            this.drawDrone(targetCtx, entity, now);
            break;
          case EntityType.ENEMY:
            this.drawEnemyEmissives(targetCtx, entity, now);
            break;
          case EntityType.TEXT:
            this.drawCombatText(targetCtx, entity);
            break;
        }
      });

      targetCtx.restore();
    });
  }

  // ==================== PROJECTILES & LASERS ====================

  private drawProjectile(targetCtx: CanvasRenderingContext2D, entity: Entity, now: number) {
    targetCtx.save();
    targetCtx.translate(entity.pos.x, entity.pos.y);
    targetCtx.rotate(entity.rotation);

    if (entity.isEnemyProjectile) {
      // Enemy Crimson / Amber Plasma Diamond Bolt
      const col = entity.color || '#f43f5e';
      
      // Outer radiant plasma aura
      targetCtx.shadowBlur = 16;
      targetCtx.shadowColor = col;
      targetCtx.fillStyle = col;
      targetCtx.beginPath();
      targetCtx.moveTo(12, 0);
      targetCtx.lineTo(0, 5);
      targetCtx.lineTo(-10, 0);
      targetCtx.lineTo(0, -5);
      targetCtx.closePath();
      targetCtx.fill();

      // White-hot plasma core
      targetCtx.fillStyle = '#ffffff';
      targetCtx.beginPath();
      targetCtx.moveTo(8, 0);
      targetCtx.lineTo(0, 2.5);
      targetCtx.lineTo(-6, 0);
      targetCtx.lineTo(0, -2.5);
      targetCtx.closePath();
      targetCtx.fill();
    } else {
      // High-Energy Blaster Bolt (Player & Drones)
      const col = entity.color || '#22d3ee';
      const isDrone = entity.radius <= 3;
      const length = isDrone ? 14 : 22;
      const width = isDrone ? 3 : 4.5;

      targetCtx.shadowBlur = isDrone ? 12 : 20;
      targetCtx.shadowColor = col;

      // 1. Outer Neon Envelope
      targetCtx.fillStyle = col;
      targetCtx.beginPath();
      targetCtx.roundRect(-length / 2, -width / 2, length, width, width / 2);
      targetCtx.fill();

      // 2. Pure White Core Laser Beam
      targetCtx.fillStyle = '#ffffff';
      targetCtx.beginPath();
      targetCtx.roundRect(-length / 2 + 2, -width / 4, length - 4, width / 2, width / 4);
      targetCtx.fill();

      // 3. Tip Glare Flash
      targetCtx.fillStyle = '#ffffff';
      targetCtx.beginPath();
      targetCtx.arc(length / 2 - 1, 0, width / 2 + 1, 0, Math.PI * 2);
      targetCtx.fill();
    }

    targetCtx.restore();
  }

  // ==================== THRUSTERS & PLAYER EMISSIVES ====================

  private drawPlayerEmissives(targetCtx: CanvasRenderingContext2D, player: Entity, now: number) {
    targetCtx.save();
    targetCtx.translate(player.pos.x, player.pos.y);
    targetCtx.rotate(player.rotation);

    const speed = Math.sqrt(player.vel.x * player.vel.x + player.vel.y * player.vel.y);
    const speedBoost = Math.min(speed * 3.5, 30);
    const flicker = Math.sin(now * 0.05) * 4 + (Math.random() * 4);
    const plumeLength = 16 + speedBoost + flicker;

    // --- MAIN ENGINE PLASMA PLUME ---
    targetCtx.shadowBlur = 22;
    targetCtx.shadowColor = player.color || '#22d3ee';

    // 1. Broad Outer Ion Glow
    const gradOuter = targetCtx.createLinearGradient(0, 0, -plumeLength * 1.3, 0);
    gradOuter.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
    gradOuter.addColorStop(0.4, 'rgba(99, 102, 241, 0.6)');
    gradOuter.addColorStop(1, 'rgba(168, 85, 247, 0)');

    targetCtx.fillStyle = gradOuter;
    targetCtx.beginPath();
    targetCtx.moveTo(-8, -7);
    targetCtx.lineTo(-plumeLength * 1.3, 0);
    targetCtx.lineTo(-8, 7);
    targetCtx.closePath();
    targetCtx.fill();

    // 2. Intense Core Plasma Flame
    const gradCore = targetCtx.createLinearGradient(0, 0, -plumeLength * 0.8, 0);
    gradCore.addColorStop(0, '#ffffff');
    gradCore.addColorStop(0.3, '#38bdf8');
    gradCore.addColorStop(1, 'transparent');

    targetCtx.fillStyle = gradCore;
    targetCtx.beginPath();
    targetCtx.moveTo(-8, -4);
    targetCtx.lineTo(-plumeLength * 0.8, 0);
    targetCtx.lineTo(-8, 4);
    targetCtx.closePath();
    targetCtx.fill();

    // 3. Ultra White-Hot Exhaust Throat
    targetCtx.fillStyle = '#ffffff';
    targetCtx.beginPath();
    targetCtx.ellipse(-8, 0, 3 + Math.random() * 2, 4, 0, 0, Math.PI * 2);
    targetCtx.fill();

    // --- SECONDARY RCS MANEUVERING THRUSTERS (when turning or moving fast) ---
    if (speed > 1.2) {
      targetCtx.fillStyle = '#38bdf8';
      targetCtx.beginPath();
      targetCtx.arc(-14, -12, 2 + Math.random() * 1.5, 0, Math.PI * 2);
      targetCtx.arc(-14, 12, 2 + Math.random() * 1.5, 0, Math.PI * 2);
      targetCtx.fill();
    }

    // --- COCKPIT GLOW ---
    targetCtx.fillStyle = '#38bdf8';
    targetCtx.shadowBlur = 12;
    targetCtx.shadowColor = '#38bdf8';
    targetCtx.beginPath();
    targetCtx.ellipse(8, 0, 6, 3, 0, 0, Math.PI * 2);
    targetCtx.fill();

    // --- REGENERATING SHIELD PULSE ---
    if (player.isRegenerating) {
      const shieldPulse = (Math.sin(now * 0.008) + 1) * 0.5;
      targetCtx.shadowBlur = 24;
      targetCtx.shadowColor = '#22d3ee';
      targetCtx.strokeStyle = `rgba(34, 211, 238, ${0.4 + shieldPulse * 0.4})`;
      targetCtx.lineWidth = 2.5;
      
      // Outer bubble
      targetCtx.beginPath();
      targetCtx.arc(0, 0, player.radius + 18, 0, Math.PI * 2);
      targetCtx.stroke();

      // Shimmering inner interference grid
      targetCtx.lineWidth = 1.2;
      targetCtx.strokeStyle = `rgba(255, 255, 255, ${0.3 + shieldPulse * 0.3})`;
      targetCtx.beginPath();
      targetCtx.arc(0, 0, player.radius + 12, 0, Math.PI * 2);
      targetCtx.stroke();
    }

    targetCtx.restore();
  }

  // ==================== PARTICLES & EXPLOSIONS ====================

  private drawParticle(targetCtx: CanvasRenderingContext2D, entity: Entity) {
    targetCtx.save();
    targetCtx.translate(entity.pos.x, entity.pos.y);

    const alpha = entity.opacity ?? 1;
    targetCtx.globalAlpha = Math.max(0, Math.min(1, alpha));
    
    // Check if particle is a high-speed spark (motion blur streak)
    const speedSq = entity.vel.x * entity.vel.x + entity.vel.y * entity.vel.y;

    if (speedSq > 4) {
      // High-Velocity Incandescent Spark Streak
      const col = entity.color || '#fbbf24';
      targetCtx.shadowBlur = 14;
      targetCtx.shadowColor = col;

      targetCtx.strokeStyle = col;
      targetCtx.lineWidth = entity.radius;
      targetCtx.lineCap = 'round';
      
      targetCtx.beginPath();
      targetCtx.moveTo(-entity.vel.x * 1.5, -entity.vel.y * 1.5);
      targetCtx.lineTo(entity.vel.x * 0.5, entity.vel.y * 0.5);
      targetCtx.stroke();

      // Bright white tip
      targetCtx.fillStyle = '#ffffff';
      targetCtx.beginPath();
      targetCtx.arc(entity.vel.x * 0.5, entity.vel.y * 0.5, entity.radius * 0.6, 0, Math.PI * 2);
      targetCtx.fill();
    } else {
      // Expanding glowing fireball ember / debris
      targetCtx.shadowBlur = 16;
      targetCtx.shadowColor = entity.color;

      const grad = targetCtx.createRadialGradient(0, 0, 0, 0, 0, entity.radius);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, entity.color);
      grad.addColorStop(1, 'transparent');

      targetCtx.fillStyle = grad;
      targetCtx.beginPath();
      targetCtx.arc(0, 0, entity.radius, 0, Math.PI * 2);
      targetCtx.fill();
    }

    targetCtx.restore();
  }

  // ==================== DRONES & ENEMY EMISSIVES ====================

  private drawDrone(targetCtx: CanvasRenderingContext2D, drone: Entity, now: number) {
    const customization = drone.droneCustomization || { color: drone.color, pattern: DronePattern.SCOUT };
    const color = customization.color;
    const pattern = customization.pattern;

    targetCtx.save();
    targetCtx.translate(drone.pos.x, drone.pos.y);
    targetCtx.rotate(drone.rotation);

    // Glowing Drone Thruster
    const thrustLen = 8 + Math.random() * 8;
    targetCtx.shadowBlur = 14;
    targetCtx.shadowColor = color;

    targetCtx.fillStyle = color;
    targetCtx.beginPath();
    targetCtx.moveTo(-6, -3);
    targetCtx.lineTo(-6 - thrustLen, 0);
    targetCtx.lineTo(-6, 3);
    targetCtx.closePath();
    targetCtx.fill();

    // Glowing Body & Eye
    targetCtx.fillStyle = color;
    targetCtx.beginPath();
    if (pattern === DronePattern.SHIELD) {
      const sides = 8;
      for (let i = 0; i < sides; i++) {
        const angle = (i * Math.PI * 2) / sides;
        const r = drone.radius * 1.2;
        targetCtx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      targetCtx.closePath();
    } else if (pattern === DronePattern.ASSAULT) {
      targetCtx.rect(-6, -8, 10, 16);
      targetCtx.fillRect(4, -6, 6, 3);
      targetCtx.fillRect(4, 3, 6, 3);
    } else {
      // Scout
      targetCtx.moveTo(12, 0);
      targetCtx.lineTo(-6, -8);
      targetCtx.lineTo(-2, 0);
      targetCtx.lineTo(-6, 8);
      targetCtx.closePath();
    }
    targetCtx.fill();

    // Glowing Core Lens
    targetCtx.fillStyle = '#ffffff';
    targetCtx.shadowBlur = 16;
    targetCtx.shadowColor = '#ffffff';
    targetCtx.beginPath();
    targetCtx.arc(pattern === DronePattern.SHIELD ? 0 : 2, 0, 2 + Math.sin(now * 0.01) * 1, 0, Math.PI * 2);
    targetCtx.fill();

    targetCtx.restore();
  }

  private drawEnemyEmissives(targetCtx: CanvasRenderingContext2D, entity: Entity, now: number) {
    targetCtx.save();
    targetCtx.translate(entity.pos.x, entity.pos.y);
    targetCtx.rotate(entity.rotation);

    if (entity.isBoss) {
      // Boss Radiant Plasma Core & Turret Muzzles
      targetCtx.shadowBlur = 30;
      targetCtx.shadowColor = entity.color;

      // Central Pulsing Core
      const corePulse = 18 + Math.sin(now * 0.006) * 6;
      const grad = targetCtx.createRadialGradient(0, 0, 0, 0, 0, corePulse);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, entity.color);
      grad.addColorStop(1, 'transparent');

      targetCtx.fillStyle = grad;
      targetCtx.beginPath();
      targetCtx.arc(0, 0, corePulse, 0, Math.PI * 2);
      targetCtx.fill();

      // Glowing Turret Muzzles
      for (let i = 0; i < 4; i++) {
        const angle = now * 0.001 + (i * Math.PI / 2);
        targetCtx.save();
        targetCtx.rotate(angle);
        targetCtx.fillStyle = '#ffffff';
        targetCtx.shadowBlur = 15;
        targetCtx.shadowColor = '#ffffff';
        targetCtx.fillRect(entity.radius * 0.7 + 20, -3, 14, 6);
        targetCtx.restore();
      }
    } else {
      const enemyType = entity.enemyType || EnemyType.SEEKER;
      
      // Thruster trail & Glowing weak points
      targetCtx.shadowBlur = 14;
      targetCtx.shadowColor = entity.color;

      if (enemyType === EnemyType.SHOOTER || enemyType === EnemyType.TURRET) {
        // Glowing Weapon Barrel & Core
        targetCtx.fillStyle = '#ffffff';
        targetCtx.beginPath();
        targetCtx.arc(0, 0, 4.5, 0, Math.PI * 2);
        targetCtx.fill();

        if (entity.aiState === 'READY') {
          targetCtx.fillStyle = '#22d3ee';
          targetCtx.shadowBlur = 20;
          targetCtx.shadowColor = '#22d3ee';
          targetCtx.beginPath();
          targetCtx.arc(0, 0, 6, 0, Math.PI * 2);
          targetCtx.fill();
        }
      } else if (enemyType === EnemyType.CHARGER) {
        if (entity.aiState === 'LUNGING') {
          targetCtx.fillStyle = '#ffffff';
          targetCtx.shadowBlur = 22;
          targetCtx.shadowColor = '#fb923c';
          targetCtx.beginPath();
          targetCtx.arc(0, 0, 9, 0, Math.PI * 2);
          targetCtx.fill();
        }
      } else if (enemyType === EnemyType.KAMIKAZE) {
        // Unstable flickering core
        targetCtx.fillStyle = '#ffffff';
        targetCtx.shadowBlur = 18;
        targetCtx.shadowColor = '#fde047';
        targetCtx.beginPath();
        targetCtx.arc(-8, 0, 3 + Math.random() * 4, 0, Math.PI * 2);
        targetCtx.fill();
      }
    }

    targetCtx.restore();
  }

  private drawCombatText(targetCtx: CanvasRenderingContext2D, entity: Entity) {
    targetCtx.save();
    targetCtx.translate(entity.pos.x, entity.pos.y);
    targetCtx.globalAlpha = entity.opacity || 1;

    targetCtx.shadowBlur = 14;
    targetCtx.shadowColor = entity.color;
    targetCtx.fillStyle = entity.color;
    targetCtx.font = `bold ${entity.fontSize || 14}px 'JetBrains Mono', monospace`;
    targetCtx.textAlign = 'center';
    targetCtx.fillText(entity.text || '', 0, 0);

    targetCtx.restore();
  }

  // ==================== BASE STRUCTURAL HULLS ====================

  private drawPlayerHull(player: Entity) {
    const { ctx } = this;
    const pattern = player.customization?.pattern || ShipPattern.SLICK;
    const color = player.color || GAME_CONFIG.COLORS.PLAYER;

    ctx.save();
    ctx.translate(player.pos.x, player.pos.y);
    ctx.rotate(player.rotation);

    // Hull Gradient
    const hullGrad = ctx.createLinearGradient(0, -20, 0, 20);
    try {
      hullGrad.addColorStop(0, color);
      hullGrad.addColorStop(0.5, '#ffffff99');
      hullGrad.addColorStop(0.5, color);
      hullGrad.addColorStop(1, '#00000088');
    } catch {
      hullGrad.addColorStop(0, color);
      hullGrad.addColorStop(1, '#000000');
    }

    ctx.fillStyle = hullGrad;
    ctx.beginPath();

    if (pattern === ShipPattern.WINGED) {
      ctx.moveTo(28, 0);
      ctx.lineTo(-5, -12);
      ctx.lineTo(-20, -25);
      ctx.lineTo(-12, -8);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-12, 8);
      ctx.lineTo(-20, 25);
      ctx.lineTo(-5, 12);
    } else if (pattern === ShipPattern.HEAVY) {
      ctx.moveTo(22, -8);
      ctx.lineTo(22, 8);
      ctx.lineTo(5, 18);
      ctx.lineTo(-18, 18);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-18, -18);
      ctx.lineTo(5, -18);
    } else {
      // SLICK
      ctx.moveTo(25, 0);
      ctx.lineTo(-15, -18);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-15, 18);
    }
    ctx.closePath();
    ctx.fill();

    // Plating Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Dark Cockpit Base
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(8, 0, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Engine Nozzle
    ctx.fillStyle = '#334155';
    ctx.fillRect(-10, -5, 4, 10);

    ctx.restore();
  }

  private drawEnemyHull(entity: Entity) {
    const { ctx } = this;
    const now = performance.now();

    ctx.save();
    ctx.translate(entity.pos.x, entity.pos.y);
    ctx.rotate(entity.rotation);

    if (entity.isBoss) {
      // Large Hexagonal Fortress Boss
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#090d16';

      const sides = 6;
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const angle = (i * Math.PI * 2) / sides;
        const r = entity.radius * (0.9 + Math.sin(now * 0.002 + i) * 0.1);
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Rotating Armor Panels
      for (let i = 0; i < 4; i++) {
        const angle = now * 0.001 + (i * Math.PI / 2);
        ctx.save();
        ctx.rotate(angle);
        ctx.fillStyle = entity.color;
        ctx.fillRect(entity.radius * 0.7, -10, 30, 20);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(entity.radius * 0.7, -10, 30, 20);
        ctx.restore();
      }
    } else {
      const enemyType = entity.enemyType || EnemyType.SEEKER;
      ctx.fillStyle = entity.color;
      ctx.beginPath();

      if (enemyType === EnemyType.SHOOTER) {
        ctx.moveTo(18, 0);
        ctx.lineTo(8, -12);
        ctx.lineTo(-8, -12);
        ctx.lineTo(-18, 0);
        ctx.lineTo(-8, 12);
        ctx.lineTo(8, 12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(10, -2, 12, 4);
      } else if (enemyType === EnemyType.STALKER) {
        ctx.moveTo(20, 0);
        ctx.lineTo(-10, -15);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-10, 15);
        ctx.closePath();
        ctx.fill();
      } else if (enemyType === EnemyType.CHARGER) {
        ctx.moveTo(20, -10);
        ctx.lineTo(20, 10);
        ctx.lineTo(0, 20);
        ctx.lineTo(-20, 15);
        ctx.lineTo(-20, -15);
        ctx.lineTo(0, -20);
        ctx.closePath();
        ctx.fill();
      } else if (enemyType === EnemyType.KAMIKAZE) {
        ctx.moveTo(15, 0);
        ctx.lineTo(-12, -6);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-12, 6);
        ctx.closePath();
        ctx.fill();
      } else if (enemyType === EnemyType.TURRET) {
        const sides = 8;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
          const r = entity.radius * 0.9;
          const angle = (i * Math.PI * 2) / sides;
          ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(20, 0);
        ctx.stroke();
      } else {
        // SEEKER
        ctx.moveTo(15, 0);
        ctx.lineTo(-10, -12);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-10, 12);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawAsteroid(entity: Entity) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(entity.pos.x, entity.pos.y);
    ctx.rotate(entity.rotation);

    ctx.fillStyle = entity.color;
    ctx.beginPath();
    const sides = 8;
    const angleStep = (Math.PI * 2) / sides;
    for (let i = 0; i < sides; i++) {
      const r = entity.radius * (0.8 + Math.sin(i * 3) * 0.2);
      const x = Math.cos(i * angleStep) * r;
      const y = Math.sin(i * angleStep) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Cracks & craters
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-entity.radius * 0.3, -entity.radius * 0.3);
    ctx.lineTo(entity.radius * 0.3, entity.radius * 0.3);
    ctx.stroke();

    ctx.restore();
  }

  // ==================== ENVIRONMENT & HUD ====================

  private renderStars(width: number, height: number, warpFactor: number = 1) {
    const { ctx } = this;
    ctx.fillStyle = '#ffffff';

    this.stars.forEach(star => {
      ctx.globalAlpha = star.o;
      ctx.beginPath();
      const x = (star.x % width);
      const y = (star.y % height);

      if (warpFactor > 1.1) {
        const stretch = (warpFactor - 1) * 25 * star.speed;
        ctx.lineWidth = star.s;
        ctx.strokeStyle = '#ffffff';
        ctx.moveTo(x, y);
        ctx.lineTo(x - stretch, y);
        ctx.stroke();
      } else {
        ctx.arc(x, y, star.s / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    ctx.globalAlpha = 1;
  }

  private renderNebulae(state: GameState) {
    const { ctx } = this;
    state.nebulae.forEach(nebula => {
      const grad = ctx.createRadialGradient(
        nebula.pos.x, nebula.pos.y, 0,
        nebula.pos.x, nebula.pos.y, nebula.radius
      );
      grad.addColorStop(0, nebula.color + Math.floor(nebula.opacity * 255).toString(16).padStart(2, '0'));
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.globalCompositeOperation = 'screen';
      ctx.beginPath();
      ctx.arc(nebula.pos.x, nebula.pos.y, nebula.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawBossHUD(boss: Entity, screenWidth: number) {
    const { ctx } = this;
    const padding = 120;
    const barWidth = screenWidth - padding * 2;
    const barHeight = 8;

    ctx.save();
    // Name
    ctx.fillStyle = boss.color;
    ctx.font = "bold 13px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.shadowBlur = 10;
    ctx.shadowColor = boss.color;
    ctx.fillText("VOID ARBITER UNIT [CORE ENTITY]", screenWidth / 2, 40);

    // Health Bar BG
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(padding, 50, barWidth, barHeight);

    // Health Bar Fill
    const healthPct = Math.max(0, boss.health / boss.maxHealth);
    ctx.fillStyle = boss.color;
    ctx.fillRect(padding, 50, barWidth * healthPct, barHeight);

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, 50, barWidth, barHeight);

    ctx.restore();
  }

  private renderHUD(state: GameState) {
    const { ctx } = this;
    const { width, height } = state.dimensions;

    // 1. Subtle Cinematic Vignette
    const vignette = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.4,
      width / 2, height / 2, Math.max(width, height) * 0.75
    );
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, 'rgba(2, 4, 10, 0.65)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // 2. Futuristic Scanlines
    ctx.fillStyle = 'rgba(34, 211, 238, 0.015)';
    for (let i = 0; i < height; i += 4) {
      ctx.fillRect(0, i, width, 1);
    }
  }
}
