// 水滴 (SAD)：从眼角生成，受重力下落，轻微左右摆动。

import { FxElement } from "../element.js";
import { fall } from "../../animation/behaviors.js";
import { TAU } from "../../core/math.js";

export class TeardropElement extends FxElement {
  constructor(opts) {
    super({ size: 9, duration: 1400, fadeIn: 0.06, fadeOut: 0.3, mood: "SAD", ...opts });
    this.vy = 20;
    this.sway = Math.random() * TAU;
  }

  onUpdate(dt, now) {
    fall(this.pos, dt, { g: 950, vmax: 640 });
    this.pos.x += Math.sin(now * 0.004 + this.sway) * 14 * dt;
  }

  paint(ctx) {
    const r = this.size;
    // 上尖下圆的水滴形
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.5);
    ctx.bezierCurveTo(r * 0.9, -r * 0.3, r * 0.75, r, 0, r);
    ctx.bezierCurveTo(-r * 0.75, r, -r * 0.9, -r * 0.3, 0, -r * 1.5);
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();
    // 高光
    ctx.beginPath();
    ctx.arc(-r * 0.28, r * 0.15, r * 0.22, 0, TAU);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fill();
  }
}
