/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Entity, EntityType, EnemyType, GameState, Vector, ShipCustomization, ShipPattern, DroneCustomization, DronePattern, DroneUpgrades } from './types';
import { GAME_CONFIG } from './constants';
import { distance, normalize, randomRange, getAngle, rotate } from './utils';
import { SoundManager, SoundType } from './SoundManager';

export class Engine {
  private state: GameState;
  private projectileCooldown = 0;
  private currentCustomization: ShipCustomization;
  private droneCustomization: DroneCustomization;
  private droneUpgrades: DroneUpgrades;
  private credits: number = 0;
  private lastPlayerActionTime = 0;
  private regenerationDelay = 3000;
  private regenerationRate = 0.02;

  private spawnTimer = 0;
  private waveTransitionTimer = 3000;
  private soundManager: SoundManager;
  private regenSoundTimer = 0;

  constructor(width: number, height: number, customization?: ShipCustomization, droneCustomization?: DroneCustomization) {
    this.soundManager = new SoundManager();
    this.currentCustomization = customization || {
      color: GAME_CONFIG.COLORS.PLAYER,
      pattern: ShipPattern.SLICK,
    };
    this.droneCustomization = droneCustomization || {
      color: '#22d3ee',
      pattern: DronePattern.SCOUT,
    };
    this.droneUpgrades = {
      damage: 1,
      speed: 1,
      health: 1,
      fireRate: 1,
    };
    this.state = this.createInitialState(width, height);
    this.initDrones(width, height);
  }

  private createInitialState(width: number, height: number): GameState {
    const player: Entity = {
      id: 'player',
      type: EntityType.PLAYER,
      pos: { x: width / 2, y: height * 0.8 },
      vel: { x: 0, y: 0 },
      radius: GAME_CONFIG.PLAYER_RADIUS,
      rotation: -Math.PI / 2,
      health: 100,
      maxHealth: 100,
      color: this.currentCustomization.color,
      isDead: false,
      customization: this.currentCustomization,
    };

    return {
      player,
      entities: [],
      score: 0,
      level: 1,
      wave: 0,
      waveEnemiesRemaining: 0,
      isWaveActive: false,
      combo: 0,
      multiplier: 1,
      isGameOver: false,
      cameraShake: 0,
      lastFrameTime: performance.now(),
      dimensions: { width, height },
      nebulae: [],
      warpFactor: 1,
      credits: this.credits,
      droneUpgrades: this.droneUpgrades,
    };
  }

  private initDrones(width: number, height: number) {
    const droneCount = 3;
    for (let i = 0; i < droneCount; i++) {
        const drone: Entity = {
            id: `drone-${i}`,
            type: EntityType.DRONE,
            pos: { x: width / 2, y: height * 0.8 },
            vel: { x: 0, y: 0 },
            radius: 8,
            rotation: 0,
            health: 100,
            maxHealth: 100,
            color: this.droneCustomization.color,
            droneCustomization: this.droneCustomization,
            isDead: false,
            aiTimer: 0,
        };
        this.state.entities.push(drone);
    }
  }

  public updateDimensions(width: number, height: number) {
    this.state.dimensions = { width, height };
  }

  public updateCustomization(ship?: ShipCustomization, drone?: DroneCustomization) {
    if (ship) {
      this.currentCustomization = ship;
      this.state.player.color = ship.color;
      this.state.player.customization = ship;
    }
    if (drone) {
      this.droneCustomization = drone;
      // Update existing drones
      this.state.entities.forEach(e => {
        if (e.type === EntityType.DRONE) {
          e.color = drone.color;
          e.droneCustomization = drone;
        }
      });
    }
  }

  public reset(customization?: ShipCustomization, droneCustomization?: DroneCustomization) {
    if (customization) {
      this.currentCustomization = customization;
    }
    if (droneCustomization) {
      this.droneCustomization = droneCustomization;
    }
    this.state = this.createInitialState(this.state.dimensions.width, this.state.dimensions.height);
    this.initDrones(this.state.dimensions.width, this.state.dimensions.height);
  }

