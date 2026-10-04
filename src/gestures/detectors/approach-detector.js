// Gesture: 靠近摄像头 (SURPRISED)
// 脸宽（两颊距离）相对缓慢更新的基线明显变大 -> 判定靠近。
// 基线只在 ratio < 1.15 时更新（避免基线追着尖峰跑），
// 触发后必须回落到 rearmRatio 以下才重新武装。

import { CONFIG } from "../../config.js";

export class ApproachDetector {
  constructor() {
    this.baseline = null;
    this.ratio = 1;
    this.armed = true;
    this.firstFaceTs = 0;
    this.lastFire = -Infinity;
  }

  update(ctx) {
    const { scene, mem, now, dt } = ctx;
    const events = [];
    const face = scene.face;

    if (!face) {
      this.baseline = null;
      this.firstFaceTs = 0;
      return { events };
    }
    if (!this.firstFaceTs) this.firstFaceTs = now;

    if (this.baseline === null) this.baseline = face.faceWidth;
    this.ratio = face.faceWidth / this.baseline;

    if (this.ratio < 1.15) {
      const alpha = Math.min(1, dt * 1000 / CONFIG.approach.baselineMs);
      this.baseline += (face.faceWidth - this.baseline) * alpha;
    }

    const ready = now - this.firstFaceTs > CONFIG.approach.minFaceAgeMs;
    if (this.armed && ready && this.ratio > CONFIG.approach.triggerRatio && now - this.lastFire > CONFIG.approach.cooldownMs) {
      this.armed = false;
      this.lastFire = now;
      events.push({ type: "approach", ratio: this.ratio, pos: { ...face.center } });
    }
    if (this.ratio < CONFIG.approach.rearmRatio) this.armed = true;

    mem.approachRatio = this.ratio;
    return { events };
  }
}
