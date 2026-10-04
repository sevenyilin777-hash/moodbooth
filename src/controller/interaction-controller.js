// 模块 5：Interaction Controller。
//
// 职责：接收 GestureRecognizer 的 { events, states }，
// 决定 何时 / 在哪个身体位置 / 生成哪种视觉元素。
// 核心是“触发 - 持续 - 冷却 - 退出”规则，避免同一动作每帧重复生成：
//
//   HAPPY     张开手掌   上升沿生成 1 花 1 星；持续张开每 900ms 补充一个
//   SAD       眨眼       上升沿生成 2-3 颗水滴（检测器内有 600ms 冷却）
//   ANGRY     握拳       上升沿生成一次爆炸线；持续握拳不重复
//   SHY       双手遮脸   状态期间每 380ms 生成一个扩散圆环；结束后圆环加速淡出
//   TIRED     静止 5s    进入后维持 云/水流/风向线；恢复移动时全部淡出
//   SURPRISED 靠近摄像头 上升沿生成烟花线（检测器内含再武装逻辑）
//   CONFUSED  手指靠下巴 上升沿生成弯曲线（检测器内含 2.8s 冷却）

import { CONFIG } from "../config.js";
import { rand } from "../core/math.js";
import { FlowerElement } from "../fx/elements/flower.js";
import { StarElement } from "../fx/elements/star.js";
import { TeardropElement } from "../fx/elements/teardrop.js";
import { BurstElement } from "../fx/elements/burst.js";
import { RingElement } from "../fx/elements/ring.js";
import { CloudElement } from "../fx/elements/cloud.js";
import { WaterFlowElement } from "../fx/elements/water-flow.js";
import { WindLineElement } from "../fx/elements/wind-line.js";
import { FireworkElement } from "../fx/elements/firework.js";
import { SquiggleElement } from "../fx/elements/squiggle.js";

const C = CONFIG.colors;

export class InteractionController {
  /** @param {import("../fx/fx-layer.js").FxLayer} fxLayer */
  constructor(fxLayer) {
    this.fx = fxLayer;
    this.lastPalmSpawn = new Map();  // handId -> ts（HAPPY 持续生成节流）
    this.lastFistSpawn = new Map();  // handId -> ts（ANGRY 额外保险冷却）
    this.lastRingSpawn = 0;          // SHY 圆环节流
    this.lastFirework = 0;           // SURPRISED 统一冷却（靠近 / 表情两条路径共用）
    this.ambient = { active: false, elements: [], lastWindSpawn: 0 };
  }

  update(out, scene, now, frame) {
    this.frame = frame; // { w, h }

    for (const ev of out.events) {
      switch (ev.type) {
        case "palm-open": this.onPalmOpen(ev, now); break;
        case "blink": this.onBlink(ev, now); break;
        case "fist": this.onFist(ev, now); break;
        case "cover-start": break; // 圆环由持续状态驱动
        case "cover-end": this.onCoverEnd(); break;
        case "still-start": this.onStillStart(now); break;
        case "still-end": this.onStillEnd(); break;
        case "approach": this.onApproach(ev, now); break;
        case "surprise": this.onSurprise(ev, now); break;
        case "chin": this.onChin(ev, now); break;
      }
    }

    this.sustainHappy(out.states, now);
    this.sustainShy(out, now);
    this.sustainCalm(out.states, scene, now);
  }

  // ---------------- HAPPY ----------------
  onPalmOpen(ev, now) {
    this.lastPalmSpawn.set(ev.handId, now);
    this.spawnFlower(ev.pos);
    this.spawnStar(ev.pos);
  }

  sustainHappy(states, now) {
    for (const hand of states.openHands) {
      const last = this.lastPalmSpawn.get(hand.id) ?? 0;
      if (now - last > 900) {
        this.lastPalmSpawn.set(hand.id, now);
        // 交替生成花与星，位置带一点随机偏移
        if (Math.random() < 0.6) this.spawnFlower(hand.palm);
        else this.spawnStar(hand.palm);
      }
    }
  }

  spawnFlower(pos) {
    this.fx.spawn(new FlowerElement({
      pos: { x: pos.x + rand(-26, 26), y: pos.y + rand(-20, 20) },
      color: Math.random() < 0.7 ? C.happy : C.happyAlt,
      size: rand(20, 30),
    }));
  }

  spawnStar(pos) {
    this.fx.spawn(new StarElement({
      pos: { x: pos.x + rand(-22, 22), y: pos.y + rand(-22, 22) },
      color: C.happyAlt,
      size: rand(9, 14),
    }));
  }

