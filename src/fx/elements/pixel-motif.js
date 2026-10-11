// HAPPY 视觉素材：直接使用上传的 PNG 贴图（assets/happy/），
// 由素材库（asset-library.js）负责加载、预缩放与随机换色。
// 元素只决定：选哪张贴图、什么颜色（色相）、多大、出现在哪。
// 像素结构与轮廓完全来自原始素材，不做几何重绘。

import { FxElement } from "../element.js";
import { easeOutBack } from "../../animation/easing.js";
import { driftWave } from "../../animation/behaviors.js";
import { rand, pick } from "../../core/math.js";
import { getAssetSprite } from "../asset-library.js";

/** 每类动作可用的素材与尺寸区间（size = 图案半宽） */
const KIND_ASSETS = {
  "flower-l": ["flower-4p", "flower-5p"],
  "flower-m": ["flower-4p", "flower-5p", "flower-small"],
  "flower-s": ["flower-small", "flower-4p"],
  star: ["star-diamond", "star-chunky"],
  dust: ["star-diamond", "star-chunky"],
};

const KIND_SIZE = {
  "flower-l": [56, 84],
  "flower-m": [34, 50],
  "flower-s": [20, 30],
  star: [24, 38],
  dust: [10, 18],
};

// 手掌带动花卉的物理参数：
// PUSH_RADIUS   影响半径（px）：只有这个范围内的花才被掌心带动
// PUSH_COUPLE   花速向「掌心速度×距离权重」收敛的刚度（/s）
// PUSH_FRICTION 掌心离开/停下后的阻尼（/s）：花滑行一小段就停在新位置
// PUSH_VMAX     速度上限（px/s）：防止手部检测抖动把花弹飞
const PUSH_RADIUS = 115;
const PUSH_COUPLE = 9;
const PUSH_FRICTION = 3.2;
const PUSH_VMAX = 640;
const EDGE_MARGIN = 30;

export class PixelMotifElement extends FxElement {
  /**
   * @param {object} opts
   * @param {string} [opts.kind] 'flower-l' | 'flower-m' | 'flower-s' | 'star' | 'dust'
   */
  constructor(opts = {}) {
    const kind = opts.kind ?? "flower-m";
    const pool = KIND_ASSETS[kind] ?? KIND_ASSETS["flower-m"];
    const assetId = pick(pool);

    super({
      size: rand(...KIND_SIZE[kind] ?? KIND_SIZE["flower-m"]),
      duration: rand(6000, 10000), // 停留 6-10s（独立生命周期）
      fadeIn: 0.03,
      fadeOut: 0.18,               // 最后约 1.1-1.8s 缓慢淡出
      mood: "HAPPY",
      ...opts,
    });

    this.assetId = assetId;
    this.hue = (Math.random() * 360) | 0; // 随机鲜艳色相
    this.popMs = rand(220, 380);          // pixel pop 时长 0.2-0.4s
    this.targetScale = rand(0.9, 1.15);
    this.phase = rand(10);

    // 生成后安家在原地（base），只叠加轻风摆动与倾摆；
    // 手掌不是固定跟随点：只有靠近某朵花时，那朵花才被掌心的移动方向带动，
    // 手掌离开/停下后，花靠阻尼停住，留在被推到的新位置继续摆。
    this.base = { x: this.pos.x, y: this.pos.y };
    this.vel = { x: 0, y: 0 };
    this.palmPrev = new Map(); // handId -> { x, y, t }（算掌心瞬时速度）
    this.palmVel = new Map();  // handId -> 平滑后的掌心速度

    // 左右晃动：每朵幅度/节奏略有差异，生成后一眼可见
    this.swayAmp = rand(7, 12);    // 水平晃动幅度（px，单侧）
    this.swaySpeed = rand(1.0, 1.4); // 晃动节奏（rad/s，周期约 4.5-6.3s）

    // 围绕自身中心的左右倾摆（rocking）：独立的幅度与节奏，与水平晃动错开
    this.rockAmp = rand(0.14, 0.22); // 倾摆幅度（rad，约 8°-12.6°）
    this.rockSpeed = rand(0.8, 1.2); // 倾摆节奏（rad/s，周期约 5.2-7.9s）
  }

