// 问号编组 (CONFUSED)：直接使用预排版的整排问号 PNG
// （assets/confused/qrow-big.png = 一排 3 个大问号，qrow-small.png = 一排 4 个小问号，
// 间距由素材本身保证），flat 平涂染色（形状来自 alpha，无渐变），trim 裁掉透明边距。
// 编组标记为 behindPerson：绘制在人物图层之下，满屏飘过、遇到人物从背后经过不被遮挡。
// 从屏幕最右侧进入、匀速向左横穿整个屏幕，完全离开左侧边缘后结束。
// 出场延迟由 controller 编排（延迟期间不计寿命、不出现在画面中）。

import { FxElement } from "../element.js";
import { rand, pick } from "../../core/math.js";
import { getAssetSprite } from "../asset-library.js";

// 群组尺寸档位（size = 整排问号的半宽 px）与可用素材：
// 中型是画面主体，小型填充空白，大型点缀层次（数量配比 25/55/20 在 controller 分配）。
// 同组只用一张素材、一个尺寸；缩放按素材原始比例，保持像素轮廓清晰。
const SIZE_CLASS = {
  s: { size: [48, 64], assets: ["qrow-small"] },
  m: { size: [82, 104], assets: ["qrow-small", "qrow-big"] },
  l: { size: [96, 112], assets: ["qrow-big"] },
};

export class QuestionGroupElement extends FxElement {
  /**
   * @param {object} opts
   * @param {number[]} opts.hues 本次触发的专属配色（2 个色相）
   * @param {"s"|"m"|"l"} [opts.sizeClass] 群组尺寸档位（默认中）
   * @param {number} [opts.delay] 出场延迟 ms
   */
  constructor(opts = {}) {
    const cls = SIZE_CLASS[opts.sizeClass] ?? SIZE_CLASS.m;
    // 横穿速度：快速飘过 + 组间速度差大，飘行中彼此距离越拉越开
    const speed = rand(280, 400);
    super({
      size: rand(...cls.size), // 整排问号的半宽（trim 后即内容宽度）
      duration: 1e9,           // 首帧按「完全离开屏幕」的实际路程计算
      fadeIn: 0.04,
      fadeOut: 0,
      mood: "CONFUSED",
      ...opts,
    });

    this.hue = pick(opts.hues ?? [335, 55]);
    this.assetId = pick(cls.assets);
    this.vel = { x: -speed, y: 0 };
    this.delay = opts.delay ?? 0; // 出场延迟：期间不计寿命、不出现在画面中
    this.lifeReady = false;
    this.behindPerson = true;     // 在人物图层之下飘过（遇到人物从背后经过）
  }

  update(dt, scene, now) {
    if (this.delay > 0) {
      this.delay -= dt * 1000; // 出场延迟：不计寿命、保持隐形
      return;
    }
    const sprite = getAssetSprite(this.assetId, this.hue);
    const halfW = sprite ? sprite.width / 2 : 60;
    if (!this.lifeReady) {
      // 首帧：按「完全离开屏幕左侧」的实际路程计算寿命
      this.lifeReady = true;
      const W = scene?.frame?.w ?? 1280;
      const exitDist = W + halfW + this.pos.x; // 已在右画外，路程 = 全宽 + 余量
      this.duration = Math.max(2500, (exitDist / -this.vel.x) * 1000);
      this.fadeOut = 260 / this.duration; // 完全离开画面后才淡出（画面内始终完整可见）
    }
    super.update(dt, scene, now);
    // 完全离开屏幕左侧 -> 本次互动结束
    if (this.pos.x + halfW < -12) this.done = true;
  }

  onUpdate(dt) {
    this.pos.x += this.vel.x * dt;
  }

  paint(ctx) {
    const sprite = getAssetSprite(this.assetId, this.hue);
    if (!sprite) return; // 素材库未就绪
    const scale = (this.size * 2) / Math.max(sprite.width, sprite.height);
    ctx.drawImage(sprite, -sprite.width * scale / 2, -sprite.height * scale / 2,
      sprite.width * scale, sprite.height * scale);
  }
}
