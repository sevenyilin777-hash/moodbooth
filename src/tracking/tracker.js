// 模块 2：Tracking —— 加载 MediaPipe 三个模型（脸 / 手 / 身体），
// 每帧检测并产出统一的 SceneState：
// {
//   frame: {w, h},
//   face:  null | { center, chin, nose, bbox, faceWidth, eyes:{left,right}, landmarks },
//   hands: [ { palm, fingers, extCount, open, fist, fingertips, landmarks } ],
//   body:  null | { center, landmarks },
// }

import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from "/vendor/mediapipe/vision_bundle.mjs";
import { CONFIG } from "../config.js";
import { analyzeFace, analyzeHand } from "./scene.js";

const POSE_SHOULDERS = [11, 12];
const POSE_HIPS = [23, 24];

export class Tracker {
  constructor() {
    this.face = null;
    this.hand = null;
    this.pose = null;
    this.frameCount = 0;
    this.lastTs = 0;
    this.cachedBody = null;
    // 诊断统计：人脸检测在真机上不工作时，从这里能看到原因
    this.stats = { frames: 0, faceFound: 0, faceErrors: 0, faceErrorMsg: "" };
  }

  /** 加载模型；GPU 失败自动回退 CPU。 */
  async init(onProgress = () => {}) {
    onProgress("LOADING MODELS 0/3");
    const fileset = await FilesetResolver.forVisionTasks(CONFIG.models.wasmBase);

    const make = async (Cls, modelPath, options) => {
      for (const delegate of ["GPU", "CPU"]) {
        try {
          return await Cls.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: modelPath, delegate },
            runningMode: "VIDEO",
            ...options,
          });
        } catch (err) {
          if (delegate === "CPU") throw err;
          console.warn(`[tracker] ${Cls.name} GPU 初始化失败，回退 CPU`, err);
        }
      }
    };

    // 人脸单独创建：faceDelegate 可在 config.js 里强制 CPU，
    // 绕过某些版本 GPU delegate + blendshapes 静默返回空结果的问题
    const createFace = async () => {
      const first = CONFIG.models.faceDelegate === "CPU" ? "CPU" : "GPU";
      const delegates = first === "CPU" ? ["CPU", "GPU"] : ["GPU", "CPU"];
      let lastErr;
      for (const delegate of delegates) {
        try {
          return await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: CONFIG.models.face, delegate },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
          });
        } catch (err) {
          lastErr = err;
          console.warn(`[tracker] FaceLandmarker ${delegate} 初始化失败`, err);
        }
      }
      throw lastErr;
    };

    this.face = await createFace();
    onProgress("LOADING MODELS 1/3");

    this.hand = await make(HandLandmarker, CONFIG.models.hand, {
      numHands: CONFIG.hand.numHands,
    });
    onProgress("LOADING MODELS 2/3");

    this.pose = await make(PoseLandmarker, CONFIG.models.pose, {
      numPoses: 1,
    });
    onProgress("MODELS READY");
  }

  /**
   * 对当前视频帧做检测，返回 SceneState（视频未就绪时返回 null）。
   * @param {HTMLVideoElement} video
   * @param {number} nowMs performance.now()
   */
  detect(video, nowMs) {
    if (video.readyState < 2 || !this.face) return null;
    const w = video.videoWidth;
    const h = video.videoHeight;
    // MediaPipe 要求时间戳严格递增
    const ts = Math.max(nowMs, this.lastTs + 1);
    this.lastTs = ts;
    this.frameCount++;
    this.stats.frames++;

    let faceScene = null;
    try {
      const res = this.face.detectForVideo(video, ts);
      if (res.faceLandmarks?.length) {
        faceScene = analyzeFace(res.faceLandmarks[0], res.faceBlendshapes?.[0], w, h);
        this.stats.faceFound++;
      }
    } catch (err) {
      this.stats.faceErrors++;
      this.stats.faceErrorMsg = String(err?.message || err).slice(0, 140);
      if (this.stats.faceErrors <= 3 || this.stats.faceErrors % 100 === 0) {
        console.warn("[tracker] face detect error", err);
      }
    }

    let hands = [];
    try {
      const res = this.hand.detectForVideo(video, ts);
      if (res.landmarks?.length) {
        hands = res.landmarks.map((lm) => analyzeHand(lm, w, h));
        // 给手一个稳定 id：按屏幕位置左右排序（0=左 1=右）
        hands.sort((a, b) => a.palm.x - b.palm.x);
        hands.forEach((hd, i) => { hd.id = i; });
      }
    } catch (err) {
      console.warn("[tracker] hand detect error", err);
    }

    // 身体隔帧检测，缓存上一次结果
    if (this.pose && this.frameCount % CONFIG.poseEveryNFrames === 0) {
      try {
        const res = this.pose.detectForVideo(video, ts);
        const lm = res.landmarks?.[0];
        if (lm) {
          const pts = lm.map((p) => ({
            x: (CONFIG.mirror ? 1 - p.x : p.x) * w,
            y: p.y * h,
            v: p.visibility ?? 1,
          }));
          const anchors = [...POSE_SHOULDERS, ...POSE_HIPS].map((i) => pts[i]).filter((p) => p.v > 0.5);
          const center = anchors.length
            ? {
                x: anchors.reduce((s, p) => s + p.x, 0) / anchors.length,
                y: anchors.reduce((s, p) => s + p.y, 0) / anchors.length,
              }
            : null;
          this.cachedBody = { center, landmarks: pts };
        } else {
          this.cachedBody = null;
        }
      } catch (err) {
        console.warn("[tracker] pose detect error", err);
      }
    }

    return {
      frame: { w, h },
      face: faceScene,
      hands,
      body: this.cachedBody,
      stats: this.stats,
    };
  }
}
