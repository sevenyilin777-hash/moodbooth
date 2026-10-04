// 模块 3：Gesture Recognition —— 聚合 7 个检测器，
// 每帧输出 { events, states } 供 InteractionController 消费。
//
// events：边沿触发（本帧刚发生的动作），如 blink / fist / palm-open…
// states：持续状态（是否仍保持），如 coverFace / stillActive / openHands…
//
// 同时缓存最近的脸部锚点（脸中心 / 下巴 / 眼睛位置），
// 供特效绑定身体位置使用 —— 即使脸短暂丢失，1.2s 内特效仍能跟着最后位置。

import { BlinkDetector } from "./detectors/blink-detector.js";
import { OpenPalmDetector } from "./detectors/open-palm-detector.js";
import { FistDetector } from "./detectors/fist-detector.js";
import { CoverFaceDetector } from "./detectors/cover-face-detector.js";
import { StillnessDetector } from "./detectors/stillness-detector.js";
import { ApproachDetector } from "./detectors/approach-detector.js";
import { SurpriseDetector } from "./detectors/surprise-detector.js";
import { ChinTouchDetector } from "./detectors/chin-touch-detector.js";

const ANCHOR_FRESH_MS = 1200;

export class GestureRecognizer {
  constructor() {
    this.blink = new BlinkDetector();
    this.openPalm = new OpenPalmDetector();
    this.fist = new FistDetector();
    this.cover = new CoverFaceDetector();
    this.still = new StillnessDetector();
    this.approach = new ApproachDetector();
    this.surprise = new SurpriseDetector();
    this.chin = new ChinTouchDetector();

    this.lastNow = 0;
    this.mem = { lastFace: null, lastFaceTs: 0, approachRatio: 1 };
    // 供特效绑定的缓存锚点
    this.anchors = { faceCenter: null, chin: null, eyeLeft: null, eyeRight: null, ts: 0 };
  }

  update(scene, now) {
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 1 / 30;
    this.lastNow = now;

    if (scene.face) {
      this.mem.lastFace = scene.face;
      this.mem.lastFaceTs = now;
      this.anchors.faceCenter = { ...scene.face.center };
      this.anchors.chin = { ...scene.face.chin };
      this.anchors.eyeLeft = { ...scene.face.eyes.left.pos };
      this.anchors.eyeRight = { ...scene.face.eyes.right.pos };
      this.anchors.ts = now;
    }

    const ctx = { scene, mem: this.mem, now, dt };
    const fresh = now - this.anchors.ts < ANCHOR_FRESH_MS;
    const anchor = (key) => (fresh ? this.anchors[key] : null);

    const events = [];

    // 顺序有讲究：先算遮脸/托下巴，用于抑制误触发
    const blinkOut = this.blink.update(ctx);
    events.push(...blinkOut);

    const chinOut = this.chin.update(ctx);
    events.push(...chinOut.events);

    const coverOut = this.cover.update(ctx);
    events.push(...coverOut.events);

    // 手在脸上时，张开/握拳大概率是误判：事件与持续状态一并抑制
    const suppressHandGestures = coverOut.coverFace || chinOut.chinNear;
    const palmOut = this.openPalm.update(ctx);
    const fistOut = this.fist.update(ctx);
    if (suppressHandGestures) {
      palmOut.openHands = [];
      fistOut.fistHands = [];
    } else {
      events.push(...palmOut.events, ...fistOut.events);
    }

    const stillOut = this.still.update(ctx);
    events.push(...stillOut.events);

    const approachOut = this.approach.update(ctx);
    events.push(...approachOut.events);

    const surpriseOut = this.surprise.update(ctx);
    events.push(...surpriseOut.events);

    return {
      events,
      states: {
        openHands: palmOut.openHands,
        fistHands: fistOut.fistHands,
        coverFace: coverOut.coverFace,
        chinNear: chinOut.chinNear,
        chinReady: chinOut.chinReady,
        tiltDeg: chinOut.tiltDeg,
        stillActive: stillOut.stillActive,
        stillSeconds: stillOut.stillSeconds,
        stillRequiredMs: stillOut.requiredMs,
        motion: stillOut.motion,
        surpriseActive: surpriseOut.surpriseActive,
        jawOpen: surpriseOut.jawOpen,
        eyeWide: surpriseOut.eyeWide,
        approachRatio: this.mem.approachRatio,
        blinkValues: scene.face
          ? { left: scene.face.eyes.left.blink, right: scene.face.eyes.right.blink }
          : null,
        // 锚点缓存（可能是 null = 已过期）
        faceCenter: anchor("faceCenter"),
        chinPoint: anchor("chin"),
        eyeLeft: anchor("eyeLeft"),
        eyeRight: anchor("eyeRight"),
        faceSeen: !!scene.face,
        handsInfo: scene.hands.map((h) => ({
          id: h.id, extCount: h.extCount, open: h.open, fist: h.fist,
        })),
      },
    };
  }
}
