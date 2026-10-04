// 入口：组装 Webcam / Tracking / Gesture / FX / Controller，
// 驱动主循环并维护调试 HUD。
//
//   实时模式:  http://localhost:5173/
//             页面打开即自动请求摄像头权限；允许后立刻显示画面并持续检测，
//             动作实时触发叠加在画面上的视觉元素。全程无需任何按钮。
//   演示模式:  http://localhost:5173/?demo=1 （无需摄像头，合成动作走全流程）
//
// 快捷键: [D] 关键点调试开关  [C] 清空特效

import { CONFIG } from "./config.js";
import { Webcam } from "./core/webcam.js";
import { Tracker } from "./tracking/tracker.js";
import { GestureRecognizer } from "./gestures/recognizer.js";
import { FxLayer } from "./fx/fx-layer.js";
import { InteractionController } from "./controller/interaction-controller.js";
import { DemoDriver } from "./demo.js";
import { HAND_CONNECTIONS } from "./tracking/scene.js";

const videoEl = document.getElementById("cam");
const canvasEl = document.getElementById("fx");
const stageEl = document.getElementById("stage");
const overlayEl = document.getElementById("overlay");
const ovMsgEl = document.getElementById("ov-msg");
const ovRetryEl = document.getElementById("ov-retry");
const ovCopyEl = document.getElementById("ov-copy");
const hud = {
  status: document.getElementById("hud-status"),
  gesture: document.getElementById("hud-gesture"),
  effect: document.getElementById("hud-effect"),
};

const isDemo = new URLSearchParams(location.search).has("demo");
const showDebug = { on: true };

const fxLayer = new FxLayer();
const controller = new InteractionController(fxLayer);
const recognizer = new GestureRecognizer();
let tracker = null;
let webcam = null;
let demoDriver = null;

const ctx = canvasEl.getContext("2d");

function setStatus(text) {
  hud.status.textContent = text;
}

function showOverlay(html, { retry = false, copyLink = false } = {}) {
  overlayEl.classList.add("on");
  ovMsgEl.innerHTML = html;
  ovRetryEl.hidden = !retry;
  ovCopyEl.hidden = !copyLink;
}

ovCopyEl.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    ovCopyEl.textContent = "已复制 ✓ 粘贴到 Chrome 打开";
  } catch {
    ovCopyEl.textContent = location.href;
  }
});

function hideOverlay() {
  overlayEl.classList.remove("on");
}

ovRetryEl.addEventListener("click", () => location.reload());

/** 把 getUserMedia 的失败原因翻译成人话 */
function cameraErrorMessage(err) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      html: "摄像头权限被拒绝。<small>请点击浏览器地址栏的摄像头图标选择「允许」，<br>或到系统设置中给浏览器授权，然后点下面的按钮重试。</small>",
      retry: true,
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { html: "没有找到可用的摄像头。<small>请确认电脑有摄像头且没有被系统禁用。</small>", retry: true };
  }
  if (name === "NotReadableError") {
    return { html: "摄像头被其他应用占用。<small>请关闭正在使用摄像头的软件（如会议/直播工具）后重试。</small>", retry: true };
  }
  return { html: "摄像头启动失败。<small>" + (err?.message || name || "未知错误") + "</small>", retry: true };
}

