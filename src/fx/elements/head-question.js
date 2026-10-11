// 头顶大问号 (CONFUSED)：使用 疑问.png（保持原始红色，不换色、不重绘）。
// 锚定在人物头顶并跟随头部移动（脸丢失时停在最后位置）；
// 出现时快速放大并稍微过冲，之后缓慢旋转 + 非常轻微的晃动，
// 与背景问号群组是两个独立系统。寿命约 3.5-4.5s，末段淡出。

import { FxElement } from "../element.js";
import { easeOutBack } from "../../animation/easing.js";
import { rand } from "../../core/math.js";
import { getAssetSprite } from "../asset-library.js";

export class HeadQuestionElement extends FxElement {
  constructor(opts = {}) {
    super({
      size: rand(120, 150),        // 明显大于背景问号，是 CONFUSED 的视觉中心
      duration: rand(3500, 4500),
      fadeIn: 0.04,
      fadeOut: 0.18,
      mood: "CONFUSED",
      ...opts,
    });

    this.assetId = "head-q";
    this.popMs = 180;                                             // 快速放大时长
    this.spin = rand(0.35, 0.55) * (Math.random() < 0.5 ? -1 : 1); // 缓慢旋转（rad/s）
    this.p1 = rand(10);
  }

  onUpdate(dt, now) {
    // 基类已用锚点刷新 pos（脸丢失时停在最后头顶位置），这里只叠加轻微晃动
    this.pos.x += Math.sin(this.age * 0.002 + this.p1) * 6;
    this.pos.y += Math.sin(this.age * 0.0016 + this.p1 * 2) * 3;
    // 出现：快速放大并稍微过冲
    this.scale = 0.3 + 0.7 * easeOutBack(Math.min(1, this.age / this.popMs));
    // 缓慢旋转
    this.rotation = this.spin * this.age * 0.001;
  }

  paint(ctx) {
    const sprite = getAssetSprite(this.assetId);
    if (!sprite) return; // 素材库未就绪
    const scale = (this.size * 2) / Math.max(sprite.width, sprite.height);
    ctx.drawImage(sprite, -sprite.width * scale / 2, -sprite.height * scale / 2,
      sprite.width * scale, sprite.height * scale);
  }
}
