// 统一的情绪状态管理：activeMood 是当前激活情绪的唯一事实来源。
//
//   null        → 情绪选择首页（不运行任何情绪的互动触发逻辑）
//   "HAPPY" 等  → 对应互动模式（只有该情绪的触发逻辑生效）
//
// 当前开放 5 种互动模式（MOODS）。SHY（害羞）的检测器、圆环元素与配置
// 全部保留，只是不出现在首页入口、也不参与触发（enabled: false）；
// 之后要恢复时把 enabled 改回 true 并加入 MOODS 即可。
// TIRED / CALM 的实现此前已按需求整体移除，无代码可停用（见 PROJECT_CONTEXT.md）。

import { CONFIG } from "../config.js";

/** 首页入口与互动模式的开放清单（顺序即展示顺序） */
export const MOODS = ["HAPPY", "SAD", "ANGRY", "SURPRISED", "CONFUSED"];

export const MOOD_META = {
  HAPPY:     { en: "HAPPY",     zh: "开心", color: CONFIG.colors.happy },
  SAD:       { en: "SAD",       zh: "悲伤", color: CONFIG.colors.sad },
  ANGRY:     { en: "ANGRY",     zh: "愤怒", color: CONFIG.colors.angry },
  SURPRISED: { en: "SURPRISED", zh: "惊讶", color: CONFIG.colors.surprised },
  CONFUSED:  { en: "CONFUSED",  zh: "困惑", color: CONFIG.colors.confused },
  // —— 暂停开放：代码与素材保留，入口与触发均不启用 ——
  SHY: { en: "SHY", zh: "害羞", color: CONFIG.colors.shy, enabled: false },
};

let current = null;
const listeners = new Set();

export const MoodState = {
  /** 当前激活情绪；null = 首页 */
  get active() { return current; },
  /** 切换激活情绪；重复设置同一情绪为 no-op 并返回 false */
  set(mood) {
    if (mood === current) return false;
    current = mood;
    for (const fn of listeners) fn(current);
    return true;
  },
  is(mood) { return current === mood; },
  /** 订阅变化（UI 同步用），返回取消订阅函数 */
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
