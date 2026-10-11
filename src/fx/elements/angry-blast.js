// 爆炸纹样 (ANGRY)：直接使用上传的 PNG 素材（assets/angry/blast-*.png，
// 原始红色像素风，不换色、不重绘）。
//
// 人物是爆炸中心，拳头只是触发器。每颗纹样摆在人物周围 8 个罗盘方向之一，
// 朝向 = 「人物中心 -> 图案位置」的方向，用离散变换表实现（禁止任意角度旋转）：
//   素材固有朝向为画布右上（↗）。
//   上=逆时针45° / 右上=原始 / 右=顺时针45° / 右下=垂直镜像（↗->↘）/
//   下=顺时针135° / 左下=水平+垂直镜像（↗->↙） / 左=逆时针135° / 左上=水平镜像（↗->↖）
// 绘制时关闭平滑（最近邻采样），旋转后仍保持像素硬边。
//
// 节奏：迸发（130ms 快速放大 + 沿径向外冲后停止）
//   -> 高频小幅度震动（320-480ms，双正弦叠加出不规则颤动）
//   -> 短暂停留 -> 快速淡出（约 340ms，附带轻微缩小）。总寿命约 1.2-1.5s。

import { FxElement } from "../element.js";
import { easeOutCubic } from "../../animation/easing.js";
import { rand, pick } from "../../core/math.js";
import { getAssetSprite } from "../asset-library.js";

const BLAST_ASSETS = ["blast-1", "blast-2", "blast-3", "blast-4"];
const BURST_MS = 130;     // 迸发时长
const FADE_MS = 340;      // 淡出时长
const BURST_OUT = 55;     // 迸发时沿径向外冲的距离（px）

// 8 个罗盘方向的离散变换（索引即 controller 传入的 dirIndex，0=上顺时针到 7=左上）
const DIR_TRANSFORMS = [
  { theta: -90, rot: -Math.PI / 4, flipH: false, flipV: false },  // 上
  { theta: -45, rot: 0, flipH: false, flipV: false },             // 右上（素材原始方向）
  { theta: 0, rot: Math.PI / 4, flipH: false, flipV: false },     // 右
  { theta: 45, rot: 0, flipH: false, flipV: true },               // 右下（垂直镜像）
  { theta: 90, rot: Math.PI * 0.75, flipH: false, flipV: false }, // 下
  { theta: 135, rot: 0, flipH: true, flipV: true },               // 左下（水平+垂直镜像）
  { theta: 180, rot: -Math.PI * 0.75, flipH: false, flipV: false },// 左
  { theta: -135, rot: 0, flipH: true, flipV: false },             // 左上（水平镜像）
];

export class AngryBlastElement extends FxElement {
  /**
   * @param {object} opts
   * @param {number} opts.dirIndex 罗盘方向索引 0-7（0=上，顺时针到 7=左上）
   */
  constructor(opts = {}) {
    const shakeMs = rand(320, 480);
    const holdMs = rand(380, 560);
    const duration = BURST_MS + shakeMs + holdMs + FADE_MS;
    super({
      size: rand(150, 210), // 半最长边：可见纹样约 180-250px
      duration,
      fadeIn: 0.02,                       // 瞬间出现
      fadeOut: FADE_MS / duration,        // 末段快速淡出
      mood: "ANGRY",
      ...opts,
    });

    this.assetId = pick(BLAST_ASSETS);
    this.dirIndex = ((opts.dirIndex ?? 1) % 8 + 8) % 8;
    this.base = { x: this.pos.x, y: this.pos.y }; // controller 算好的摆放位置
    const t = DIR_TRANSFORMS[this.dirIndex];
    this.dir = { x: Math.cos(t.theta * Math.PI / 180), y: Math.sin(t.theta * Math.PI / 180) };
    this.shakeEnd = BURST_MS + shakeMs;
    this.fadeStart = duration - FADE_MS;
    this.p1 = rand(10);
    this.p2 = rand(10);
  }

  onUpdate(dt, now) {
    const t = this.age;

    // 迸发：快速放大 + 沿径向外冲，冲完即停（不持续漂移）
    const k = easeOutCubic(Math.min(1, t / BURST_MS));
    let scale = 0.35 + 0.65 * k;

    // 高频小幅度震动：双正弦叠加出不规则颤动，末段 120ms 内收敛
    let ox = 0;
    let oy = 0;
    if (t >= BURST_MS * 0.7 && t < this.shakeEnd) {
      const amp = Math.min(1, (this.shakeEnd - t) / 120) * 3.6;
      ox = (Math.sin(now * 0.09 + this.p1) + Math.sin(now * 0.037 + this.p2) * 0.6) * amp;
      oy = (Math.cos(now * 0.083 + this.p2) + Math.sin(now * 0.041 + this.p1) * 0.6) * amp;
    }

    this.pos.x = this.base.x + this.dir.x * BURST_OUT * k + ox;
    this.pos.y = this.base.y + this.dir.y * BURST_OUT * k + oy;

    // 消失：快速淡出的同时轻微缩小
    const fadeP = Math.max(0, Math.min(1, (t - this.fadeStart) / FADE_MS));
    this.scale = scale * (1 - 0.15 * fadeP);
  }

  paint(ctx) {
    const sprite = getAssetSprite(this.assetId);
    if (!sprite) return; // 素材库未就绪
    const t = DIR_TRANSFORMS[this.dirIndex];
    ctx.imageSmoothingEnabled = false; // 离散旋转也保持像素硬边
    ctx.rotate(t.rot);
    if (t.flipH || t.flipV) ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1);
    const s = this.size * 2;
    const scale = s / Math.max(sprite.width, sprite.height);
    ctx.drawImage(sprite, -sprite.width * scale / 2, -sprite.height * scale / 2,
      sprite.width * scale, sprite.height * scale);
  }
}
