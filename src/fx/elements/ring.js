// 圆环 (SHY)：以人物脸中心为锚，一圈圈向外扩张。
// 用噪声扰动半径，带来轻微的手绘不规则感；
// 扰动相位随时间缓慢旋转，圆环有“呼吸”感。

import { FxElement } from "../element.js";
import { easeOutCubic } from "../../animation/easing.js";
import { noise1, TAU } from "../../core/math.js";

export class RingElement extends FxElement {
  constructor(opts) {
    super({
      size: 120, duration: 2300, fadeIn: 0.08, fadeOut: 0.3,
      mood: "SHY", ...opts,
    });
    this.seed = Math.random() * 100;
    this.expandMs = 1900;
    this.maxR = opts?.maxR ?? this.size;
  }

  paint(ctx) {
    const p = easeOutCubic(Math.min(1, this.age / this.expandMs));
    const R = 8 + p * this.maxR;
    const t = this.age;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2.4 * (1 - p * 0.5);
    ctx.beginPath();
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      // 半径噪声：不规则的圆 + 缓慢扭动的相位
      const wobble =
        noise1(Math.cos(a) * 1.7 + t * 0.0012, this.seed) * 0.07 +
        noise1(Math.sin(a) * 2.3 - t * 0.0009, this.seed + 5) * 0.05;
      const r = R * (1 + wobble);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}
