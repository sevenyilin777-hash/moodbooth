// Gesture: 张大嘴巴 (SURPRISED)
// 嘴巴张开程度 (jawOpen blendshape) 超过阈值即触发，烟花线从脸部迸发。
// 保持 minHoldMs 防说话误触；嘴闭上回落后才重新武装。
// “靠近摄像头”(approach-detector) 是同一效果的另一条触发路径，
// 两者在 InteractionController 里共用烟花冷却。

import { CONFIG } from "../../config.js";

export class SurpriseDetector {
  constructor() {
    this.active = false;   // 已触发、等待嘴巴闭上回落
    this.holdSince = 0;    // 嘴巴开始持续张开的时间戳
    this.lastFire = -Infinity;
  }

  update(ctx) {
    const { scene, now } = ctx;
    const events = [];
    const face = scene.face;
    const jaw = face?.jawOpen ?? 0;

    const cond = jaw >= CONFIG.surprise.jawOpenAt;
    const rearm = jaw <= CONFIG.surprise.rearmJaw;

    if (!this.active) {
      if (cond) {
        if (!this.holdSince) this.holdSince = now;
        if (
          now - this.holdSince >= CONFIG.surprise.minHoldMs &&
          now - this.lastFire >= CONFIG.surprise.cooldownMs
        ) {
          this.active = true;
          this.lastFire = now;
          this.holdSince = 0;
          events.push({ type: "surprise", pos: face ? { ...face.center } : null });
        }
      } else {
        this.holdSince = 0;
      }
    } else if (rearm) {
      this.active = false;
    }

    return { events, surpriseActive: this.active, eyeWide: face?.eyeWide ?? 0, jawOpen: jaw };
  }
}