  public previewUpdate(deltaTime: number, input: { mouse: Vector; isMouseDown: boolean }) {
    // Only update rotation and position of player and drones in a safe way
    const targetAngle = getAngle(this.state.player.pos, input.mouse);
    this.state.player.rotation = targetAngle;
    
    // Update drone formation without AI
    const drones = this.state.entities.filter(e => e.type === EntityType.DRONE);
    drones.forEach((drone, index) => {
        const orbitAngle = (performance.now() * 0.002) + (index * (Math.PI * 2 / drones.length));
        const orbitRadius = 60;
        const targetPos = {
            x: this.state.player.pos.x + Math.cos(orbitAngle) * orbitRadius,
            y: this.state.player.pos.y + Math.sin(orbitAngle) * orbitRadius
        };
        drone.pos = targetPos;
        drone.rotation = targetAngle;
    });

    // Update warp effect decay
    if (this.state.warpFactor > 1) {
        this.state.warpFactor = Math.max(1, this.state.warpFactor - deltaTime * 0.005);
    }
  }

  public update(deltaTime: number, input: { mouse: Vector; isMouseDown: boolean }) {
    if (this.state.isGameOver) return;

    // Decent camera shake decay
    if (this.state.cameraShake > 0) {
      this.state.cameraShake -= deltaTime * 0.02; // Slower decay (approx 500ms for magnitude 10)
      if (this.state.cameraShake < 0) this.state.cameraShake = 0;
    }

    // Player Movement - Physics based smoothing
    const targetAngle = getAngle(this.state.player.pos, input.mouse);
    this.state.player.rotation = targetAngle;

    const distToMouse = distance(this.state.player.pos, input.mouse);
    if (distToMouse > 5) {
      const dir = normalize({
        x: input.mouse.x - this.state.player.pos.x,
        y: input.mouse.y - this.state.player.pos.y,
      });

      this.state.player.vel.x += dir.x * GAME_CONFIG.PLAYER_SPEED * deltaTime;
      this.state.player.vel.y += dir.y * GAME_CONFIG.PLAYER_SPEED * deltaTime;

      // Emit glowing thruster wake particles when accelerating
      if (Math.random() < 0.45) {
        const exhaustAngle = targetAngle + Math.PI + (Math.random() - 0.5) * 0.5;
        const exhaustSpeed = randomRange(2, 5);
        const exhaustDir = { x: Math.cos(exhaustAngle), y: Math.sin(exhaustAngle) };
        const exhaustParticle: Entity = {
          id: Math.random().toString(36).substr(2, 9),
          type: EntityType.PARTICLE,
          pos: {
            x: this.state.player.pos.x - Math.cos(targetAngle) * 12 + (Math.random() - 0.5) * 4,
            y: this.state.player.pos.y - Math.sin(targetAngle) * 12 + (Math.random() - 0.5) * 4,
          },
          vel: {
            x: exhaustDir.x * exhaustSpeed + this.state.player.vel.x * 0.2,
            y: exhaustDir.y * exhaustSpeed + this.state.player.vel.y * 0.2,
          },
          radius: randomRange(2, 4),
          rotation: Math.random() * Math.PI * 2,
          health: 0,
          maxHealth: 0,
          color: Math.random() < 0.6 ? '#ffffff' : (this.state.player.color || '#22d3ee'),
          isDead: false,
          opacity: 0.9,
          lifeTime: randomRange(120, 260),
          maxLifeTime: 260,
        };
        this.state.entities.push(exhaustParticle);
      }
    }

    this.state.player.vel.x *= GAME_CONFIG.PLAYER_FRICTION;
    this.state.player.vel.y *= GAME_CONFIG.PLAYER_FRICTION;

    this.state.player.pos.x += this.state.player.vel.x;
    this.state.player.pos.y += this.state.player.vel.y;

    // Clamp player to screen
    this.state.player.pos.x = Math.max(this.state.player.radius, Math.min(this.state.dimensions.width - this.state.player.radius, this.state.player.pos.x));
    this.state.player.pos.y = Math.max(this.state.player.radius, Math.min(this.state.dimensions.height - this.state.player.radius, this.state.player.pos.y));

    // Warp and Nebulae update
    if (this.state.warpFactor > 1) {
        this.state.warpFactor = Math.max(1, this.state.warpFactor - deltaTime * 0.005);
    }
    
    // Update and prune nebulae
    this.state.nebulae.forEach(nebula => {
        nebula.pos.x -= deltaTime * 0.1 * this.state.warpFactor;
    });
    this.state.nebulae = this.state.nebulae.filter(n => n.pos.x + n.radius > -100);
    
    // Spawn nebulae
    if (this.state.nebulae.length < 5 && Math.random() < 0.005) {
        const colors = ['#3b82f6', '#8b5cf6', '#d946ef', '#06b6d4'];
        this.state.nebulae.push({
            pos: { x: this.state.dimensions.width + 500, y: Math.random() * this.state.dimensions.height },
            color: colors[Math.floor(Math.random() * colors.length)],
            radius: randomRange(200, 500),
            opacity: randomRange(0.05, 0.15)
        });
    }

    // Drone AI
    const drones = this.state.entities.filter(e => e.type === EntityType.DRONE);
    drones.forEach((drone, index) => {
        // Formation following
        const orbitAngle = (performance.now() * 0.002) + (index * (Math.PI * 2 / drones.length));
        const orbitRadius = 60;
        const targetPos = {
            x: this.state.player.pos.x + Math.cos(orbitAngle) * orbitRadius,
            y: this.state.player.pos.y + Math.sin(orbitAngle) * orbitRadius
        };

        const distToTarget = distance(drone.pos, targetPos);
        const followDir = normalize({
            x: targetPos.x - drone.pos.x,
            y: targetPos.y - drone.pos.y
        });

        drone.vel.x += followDir.x * 0.5;
        drone.vel.y += followDir.y * 0.5;
        drone.vel.x *= 0.9;
        drone.vel.y *= 0.9;

        drone.pos.x += drone.vel.x;
        drone.pos.y += drone.vel.y;

        // Targeting
        const enemies = this.state.entities.filter(e => e.type === EntityType.ENEMY && !e.isDead);
        let nearestEnemy: Entity | null = null;
        let minDist = 400;

        enemies.forEach(enemy => {
            const d = distance(drone.pos, enemy.pos);
            if (d < minDist) {
                minDist = d;
                nearestEnemy = enemy;
            }
        });

        if (nearestEnemy) {
            const attackDir = normalize({
                x: nearestEnemy.pos.x - drone.pos.x,
                y: nearestEnemy.pos.y - drone.pos.y
            });
            drone.rotation = Math.atan2(attackDir.y, attackDir.x);

            if (drone.aiTimer === undefined) drone.aiTimer = 0;
            drone.aiTimer -= deltaTime * this.state.droneUpgrades.fireRate;
            if (drone.aiTimer <= 0) {
                this.createProjectileFromAngle(drone, drone.rotation, false);
                this.soundManager.playPositional(SoundType.SHOOT_DRONE, drone.pos.x, this.state.dimensions.width);
                drone.aiTimer = 1000 + Math.random() * 500; // Fire every 1-1.5s
            }
        } else {
            drone.rotation = this.state.player.rotation;
        }
    });

    // Wave Management
    if (!this.state.isWaveActive) {
      this.waveTransitionTimer -= deltaTime;
      if (this.waveTransitionTimer <= 0) {
        this.startNextWave();
      }
    } else {
      // Spawn enemies if needed
      if (this.state.waveEnemiesRemaining > 0) {
        this.spawnTimer -= deltaTime;
        if (this.spawnTimer <= 0) {
          this.spawnEntity(EntityType.ENEMY);
          this.state.waveEnemiesRemaining--;
          this.spawnTimer = Math.max(500, 2000 - this.state.wave * 100);
        }
      } else {
        // Check if all enemies + bosses are dead
        const activeHostiles = this.state.entities.filter(e => e.type === EntityType.ENEMY).length;
        if (activeHostiles === 0) {
          this.state.isWaveActive = false;
          this.waveTransitionTimer = 3000;
          this.createText(this.state.player.pos, `WAVE ${this.state.wave} CLEARED`, '#22d3ee', 24);
        }
      }
    }

    // Shooting
    if (input.isMouseDown && this.projectileCooldown <= 0) {
      this.createProjectile(this.state.player);
      this.projectileCooldown = GAME_CONFIG.PLAYER_PROJECTILE_COOLDOWN;
      this.lastPlayerActionTime = performance.now();
      // Add subtle random micro-pitch variation to prevent rapid-fire ear fatigue
      const pitchMod = (Math.random() - 0.5) * 1.5;
      this.soundManager.play(SoundType.SHOOT_PLAYER, 0, pitchMod);
    }
    this.projectileCooldown -= deltaTime;

    // Shield Regeneration
    const now = performance.now();
    if (now - this.lastPlayerActionTime > this.regenerationDelay) {
      if (this.state.player.health < this.state.player.maxHealth) {
        this.state.player.health = Math.min(this.state.player.maxHealth, this.state.player.health + this.regenerationRate * deltaTime);
        this.state.player.isRegenerating = true;
        
        // Regen audio pulse
        this.regenSoundTimer -= deltaTime;
        if (this.regenSoundTimer <= 0) {
          this.soundManager.play(SoundType.REGEN_PULSE);
          this.regenSoundTimer = 300; // Pulse every 300ms
        }
      } else {
        this.state.player.isRegenerating = false;
      }
    } else {
      this.state.player.isRegenerating = false;
    }

    // Spawn Asteroids (independent of waves)
    const isAsteroidField = this.state.wave > 0 && this.state.wave % 3 === 0;
    const asteroidChance = isAsteroidField ? GAME_CONFIG.ASTEROID_SPAWN_CHANCE * 5 : GAME_CONFIG.ASTEROID_SPAWN_CHANCE;
    if (Math.random() < asteroidChance) {
      this.spawnEntity(EntityType.ASTEROID);
    }

    // Update Entities
    this.state.entities.forEach(entity => {
      entity.pos.x += entity.vel.x;
      entity.pos.y += entity.vel.y;

      // Enemy AI
      if (entity.type === EntityType.ENEMY) {
        const enemyType = entity.enemyType || EnemyType.SEEKER;
        const dist = distance(entity.pos, this.state.player.pos);
        const dir = normalize({
          x: this.state.player.pos.x - entity.pos.x,
          y: this.state.player.pos.y - entity.pos.y,
        });

        switch(enemyType) {
          case EnemyType.SEEKER:
            entity.vel.x += dir.x * 0.12;
            entity.vel.y += dir.y * 0.12;
            entity.rotation = Math.atan2(entity.vel.y, entity.vel.x);
            break;

          case EnemyType.SHOOTER:
            // Keep distance
            if (dist > 300) {
              entity.vel.x += dir.x * 0.08;
              entity.vel.y += dir.y * 0.08;
            } else if (dist < 200) {
              entity.vel.x -= dir.x * 0.08;
              entity.vel.y -= dir.y * 0.08;
            }
            // Shoot at player
            if (entity.aiTimer === undefined) entity.aiTimer = 0;
            entity.aiTimer -= deltaTime;
            if (entity.aiTimer <= 0) {
              this.createProjectile(entity, true);
              this.soundManager.playPositional(SoundType.SHOOT_ENEMY, entity.pos.x, this.state.dimensions.width);
              entity.aiTimer = 1500; // 1.5s fire rate
            }
            entity.rotation = Math.atan2(dir.y, dir.x);
            break;

          case EnemyType.STALKER:
            // Circle player
            const perp = { x: -dir.y, y: dir.x };
            const stalkDist = 250;
            if (dist > stalkDist + 20) {
              entity.vel.x += (dir.x * 0.05 + perp.x * 0.1);
              entity.vel.y += (dir.y * 0.05 + perp.y * 0.1);
            } else if (dist < stalkDist - 20) {
              entity.vel.x += (-dir.x * 0.05 + perp.x * 0.1);
              entity.vel.y += (-dir.y * 0.05 + perp.y * 0.1);
            } else {
              entity.vel.x += perp.x * 0.15;
              entity.vel.y += perp.y * 0.15;
            }
            entity.rotation = Math.atan2(dir.y, dir.x);
            break;

          case EnemyType.CHARGER:
            if (entity.aiTimer === undefined) {
              entity.aiTimer = 1000;
              entity.aiState = 'CHARGING';
            }
            entity.aiTimer -= deltaTime;
            
            if (entity.aiState === 'CHARGING') {
              // Drift slowly while charging
              entity.vel.x += dir.x * 0.02;
              entity.vel.y += dir.y * 0.02;
              entity.rotation = Math.atan2(dir.y, dir.x);
              if (entity.aiTimer <= 0) {
                entity.aiState = 'LUNGING';
                entity.aiTimer = 800; // Lunge duration
                const lungeDir = normalize({
                  x: this.state.player.pos.x - entity.pos.x,
                  y: this.state.player.pos.y - entity.pos.y
                });
                entity.vel.x = lungeDir.x * 12;
                entity.vel.y = lungeDir.y * 12;
              }
            } else {
              // Lunging, rotation remains locked to movement
              entity.rotation = Math.atan2(entity.vel.y, entity.vel.x);
              if (entity.aiTimer <= 0) {
                entity.aiState = 'CHARGING';
                entity.aiTimer = 1500; // cooldown
              }
            }
            break;

          case EnemyType.KAMIKAZE:
            // Very fast pursuit
            entity.vel.x += dir.x * 0.25;
            entity.vel.y += dir.y * 0.25;
            entity.rotation = Math.atan2(entity.vel.y, entity.vel.x);
            break;

          case EnemyType.TURRET:
            // Barely moves
            entity.vel.x *= 0.9;
            entity.vel.y *= 0.9;
            entity.rotation = Math.atan2(dir.y, dir.x);
            
            if (entity.aiTimer === undefined) entity.aiTimer = 2000;
            if (entity.aiState === undefined) entity.aiState = 'READY';
            
            entity.aiTimer -= deltaTime;
            if (entity.aiTimer <= 0) {
              if (entity.aiState === 'READY') {
                // Fire volley
                for (let i = -1; i <= 1; i++) {
                   const spreadAngle = entity.rotation + (i * 0.15);
                   this.createProjectileFromAngle(entity, spreadAngle, true);
                }
                this.soundManager.playPositional(SoundType.SHOOT_ENEMY, entity.pos.x, this.state.dimensions.width);
                entity.aiState = 'COOLDOWN';
                entity.aiTimer = 2500;
              } else {
                entity.aiState = 'READY';
                entity.aiTimer = 1000;
              }
            }
            break;
        }

        // Boss AI overrides
        if (entity.isBoss) {
            const now = performance.now();
            // Bosses oscillate around the top or follow at distance
            const targetPos = { x: this.state.dimensions.width / 2 + Math.sin(now * 0.001) * 200, y: 150 };
            const bossDir = normalize({ x: targetPos.x - entity.pos.x, y: targetPos.y - entity.pos.y });
            entity.vel.x += bossDir.x * 0.05;
            entity.vel.y += bossDir.y * 0.05;
            entity.rotation = Math.atan2(this.state.player.pos.y - entity.pos.y, this.state.player.pos.x - entity.pos.x);

            // Multi-shot for boss
            if (entity.aiTimer === undefined) entity.aiTimer = 2000;
            entity.aiTimer -= deltaTime;
            if (entity.aiTimer <= 0) {
              // Rapid volley
              for (let i = -2; i <= 2; i++) {
                const spreadAngle = entity.rotation + (i * 0.2);
                this.createProjectileFromAngle(entity, spreadAngle, true);
              }
              this.soundManager.play(SoundType.SHOOT_BOSS, 0);
              entity.aiTimer = 2000;
              this.state.cameraShake = 5;
            }
        }
        
        // Friction and Cap speed
        entity.vel.x *= 0.98;
        entity.vel.y *= 0.98;
        const speed = Math.sqrt(entity.vel.x ** 2 + entity.vel.y ** 2);
        const maxSpeed = enemyType === EnemyType.CHARGER && entity.aiState === 'LUNGING' ? 15 : 
                        enemyType === EnemyType.KAMIKAZE ? 8 : 4;
        if (speed > maxSpeed) {
          entity.vel.x = (entity.vel.x / speed) * maxSpeed;
          entity.vel.y = (entity.vel.y / speed) * maxSpeed;
        }
      }

      // Particle physics
      if (entity.type === EntityType.PARTICLE) {
        if (entity.lifeTime !== undefined) {
          entity.lifeTime -= deltaTime;
          entity.opacity = entity.lifeTime / (entity.maxLifeTime || 1);
          if (entity.lifeTime <= 0) entity.isDead = true;
        }
      }

      // Clean up out of bounds (except particles which have lifetime)
      if (entity.type !== EntityType.PARTICLE && 
          (entity.pos.x < -100 || entity.pos.x > this.state.dimensions.width + 100 ||
           entity.pos.y < -100 || entity.pos.y > this.state.dimensions.height + 100)) {
        entity.isDead = true;
      }
    });

    this.checkCollisions();

    // Filter dead entities
    this.state.entities = this.state.entities.filter(e => !e.isDead);

    // Update Score & Difficulty
    this.state.level = Math.floor(this.state.score / 1000) + 1;

    // Combo decay
    if (this.state.combo > 0) {
      const decay = deltaTime * 0.005;
      this.state.combo = Math.max(0, this.state.combo - decay);
      const prevMult = this.state.multiplier;
      this.state.multiplier = 1 + Math.floor(this.state.combo / 5);
      if (this.state.multiplier > prevMult) {
        this.soundManager.play(SoundType.COMBO_UP, 0, this.state.multiplier);
      }
    }
  }

