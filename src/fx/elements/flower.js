// 花朵 (HAPPY)：六瓣花，easeOutBack 从小到大“生长”，
// 生长完成后轻微旋转、缓缓淡出。

import { FxElement } from "../element.js";
import { easeOutBack } from "../../animation/easing.js";
import { TAU } from "../../core/math.js";

export class FlowerElement extends FxElement {
  constructor(opts) {
    super({ size: 26, duration: 3400, fadeIn: 0.05, fadeOut: 0.2, mood: "HAPPY", ...opts });
    this.growMs = 1300;
    this.spin = opts?.spin ?? (Math.random() - 0.5) * 0.4;
    this.petalTint = opts?.petalTint ?? null;
  }

  onUpdate(dt) {
    const p = Math.min(1, this.age / this.growMs);
    this.scale = easeOutBack(p);
    this.rotation += this.spin * dt;
  }

  paint(ctx) {
    const R = this.size;
    const petals = 6;
    ctx.fillStyle = this.petalTint ?? this.color;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(R * 0.62, 0, R * 0.42, R * 0.2, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.28, 0, TAU);
    ctx.fillStyle = "#fff3c4";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.12, 0, TAU);
    ctx.fillStyle = "#e8890c";
    ctx.fill();
  }
}
