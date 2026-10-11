// 模块 5：Interaction Controller。
//
// 职责：接收 GestureRecognizer 的 { events, states }，
// 决定 何时 / 在哪个身体位置 / 生成哪种视觉元素。
// 核心是“触发 - 持续 - 冷却 - 退出”规则，避免同一动作每帧重复生成：
//
  //   HAPPY     张开手掌   上升沿一次生成 2-4 个黑白像素纹样，从掌心附近 pop 出现后原地安家、
  //                        保持明显的轻摆与倾摆；手掌靠近哪朵，哪朵才被移动方向带动，
  //                        离开后停在新位置；保持张开不重复生成（600ms 冷却）
//   SAD       眨眼       每只眼上升沿在眼睛位置生成一颗大小相近的 PNG 水滴（600ms 冷却），
//                        底部圆形碰撞堆成不规则的多层小球堆，停留数秒后淡出消失
//   ANGRY     握拳+挥动  拳头状态下明显快速挥动触发（速度阈值 + 800ms 冷却）；
//                        以触发拳头为中心迸发 5-7 张 PNG 爆炸纹样，
//                        朝向 = 拳头中心 -> 图案位置 的离散方向（尖角全部向外）；
//                        迸发 -> 高频短震 -> 短暂停留 -> 快速淡出
//   SHY       双手遮脸   状态期间每 380ms 生成一个扩散圆环；结束后圆环加速淡出
//   SURPRISED 张大嘴巴   上升沿触发烟花齐射（与靠近路径共用 1s 冷却）：
//                        10-14 枚像素尾迹从底部密集错峰升空，在上部散开的目标点
//                        由内向外像素扩散绽放（上传烟花 PNG，随机样式/颜色/
//                        尺寸），停留 0.5-1s 后淡出；场上数量受上限约束
//   CONFUSED  指下巴    食指靠近下巴触发（上升沿 + 2.8s 冷却）：36-48 个 PNG 问号编组
//                        从右向左快速横穿全屏（垂直按带分布、中部权重最高，从人的
//                        背后飘过），入场延迟最长 7s、持续不断；尺寸按 小25%/中55%/
//                        大20% 配比；本次触发共用 3 种专属配色，完全离开左边缘才结束

import { CONFIG } from "../config.js";
import { rand, pick, TAU } from "../core/math.js";
import { PixelMotifElement } from "../fx/elements/pixel-motif.js";
import { TeardropElement } from "../fx/elements/teardrop.js";
import { AngryBlastElement } from "../fx/elements/angry-blast.js";
import { RingElement } from "../fx/elements/ring.js";
import { QuestionGroupElement } from "../fx/elements/question-group.js";
import { PixelFireworkElement } from "../fx/elements/pixel-firework.js";

const C = CONFIG.colors;

// CONFUSED 每次触发的候选配色（明亮、轻快、复古数字感；按色相）
const CONFUSED_PALETTE = [335, 18, 55, 175, 205, 285];

// 事件类型 -> 情绪：模式隔离的唯一依据。追踪/识别服务照常共享运行，
// 但本控制器只消费与 activeMood 匹配的识别结果，保证同一时间只有
// 当前情绪能触发互动。
const EVENT_MOOD = {
  "palm-open": "HAPPY",
  "blink": "SAD",
  "fist-shake": "ANGRY",
  "cover-start": "SHY",
  "cover-end": "SHY",
  "approach": "SURPRISED",
  "surprise": "SURPRISED",
  "chin": "CONFUSED",
};

export class InteractionController {
  /** @param {import("../fx/fx-layer.js").FxLayer} fxLayer */
  constructor(fxLayer) {
    this.fx = fxLayer;
    this.lastPalmSpawn = new Map();  // handId -> ts（HAPPY 进入触发 + 冷却）
    this.lastFistShake = new Map();  // handId -> ts（ANGRY 双保险冷却）
    this.lastRingSpawn = 0;          // SHY 圆环节流
    this.lastFirework = 0;           // SURPRISED 统一冷却（靠近 / 表情两条路径共用）
  }

  /**
   * @param {string|null} activeMood 当前激活情绪（来自 mood-state.js）：
   *   null  = 情绪选择首页，任何情绪都不触发；
   *   "ALL" = 演示模式，不过滤（保留原有全流程演示行为）；
   *   其余  = 只放行该情绪的事件。
   */
  update(out, scene, now, frame, activeMood = null) {
    this.frame = frame; // { w, h }

    const allow = (mood) => activeMood === "ALL" || mood === activeMood;
    for (const ev of out.events) {
      if (!allow(EVENT_MOOD[ev.type])) continue; // 模式隔离：非当前情绪的事件直接忽略
      switch (ev.type) {
        case "palm-open": this.onPalmOpen(ev, now); break;
        case "blink": this.onBlink(ev); break;
        case "fist-shake": this.onFistShake(ev, now); break;
        case "cover-start": break; // 圆环由持续状态驱动
        case "cover-end": this.onCoverEnd(); break;
        case "approach": this.onApproach(ev, now); break;
        case "surprise": this.onSurprise(ev, now); break;
        case "chin": this.onChin(ev, scene); break;
      }
    }

    if (allow("SHY")) this.sustainShy(out, now);
  }

