// Gesture: 握拳挥动 (ANGRY)
// 拳头状态下检测手掌的明显快速晃动/挥动：平滑速度超过阈值视为一次有效挥动。
// 普通握拳（静止或缓慢移动）不触发；持续挥动时按冷却间隔重复触发。

import { CONFIG } from "../../config.js";

export class FistShakeDetector {
  constructor() {
    this.last = new Map();     // id -> { x, y, t }（上一帧拳位置）
    this.speed = new Map();    // id -> 平滑速度（px/s）
    this.lastFire = new Map(); // id -> ts（冷却）
  }

  update(ctx) {
    const { scene, now, dt } = ctx;
    const events = [];

    for (const hand of scene.hands) {
      if (!hand.fist || !hand.palm) {
        this.speed.delete(hand.id);
        this.last.delete(hand.id);
        continue;
      }
      const prev = this.last.get(hand.id);
      this.last.set(hand.id, { x: hand.palm.x, y: hand.palm.y, t: now });

      // 位置断层（手刚出现/丢失重现）不算速度
      let raw = 0;
      if (prev && now - prev.t > 0 && now - prev.t < 150) {
        raw = Math.hypot(hand.palm.x - prev.x, hand.palm.y - prev.y) / ((now - prev.t) / 1000);
      }
      const sp = this.speed.get(hand.id) ?? 0;
      const sv = sp + (raw - sp) * Math.min(1, dt * 12); // EMA 平滑，滤单帧抖动
      this.speed.set(hand.id, sv);

      const lastFire = this.lastFire.get(hand.id) ?? -Infinity;
      if (sv >= CONFIG.angry.shakeSpeed && now - lastFire >= CONFIG.angry.cooldownMs) {
        this.lastFire.set(hand.id, now);
        events.push({ type: "fist-shake", handId: hand.id, pos: { ...hand.palm } });
      }
    }
    return events;
  }
}
