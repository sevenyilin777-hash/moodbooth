// 全局配置：所有可调参数集中在这里，方便后续调优。

export const CONFIG = {
  // ---------- 摄像头 ----------
  video: { width: 1280, height: 720, facingMode: "user" },
  mirror: true,          // 自拍镜像：视频 CSS 翻转，坐标在 JS 中做 (1-x) 镜像

  // ---------- 检测模型 ----------
  models: {
    wasmBase: "/vendor/mediapipe/wasm",
    face: "/models/face_landmarker.task",
    hand: "/models/hand_landmarker.task",
    pose: "/models/pose_landmarker_lite.task",
    // 人脸模型单独的 delegate：GPU 正常可用；若个别机器上异常可改 "CPU"
    faceDelegate: "GPU",
  },
  poseEveryNFrames: 2,   // 身体检测隔帧跑一次，省性能

  // ---------- 手部 ----------
  hand: {
    numHands: 2,
    openFingersNeeded: 4,   // 伸直手指数 >= 4 判定张开手掌（拇指可选）
    fistMaxFingers: 1,      // 伸直手指数 <= 1 判定握拳
    debounceFrames: 3,      // 状态需连续 N 帧一致才切换（防抖）
  },

  // ---------- 眨眼 (SAD) ----------
  blink: {
    closedAt: 0.5,          // blendshape > 0.5 视为闭眼
    openAt: 0.25,           // blendshape < 0.25 视为睁眼（滞回区间防抖）
    cooldownMs: 600,        // 单眼两次触发的最小间隔
    dropsPerBlink: 1,       // 一次有效眨眼生成一滴眼泪
  },

  // ---------- 双手遮脸 (SHY) ----------
  coverFace: {
    margin: 0.45,           // 手掌落点允许超出脸部包围盒的比例（相对脸宽）
    minHoldMs: 250,         // 需持续遮挡这么久才进入状态
    ringIntervalMs: 380,    // 圆环生成间隔
  },

  // ---------- 静止 (TIRED / CALM) ----------
  stillness: {
    requiredMs: 5000,       // 保持静止 5 秒触发（3–5s 区间的上限）
    drowsyBonusMs: 2000,    // 眼睛持续闭合时最多缩短的等待（打盹加成，最短约 3s）
    motionThreshold: 0.045, // 归一化运动速度低于该值视为“静止”
    exitThreshold: 0.09,    // 高于该值才退出（滞回）
    smooth: 0.12,           // 运动速度 EMA 平滑系数
  },

  // ---------- 张大嘴巴 (SURPRISED) ----------
  surprise: {
    jawOpenAt: 0.5,         // jawOpen blendshape 超过该值判定“张大嘴”（说话通常 < 0.4）
    minHoldMs: 250,         // 嘴巴需保持张开这么久才触发
    rearmJaw: 0.2,          // 嘴闭上回落到该值以下才重新武装
    cooldownMs: 2000,
  },

  // ---------- 靠近摄像头 (SURPRISED 之靠近路径) ----------
  approach: {
    baselineMs: 2500,       // 脸部尺寸基线的平滑时间
    triggerRatio: 1.28,     // 当前脸宽 / 基线 超过该值触发
    rearmRatio: 1.08,       // 回落到该值以下才重新武装
    minFaceAgeMs: 800,      // 刚出现脸的 0.8s 内不判定
    cooldownMs: 1200,       // 两次烟花之间的最小间隔
  },

  // ---------- 手指指到下巴 (CONFUSED) ----------
  chin: {
    radiusOfFaceWidth: 0.55, // 指尖与下巴距离 < 0.55 * 脸宽 判定“指到下巴”
    cooldownMs: 2800,
  },

  // ---------- 通用 ----------
  fx: {
    maxElements: 240,       // 场上元素上限，超出丢弃最老的
  },

  // 各情绪的占位配色（之后替换正式素材时可继续用 tint 或完全弃用）
  colors: {
    happy:     "#ff8fc7",
    happyAlt:  "#ffd166",
    sad:       "#6fb7ff",
    angry:     "#ff5a4e",
    shy:       "#ffb3c1",
    tired:     "#9ad0d8",
    tiredAlt:  "#e8f4f6",
    surprised: "#ffd166",
    confused:  "#b39ddb",
  },
};