  /** 模式退出 / 切换时重置触发侧状态（冷却计时）；检测器内部防抖逻辑不受影响。 */
  resetMoodState() {
    this.lastPalmSpawn.clear();
    this.lastFistShake.clear();
    this.lastRingSpawn = 0;
    this.lastFirework = 0;
  }

  // ---------------- HAPPY ----------------
  // OPEN PALM ENTER -> 一次生成；HOLD -> 不生成；EXIT -> 等待下一次进入。
  // 每组 = 大花主体 + (60% 中花) + 小花 + 2-3 个像素星屑，彼此保持最小间距。
  onPalmOpen(ev, now) {
    const last = this.lastPalmSpawn.get(ev.handId) ?? 0;
    if (now - last < 600) return; // 冷却：防止快速开合误触发
    this.lastPalmSpawn.set(ev.handId, now);

    const placed = [];
    const place = (kind) => {
      for (let t = 0; t < 24; t++) {
        const a = rand(TAU);
        const r = rand(30, 140);
        const q = { x: ev.pos.x + Math.cos(a) * r, y: ev.pos.y + Math.sin(a) * r };
        const far = placed.every((o) => Math.hypot(o.x - q.x, o.y - q.y) > 85);
        if (far) {
          placed.push(q);
          this.fx.spawn(new PixelMotifElement({ pos: q, kind }));
          return;
        }
      }
    };

    place("flower-l"); // 大花：视觉主体
    if (Math.random() < 0.6) place("flower-m");
    place("flower-s"); // 小花：辅助
    // 星屑/四角星 2-3 个，只做陪衬
    const starKinds = ["star", "dust"];
    const stars = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < stars; i++) place(starKinds[(Math.random() * starKinds.length) | 0]);
  }

  // ---------------- SAD ----------------
  // 每只眼 600ms 冷却（检测器内）；一次眨眼在对应眼睛下方生成一颗 PNG 水滴：
  // 尺寸生成时随机锁定 -> 重力下落 -> 底部圆形碰撞堆成不规则多层小球堆 ->
  // 停留数秒后淡出消失。
  onBlink(ev) {
    for (let i = 0; i < CONFIG.blink.dropsPerBlink; i++) {
      this.fx.spawn(new TeardropElement({
        pos: { x: ev.pos.x + rand(-4, 4), y: ev.pos.y + rand(6, 14) },
      }));
    }
  }

  // ---------------- ANGRY ----------------
  // 握拳 + 明显挥动触发（FistShakeDetector，检测器内含速度阈值与冷却）。
  // 拳头是爆炸中心：以触发这次动作的拳头当前位置为爆心，纹样摆在拳头四周
  // 8 个罗盘方向上（洗牌取 5-7 个），朝向 = 「拳头中心 -> 图案位置」的离散
  // 方向（无随机旋转），尖角全部从拳头向外指。纹样摆放后不跟随拳头移动。
  onFistShake(ev, now) {
    const last = this.lastFistShake.get(ev.handId) ?? 0;
    if (now - last < CONFIG.angry.cooldownMs) return; // 双保险冷却
    this.lastFistShake.set(ev.handId, now);

    // 爆心：触发动作对应拳头的中心（生成后固定，不随后续移动）
    const c = { x: ev.pos.x, y: ev.pos.y };
    const [rMin, rMax] = CONFIG.angry.blastRadius;
    const n = CONFIG.angry.blastsPerBurst[0]
      + ((Math.random() * (CONFIG.angry.blastsPerBurst[1] - CONFIG.angry.blastsPerBurst[0] + 1)) | 0);

    // 8 个方向洗牌取前 n 个：均匀绕拳头一周，覆盖左/右/上/下与四个斜角
    const dirs = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5).slice(0, n);
    for (const dirIndex of dirs) {
      const angle = (-90 + dirIndex * 45) * Math.PI / 180;
      const dist = rand(rMin, rMax) + rand(-18, 18);
      this.fx.spawn(new AngryBlastElement({
        pos: { x: c.x + Math.cos(angle) * dist, y: c.y + Math.sin(angle) * dist },
        dirIndex,
      }));
    }
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

  // ---------------- SURPRISED ----------------
  // 靠近摄像头与“张大嘴巴”共用一个冷却，避免两条路径叠加连发。
  // 一次触发 = 一轮烟花齐射：10-14 枚从屏幕底部密集错峰升空（像素阶梯尾迹），
  // 到达上部散开的目标点后，各自的上传烟花 PNG 由中心向外像素扩散绽放，
  // 停留 0.5-1s 后淡出。样式 / 颜色 / 尺寸逐枚随机，场上数量受 maxActive 约束。
  fireFireworkShow(now) {
    if (now - this.lastFirework < 1000) return;
    this.lastFirework = now;
    const { w, h } = this.frame ?? { w: 1280, h: 720 };
    const active = this.fx.elements.filter((e) => e instanceof PixelFireworkElement).length;
    const [vMin, vMax] = CONFIG.surpriseFx.volley;
    const n = Math.min(
      vMin + ((Math.random() * (vMax - vMin + 1)) | 0),
      CONFIG.surpriseFx.maxActive - active,
    );
    if (n <= 0) return;

    // 目标点分布在屏幕上部并互相散开（尝试保持最小间距，避免扎堆）
    const placed = [];
    const minGap = Math.min(w, h) * 0.14;
    for (let i = 0; i < n; i++) {
      let tx = rand(w * 0.08, w * 0.92);
      let ty = rand(h * 0.06, h * 0.48);
      for (let t = 0; t < 20; t++) {
        const cx = rand(w * 0.08, w * 0.92);
        const cy = rand(h * 0.06, h * 0.48);
        if (placed.every((p) => Math.hypot(p.x - cx, p.y - cy) > minGap)) {
          tx = cx;
          ty = cy;
          break;
        }
      }
      placed.push({ x: tx, y: ty });
      this.fx.spawn(new PixelFireworkElement({
        start: { x: tx + rand(-50, 50), y: h + 30 }, // 底部不同水平位置升空
        target: { x: tx, y: ty },
        size: rand(...CONFIG.surpriseFx.size),
        delay: i * rand(...CONFIG.surpriseFx.launchIntervalMs), // 错峰发射
      }));
    }
  }

  onApproach(ev, now) {
    this.fireFireworkShow(now);
  }

  onSurprise(ev, now) {
    this.fireFireworkShow(now);
  }

  // ---------------- CONFUSED ----------------
  // 食指靠近下巴触发（ChinTouchDetector，上升沿 + 2.8s 冷却）。一次触发 =
  // 约 36-48 个问号编组从右向左快速横穿全屏、持续不断（入场延迟最长 7s），
  // 飘行途中从人的背后经过；完全离开左边缘才结束。
  // 每次触发随机 3 种专属配色；群组尺寸按 小25%/中55%/大20% 配比；
  // 场上群组总量受上限约束，不无限累积。
  onChin(ev, scene) {
    const existing = this.fx.elements.filter((e) => e instanceof QuestionGroupElement).length;
    if (existing >= CONFIG.confused.maxGroups) return;

    // 本次触发的专属配色：3 种
    const hues = [...CONFUSED_PALETTE]
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const [gMin, gMax] = CONFIG.confused.groupsPerTrigger;
    const n = Math.min(
      gMin + ((Math.random() * (gMax - gMin + 1)) | 0),
      CONFIG.confused.maxGroups - existing,
    );

    const W = this.frame?.w ?? 1280;
    const H = this.frame?.h ?? 720;

    // 垂直分布带（高度比例 + 权重）：顶部到底部全覆盖，
    // 中部三条带（头部两侧 / 肩 / 胸口 / 身体附近）权重最高 —— 重点补足中间区域
    const BANDS = [
      { yMin: 0.06, yMax: 0.20, w: 3 }, // 顶部
      { yMin: 0.20, yMax: 0.40, w: 7 }, // 中上：头部两侧
      { yMin: 0.40, yMax: 0.62, w: 9 }, // 中部重点：肩 / 胸口
      { yMin: 0.62, yMax: 0.80, w: 6 }, // 中下：身体附近
      { yMin: 0.80, yMax: 0.94, w: 2 }, // 底部
    ];
    const totalW = BANDS.reduce((s, b) => s + b.w, 0);

    // 先保证每条带至少 1 组，其余按权重随机分配 → 中部群组最多、上下不断档
    const bandPicks = BANDS.map((_, i) => i);
    for (let i = n - BANDS.length; i > 0; i--) {
      let r = Math.random() * totalW;
      let k = BANDS.length - 1;
      for (let b = 0; b < BANDS.length - 1; b++) {
        r -= BANDS[b].w;
        if (r <= 0) { k = b; break; }
      }
      bandPicks.push(k);
    }
    bandPicks.length = Math.min(bandPicks.length, n); // 极端限流时按比例截断
    bandPicks.sort(() => Math.random() - 0.5);        // 打乱带顺序，避免按序整齐入场

    // 尺寸配比（按群组数量）：小型 25% / 中型 55% / 大型 20%
    const rollSizeClass = () => {
      const r = Math.random();
      return r < 0.25 ? "s" : r < 0.8 ? "m" : "l";
    };

    for (const bi of bandPicks) {
      const b = BANDS[bi];
      this.fx.spawn(new QuestionGroupElement({
        pos: {
          x: W + 60 + rand(0, 1200), // 右画外大范围横向错位，组与组之间拉开距离
          y: H * (b.yMin + Math.random() * (b.yMax - b.yMin)), // 生成时定死，运动中不变
        },
        hues,
        sizeClass: rollSizeClass(),
        delay: rand(0, 7000), // 长窗口错峰入场：弹幕整体持续时间更长
      }));
    }
  }
}
