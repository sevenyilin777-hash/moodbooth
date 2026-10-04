// 弯曲线 (CONFUSED)：从下巴缓慢“长”出来的思考曲线。
// 预生成一条随机游走的波浪路径，按进度逐段画出；
// 每个点叠加随时间缓变的噪声抖动，产生轻微不规则的颤动。

import { FxElement } from "../element.js";
import { easeOutCubic } from "../../animation/easing.js";
import { noise1, TAU, rand } from "../../core/math.js";

export class SquiggleElement extends FxElement {
  constructor(opts) {
    super({
      size: 10, duration: 3600, fadeIn: 0.05, fadeOut: 0.2,
      mood: "CONFUSED", ...opts,
    });
    this.seed = Math.random() * 100;
    this.dir = rand(-0.5, 0.5) - Math.PI / 2; // 大致朝上
    this.stepLen = rand(7, 10);
    this.growMs = 1900;
    this.pts = this.buildPath(26);
  }

  buildPath(n) {
    const pts = [{ x: 0, y: 0 }];
    let a = this.dir;
    for (let i = 0; i < n; i++) {
      a += noise1(i * 0.9, this.seed) * 0.55;
      const prev = pts[pts.length - 1];
      pts.push({
        x: prev.x + Math.cos(a) * this.stepLen,
        y: prev.y + Math.sin(a) * this.stepLen,
      });
    }
    return pts;
  }

  onUpdate(dt, now) {
    this.wobbleT = now; // paint 里使用
  }

  paint(ctx) {
    const t = this.wobbleT ?? this.age;
    const growP = easeOutCubic(Math.min(1, this.age / this.growMs));
    const visible = growP * (this.pts.length - 1);

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const full = Math.floor(visible);
    for (let i = 0; i <= full; i++) {
      const p = this.pts[i];
      // 轻微、缓慢的抖动
      const jx = noise1(i * 1.3 + t * 0.0011, this.seed) * 2.2;
      const jy = noise1(i * 1.7 - t * 0.0009, this.seed + 4) * 2.2;
      if (i === 0) ctx.moveTo(p.x + jx, p.y + jy);
      else ctx.lineTo(p.x + jx, p.y + jy);
    }
    // 末端画到小数部分，生长更顺滑
    const frac = visible - full;
    if (frac > 0 && full + 1 < this.pts.length) {
      const a = this.pts[full];
      const b = this.pts[full + 1];
      ctx.lineTo(a.x + (b.x - a.x) * frac, a.y + (b.y - a.y) * frac);
    }
    ctx.stroke();
  }
}
