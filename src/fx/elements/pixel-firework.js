// SURPRISED 像素烟花：三阶段动画（上升 → 由内向外像素扩散 → 停留淡出）。
//   上升：程序绘制的像素方块阶梯尾迹，从屏幕底部快速升到目标点；
//   扩散：把选中的烟花 PNG 按源像素分块、按「块到烟花中心的距离」排序，
//         随进度把块逐步画到揭示画布上 —— 由内向外显现，全程使用原素材
//         像素，不重绘形状、不做擦除动画；完整后直接绘制原素材画布；
//   结束：完整图案停留（时长见构造参数）后由基类 alpha 在末段淡出，
//         结束后由 FxLayer 回收。
// 颜色：生成时从明亮色相池随机取一种，经素材库按亮度重构换色
// （保留线条与明暗层次，只换色相），整段动画保持一致。

import { FxElement } from "../element.js";
import { CONFIG } from "../../config.js";
import { rand, pick } from "../../core/math.js";
import { getAssetSprite, FW_ASSET_IDS } from "../asset-library.js";

export const FW_HUES = [55, 325, 285, 215, 170]; // 黄 / 粉 / 紫 / 蓝 / 青绿

// 每种素材的分块揭示数据（几何与色相无关，全局缓存，全部烟花复用）
const blockCache = new Map();

function getBlocks(assetId) {
  let info = blockCache.get(assetId);
  if (info) return info;
  const sprite = getAssetSprite(assetId, null); // 原始素材（几何）
  if (!sprite) return null;
  const w = sprite.width;
  const h = sprite.height;
  const px = sprite.getContext("2d").getImageData(0, 0, w, h).data;
  const bs = Math.max(3, Math.round(Math.min(w, h) / 48)); // 像素块边长（源像素）
  const cols = Math.ceil(w / bs);
  const rows = Math.ceil(h / bs);
  const blocks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * bs;
      const y0 = r * bs;
      const x1 = Math.min(w, x0 + bs);
      const y1 = Math.min(h, y0 + bs);
      let opaque = false;
      for (let y = y0; y < y1 && !opaque; y++) {
        for (let x = x0; x < x1; x++) {
          if (px[(y * w + x) * 4 + 3] > 40) { opaque = true; break; }
        }
      }
      if (!opaque) continue;
      blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  // 扩散中心用不透明像素质心（比包围盒中心更贴合烟花的放射结构），
  // 显现顺序 = 块中心到质心的距离，由近及远
  let sx = 0;
  let sy = 0;
  for (const b of blocks) {
    sx += b.x + b.w / 2;
    sy += b.y + b.h / 2;
  }
  const cx = blocks.length ? sx / blocks.length : w / 2;
  const cy = blocks.length ? sy / blocks.length : h / 2;
  for (const b of blocks) b.r = Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy);
  blocks.sort((a, b) => a.r - b.r); // 由内向外的显现顺序
  info = { blocks, w, h };
  blockCache.set(assetId, info);
  return info;
}

export class PixelFireworkElement extends FxElement {
  /**
   * @param {object} opts
   * @param {{x:number,y:number}} opts.start  发射点（屏幕底部）
   * @param {{x:number,y:number}} opts.target 绽放点（屏幕上部）
   * @param {number} [opts.delay] 错峰发射延迟 ms（期间不计寿命、不显示）
   */
  constructor(opts = {}) {
    // 各阶段时长范围集中在 config.js 的 surpriseFx（可调）
    const [rMin, rMax] = CONFIG.surpriseFx.riseMs;
    const [eMin, eMax] = CONFIG.surpriseFx.revealMs;
    const [hMin, hMax] = CONFIG.surpriseFx.holdMs;
    const [fMin, fMax] = CONFIG.surpriseFx.fadeMs;
    const riseMs = rand(rMin, rMax);   // 阶段一：上升
    const revealMs = rand(eMin, eMax); // 阶段二：像素扩散
    const holdMs = rand(hMin, hMax);   // 阶段三：完整绽放停留
    const fadeMs = rand(fMin, fMax);   // 停留结束后淡出
    const duration = riseMs + revealMs + holdMs + fadeMs;
    super({
      pos: { ...(opts.start ?? { x: 640, y: 720 }) },
      size: opts.size ?? 90, // 半宽，保持素材原始宽高比缩放
      duration,
      fadeIn: 0.02,
      fadeOut: fadeMs / duration, // 只有停留结束才进入淡出
      mood: "SURPRISED",
    });
    this.start = { ...(opts.start ?? { x: 640, y: 720 }) };
    this.target = { ...(opts.target ?? { x: 640, y: 360 }) };
    this.riseMs = riseMs;
    this.revealMs = revealMs;
    this.phase = "rise";
    this.hue = opts.hue ?? pick(FW_HUES);
    this.assetId = opts.assetId ?? pick(FW_ASSET_IDS);
    this.delay = opts.delay ?? 0;
    this.info = null;      // 分块揭示数据（到达目标点时构建）
    this.revealCv = null;  // 揭示画布（源分辨率，增量绘制）
    this.revealCtx = null;
    this.revealed = 0;
  }