  // ---------------- SAD ----------------
  onBlink(ev) {
    const n = CONFIG.blink.dropsPerBlink;
    for (let i = 0; i < n; i++) {
      this.fx.spawn(new TeardropElement({
        pos: { x: ev.pos.x + rand(-6, 6), y: ev.pos.y + rand(0, 6) },
        color: C.sad,
        size: rand(7, 10),
      }));
    }
  }

  // ---------------- ANGRY ----------------
  onFist(ev, now) {
    const last = this.lastFistSpawn.get(ev.handId) ?? 0;
    if (now - last < 700) return; // 双保险冷却
    this.lastFistSpawn.set(ev.handId, now);
    this.fx.spawn(new BurstElement({ pos: { ...ev.pos }, color: C.angry, size: rand(42, 56) }));
  }

  // ---------------- SHY ----------------
  sustainShy(out, now) {
    const { states } = out;
    if (states.coverFace && now - this.lastRingSpawn > CONFIG.coverFace.ringIntervalMs) {
      this.lastRingSpawn = now;
      const center = states.faceCenter;
      if (center) {
        this.fx.spawn(new RingElement({
          pos: { ...center },
          color: C.shy,
          maxR: 150 + rand(-20, 40),
          anchor: () => this.faceAnchor(out),
        }));
      }
    }
  }

  faceAnchor(out) {
    // 圆环锚定在人物中心；脸丢了就停在最后位置
    return out.states.faceCenter;
  }

  onCoverEnd() {
    // 双手离开：已有圆环加速淡出
    for (const el of this.fx.elements) {
      if (el.mood === "SHY") el.beginFadeOut(600);
    }
  }

  // ---------------- TIRED / CALM ----------------
  onStillStart(now) {
    this.ambient.active = true;
    this.ambient.elements = [];
    this.ambient.lastWindSpawn = now;
    const { w, h } = this.frame ?? { w: 1280, h: 720 };
    for (let i = 0; i < 2; i++) this.spawnCloud(w, h);
    this.spawnWaterFlow(w, h);
    this.spawnWindLine(w, now);
  }

  onStillEnd() {
    this.ambient.active = false;
    for (const el of this.ambient.elements) {
      if (!el.done) el.beginFadeOut(1400);
    }
    this.ambient.elements = [];
  }

  sustainCalm(states, scene, now) {
    if (!this.ambient.active) return;
    const { w, h } = scene?.frame ?? this.frame ?? { w: 1280, h: 720 };
    const alive = () => this.ambient.elements.filter((el) => !el.done);

    // 云保持 2 朵
    if (alive().filter((e) => e instanceof CloudElement).length < 2) this.spawnCloud(w, h);
    // 水流保持 1 条
    if (alive().filter((e) => e instanceof WaterFlowElement).length < 1) this.spawnWaterFlow(w, h);
    // 风向线每 2.8s 补一条
    if (now - this.ambient.lastWindSpawn > 2800) {
      this.ambient.lastWindSpawn = now;
      this.spawnWindLine(w, now);
    }
  }

  spawnCloud(w, h) {
    const el = new CloudElement({
      pos: { x: rand(w * 0.1, w * 0.9), y: rand(h * 0.08, h * 0.36) },
      color: C.tiredAlt,
    });
    this.ambient.elements.push(el);
    this.fx.spawn(el);
  }

  spawnWaterFlow(w, h) {
    const el = new WaterFlowElement({
      pos: { x: w / 2, y: h * 0.78 },
      color: C.tired,
      width: Math.min(760, w * 0.55),
    });
    this.ambient.elements.push(el);
    this.fx.spawn(el);
  }

  spawnWindLine(w, now) {
    const el = new WindLineElement({
      pos: { x: rand(w * 0.2, w * 0.8), y: rand(120, 520) },
      color: C.tiredAlt,
    });
    el.sceneWidth = w;
    this.ambient.elements.push(el);
    this.fx.spawn(el);
  }

  // ---------------- SURPRISED ----------------
  // 靠近摄像头与“睁大眼+张嘴”共用一个烟花冷却，避免两条路径叠加连发
  fireFirework(pos, now) {
    if (now - this.lastFirework < 1000) return;
    this.lastFirework = now;
    this.fx.spawn(new FireworkElement({
      pos: { x: pos.x + rand(-30, 30), y: pos.y - rand(10, 60) },
      color: C.surprised,
      size: rand(80, 110),
    }));
  }

  onApproach(ev, now) {
    this.fireFirework(ev.pos, now);
  }

  onSurprise(ev, now) {
    if (ev.pos) this.fireFirework(ev.pos, now);
  }

  // ---------------- CONFUSED ----------------
  onChin(ev) {
    this.fx.spawn(new SquiggleElement({
      pos: { x: ev.pos.x + rand(-8, 8), y: ev.pos.y + rand(-2, 6) },
      color: C.confused,
    }));
  }
}
