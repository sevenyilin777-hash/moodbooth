// Gesture: 手指指到下巴 (CONFUSED)
// 任一手的 拇指/食指/中指 指尖进入 下巴周围 radius = 0.55 * 脸宽 的圆内
// 即触发，弯曲线从下巴缓慢生长并轻微抖动。
// 上升沿 + 冷却：手指停在下巴处不会连续生成，移开再指才下一次。
// 手靠近下巴同时会抑制 HAPPY/ANGRY 的误判（手在脸上时姿态不可信）。

import { CONFIG } from "../../config.js";
import { dist } from "../../core/math.js";

export class ChinTouchDetector {
  constructor() {
    this.near = false;     // 上一帧手指是否在下巴附近
    this.lastFire = -Infinity;
  }

  update(ctx) {
    const { scene, now } = ctx;
    const events = [];
    const face = scene.face;

    let near = false;
    let pos = null;
    if (face) {
      const radius = face.faceWidth * CONFIG.chin.radiusOfFaceWidth;
      for (const hand of scene.hands) {
        for (const tip of Object.values(hand.fingertips)) {
          if (dist(tip, face.chin) < radius) {
            near = true;
            pos = { ...face.chin };
            break;
          }
        }
        if (near) break;
      }
    }

    if (near && !this.near && now - this.lastFire >= CONFIG.chin.cooldownMs) {
      this.lastFire = now;
      events.push({ type: "chin", pos });
    }
    this.near = near;

    const tiltDeg = face ? (Math.abs(face.roll) * 180) / Math.PI : 0;
    return { events, chinNear: near, chinReady: near, tiltDeg };
  }
}
