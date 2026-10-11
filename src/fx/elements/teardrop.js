// 水滴 (SAD)：直接使用上传的 PNG 素材（assets/sad/drop-*.png，不换色、不重绘）。
//
// 生命周期：眨眼 -> 在对应眼睛位置生成（尺寸/旋转/漂移在生成瞬间随机并立即锁定）
//   -> 受重力下落（轻微水平漂移，不改尺寸）
//   -> 落到屏幕底部或其他水滴上：圆形碰撞、不穿透、不明显重叠，
//      沿边缘自然滑落寻找支撑点 -> 速度渐停 -> 停稳（settled）
//   -> 形成不规则的多层小球堆；停留一段时间后淡出消失，位置随之释放。
//
// 堆积物理（世界步进器）：所有存活水滴进入同一个小型二维求解器——
//   每个物理子步里：重力积分 -> 成对圆形碰撞（位置修正按质量分配：停稳的水滴
//   视为无限质量不动，下落中的两颗各承担一半；法向加少量冲量消除相对速度，
//   切向保留 => 沿边缘自然滑落）-> 地面约束 -> 「有支撑 + 低速度持续 0.45s」
//   即停稳。固定小步长积分，快速下落也不会穿透堆顶。

import { FxElement } from "../element.js";
import { rand, pick } from "../../core/math.js";
import { getAssetSprite } from "../asset-library.js";

const DROP_ASSETS = ["drop-1", "drop-2", "drop-3"];
const ALL = new Set();       // 所有存活的水滴，进入同一个世界求解器
const SUBSTEP = 0.02;        // 物理积分步长上限（s）：防高速穿透
const GRAVITY = 950;
const VMAX = 560;
const FLOOR_FRICTION = 4;    // 地面接触摩擦（/s）
const EDGE_FRICTION = 2.5;   // 沿其他水滴边缘滑动的摩擦（/s）
const SETTLE_SPEED = 26;     // 低于该速度且有支撑，持续一段时间即停稳
const SETTLE_TIME = 0.45;
let lastStepNow = -1;        // 每渲染帧只步进一次世界（由首个更新的水滴触发）

/** 推进整个水滴世界的物理（帧守卫：同一帧的多次调用只算一次） */
function stepWorld(dt, now, scene) {
  if (now === lastStepNow) return;
  lastStepNow = now;

  for (const d of ALL) if (d.done || d.dead) ALL.delete(d);
  const H = scene?.frame?.h ?? 720;
  const W = scene?.frame?.w ?? 1280;

  let rest = Math.min(dt, 0.1);
  while (rest > 0) {
    const h = Math.min(SUBSTEP, rest);
    rest -= h;
    const arr = [...ALL];

    // 1) 重力积分（停稳的水滴不动）
    for (const d of arr) {
      if (d.state === "settled") continue;
      d.supported = false;
      d.vel.y = Math.min(d.vel.y + GRAVITY * h, VMAX);
      d.pos.x += d.vel.x * h;
      d.pos.y += d.vel.y * h;
    }

    // 2) 成对圆形碰撞：位置修正按质量分配 + 法向冲量（保留切向滑动）
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        const wa = a.state === "settled" ? 0 : 1;
        const wb = b.state === "settled" ? 0 : 1;
        if (wa + wb === 0) continue;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const need = a.size + b.size;
        const d2 = dx * dx + dy * dy;
        if (d2 >= need * need) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d;
        const ny = dy / d; // 法线方向：a -> b
        const corr = (need - d) / (wa + wb);
        if (wa) { a.pos.x -= nx * corr * wa; a.pos.y -= ny * corr * wa; }
        if (wb) { b.pos.x += nx * corr * wb; b.pos.y += ny * corr * wb; }
        const vn = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
        if (vn < 0) { // 互相接近：消除法向相对速度（微小弹性）
          const imp = -(1.05) * vn / (wa + wb);
          if (wa) { a.vel.x -= imp * nx * wa; a.vel.y -= imp * ny * wa; }
          if (wb) { b.vel.x += imp * nx * wb; b.vel.y += imp * ny * wb; }
        }
        if (wa) a.vel.x *= Math.exp(-h * EDGE_FRICTION); // 接触摩擦
        if (wb) b.vel.x *= Math.exp(-h * EDGE_FRICTION);
        if (wa && ny > 0.35) a.supported = true;  // 对方在 a 下方：a 有支撑
        if (wb && ny < -0.35) b.supported = true; // 对方在 b 下方：b 有支撑
      }
    }

    // 3) 地面 / 边界约束 + 停稳判定
    for (const d of arr) {
      if (d.state === "settled") continue;
      if (d.pos.y >= H - d.size) {
        d.pos.y = H - d.size;
        if (d.vel.y > 0) d.vel.y = 0;
        d.vel.x *= Math.exp(-h * FLOOR_FRICTION);
        d.supported = true;
      }
      d.pos.x = Math.max(d.size, Math.min(W - d.size, d.pos.x));

      if (d.supported && Math.hypot(d.vel.x, d.vel.y) < SETTLE_SPEED) {
        d.supportTimer += h;
        if (d.supportTimer >= SETTLE_TIME) {
          d.vel.x = 0;
          d.vel.y = 0;
          d.state = "settled";
        }
      } else {
        d.supportTimer = 0;
      }
    }
  }
}

export class TeardropElement extends FxElement {
  constructor(opts) {
    super({
      size: rand(30, 40),          // 半高（= 物理半径），生成时随机一次并锁定，差异较小
      duration: rand(9000, 13000), // 完整生命周期：生成 -> 下落 -> 堆积停留 -> 淡出
      fadeIn: 0.02,
      fadeOut: 0.12,               // 生命末尾约 1.1-1.6s 淡出
      mood: "SAD",
      ...opts,
    });

    this.assetId = pick(DROP_ASSETS);
    ALL.add(this); // 加入世界（消失后惰性清除）
    this.rotation = rand(-0.22, 0.22); // 少量随机旋转，生成后固定
    this.vel = { x: rand(-24, 24), y: 20 };
    this.state = "fall";               // fall -> settled
    this.supported = false;
    this.supportTimer = 0;
  }

  onUpdate(dt, now, scene) {
    if (this.state === "settled") return; // 停稳后完全静止
    stepWorld(dt, now, scene);            // 帧守卫：每帧推进一次整个水滴世界
  }

  paint(ctx) {
    // 直接引用上传的 PNG 素材（原始颜色，不换色、不重绘）
    const sprite = getAssetSprite(this.assetId);
    if (!sprite) return; // 素材库未就绪
    const scale = (this.size * 2) / Math.max(sprite.width, sprite.height);
    const dw = sprite.width * scale;
    const dh = sprite.height * scale;
    ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
  }
}
