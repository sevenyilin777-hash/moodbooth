// Gesture: 握拳 (ANGRY)
// 伸直手指数 <= 1 判定为拳；上升沿发一次事件。
// 持续握拳不会重复触发 —— 松拳后再次握拳才会下一次。

import { CONFIG } from "../../config.js";

export class FistDetector {
  constructor() {
    this.deb = new Map(); // id -> { count, state }
  }

  update(ctx) {
    const { scene } = ctx;
    const events = [];
    const fistHands = [];

    for (const hand of scene.hands) {
      const d = this.deb.get(hand.id) ?? { count: 0, state: false };
      const raw = hand.fist;
      d.count = raw === d.state ? 0 : d.count + 1;
      let justFisted = false;
      if (d.count >= CONFIG.hand.debounceFrames) {
        justFisted = raw && !d.state;
        d.state = raw;
        d.count = 0;
      }
      this.deb.set(hand.id, d);

      if (d.state) {
        fistHands.push({ id: hand.id, palm: { ...hand.palm } });
        if (justFisted) {
          events.push({ type: "fist", handId: hand.id, pos: { ...hand.palm } });
        }
      }
    }

    return { events, fistHands };
  }
}