  private checkCollisions() {
    this.state.entities.forEach(entity => {
      if (entity.isDead) return;

      // Projectile vs Target
      if (entity.type === EntityType.PROJECTILE) {
        // Player projectile hits enemies
        if (!entity.isEnemyProjectile) {
          this.state.entities.forEach(target => {
            if (target.isDead) return;
            if (target.type === EntityType.ENEMY || target.type === EntityType.ASTEROID) {
              const dist = distance(entity.pos, target.pos);
              if (dist < entity.radius + target.radius) {
                entity.isDead = true;
                
                // Weak point check
                let damage = 50;
                let isCritical = false;
                
                if (target.type === EntityType.ENEMY && 
                    (target.enemyType === EnemyType.SHOOTER || target.enemyType === EnemyType.TURRET)) {
                  // Crit if hit near the center (core)
                  if (dist < target.radius * 0.4) {
                    damage = 150;
                    isCritical = true;
                  }
                }

                target.health -= damage;
                
                if (isCritical) {
                  this.createExplosion(entity.pos, '#fff', 10);
                  this.createText(entity.pos, 'CRITICAL', '#fff', 20);
                  this.state.score += 20 * this.state.multiplier;
                  this.state.combo += 2;
                  this.soundManager.playPositional(SoundType.CRITICAL_HIT, entity.pos.x, this.state.dimensions.width);
                }

                if (target.health <= 0) {
                  target.isDead = true;
                  this.state.score += (target.type === EntityType.ENEMY ? 100 : 50) * this.state.multiplier;
                  const reward = target.type === EntityType.ENEMY ? 10 : 5;
                  this.credits += reward;
                  this.state.credits = this.credits;
                  this.state.combo += 1;
                  this.createExplosion(target.pos, target.color);
                  
                  if (target.isBoss) {
                    this.soundManager.play(SoundType.EXPLOSION_LARGE);
                  } else if (target.type === EntityType.ASTEROID || target.enemyType === EnemyType.KAMIKAZE) {
                    this.soundManager.playPositional(SoundType.EXPLOSION_SMALL, target.pos.x, this.state.dimensions.width);
                  } else {
                    this.soundManager.playPositional(SoundType.EXPLOSION_MEDIUM, target.pos.x, this.state.dimensions.width);
                  }
                }
              }
            }
          });
        } else {
          // Enemy projectile hits player
          if (distance(entity.pos, this.state.player.pos) < entity.radius + this.state.player.radius) {
            entity.isDead = true;
            this.state.player.health -= 5;
            this.state.cameraShake = Math.max(this.state.cameraShake, 10);
            this.lastPlayerActionTime = performance.now();
            this.createExplosion(entity.pos, entity.color, 5);
            
            if (this.state.player.health > 25) {
              this.soundManager.play(SoundType.DAMAGE_SHIELD);
            } else {
              this.soundManager.play(SoundType.DAMAGE_HULL);
            }

            if (this.state.player.health <= 0) {
              this.state.isGameOver = true;
              this.state.cameraShake = 30;
              this.createExplosion(this.state.player.pos, this.state.player.color, 50);
              this.soundManager.play(SoundType.EXPLOSION_LARGE);
              this.soundManager.play(SoundType.GAME_OVER);
            }
          }

          // Enemy projectile hits drones
          this.state.entities.forEach(target => {
            if (target.isDead || target.type !== EntityType.DRONE) return;
            if (distance(entity.pos, target.pos) < entity.radius + target.radius) {
                entity.isDead = true;
                target.health -= 25;
                this.createExplosion(entity.pos, entity.color, 5);
                this.soundManager.playPositional(SoundType.DAMAGE_SHIELD, target.pos.x, this.state.dimensions.width);
                if (target.health <= 0) {
                    target.isDead = true;
                    this.createExplosion(target.pos, target.color, 15);
                    this.soundManager.playPositional(SoundType.EXPLOSION_SMALL, target.pos.x, this.state.dimensions.width);
                }
            }
          });
        }
      }

      // Player vs Enemy/Asteroid
      if (entity.type === EntityType.ENEMY || entity.type === EntityType.ASTEROID) {
        if (distance(this.state.player.pos, entity.pos) < this.state.player.radius + entity.radius) {
          this.state.player.health -= 10;
          this.state.cameraShake = Math.max(this.state.cameraShake, 15);
          this.lastPlayerActionTime = performance.now();
          entity.isDead = true;
          this.createExplosion(entity.pos, entity.color);
          this.soundManager.play(SoundType.DAMAGE_HULL);
          this.soundManager.playPositional(SoundType.EXPLOSION_MEDIUM, entity.pos.x, this.state.dimensions.width);
          if (this.state.player.health <= 0) {
            this.state.isGameOver = true;
            this.state.cameraShake = 30;
            this.createExplosion(this.state.player.pos, this.state.player.color, 50);
            this.soundManager.play(SoundType.EXPLOSION_LARGE);
            this.soundManager.play(SoundType.GAME_OVER);
          }
        }
      }
    });
  }

