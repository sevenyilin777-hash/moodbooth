// 可复用的运动行为：元素按需组合，而不是各自手写物理。

import { noise1 } from "../core/math.js";

/**
 * 重力下落（水滴等）。直接修改 obj.vy / obj.y。
 */
export function fall(obj, dt, { g = 900, vmax = 720 } = {}) {
  obj.vy = Math.min(vmax, (obj.vy || 0) + g * dt);
  obj.y += obj.vy * dt;
}

/**
 * 缓慢漂移的上下 / 左右浮动（云、风向线）。
 */
export function driftWave(t, { amp = 6, speed = 1, phase = 0 } = {}) {
  return Math.sin(t * speed + phase) * amp;
}

/**
 * 轻微不规则的抖动偏移（弯曲线生长等）。
 */
export function wobble(t, seed = 0, amp = 2) {
  return noise1(t * 0.006, seed) * amp;
}

/**
 * 向外速度 + 阻尼（星星扩散、烟花迸发）。
 */
export function applyDamping(vel, dt, dampingPerSec = 0.9) {
  const k = Math.pow(dampingPerSec, dt);
  vel.x *= k;
  vel.y *= k;
}
