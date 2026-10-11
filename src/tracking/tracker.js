// 模块 2：Tracking —— 加载 MediaPipe 模型（脸 / 手 / 身体 / 人物分割），
// 每帧检测并产出统一的 SceneState：
// {
//   frame: {w, h},
//   face:  null | { center, chin, nose, bbox, faceWidth, eyes:{left,right}, landmarks },
//   hands: [ { palm, fingers, extCount, open, fist, fingertips, landmarks } ],
//   body:  null | { center, landmarks },
//   personMask: null | canvas,   // 人物剪影（白=人，透明=背景），供人物图层合成
// }

import {
  FilesetResolver,
  FaceLandmarker,
  HandLandmarker,
  PoseLandmarker,
  ImageSegmenter,
} from "/vendor/mediapipe/vision_bundle.mjs";
import { CONFIG } from "../config.js";
import { analyzeFace, analyzeHand } from "./scene.js";

const POSE_SHOULDERS = [11, 12];
const POSE_HIPS = [23, 24];

export class Tracker {
  constructor() {
    this.face = null;
    this.hand = null;
    this.pose = null;
    this.segmenter = null;
    this.personMask = null;   // canvas：每帧刷新的人物剪影
    this.segFlip = 0;         // 掩码极性：1=非0是人物 -1=非0是背景 0=未定（未定时不产出人物层）
    this.segBad = 0;          // 掩码连续不可用帧数（过长则停用分割）
    this.segFailures = 0;     // 分割连续失败即停用，避免每帧刷错误
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
    onProgress("LOADING MODELS 3/4");

    // 人物分割（可选）：失败不阻塞启动，只是问号弹幕改为人前飘过
    if (CONFIG.models.selfie) {
      try {
        this.segmenter = await make(ImageSegmenter, CONFIG.models.selfie, {
          outputCategoryMask: true,
          outputConfidenceMask: false,
        });
      } catch (err) {
        console.warn("[tracker] 人物分割模型不可用，弹幕将从人前飘过", err);
      }
    }
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

    // 人物分割：产出人物剪影（模型输出分辨率小，每帧运行开销低）。
    // 掩码极性自校准：人脸检测器告诉我们脸在哪——正确的掩码应为
    // 「脸区域=人物(非0)、画面四角=背景(0)」；两者对调说明该机器/输入下
    // 掩码极性反转，自动翻转使用。极性未判定、覆盖率异常（几乎全0或全1，
    // 意味着掩码失效）时不产出人物层——特效回到人前显示，宁可可见也不遮蔽。
    // 连续失败/连续坏掩码过长则停用分割，避免每帧空耗。
    if (this.segmenter) {
      try {
        this.segmenter.segmentForVideo(video, ts, (result) => {
          const mask = result.categoryMask;
          const mw = mask.width;
          const mh = mask.height;
          const data = mask.getAsUint8Array();

          // 帧坐标 -> 掩码坐标 的区块采样：返回非0占比
          const sample = (x, y, r) => {
            const x0 = Math.max(0, Math.floor(((x - r) / w) * mw));
            const x1 = Math.min(mw - 1, Math.ceil(((x + r) / w) * mw));
            const y0 = Math.max(0, Math.floor(((y - r) / h) * mh));
            const y1 = Math.min(mh - 1, Math.ceil(((y + r) / h) * mh));
            let nz = 0;
            let n = 0;
            for (let yy = y0; yy <= y1; yy++) {
              for (let xx = x0; xx <= x1; xx++) {
                n++;
                if (data[yy * mw + xx] > 0) nz++;
              }
            }
            return n ? nz / n : 0;
          };

          // 1) 极性判定（只需一次，有脸即可判）
          if (faceScene && this.segFlip === 0) {
            const faceHit = sample(
              faceScene.center.x, faceScene.center.y,
              Math.max(12, faceScene.faceWidth * 0.15),
            ) > 0.5;
            const cw = w * 0.05; // 四角各取 5% 宽度的角块
            const cornerHit = (
              sample(cw, cw, cw * 0.6)
              + sample(w - cw, cw, cw * 0.6)
              + sample(cw, h - cw, cw * 0.6)
              + sample(w - cw, h - cw, cw * 0.6)
            ) / 4 > 0.5;
            if (faceHit && !cornerHit) this.segFlip = 1;
            else if (!faceHit && cornerHit) this.segFlip = -1;
            // 两者同真/同假：掩码不可信，保持未定
          }

          // 2) 持续校验（极性已定时）：画面四角应始终是背景；
          //    覆盖率粗查（每 16 像素抽 1 个）：人物占比异常接近全屏也视为失效
          let usable = this.segFlip !== 0;
          if (usable) {
            const cw = w * 0.05;
            const cornerWrong = [
              [sample(cw, cw, cw * 0.6), cw, cw],
              [sample(w - cw, cw, cw * 0.6), w - cw, cw],
              [sample(cw, h - cw, cw * 0.6), cw, h - cw],
              [sample(w - cw, h - cw, cw * 0.6), w - cw, h - cw],
            ].filter(([v]) => (v > 0.5) === (this.segFlip === 1)).length; // 被判成人物的角数
            let nzCount = 0;
            let totalCount = 0;
            for (let i = 0; i < data.length; i += 16) {
              totalCount++;
              if (data[i] > 0) nzCount++;
            }
            const ratio = totalCount ? nzCount / totalCount : 0;
            if (cornerWrong >= 3 || ratio > 0.92 || ratio < 0.02) usable = false;
          }

          if (!usable) {
            this.segBad++;
            this.personMask = null;
            if (this.segBad > 240) {
              this.segmenter.close?.();
              this.segmenter = null;
              console.warn("[tracker] 人物分割掩码持续异常，已停用（特效改为人前显示）");
            }
          } else {
            this.segBad = 0;
            const personIsNonZero = this.segFlip === 1;
            if (!this.personMask || this.personMask.width !== mw || this.personMask.height !== mh) {
              this.personMask = document.createElement("canvas");
              this.personMask.width = mw;
              this.personMask.height = mh;
            }
            const g = this.personMask.getContext("2d");
            const img = g.createImageData(mw, mh);
            const px = img.data;
            for (let i = 0; i < data.length; i++) {
              if ((data[i] > 0) === personIsNonZero) {
                px[i * 4] = 255;
                px[i * 4 + 1] = 255;
                px[i * 4 + 2] = 255;
                px[i * 4 + 3] = 255;
              }
            }
            g.putImageData(img, 0, 0);
          }
          result.close();
        });
        this.segFailures = 0;
      } catch (err) {
        this.segFailures++;
        this.personMask = null;
        if (this.segFailures <= 3 || this.segFailures % 100 === 0) {
          console.warn("[tracker] person segment error", err);
        }
        if (this.segFailures >= 30) {
          this.segmenter.close?.();
          this.segmenter = null;
          console.warn("[tracker] 人物分割已停用（连续失败）");
        }
      }
    }

    return {
      frame: { w, h },
      face: faceScene,
      hands,
      body: this.cachedBody,
      personMask: this.personMask,
      stats: this.stats,
    };
  }
}
