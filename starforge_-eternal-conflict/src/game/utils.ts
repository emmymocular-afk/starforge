/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector } from './types';

export function distance(v1: Vector, v2: Vector): number {
  return Math.sqrt(Math.pow(v2.x - v1.x, 2) + Math.pow(v2.y - v1.y, 2));
}

export function normalize(v: Vector): Vector {
  const d = Math.sqrt(v.x * v.x + v.y * v.y);
  return d === 0 ? { x: 0, y: 0 } : { x: v.x / d, y: v.y / d };
}

export function rotate(v: Vector, angle: number): Vector {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  };
}

export function getAngle(v1: Vector, v2: Vector): number {
  return Math.atan2(v2.y - v1.y, v2.x - v1.x);
}

export function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
