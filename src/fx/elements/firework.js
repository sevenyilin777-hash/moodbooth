// 烟花线 (SURPRISED)：从脸部附近快速向外迸发。
// 三段式：闪光 -> 放射线极速伸展 -> 端点碎粒闪烁后熄灭。

import { FxElement } from "../element.js";
import { easeOutExpo } from "../../animation/easing.js";
import { TAU, rand, seg } from "../../core/math.js";

export class FireworkElement extends FxElement {
  constructor(opts) {
    super({
      size: 90, duration: 900, fadeIn: 0.01, fadeOut: 0.4,
      mood: "SURPRISED", composite: "lighter", ...opts,
    });
    this.seed = Math.random() * 100;
    this.rays = [];
    const n = 18;
    for (let i = 0; i < n; i++) {
      this.rays.push({
        angle: (i / n) * TAU + rand(-0.09, 0.09),
        len: rand(0.7, 1.3),
        delay: rand(0, 40),
      });
    }
  }

  onUpdate() {}

  paint(ctx) {
    const t = this.age;
    const baseA = ctx.globalAlpha;
    const R = this.size;

    // 起始闪光
    const flash = seg(t, 0, 110);
    if (flash < 1) {
      ctx.globalAlpha = baseA * (1 - flash) * 0.9;
      ctx.fillStyle = "#fff8e1";
      ctx.beginPath();
      ctx.arc(0, 0, 6 + flash * 16, 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = this.color;
    ctx.lineCap = "round";
    const p = easeOutExpo(seg(t, 10, 480));
    for (const ray of this.rays) {
      const rp = easeOutExpo(seg(t, ray.delay, ray.delay + 400));
      if (rp <= 0) continue;
      const dx = Math.cos(ray.angle);
      const dy = Math.sin(ray.angle);
      const inner = R * 0.1 + rp * R * 0.25 * ray.len;
      const outer = R * 0.1 + rp * R * ray.len;
      ctx.globalAlpha = baseA * (1 - rp * 0.4);
      ctx.lineWidth = 2.2 * (1 - rp * 0.5);
      ctx.beginPath();
      ctx.moveTo(dx * inner, dy * inner);
      ctx.lineTo(dx * outer, dy * outer);
      ctx.stroke();

      // 端点碎粒（后半段出现并闪烁）
      if (rp > 0.75) {
        const tw = 0.5 + 0.5 * Math.sin(t * 0.09 + ray.angle * 7 + this.seed);
        ctx.globalAlpha = baseA * (1 - p) * tw;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(dx * outer, dy * outer, 1.8, 0, TAU);
        ctx.fill();
      }
    }
  }
}
