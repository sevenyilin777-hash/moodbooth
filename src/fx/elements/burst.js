// 爆炸线 (ANGRY)：从拳头中心快速向外发散的放射线 + 冲击环，
// 前 150ms 带轻微震动。松拳不会重复生成（事件只在握拳上升沿发）。

import { FxElement } from "../element.js";
import { easeOutExpo, easeOutCubic } from "../../animation/easing.js";
import { noise1, TAU, rand, seg } from "../../core/math.js";

export class BurstElement extends FxElement {
  constructor(opts) {
    super({
      size: 46, duration: 620, fadeIn: 0.01, fadeOut: 0.5,
      mood: "ANGRY", composite: "lighter", ...opts,
    });
    this.seed = Math.random() * 100;
    this.rays = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      this.rays.push({
        angle: (i / n) * TAU + rand(-0.12, 0.12),
        len: rand(0.6, 1.25),
        width: rand(1.6, 3.4),
        delay: rand(0, 60),
      });
    }
  }

  onUpdate() {} // 全部在 paint 里按 age 计算

  paint(ctx) {
    const t = this.age; // ms
    const baseA = ctx.globalAlpha;
    // 震动
    if (t < 150) {
      const k = 1 - t / 150;
      ctx.translate(noise1(t * 0.05, this.seed) * 4 * k, noise1(t * 0.05, this.seed + 9) * 4 * k);
    }
    ctx.strokeStyle = this.color;
    ctx.lineCap = "round";

    const R0 = this.size * 0.18;
    for (const ray of this.rays) {
      const p = easeOutExpo(seg(t, ray.delay, ray.delay + 420));
      if (p <= 0) continue;
      const inner = R0 + p * this.size * 0.3 * ray.len;
      const outer = R0 + p * this.size * ray.len;
      const dx = Math.cos(ray.angle);
      const dy = Math.sin(ray.angle);
      ctx.globalAlpha = baseA * (1 - p * 0.55);
      ctx.lineWidth = ray.width * (1 - p * 0.6);
      ctx.beginPath();
      ctx.moveTo(dx * inner, dy * inner);
      ctx.lineTo(dx * outer, dy * outer);
      ctx.stroke();
    }

    // 冲击环
    const rp = seg(t, 0, 450);
    if (rp > 0 && rp < 1) {
      ctx.globalAlpha = baseA * (1 - rp) * 0.6;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, easeOutCubic(rp) * this.size * 1.15, 0, TAU);
      ctx.stroke();
    }
  }
}
