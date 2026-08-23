/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Vector {
  x: number;
  y: number;
}

export enum EntityType {
  PLAYER = 'PLAYER',
  ENEMY = 'ENEMY',
  PROJECTILE = 'PROJECTILE',
  ASTEROID = 'ASTEROID',
  PARTICLE = 'PARTICLE',
  COLLECTIBLE = 'COLLECTIBLE',
  TEXT = 'TEXT',
  DRONE = 'DRONE',
}

export enum ShipPattern {
  SLICK = 'SLICK',
  WINGED = 'WINGED',
  HEAVY = 'HEAVY',
}

export interface ShipCustomization {
  color: string;
  pattern: ShipPattern;
}

export enum DronePattern {
  SCOUT = 'SCOUT',
  SHIELD = 'SHIELD',
  ASSAULT = 'ASSAULT',
}

export interface DroneCustomization {
  color: string;
  pattern: DronePattern;
}

export interface DroneUpgrades {
  damage: number;
  speed: number;
  health: number;
  fireRate: number;
}

export enum EnemyType {
  SEEKER = 'SEEKER',
  SHOOTER = 'SHOOTER',
  STALKER = 'STALKER',
  CHARGER = 'CHARGER',
  KAMIKAZE = 'KAMIKAZE',
  TURRET = 'TURRET',
}

export interface Entity {
  id: string;
  type: EntityType;
  pos: Vector;
  vel: Vector;
  radius: number;
  rotation: number;
  health: number;
  maxHealth: number;
  color: string;
  isDead: boolean;
  opacity?: number;
  lifeTime?: number; // for particles
  maxLifeTime?: number;
  customization?: ShipCustomization;
  droneCustomization?: DroneCustomization;
  enemyType?: EnemyType;
  aiTimer?: number;
  aiState?: string;
  isEnemyProjectile?: boolean;
  text?: string;
  fontSize?: number;
  isRegenerating?: boolean;
  isBoss?: boolean;
  damage?: number;
}

export interface GameState {
  player: Entity;
  entities: Entity[];
  score: number;
  level: number;
  wave: number;
  waveEnemiesRemaining: number;
  isWaveActive: boolean;
  nebulae: Array<{ pos: Vector; color: string; radius: number; opacity: number }>;
  warpFactor: number;
  credits: number;
  droneUpgrades: DroneUpgrades;
  combo: number;
  multiplier: number;
  isGameOver: boolean;
  cameraShake: number;
  lastFrameTime: number;
  dimensions: { width: number; height: number };
}