  update(dt, scene, now) {
    if (this.delay > 0) {
      this.delay -= dt * 1000;
      return;
    }
    super.update(dt, scene, now);
    if (this.done) return;
    const age = this.age;

    if (this.phase === "rise") {
      const p = Math.min(1, age / this.riseMs);
      const e = 1 - (1 - p) * (1 - p); // easeOut：出膛快、临近目标减速
      this.pos.x = this.start.x + (this.target.x - this.start.x) * e;
      this.pos.y = this.start.y + (this.target.y - this.start.y) * e;
      if (p >= 1) this.enterReveal();
    } else if (this.phase === "reveal") {
      const info = this.info;
      const p = Math.min(1, (age - this.riseMs) / this.revealMs);
      const count = Math.max(1, Math.ceil(info.blocks.length * p));
      const g = this.revealCtx;
      const sprite = getAssetSprite(this.assetId, this.hue);
      for (let i = this.revealed; i < count; i++) {
        const b = info.blocks[i];
        g.drawImage(sprite, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
      }
      this.revealed = count;
      if (p >= 1) this.phase = "hold";
    }
    // hold：位置不变、完整显示；淡出由 alpha() 在 duration 末段完成
  }

  enterReveal() {
    this.phase = "reveal";
    this.pos.x = this.target.x;
    this.pos.y = this.target.y;
    this.info = getBlocks(this.assetId);
    this.revealCv = document.createElement("canvas");
    this.revealCv.width = this.info.w;
    this.revealCv.height = this.info.h;
    this.revealCtx = this.revealCv.getContext("2d");
    this.revealed = 0;
  }

  paint(ctx) {
    if (this.phase === "rise") {
      this.drawTrail(ctx);
      return;
    }
    if (!this.info) return;
    // 扩散中显示揭示画布（已显现的像素块）；完整后直接绘制原素材
    const src = this.phase === "hold" ? getAssetSprite(this.assetId, this.hue) : this.revealCv;
    if (!src) return;
    const scale = (this.size * 2) / Math.max(src.width, src.height);
    ctx.drawImage(src, -src.width * scale / 2, -src.height * scale / 2,
      src.width * scale, src.height * scale);
  }

  /** 上升尾迹：规则方形像素块组成的阶梯轨迹（纯色块，无渐变无拖影） */
  drawTrail(ctx) {
    const px = Math.max(5, this.size * 0.1);
    const blocks = 8;
    for (let k = 0; k < blocks; k++) {
      const stepX = ((k >> 1) % 2 === 0) ? 0 : px * 0.5; // 阶梯转折
      const x = this.pos.x + stepX;
      const y = this.pos.y + k * px * 1.2;
      ctx.fillStyle = k % 2 ? `hsl(${this.hue}, 85%, 60%)` : `hsl(${this.hue}, 85%, 42%)`;
      ctx.fillRect(Math.round(x - px / 2), Math.round(y - px / 2), px, px);
    }
    ctx.fillStyle = `hsl(${this.hue}, 95%, 72%)`; // 弹头亮块
    ctx.fillRect(Math.round(this.pos.x - px / 2), Math.round(this.pos.y - px / 2), px, px);
  }
}