async function boot() {
  if (isDemo) {
    setStatus("DEMO MODE\n(no camera — synthetic gestures)");
    demoDriver = new DemoDriver();
    canvasEl.width = 1280;
    canvasEl.height = 720;
    stageEl.style.setProperty("--ar", 1280 / 720);
    hideOverlay();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showOverlay(
      "此环境无法访问摄像头。<small>请通过 http://localhost 访问本页面（不要直接双击文件），<br>并使用较新的 Chrome / Edge / Safari。内嵌预览浏览器通常不支持摄像头。</small>",
    );
    setStatus("CAMERA ERROR");
    throw new Error("getUserMedia unavailable");
  }

  webcam = new Webcam(videoEl);
  tracker = new Tracker();

  // 摄像头与模型并行加载；状态统一渲染，避免互相覆盖
  const bootState = { cam: "REQUESTING CAMERA…", models: "LOADING MODELS…" };
  const renderStatus = () => setStatus(`${bootState.cam}\n${bootState.models}`);
  renderStatus();

  // 权限预检查：被拒时直接给修复指引，不等一个永远不会弹的框
  let permState = null;
  try {
    permState = (await navigator.permissions.query({ name: "camera" })).state;
  } catch {
    /* 部分浏览器不支持查询，忽略 */
  }
  if (permState === "denied") {
    showOverlay(
      "摄像头权限已被拒绝，页面无法自动开启摄像头。<small>点击地址栏左侧的摄像头 / ⟳ / ⓘ 图标，<br>把「摄像头」改为「允许」，然后点下面的按钮重试。</small>",
      { retry: true },
    );
    setStatus("CAMERA BLOCKED");
    throw new Error("camera permission denied (pre-check)");
  }

  showOverlay(
    "正在请求摄像头权限…<small>" +
      (permState === "prompt"
        ? "浏览器即将弹出询问，请点击「允许」。允许后将直接进入实时互动。"
        : "允许后将直接进入实时互动，无需其他操作。") +
      "</small>",
  );

  // 8 秒还没结果：大概率是内嵌预览浏览器不支持摄像头 / 没注意到权限弹窗 / 摄像头被占用
  let camSettled = false;
  const pendingHint = setTimeout(() => {
    if (camSettled) return;
    showOverlay(
      "摄像头一直没有响应。<small>常见原因：<br>" +
        "1）正在使用 <b>IDE / ZCode 的内嵌预览浏览器</b> —— 它不支持摄像头，<br>请点下方按钮复制地址，到 Chrome / Edge 打开；<br>" +
        "2）权限弹窗没注意到 —— 点击地址栏左侧的摄像头 / ⓘ 图标选择「允许」；<br>" +
        "3）摄像头被其他标签页或软件占用 —— 先关闭它们。</small>",
      { copyLink: true },
    );
  }, 8000);

  const camPromise = webcam
    .start()
    .then(() => {
      camSettled = true;
      clearTimeout(pendingHint);
      bootState.cam = "CAMERA OK";
      canvasEl.width = webcam.width;
      canvasEl.height = webcam.height;
      // 舞台宽高比跟随摄像头实际分辨率，保证特效与画面像素级对齐
      stageEl.style.setProperty("--ar", String(webcam.width / webcam.height));
      renderStatus();
    })
    .catch((err) => {
      camSettled = true;
      clearTimeout(pendingHint);
      console.error(err);
      const msg = cameraErrorMessage(err);
      showOverlay(msg.html, { retry: msg.retry });
      bootState.cam = "CAMERA ERROR";
      setStatus("CAMERA ERROR");
      throw err;
    });

  const modelPromise = tracker.init((msg) => {
    bootState.models = msg;
    renderStatus();
  });

  try {
    await camPromise;
  } catch (err) {
    throw err;
  }

  try {
    await modelPromise;
  } catch (err) {
    console.error(err);
    showOverlay(
      "识别模型加载失败。<small>模型存放在本项目的 models/ 目录，请确认文件完整后刷新重试。</small>",
      { retry: true },
    );
    setStatus("MODEL LOAD ERROR");
    webcam.stop();
    throw err;
  }

  hideOverlay();
  setStatus("CAMERA READY");
}

// ---------------- 调试绘制 ----------------

