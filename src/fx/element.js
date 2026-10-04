// 模块 4：视觉元素基类。
//
// 每个元素有统一生命周期：
//   age 从 0 增长；t = age / duration；
//   alpha = 淡入(前 fadeIn 比例) × 淡出(后 fadeOut 比例)；
//   age >= duration 时 done，被图层回收。
//
// 坐标与变换：draw() 统一做 translate(pos) -> rotate -> scale，
// 子类只需在局部坐标里以 (0,0) 为中心画形状（尺寸参考 this.size）。
//
// 与身体绑定：constructor 传入 anchor(scene) => {x,y}，
// 则每帧位置跟随身体锚点（anchor 返回 null 时停在原地）。
//
// 素材替换：给元素设置 .sprite = new Image()（PNG/SVG 均可），
// 绘制时自动用贴图替代矢量占位图形，缩放/旋转/透明度逻辑不变。

import { smoothstep } from "../animation/easing.js";

export class FxElement {
  constructor({
    pos = { x: 0, y: 0 },
    size = 24,
    color = "#fff",
    duration = 2000,
    fadeIn = 0.15,     // 生命前 15% 淡入
    fadeOut = 0.25,    // 生命后 25% 淡出
    mood = "",
        tag = "",
    composite = null,  // "lighter" 等混合模式
    anchor = null,
    sprite = null,
  } = {}) {
    this.pos = { ...pos };
    this.size = size;
    this.color = color;
    this.duration = duration;
    this.fadeIn = fadeIn;
    this.fadeOut = fadeOut;
    this.mood = mood;
    this.tag = tag;
    this.composite = composite;
    this.anchor = anchor;
    this.sprite = sprite;

    this.age = 0;
    this.scale = 1;
    this.rotation = 0;
    this.done = false;
    this.dead = false; // update() 内可自行提前判死
  }

  get t() {
    return this.duration > 0 ? Math.min(1, this.age / this.duration) : 1;
  }

  /** 提前进入淡出（例如手势结束、静止状态退出） */
  beginFadeOut(ms = 600) {
    const remain = Math.min(ms, this.duration - this.age);
    if (remain <= 0) {
      this.done = true;
      return;
    }
    this.duration = this.age + remain;
    this.fadeOut = remain / this.duration;
  }

  alpha() {
    const t = this.t;
    const aIn = this.fadeIn > 0 ? smoothstep(0, this.fadeIn, t) : 1;
    const aOut = this.fadeOut > 0 ? 1 - smoothstep(1 - this.fadeOut, 1, t) : 1;
    return aIn * aOut;
  }

  update(dt, scene, now) {
    if (this.done) return;
    this.age += dt * 1000;
    if (this.age >= this.duration) {
      this.done = true;
      return;
    }
    if (this.anchor) {
      const p = this.anchor(scene);
      if (p) {
        this.pos.x = p.x;
        this.pos.y = p.y;
      }
    }
    this.onUpdate(dt, now, scene);
  }

  /** 子类动画逻辑写这里 */
  onUpdate(dt, now) {}

  draw(ctx) {
    const a = this.alpha();
    if (a <= 0.003) return;
    ctx.save();
    if (this.composite) ctx.globalCompositeOperation = this.composite;
    ctx.globalAlpha = a;
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.rotation);
    ctx.scale(this.scale, this.scale);
    if (this.sprite && this.sprite.complete && this.sprite.naturalWidth > 0) {
      this.drawSprite(ctx);
    } else {
      this.paint(ctx);
    }
    ctx.restore();
  }

  drawSprite(ctx) {
    // 贴图按 contain 方式放进 2*size 的方框
    const s = this.sprite;
    const ar = s.naturalWidth / s.naturalHeight;
    let w = this.size * 2;
    let h = w;
    if (ar > 1) h = w / ar;
    else w = h * ar;
    ctx.drawImage(s, -w / 2, -h / 2, w, h);
  }

  /** 子类矢量占位图形写这里（局部坐标，中心为原点） */
  paint(ctx) {}
}