  onUpdate(dt, now, scene) {
    const t = now * 0.001;

    // pixel pop：分步放大 + easeOutBack 回弹；pop 后叠加极轻微的呼吸缩放
    const p = Math.min(1, this.age / this.popMs);
    const k = Math.max(0.12, Math.ceil(easeOutBack(p) * 5) / 5);
    this.scale = this.targetScale * k * (1 + Math.sin(t * 0.9 + this.phase) * 0.018);

    // 持续晃动：明显的左右摇摆 + 轻微上下浮，时间驱动，永不完全静止
    const swayX = driftWave(t, { amp: this.swayAmp, speed: this.swaySpeed, phase: this.phase });
    const floatY = driftWave(t, { amp: 3, speed: 0.8, phase: this.phase + 1.3 });
    // 绕自身中心的左右倾摆：独立节奏与相位，和水平晃动叠加出摇曳感
    this.rotation = driftWave(t, { amp: this.rockAmp, speed: this.rockSpeed, phase: this.phase * 2.3 });

    // 手掌带动（只影响靠近的花）
    this.applyPalmPush(dt, now, scene);

    this.pos.x = this.base.x + swayX;
    this.pos.y = this.base.y + floatY;
  }

  /** 手掌靠近时按「掌心速度 × 距离权重」带动花朵；离开后阻尼滑停在新位置 */
  applyPalmPush(dt, now, scene) {
    dt = Math.max(dt, 1e-3);
    for (const h of scene?.hands ?? []) {
      if (!h?.palm) continue;
      const prev = this.palmPrev.get(h.id);
      // 手刚出现 / 丢失后重现：没有可靠速度，从 0 开始
      const raw = prev && now - prev.t < 120
        ? { x: (h.palm.x - prev.x) / dt, y: (h.palm.y - prev.y) / dt }
        : { x: 0, y: 0 };
      this.palmPrev.set(h.id, { x: h.palm.x, y: h.palm.y, t: now });

      const sp = this.palmVel.get(h.id) ?? raw; // 低通滤波，滤掉检测抖动
      const a = 1 - Math.exp(-dt * 14);
      const sv = { x: sp.x + (raw.x - sp.x) * a, y: sp.y + (raw.y - sp.y) * a };
      this.palmVel.set(h.id, sv);

      const d = Math.hypot(this.base.x - h.palm.x, this.base.y - h.palm.y);
      if (d < PUSH_RADIUS) {
        const w = 1 - d / PUSH_RADIUS; // 越近带动越强，半径边缘为 0
        const c = 1 - Math.exp(-dt * PUSH_COUPLE);
        this.vel.x += (sv.x * w - this.vel.x) * c;
        this.vel.y += (sv.y * w - this.vel.y) * c;
      }
    }

    // 阻尼 + 积分：掌心的影响消失后，花滑行一小段就停住
    const damp = Math.exp(-dt * PUSH_FRICTION);
    this.vel.x *= damp;
    this.vel.y *= damp;
    const speed = Math.hypot(this.vel.x, this.vel.y);
    if (speed > PUSH_VMAX) {
      this.vel.x *= PUSH_VMAX / speed;
      this.vel.y *= PUSH_VMAX / speed;
    }
    this.base.x += this.vel.x * dt;
    this.base.y += this.vel.y * dt;

    // 只拦「被推出画面」的运动，不做硬性回拉
    const f = scene?.frame;
    if (f) {
      if (this.base.x < EDGE_MARGIN && this.vel.x < 0) { this.base.x = EDGE_MARGIN; this.vel.x = 0; }
      if (this.base.x > f.w - EDGE_MARGIN && this.vel.x > 0) { this.base.x = f.w - EDGE_MARGIN; this.vel.x = 0; }
      if (this.base.y < EDGE_MARGIN && this.vel.y < 0) { this.base.y = EDGE_MARGIN; this.vel.y = 0; }
      if (this.base.y > f.h - EDGE_MARGIN && this.vel.y > 0) { this.base.y = f.h - EDGE_MARGIN; this.vel.y = 0; }
    }
  }

  paint(ctx) {
    const sprite = getAssetSprite(this.assetId, this.hue);
    if (!sprite) return; // 素材库未就绪
    const s = this.size * 2;
    const scale = s / Math.max(sprite.width, sprite.height);
    const dw = sprite.width * scale;
    const dh = sprite.height * scale;
    ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
  }
}
