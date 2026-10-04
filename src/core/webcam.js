// 模块 1：Webcam —— 摄像头调用与 <video> 显示。

import { CONFIG } from "../config.js";

export class Webcam {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.width = 0;
    this.height = 0;
  }

  /** 请求摄像头并等待视频可读。成功返回 true，失败抛出可读错误。 */
  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("此浏览器不支持 getUserMedia（需要 Chrome / Edge / Safari，且通过 localhost 访问）");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: CONFIG.video.width },
        height: { ideal: CONFIG.video.height },
        facingMode: CONFIG.video.facingMode,
      },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await new Promise((resolve) => {
      if (this.video.readyState >= 2) return resolve();
      this.video.onloadedmetadata = resolve;
    });
    await this.video.play();
    this.width = this.video.videoWidth;
    this.height = this.video.videoHeight;
    return true;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }
}
