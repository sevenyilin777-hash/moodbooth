// 特效图层：持有所有活动元素，负责生成 / 更新 / 回收 / 绘制。

import { CONFIG } from "../config.js";

export class FxLayer {
  constructor() {
    this.elements = [];
  }

  spawn(el) {
    this.elements.push(el);
    if (this.elements.length > CONFIG.fx.maxElements) {
      // 优先淘汰非永久元素（如已堆积的水滴永久保留，不参与淘汰）
      const idx = this.elements.findIndex((e) => !e.permanent);
      this.elements.splice(idx >= 0 ? idx : 0, 1);
    }
    return el;
  }

  update(dt, scene, now) {
    for (const el of this.elements) el.update(dt, scene, now);
    this.elements = this.elements.filter((el) => !el.done && !el.dead);
  }

  /**
   * 绘制所有元素。标记 behindPerson 的元素画到 backCtx（人物图层之下，
   * 从人的背后飘过），其余画到 ctx（最上层）。backCtx 为空时全部画到前景。
   */
  draw(ctx, backCtx = null) {
    for (const el of this.elements) {
      if (el.behindPerson && backCtx) el.draw(backCtx);
      else el.draw(ctx);
    }
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
