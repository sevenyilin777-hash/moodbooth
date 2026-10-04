// Tracking 辅助：把 MediaPipe 的归一化关键点换算成画布像素，
// 并抽取后续手势检测需要的“场景状态 SceneState”。
//
// 坐标约定：开启镜像（自拍视图）时 x 做 (1 - x) 翻转，
// 所有下游模块拿到的都是“屏幕上看到的”像素坐标。

import { CONFIG } from "../config.js";

// MediaPipe FaceMesh 关键索引（按人物自身左右命名：
// 人物左眼在未镜像画面里偏右侧，镜像换算后与我们看到的左右一致）
export const FACE = {
  NOSE_TIP: 1,
  CHIN: 152,
  LEFT_EYE_LOWER: 374,  // 人物左眼下眼睑
  RIGHT_EYE_LOWER: 145, // 人物右眼下眼睑
  LEFT_IRIS: 473,
  RIGHT_IRIS: 468,
  CHEEK_L: 234,         // 左侧脸颊（量脸宽用）
  CHEEK_R: 454,
};

// 手部 21 点索引
export const HAND = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
  THUMB_IP: 2,
  FINGERS: [ // [tip, pip] 对，用于判断伸直
    [8, 6], [12, 10], [16, 14], [20, 18],
  ],
  MCPs: [5, 9, 13, 17],
};

// 画手骨架用的连线
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/** 单个归一化关键点 -> 画布像素（含镜像） */
export function toPx(lm, w, h) {
  const x = CONFIG.mirror ? (1 - lm.x) * w : lm.x * w;
  return { x, y: lm.y * h };
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * 分析一只手的 21 个关键点，产出姿态信息。
 * 伸直判定用手腕-关键点距离比（对旋转不敏感）。
 */
export function analyzeHand(rawLm, w, h) {
  const P = (i) => toPx(rawLm[i], w, h);
  const wrist = P(HAND.WRIST);
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const fingers = [];
  // 拇指：腕->拇指尖 明显远于 腕->拇指第二关节
  fingers.push(d(wrist, P(HAND.THUMB_TIP)) > d(wrist, P(HAND.THUMB_IP)) * 1.35);
  for (const [tip, pip] of HAND.FINGERS) {
    fingers.push(d(wrist, P(tip)) > d(wrist, P(pip)) * 1.15);
  }
  const extCount = fingers.filter(Boolean).length;

  // 手掌中心：手腕 + 四指根
  const mcps = HAND.MCPs.map(P);
  const palm = { x: wrist.x, y: wrist.y };
  for (const p of mcps) { palm.x += p.x; palm.y += p.y; }
  palm.x /= mcps.length + 1;
  palm.y /= mcps.length + 1;

  return {
    palm,
    fingers,
    extCount,
    open: extCount >= CONFIG.hand.openFingersNeeded,
    fist: extCount <= CONFIG.hand.fistMaxFingers,
    fingertips: {
      thumb: P(HAND.THUMB_TIP),
      index: P(HAND.INDEX_TIP),
      middle: P(HAND.MIDDLE_TIP),
    },
    landmarks: rawLm.map((lm) => toPx(lm, w, h)),
  };
}

/**
 * 从 FaceLandmarker 结果中抽取脸部信息：
 * 双眼位置/开合、嘴部开合、脸中心/尺寸/包围盒、头部倾斜角。
 */
export function analyzeFace(rawLm, blendshapes, w, h) {
  const P = (i) => toPx(rawLm[i], w, h);
  const chin = P(FACE.CHIN);
  const nose = P(FACE.NOSE_TIP);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const lm of rawLm) {
    const p = toPx(lm, w, h);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  const center = { x: minX + bbox.w / 2, y: minY + bbox.h / 2 };
  const faceWidth = Math.hypot(P(FACE.CHEEK_L).x - P(FACE.CHEEK_R).x, P(FACE.CHEEK_L).y - P(FACE.CHEEK_R).y);

  // 头部倾斜角（roll，屏幕坐标系）：两颊连线相对水平线的夹角
  const cA = P(FACE.CHEEK_L);
  const cB = P(FACE.CHEEK_R);
  const [cp1, cp2] = cA.x <= cB.x ? [cA, cB] : [cB, cA];
  const roll = Math.atan2(cp2.y - cp1.y, cp2.x - cp1.x);

  // 兼容不同版本返回结构：faceBlendshapes[0] 可能是 {categories:[...]} 或直接是数组
  const cats = Array.isArray(blendshapes) ? blendshapes : blendshapes?.categories;
  const shapeOf = (name) => cats?.find((c) => c.categoryName === name)?.score ?? 0;

  return {
    center,
    chin,
    nose,
    bbox,
    faceWidth,
    roll, // 弧度，屏幕坐标；绝对值即倾斜程度
    jawOpen: shapeOf("jawOpen"), // 0..1，嘴张开程度
    eyeWide: (shapeOf("eyeWideLeft") + shapeOf("eyeWideRight")) / 2, // 0..1 睁大程度
    eyes: {
      left:  { pos: midpoint(P(FACE.LEFT_EYE_LOWER), P(FACE.LEFT_IRIS)),  blink: shapeOf("eyeBlinkLeft") },
      right: { pos: midpoint(P(FACE.RIGHT_EYE_LOWER), P(FACE.RIGHT_IRIS)), blink: shapeOf("eyeBlinkRight") },
    },
    landmarks: rawLm.map((lm) => toPx(lm, w, h)),
  };
}
