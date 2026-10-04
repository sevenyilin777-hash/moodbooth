// 星星 (HAPPY)：五角星从手掌向外扩散（速度 + 阻尼），带自转。

import { FxElement } from "../element.js";
import { easeOutBack } from "../../animation/easing.js";
import { applyDamping } from "../../animation/behaviors.js";
import { TAU, rand } from "../../core/math.js";

export class StarElement extends FxElement {
  constructor(opts) {
    super({
      size: 12, duration: 1700, fadeIn: 0.04, fadeOut: 0.35,
      mood: "HAPPY", composite: "lighter", ...opts,
    });
    const a = rand(TAU);
    const speed = rand(50, 120);
    this.vel = { x: Math.cos(a) * speed, y: Math.sin(a) * speed - 30 };
    this.spin = rand(-2.4, 2.4);
    this.growMs = 420;
  }

  onUpdate(dt) {
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    applyDamping(this.vel, dt, 0.25);
    this.rotation += this.spin * dt;
    this.scale = easeOutBack(Math.min(1, this.age / this.growMs));
  }

  paint(ctx) {
    const R = this.size;
    const r = R * 0.45;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? R : r;
      const a = -Math.PI / 2 + (i / 10) * TAU;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}
