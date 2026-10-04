// Demo 驱动：?demo=1 时用合成数据替代摄像头/模型，
// 按时间表依次“表演”7 个动作，走完整的 Recognizer -> Controller -> FX 管线。
// 用于无摄像头环境验证视觉链路，也是各效果的“演出时刻表”参考。

import { easeInOutSine } from "./animation/easing.js";
import { seg } from "./core/math.js";

// 时间表（秒）：
//  0-2.5     静置
//  2.5-5     张开手掌 (HAPPY)
//  5-7       握拳 (ANGRY)
//  7-8.3     静置
//  8.3-9.3   眨左眼 (SAD)
//  9.3-12.8  双手遮脸 (SHY)
//  12.8-19.3 完全静止 -> 约 17.8s 触发 (TIRED/CALM)
//  19.3-21.8 靠近摄像头 (SURPRISED · 靠近路径)
//  21.8-24.3 张大嘴巴 (SURPRISED · 表情路径)
//  24.3-27.3 手指指到下巴 (CONFUSED)
//  27.3-29   静置，循环
const LOOP = 29;

const STILL_A = 12.8;
const STILL_B = 19.3;

export class DemoDriver {
  constructor() {
    this.t0 = performance.now();
  }

  // 全身共用的一套“自然摆动”（身体带动头和手一起动），
  // 静止段除外 —— 保证静止计时只在真正的“静止段”累计。
  static sway(t) {
    const swaying = !(t >= STILL_A && t < STILL_B);
    return {
      x: swaying ? Math.sin(t * 1.8) * 55 : 0,
      y: swaying ? Math.sin(t * 1.3 + 1) * 16 : 0,
    };
  }

  update(now) {
    const w = 1280;
    const h = 720;
    const t = ((now - this.t0) / 1000) % LOOP;
    return {
      frame: { w, h },
      face: this.makeFace(w, h, t),
      hands: this.makeHands(w, h, t),
      body: this.makeBody(w, h, t),
    };
  }

  makeFace(w, h, t) {
    const sway = DemoDriver.sway(t);
    const cx = w / 2 + sway.x;
    const cy = h * 0.42 + sway.y;

    // 靠近摄像头：脸变大
    let sizeF = 1;
    if (t >= 19.3 && t < 21.8) {
      sizeF = 1 + 0.45 * easeInOutSine((t - 19.3) / 2.5);
    }
    const faceWidth = 190 * sizeF;
    const bboxW = faceWidth * 1.02;
    const bboxH = faceWidth * 1.42;
    const bbox = { x: cx - bboxW / 2, y: cy - bboxH / 2, w: bboxW, h: bboxH };

    // SURPRISED：张大嘴巴
    let surprise = 0;
    if (t >= 21.8 && t < 24.3) {
      surprise = seg(t, 21.8, 22.15) * (1 - seg(t, 24.0, 24.3));
    }

    const eyeY = cy - bboxH * 0.1;
    const eyeDX = faceWidth * 0.26;
    let blinkL = 0;
    if (t >= 8.3 && t < 9.3) {
      blinkL = Math.sin(((t - 8.3) / 1) * Math.PI); // 0 -> 1 -> 0
    }

    return {
      center: { x: cx, y: cy },
      chin: { x: cx, y: cy + bboxH * 0.46 },
      nose: { x: cx, y: cy + bboxH * 0.08 },
      bbox,
      faceWidth,
      roll: 0,
      jawOpen: surprise,
      eyeWide: surprise * 0.95,
      eyes: {
        left: { pos: { x: cx - eyeDX, y: eyeY }, blink: blinkL },
        right: { pos: { x: cx + eyeDX, y: eyeY }, blink: 0 },
      },
      landmarks: null,
    };
  }

  makeHands(w, h, t) {
    // 注意：遮脸/托下巴的手坐标由 makeFace 派生（已含摆动），
    // 只有固定坐标（张开/握拳的手）需要在此处叠加 sway。
    const openHand = (id, x, y, kind) => {
      const fingers =
        kind === "open" ? [true, true, true, true, true]
        : kind === "fist" ? [false, false, false, false, false]
        : [true, false, false, false, false]; // 托下巴：拇指伸直
      const extCount = fingers.filter(Boolean).length;
      return {
        id,
        palm: { x, y },
        fingers,
        extCount,
        open: extCount >= 4,
        fist: extCount <= 1,
        fingertips: {
          thumb: { x: x - 14, y: y + 8 },
          index: kind === "chin" ? { x: x + 4, y: y - 26 } : { x: x + 10, y: y - 12 },
          middle: { x: x + 12, y: y - 2 },
        },
        landmarks: null,
      };
    };

    if (t >= 2.5 && t < 5) {
      // 张开手掌（右手，屏幕右侧），随身体摆动 + 轻微浮动
      const s = DemoDriver.sway(t);
      const x = w * 0.74 + s.x + Math.sin(t * 2) * 6;
      const y = h * 0.6 + s.y + Math.cos(t * 1.7) * 5;
      return [openHand(1, x, y, "open")];
    }
    if (t >= 5 && t < 7) {
      const s = DemoDriver.sway(t);
      return [openHand(1, w * 0.74 + s.x, h * 0.6 + s.y, "fist")];
    }
    if (t >= 9.3 && t < 12.8) {
      // 双手遮脸
      const face = this.makeFace(w, h, t);
      const c = face.center;
      const dx = face.faceWidth * 0.3;
      return [
        openHand(0, c.x - dx, c.y, "flat"),
        openHand(1, c.x + dx, c.y, "flat"),
      ];
    }
    if (t >= 24.3 && t < 27.3) {
      // 手指指到下巴
      const face = this.makeFace(w, h, t);
      return [openHand(1, face.chin.x + 6, face.chin.y + 34, "chin")];
    }
    // 12.8-19.3 静止段：无手
    return [];
  }

  makeBody(w, h, t) {
    // 身体带动头和手一起摆动；静止段完全不动。
    const sway = DemoDriver.sway(t);
    return {
      center: { x: w / 2 + sway.x * 0.8, y: h * 1.1 + sway.y * 0.5 },
      landmarks: null,
    };
  }
}