  private createProjectile(source: Entity, isEnemy: boolean = false) {
    this.createProjectileFromAngle(source, source.rotation, isEnemy);
  }

  private createProjectileFromAngle(source: Entity, angle: number, isEnemy: boolean = false) {
    const dir = rotate({ x: 1, y: 0 }, angle);
    const projectile: Entity = {
      id: Math.random().toString(36).substr(2, 9),
      type: EntityType.PROJECTILE,
      isEnemyProjectile: isEnemy,
      pos: { ...source.pos },
      vel: { x: dir.x * (isEnemy ? 8 : GAME_CONFIG.PLAYER_PROJECTILE_SPEED), y: dir.y * (isEnemy ? 8 : GAME_CONFIG.PLAYER_PROJECTILE_SPEED) },
      radius: source.type === EntityType.DRONE ? 3 : 4,
      rotation: angle,
      health: 1,
      maxHealth: 1,
      color: isEnemy ? GAME_CONFIG.COLORS.ENEMY : (source.type === EntityType.DRONE ? source.color : GAME_CONFIG.COLORS.PROJECTILE),
      isDead: false,
      damage: 10 * (source.type === EntityType.DRONE ? this.state.droneUpgrades.damage : 1),
    };
    this.state.entities.push(projectile);
  }

  private spawnEntity(type: EntityType) {
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    const padding = 50;

    switch(side) {
      case 0: x = randomRange(0, this.state.dimensions.width); y = -padding; break; // Top
      case 1: x = this.state.dimensions.width + padding; y = randomRange(0, this.state.dimensions.height); break; // Right
      case 2: x = randomRange(0, this.state.dimensions.width); y = this.state.dimensions.height + padding; break; // Bottom
      case 3: x = -padding; y = randomRange(0, this.state.dimensions.height); break; // Left
    }

    let enemyType: EnemyType | undefined;
    if (type === EntityType.ENEMY) {
      const types = Object.values(EnemyType);
      enemyType = types[Math.floor(Math.random() * types.length)] as EnemyType;
    }

    const entity: Entity = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      enemyType,
      pos: { x, y },
      vel: { x: randomRange(-2, 2), y: randomRange(-2, 2) },
      radius: type === EntityType.ENEMY ? 15 : randomRange(10, 40),
      rotation: 0,
      health: type === EntityType.ENEMY ? 50 : 100,
      maxHealth: type === EntityType.ENEMY ? 50 : 100,
      color: type === EntityType.ENEMY ? GAME_CONFIG.COLORS.ENEMY : GAME_CONFIG.COLORS.ASTEROID,
      isDead: false,
    };

