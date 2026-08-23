/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GAME_CONFIG = {
  PLAYER_SPEED: 0.15,
  PLAYER_FRICTION: 0.95,
  PLAYER_RADIUS: 20,
  PLAYER_PROJECTILE_SPEED: 12,
  PLAYER_PROJECTILE_COOLDOWN: 150,
  
  ENEMY_SPAWN_CHANCE: 0.015, // per frame
  ASTEROID_SPAWN_CHANCE: 0.01,
  
  MAX_ENTITIES: 200,
  
  COLORS: {
    PLAYER: '#22d3ee',
    PLAYER_GLOW: 'rgba(34, 211, 238, 0.5)',
    ENEMY: '#f43f5e',
    ENEMY_GLOW: 'rgba(244, 63, 94, 0.5)',
    PROJECTILE: '#fff',
    ASTEROID: '#1e293b',
    BACKGROUND: '#02040a',
  }
};
