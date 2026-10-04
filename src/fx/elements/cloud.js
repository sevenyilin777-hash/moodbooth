// 云朵 (TIRED/CALM)：几团圆组成的云，极缓慢地横向漂移 + 上下浮动。
// 常驻型元素（duration 很长），静止状态结束时由控制器 beginFadeOut。

import { FxElement } from "../element.js";
import { driftWave } from "../../animation/behaviors.js";
import { rand } from "../../core/math.js";

export class CloudElement extends FxElement {
  constructor(opts) {
    super({
      size: rand(34, 56), duration: 12000, fadeIn: 0.12, fadeOut: 0.15,
      mood: "TIRED", ...opts,
    });
    this.baseY = this.pos.y;
    this.vx = rand(6, 14) * (Math.random() < 0.5 ? -1 : 1);
    this.phase = rand(10);
    this.blobs = [];
    const n = 4 + ((Math.random() * 2) | 0);
    for (let i = 0; i < n; i++) {
      this.blobs.push({
        dx: (i - (n - 1) / 2) * this.size * 0.55 + rand(-4, 4),
        dy: rand(-this.size * 0.22, this.size * 0.22),
        r: this.size * rand(0.42, 0.62),
      });
    }
  }

  onUpdate(dt, now, scene) {
    this.pos.x += this.vx * dt;
    this.pos.y = this.baseY + driftWave(now * 0.001, { amp: 5, speed: 0.5, phase: this.phase });
    // 飘出画布边缘则回绕
    const sceneW = scene?.frame?.w;
    if (sceneW) {
      const m = this.size * 2;
      if (this.pos.x < -m) this.pos.x = sceneW + m;
      if (this.pos.x > sceneW + m) this.pos.x = -m;
    }
  }

  paint(ctx) {
    ctx.fillStyle = this.color;
    for (const b of this.blobs) {
      ctx.beginPath();
      ctx.arc(b.dx, b.dy, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