    if (type === EntityType.ENEMY) {
      if (enemyType === EnemyType.SHOOTER) {
        entity.health = 80;
        entity.radius = 18;
      } else if (enemyType === EnemyType.CHARGER) {
        entity.health = 120;
        entity.radius = 22;
        entity.color = '#fb923c'; // Orange for charger
      } else if (enemyType === EnemyType.KAMIKAZE) {
        entity.health = 40;
        entity.radius = 12;
        entity.color = '#fde047'; // Yellow for kamikaze
      } else if (enemyType === EnemyType.TURRET) {
        entity.health = 200;
        entity.radius = 25;
        entity.color = '#a855f7'; // Purple for turret
      }
      
      const dir = normalize({ x: this.state.player.pos.x - x, y: this.state.player.pos.y - y });
      entity.vel = { x: dir.x * 2, y: dir.y * 2 };
    }

    this.state.entities.push(entity);
  }

  private createExplosion(pos: Vector, color: string, count: number = 20) {
    // 1. High-Velocity Incandescent Spark Streaks
    const sparkCount = Math.floor(count * 0.75);
    for (let i = 0; i < sparkCount; i++) {
      const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.5;
      const speed = randomRange(3, 8);
      const sparkParticle: Entity = {
        id: Math.random().toString(36).substr(2, 9),
        type: EntityType.PARTICLE,
        pos: { ...pos },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        radius: randomRange(2, 4),
        rotation: angle,
        health: 0,
        maxHealth: 0,
        color: Math.random() < 0.35 ? '#ffffff' : (Math.random() < 0.7 ? color : '#fde047'),
        isDead: false,
        opacity: 1,
        lifeTime: randomRange(300, 650),
        maxLifeTime: 650,
      };
      this.state.entities.push(sparkParticle);
    }

    // 2. Slower Expanding Fireball Embers
    for (let i = 0; i < count; i++) {
      const emberParticle: Entity = {
        id: Math.random().toString(36).substr(2, 9),
        type: EntityType.PARTICLE,
        pos: { ...pos },
        vel: { x: randomRange(-3, 3), y: randomRange(-3, 3) },
        radius: randomRange(4, 9),
        rotation: Math.random() * Math.PI * 2,
        health: 0,
        maxHealth: 0,
        color,
        isDead: false,
        opacity: 1,
        lifeTime: randomRange(400, 900),
        maxLifeTime: 900,
      };
      this.state.entities.push(emberParticle);
    }
  }

  private createText(pos: Vector, text: string, color: string, fontSize: number = 14) {
    const textEntity: Entity = {
      id: Math.random().toString(36).substr(2, 9),
      type: EntityType.TEXT,
      pos: { ...pos },
      vel: { x: 0, y: -2 },
      radius: 0,
      rotation: 0,
      health: 0,
      maxHealth: 0,
      color,
      isDead: false,
      text,
      fontSize,
      opacity: 1,
      lifeTime: 800,
      maxLifeTime: 800,
    };
    this.state.entities.push(textEntity);
  }

  private startNextWave() {
    this.state.wave++;
    this.state.isWaveActive = true;
    this.state.warpFactor = 5; // Trigger warp effect
    
    this.soundManager.play(SoundType.WAVE_START);
    this.soundManager.play(SoundType.WARP_SURGE);
    
    if (this.state.wave % 3 === 0) {
        this.createText({ x: this.state.dimensions.width / 2, y: this.state.dimensions.height / 2 }, "ASTEROID FIELD DETECTED", "#f87171", 30);
    }
    
    // Reward for completing wave
    this.credits += 50;
    this.state.credits = this.credits;
    
    // Respawn missing drones
    const currentDroneCount = this.state.entities.filter(e => e.type === EntityType.DRONE && !e.isDead).length;
    const maxDrones = 3;
    if (currentDroneCount < maxDrones) {
        for (let i = 0; i < maxDrones - currentDroneCount; i++) {
            const drone: Entity = {
                id: `drone-respawn-${performance.now()}-${i}`,
                type: EntityType.DRONE,
                pos: { ...this.state.player.pos },
                vel: { x: 0, y: 0 },
                radius: 8,
                rotation: 0,
                health: 100 * this.state.droneUpgrades.health,
                maxHealth: 100 * this.state.droneUpgrades.health,
                color: this.droneCustomization.color,
                droneCustomization: this.droneCustomization,
                isDead: false,
                aiTimer: 0,
            };
            this.state.entities.push(drone);
        }
    }
    
    if (this.state.wave % 5 === 0) {
      // Boss level
      this.spawnBoss();
      this.state.waveEnemiesRemaining = 0;
      this.createText(this.state.player.pos, `BOSS APPROACHING`, '#f472b6', 30);
    } else {
      this.state.waveEnemiesRemaining = 5 + this.state.wave * 2;
      this.spawnTimer = 1000;
      this.createText(this.state.player.pos, `WAVE ${this.state.wave}`, '#fff', 24);
    }
  }

  public buyDroneUpgrade(type: keyof DroneUpgrades) {
    const cost = 100; // Flat cost for simplicity, could be scaled
    if (this.credits >= cost) {
        this.credits -= cost;
        this.droneUpgrades[type] += 0.2; // 20% boost
        this.state.credits = this.credits;
        this.state.droneUpgrades = this.droneUpgrades;
        this.soundManager.play(SoundType.UPGRADE_BOUGHT);
        this.createText(this.state.player.pos, `DRONE ${(type as string).toUpperCase()} UPGRADED`, "#22d3ee", 20);
        
        // Apply health boost immediately to active drones if it's health
        if (type === 'health') {
            this.state.entities.forEach(e => {
                if (e.type === EntityType.DRONE && !e.isDead) {
                    e.maxHealth *= 1.2;
                    e.health *= 1.2;
                }
            });
        }
        return true;
    }
    return false;
  }

  private spawnBoss() {
    const entity: Entity = {
      id: 'boss-' + Math.random().toString(36).substr(2, 9),
      type: EntityType.ENEMY,
      isBoss: true,
      pos: { x: this.state.dimensions.width / 2, y: -100 },
      vel: { x: 0, y: 1 },
      radius: 60,
      rotation: Math.PI / 2,
      health: 2000 + this.state.wave * 500,
      maxHealth: 2000 + this.state.wave * 500,
      color: '#f472b6',
      isDead: false,
    };
    this.state.entities.push(entity);
  }

  public getSoundManager(): SoundManager {
    return this.soundManager;
  }

  public getState() {
    return this.state;
  }
}
