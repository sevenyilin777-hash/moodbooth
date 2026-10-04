// 缓动函数：所有动画的“非机械感”来源。

export const linear = (t) => t;

export const easeInCubic = (t) => t * t * t;

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);

export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/** 回弹式超出，用于“生长”类效果 */
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const smoothstep = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
