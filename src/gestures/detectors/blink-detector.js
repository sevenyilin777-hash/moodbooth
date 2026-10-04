// Gesture: 眨眼 (SAD)
// 用 FaceLandmarker blendshape (eyeBlinkLeft/Right) 做 滞回 判定：
// 睁 -> 闭 -> 睁 记为一次眨眼，只在“重新睁开”的瞬间发事件。

import { CONFIG } from "../../config.js";

export class BlinkDetector {
  constructor() {
    // 每只眼睛: "open" | "closed" | null(未知)
    this.state = { left: null, right: null };
    this.lastFire = { left: -Infinity, right: -Infinity };
  }

  update(ctx) {
    const { scene, now } = ctx;
    const events = [];
    const face = scene.face;

    for (const side of ["left", "right"]) {
      if (!face) { this.state[side] = null; continue; }
      const blink = face.eyes[side].blink; // 0=睁开 1=闭合
      const st = this.state[side];

      if (st === null) {
        this.state[side] = blink > CONFIG.blink.closedAt ? "closed" : "open";
      } else if (st === "open" && blink > CONFIG.blink.closedAt) {
        this.state[side] = "closed";
      } else if (st === "closed" && blink < CONFIG.blink.openAt) {
        this.state[side] = "open";
        if (now - this.lastFire[side] >= CONFIG.blink.cooldownMs) {
          this.lastFire[side] = now;
          events.push({
            type: "blink",
            eye: side,
            pos: { ...face.eyes[side].pos },
          });
        }
      }
    }
    return events;
  }
}
