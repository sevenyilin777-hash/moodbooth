// Gesture: 张开手掌 (HAPPY)
// 单只手 伸直手指数 >= 4 判定为张开；经 N 帧防抖后，
// “从非张开 -> 张开”的上升沿发一次事件。
// 持续张开的状态通过 states.openHands 暴露，供控制器周期性生成花朵/星星。

import { CONFIG } from "../../config.js";

export class OpenPalmDetector {
  constructor() {
    // id -> { count, state }
    this.deb = new Map();
  }

  update(ctx) {
    const { scene } = ctx;
    const events = [];
    const openHands = [];

    for (const hand of scene.hands) {
      const d = this.deb.get(hand.id) ?? { count: 0, state: false };
      const raw = hand.open;
      d.count = raw === d.state ? 0 : d.count + 1;
      let justOpened = false;
      if (d.count >= CONFIG.hand.debounceFrames) {
        justOpened = raw && !d.state; // 防抖确认的这一帧正好是张开
        d.state = raw;
        d.count = 0;
      }
      this.deb.set(hand.id, d);

      if (d.state) {
        openHands.push({ id: hand.id, palm: { ...hand.palm } });
        if (justOpened) {
          events.push({ type: "palm-open", handId: hand.id, pos: { ...hand.palm } });
        }
      }
    }

    return { events, openHands };
  }
}
