// 基础数学工具与轻量伪噪声。

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function rand(min = 1, max) {
  if (max === undefined) return Math.random() * min;
  return min + Math.random() * (max - min);
}

export function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

/** [a,b] 区间内的时间进度，未开始为 0，结束后为 1 */
export const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

/**
 * 轻量伪噪声：多正弦叠加，返回约 [-1, 1]。
 * 用于图形的不规则感 / 抖动，不需要真正 Perlin。
 */
export function noise1(x, seed = 0) {
  return (
    Math.sin(x * 12.9898 + seed * 78.233) * 0.5 +
    Math.sin(x * 4.1414 + seed * 12.9898 + 1.3) * 0.35 +
    Math.sin(x * 1.618 + seed * 3.7 + 2.2) * 0.15
  );
}
