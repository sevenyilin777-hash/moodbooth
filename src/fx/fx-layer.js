// 特效图层：持有所有活动元素，负责生成 / 更新 / 回收 / 绘制。

import { CONFIG } from "../config.js";

export class FxLayer {
  constructor() {
    this.elements = [];
  }

  spawn(el) {
    this.elements.push(el);
    if (this.elements.length > CONFIG.fx.maxElements) {
      this.elements.shift();
    }
    return el;
  }

  update(dt, scene, now) {
    for (const el of this.elements) el.update(dt, scene, now);
    this.elements = this.elements.filter((el) => !el.done && !el.dead);
  }

  draw(ctx) {
    for (const el of this.elements) el.draw(ctx);
  }

  clear() {
    this.elements = [];
  }

  /** 按情绪统计场上元素，供 HUD 显示 */
  summary() {
    const map = new Map();
    for (const el of this.elements) {
      if (!el.mood) continue;
      map.set(el.mood, (map.get(el.mood) ?? 0) + 1);
    }
    return map;
  }
}
