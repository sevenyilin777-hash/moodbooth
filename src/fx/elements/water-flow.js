// 水流 (TIRED/CALM)：下半屏缓慢流动的波浪线组，
// 正弦相位随时间推移产生“流动”感。常驻型，静止结束时被淡出。

import { FxElement } from "../element.js";
import { TAU, rand } from "../../core/math.js";

export class WaterFlowElement extends FxElement {
  constructor(opts) {
    super({
      size: 300, duration: 60000, fadeIn: 0.05, fadeOut: 0.05,
      mood: "TIRED", ...opts,
    });
    this.width = opts?.width ?? 620;
    this.lines = [
      { dy: -10, amp: 7, k: 0.021, speed: 0.0011, alpha: 0.85 },
      { dy: 4, amp: 9, k: 0.017, speed: 0.0008, alpha: 0.6 },
      { dy: 18, amp: 6, k: 0.026, speed: 0.0014, alpha: 0.4 },
    ];
    this.phase = rand(TAU);
  }

  paint(ctx) {
    const baseA = ctx.globalAlpha;
    ctx.strokeStyle = this.color;
    ctx.lineCap = "round";
    const t = this.age;
    for (const ln of this.lines) {
      ctx.globalAlpha = baseA * ln.alpha;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const x0 = -this.width / 2;
      for (let x = 0; x <= this.width; x += 12) {
        const y =
          ln.dy +
          Math.sin(x * ln.k + t * ln.speed * 8 + this.phase) * ln.amp +
          Math.sin(x * ln.k * 0.5 - t * ln.speed * 5) * ln.amp * 0.4;
        if (x === 0) ctx.moveTo(x0 + x, y);
        else ctx.lineTo(x0 + x, y);
      }
      ctx.stroke();
    }
  }
}
