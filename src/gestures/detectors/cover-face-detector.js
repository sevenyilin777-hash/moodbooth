// Gesture: 双手遮脸 (SHY)
// 两只手的手掌中心同时落入（放大后的）脸部包围盒，持续 minHoldMs 后进入状态。
// 脸被遮挡时 FaceLandmarker 通常仍能输出，但为保险起见缓存最近一次脸框（<900ms 内有效）。
// 状态期间 states.coverFace = true，控制器周期性在脸部中心生成扩散圆环；
// 结束时发 cover-end，让已有圆环加速淡出。

import { CONFIG } from "../../config.js";

export class CoverFaceDetector {
  constructor() {
    this.holdSince = 0;   // 条件开始持续的时间戳；0 表示未持续
    this.active = false;
  }

  insideBox(p, box, marginX, marginY) {
    return (
      p.x >= box.x - marginX && p.x <= box.x + box.w + marginX &&
      p.y >= box.y - marginY && p.y <= box.y + box.h + marginY
    );
  }

  update(ctx) {
    const { scene, mem, now } = ctx;
    const events = [];

    const face = scene.face ?? (now - mem.lastFaceTs < 900 ? mem.lastFace : null);
    const bothHands = scene.hands.length >= 2;

    let covering = false;
    let anchor = null;
    if (face && bothHands) {
      const marginX = face.bbox.w * CONFIG.coverFace.margin;
      const marginY = face.bbox.h * CONFIG.coverFace.margin;
      const [a, b] = scene.hands;
      covering =
        this.insideBox(a.palm, face.bbox, marginX, marginY) &&
        this.insideBox(b.palm, face.bbox, marginX, marginY);
      anchor = { ...face.center };
    }

    if (covering && !this.active) {
      if (!this.holdSince) this.holdSince = now;
      if (now - this.holdSince >= CONFIG.coverFace.minHoldMs) {
        this.active = true;
        events.push({ type: "cover-start", pos: anchor });
      }
    } else if (!covering && this.active) {
      this.active = false;
      this.holdSince = 0;
      events.push({ type: "cover-end", pos: anchor });
    } else if (!covering) {
      this.holdSince = 0;
    }

    return { events, coverFace: this.active };
  }
}
