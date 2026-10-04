// 风向线 (TIRED/CALM)：一条带弧度的长线，用 lineDash 让一段“彗星尾”
// 沿曲线缓缓滑过，模拟风吹的轨迹。常驻型。

import { FxElement } from "../element.js";
import { driftWave } from "../../animation/behaviors.js";
import { rand } from "../../core/math.js";

export class WindLineElement extends FxElement {
  constructor(opts) {
    super({
      size: 300, duration: 9000, fadeIn: 0.1, fadeOut: 0.15,
      mood: "TIRED", ...opts,
    });
    this.len = opts?.len ?? rand(380, 560);
    this.vx = rand(14, 26) * (Math.random() < 0.5 ? -1 : 1);
    this.phase = rand(10);
    this.baseY = this.pos.y;
    this.dashLen = rand(90, 150);
    this.period = this.dashLen + this.len;
    this.amp = rand(10, 22);
  }

  onUpdate(dt, now) {
    this.pos.x += this.vx * dt;
    this.pos.y = this.baseY + driftWave(now * 0.001, { amp: 8, speed: 0.4, phase: this.phase });
    const sceneW = this.sceneWidth ?? 2000;
    const m = this.len;
    if (this.pos.x < -m) this.pos.x = sceneW + m;
    if (this.pos.x > sceneW + m) this.pos.x = -m;
  }

  paint(ctx) {
    const L = this.len;
    const dir = Math.sign(this.vx) || 1;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    // 主体路径：轻微波浪的长线
    ctx.beginPath();
    const x0 = (-L / 2) * dir;
    ctx.moveTo(x0, 0);
    for (let i = 1; i <= 8; i++) {
      const x = x0 + (dir * L * i) / 8;
      ctx.lineTo(x, Math.sin(i * 0.9 + this.phase) * this.amp * 0.25);
    }
    // 滑动的高亮段
    ctx.setLineDash([this.dashLen, this.period]);
    ctx.lineDashOffset = -((this.age * 0.06) % this.period) * dir;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
