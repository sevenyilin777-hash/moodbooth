// Gesture: 保持静止约 5 秒 (TIRED / CALM)
// 持续跟踪若干“锚点”（鼻尖、身体中心、两只手掌）的归一化移动速度，
// EMA 平滑后：低于阈值累计满 requiredMs -> still-start；
// 期间速度超过退出阈值（滞回）-> still-end。

import { CONFIG } from "../../config.js";
import { dist } from "../../core/math.js";

export class StillnessDetector {
  constructor() {
    this.prev = null;      // 上一帧锚点 { nose, body, hands: [palm...], faceWidth }
    this.speed = 0;        // 平滑后的运动速度（归一化/秒）
    this.quietMs = 0;
    this.drowsyMs = 0;     // 眼睛持续闭合的累计时长（打盹加成）
    this.active = false;
  }

  update(ctx) {
    const { scene, now, dt } = ctx;
    const events = [];
    const w = scene.frame.w;

    // 收集本帧锚点
    const cur = {
      nose: scene.face ? { ...scene.face.nose } : null,
      body: scene.body?.center ? { ...scene.body.center } : null,
      faceWidth: scene.face?.faceWidth ?? null,
      hands: scene.hands.map((h) => ({ id: h.id, palm: { ...h.palm } })),
    };

    let rawSpeed = Infinity;
    if (this.prev && (cur.nose || cur.body)) {
      const deltas = [];
      if (cur.nose && this.prev.nose) deltas.push(dist(cur.nose, this.prev.nose));
      if (cur.body && this.prev.body) deltas.push(dist(cur.body, this.prev.body));
      // 脸变大/变小（靠近/远离摄像头）也算运动
      if (cur.faceWidth && this.prev.faceWidth) {
        deltas.push(Math.abs(cur.faceWidth - this.prev.faceWidth) * 0.7);
      }
      // 手按 id 匹配，找不到就不计
      for (const h of cur.hands) {
        const ph = this.prev.hands.find((x) => x.id === h.id);
        if (ph) deltas.push(dist(h.palm, ph.palm));
      }
      if (deltas.length) {
        const perSec = (deltas.reduce((s, d) => s + d, 0) / deltas.length) / Math.max(dt, 1e-3);
        rawSpeed = perSec / w; // 归一化速度
      }
    }
    this.prev = cur;

    if (rawSpeed !== Infinity) {
      this.speed += (rawSpeed - this.speed) * CONFIG.stillness.smooth;
    } else {
      // 没人/丢帧：视为中断
      this.speed = 1;
    }

    if (this.active) {
      if (this.speed > CONFIG.stillness.exitThreshold) {
        this.active = false;
        this.quietMs = 0;
        events.push({ type: "still-end" });
      }
    } else {
      // 眼睛持续闭合（打盹/闭目）时缩短等待：5s -> 最短约 3s
      if (scene.face) {
        const bl = (scene.face.eyes.left.blink + scene.face.eyes.right.blink) / 2;
        this.drowsyMs =
          bl > 0.4 ? Math.min(4000, this.drowsyMs + dt * 1000) : Math.max(0, this.drowsyMs - dt * 2000);
      } else {
        this.drowsyMs = Math.max(0, this.drowsyMs - dt * 2000);
      }
      const required = Math.max(
        2500,
        CONFIG.stillness.requiredMs - Math.min(CONFIG.stillness.drowsyBonusMs, this.drowsyMs),
      );
      if (this.speed < CONFIG.stillness.motionThreshold) {
        this.quietMs += dt * 1000;
        if (this.quietMs >= required) {
          this.active = true;
          events.push({ type: "still-start" });
        }
      } else {
        this.quietMs = 0;
      }
    }

    return {
      events,
      stillActive: this.active,
      stillSeconds: this.quietMs / 1000,
      motion: this.speed,
      requiredMs: this.active
        ? 0
        : Math.max(2500, CONFIG.stillness.requiredMs - Math.min(CONFIG.stillness.drowsyBonusMs, this.drowsyMs)),
    };
  }
}