function drawDebug(ctx, scene) {
  ctx.save();
  ctx.lineWidth = 1.5;

  if (scene.face?.landmarks) {
    ctx.fillStyle = "rgba(0,255,200,0.35)";
    const lms = scene.face.landmarks;
    for (let i = 0; i < lms.length; i += 3) {
      ctx.fillRect(lms[i].x - 1, lms[i].y - 1, 2, 2);
    }
    // 眼睛 / 下巴标记
    ctx.strokeStyle = "rgba(0,255,200,0.8)";
    for (const side of ["left", "right"]) {
      const p = scene.face.eyes[side].pos;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeRect(scene.face.chin.x - 3, scene.face.chin.y - 3, 6, 6);
  }

  ctx.strokeStyle = "rgba(255,210,90,0.75)";
  ctx.fillStyle = "rgba(255,210,90,0.75)";
  for (const hand of scene.hands) {
    if (hand.landmarks) {
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(hand.landmarks[a].x, hand.landmarks[a].y);
        ctx.lineTo(hand.landmarks[b].x, hand.landmarks[b].y);
      }
      ctx.stroke();
      for (const p of hand.landmarks) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // demo 模式只有手掌点
      ctx.beginPath();
      ctx.arc(hand.palm.x, hand.palm.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (scene.body?.landmarks) {
    ctx.fillStyle = "rgba(140,160,255,0.5)";
    for (const p of scene.body.landmarks) {
      if (p.v > 0.5) ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
  }
  ctx.restore();
}

// ---------------- HUD ----------------

let lastHudUpdate = 0;
let fps = 0;

function updateHud(now, out, scene) {
  if (now - lastHudUpdate < 200) return;
  lastHudUpdate = now;
  const s = out.states;

  const gestures = [];
  if (s.openHands.length) gestures.push(`OPEN PALM ×${s.openHands.length}`);
  if (s.fistHands.length) gestures.push(`FIST ×${s.fistHands.length}`);
  if (s.coverFace) gestures.push("COVER FACE");
  if (s.chinReady) gestures.push("CHIN");
  if (s.stillActive) gestures.push("STILL");
  else if (s.stillSeconds > 0.5) gestures.push(`quiet ${s.stillSeconds.toFixed(1)}s`);
  if (s.surpriseActive) gestures.push("MOUTH OPEN");
  if (s.approachRatio > 1.12) gestures.push(`close ${s.approachRatio.toFixed(2)}×`);
  if (s.blinkValues) gestures.push(`blink L${s.blinkValues.left.toFixed(2)} R${s.blinkValues.right.toFixed(2)}`);
  // 表情遥测：方便对照 config.js 调阈值
  gestures.push(`jaw ${s.jawOpen.toFixed(2)} · wide ${s.eyeWide.toFixed(2)} · tilt ${s.tiltDeg.toFixed(0)}°`);
  // 检测器健康度：脸/身体是否在帧内被找到
  gestures.push(scene.face ? "FACE✓" : "FACE✗");
  gestures.push(scene.body ? "BODY✓" : "BODY✗");
  if (!s.faceSeen && !s.handsInfo.length) gestures.push("no face / no hands");
  // 人脸检测诊断：正常时 face 需要每帧都能找到
  const st = scene.stats;
  if (st && st.faceErrors > 0) gestures.push(`FACE-ERR ×${st.faceErrors}: ${st.faceErrorMsg}`);

  const effects = [];
  for (const [mood, n] of fxLayer.summary()) effects.push(`${mood}×${n}`);

  hud.gesture.textContent = "Gesture: " + (gestures.length ? gestures.join(" · ") : "-");
  hud.effect.textContent =
    "Effect: " + (effects.length ? effects.join(" ") : "-") + `   [${Math.round(fps)} fps]`;
}

// ---------------- 主循环 ----------------

let last = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 30);
  last = now;
  if (dt > 0) fps = fps * 0.9 + (1 / dt) * 0.1;

  let scene = null;
  try {
    scene = isDemo ? demoDriver.update(now) : tracker?.detect(videoEl, now);
  } catch (err) {
    console.error("[loop] detect failed", err);
  }
  if (!scene) return;

  const out = recognizer.update(scene, now);
  controller.update(out, scene, now, scene.frame);
  fxLayer.update(dt, scene, now);

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  if (showDebug.on) drawDebug(ctx, scene);
  fxLayer.draw(ctx);

  updateHud(now, out, scene);
}

// ---------------- 快捷键 ----------------

window.addEventListener("keydown", (e) => {
  if (e.key === "d" || e.key === "D") showDebug.on = !showDebug.on;
  if (e.key === "c" || e.key === "C") fxLayer.clear();
});

boot()
  .then(() => requestAnimationFrame(loop))
  .catch(() => {
    /* 错误已写入遮罩层与 HUD */
  });
