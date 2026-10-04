# Mood Booth · Prototype

基于电脑摄像头的互动视觉原型：识别简单上半身动作，在**正确的身体位置**生成对应的视觉动画。
当前阶段只验证核心链路：**开摄像头 → 识别动作 → 判断动作 → 位置绑定图形 → 动画播放 → 结束消失**。

HAPPY / SAD / ANGRY 等只是视觉效果的分类名，不判断真实心理情绪。

---

## 快速开始

```bash
cd "mood- booth"
python3 server.py
# 打开 http://localhost:5173 （首次会请求摄像头权限，点"允许"）
```

- 必须通过 `localhost` 访问（摄像头权限要求安全上下文），不要直接双击 index.html。
- 无需安装任何依赖、无需联网：MediaPipe 的 wasm 和三个模型已全部下载在本地（`vendor/`、`models/`）。
- 推荐 Chrome / Edge / Safari。
- 页面打开即自动请求摄像头权限：Chrome 弹窗建议选「**访问该网站时允许**」，之后每次打开都直接进入实时互动；
  权限被拒时页面会给出提示和「重试」按钮。
- 已在真机验证：Chrome + FaceTime 摄像头，双手关键点实时追踪、握拳触发爆炸线、30fps 左右
  （若嫌慢，可把 `config.js` 里的 `poseEveryNFrames` 调大或注释掉身体检测）。

**没有摄像头或想快速看效果：** 打开 `http://localhost:5173/?demo=1`，
页面会按时间表自动"表演"全部 7 个动作（张开手掌 → 握拳 → 眨眼 → 遮脸 → 静止 → 靠近 → 托下巴，28 秒一循环），
走的是和摄像头完全相同的识别→触发→动画管线。

### 快捷键

| 按键 | 作用 |
| --- | --- |
| `D` | 开关关键点调试图层（脸/手/身体小点） |
| `C` | 清空场上所有特效 |

---

## 7 种互动与触发方式

| 分类 | 动作 | 判定方法 | 视觉效果 | 防重复触发 |
| --- | --- | --- | --- | --- |
| HAPPY | 张开手掌 | 伸直手指数 ≥ 4（手腕-关键点距离比，对旋转不敏感） | 花朵+星星从手掌生长/扩散，持续张开每 0.9s 补充 | 上升沿触发 + 持续期节流 |
| SAD | 眨眼 | blendshape eyeBlink 滞回（>0.5 闭 / <0.25 睁） | 一滴眼泪从对应眼睛下方滴落 | 完整“睁→闭→睁”过程才算一次，单眼 0.6s 冷却 |
| ANGRY | 握拳 | 伸直手指数 ≤ 1 | 爆炸线从拳头发散 + 冲击环 + 短震动 | 仅握拳上升沿，松拳再握才下一次 |
| SHY | 双手遮脸 | 双手掌心同时落入放大的脸框（脸丢失时用 0.9s 内缓存） | 不规则手绘圆环从脸中心扩散并跟随脸部 | 状态期间每 0.38s 一个环；结束加速淡出 |
| TIRED | 静止 3–5 秒 | 鼻尖/身体中心/手掌运动速度 EMA 低于阈值；眼睛持续闭合会缩短等待 | 云（漂浮）+ 水流（波动）+ 风向线（滑行） | 满 5s（闭眼最短 3s）进入；明显移动退出并淡出 |
| SURPRISED | 张大嘴巴 **或** 靠近摄像头 | jawOpen blendshape ≥ 0.5 保持 0.25s（说话通常 < 0.4，不会误触）；脸宽/基线 > 1.28 | 烟花线从脸部迸发 | 两条路径共用 1s 冷却；嘴闭上回落才重新武装 |
| CONFUSED | 手指指到下巴 | 指尖距下巴 < 0.55×脸宽 | 弯曲线从下巴缓慢生长 + 轻微抖动 | 上升沿 + 2.8s 冷却，移开再指才下一次 |

优先级：遮脸 / 手靠近下巴时会抑制张开手掌和握拳的判定（手在脸上的姿态不可信）。
HUD 常驻显示 `jaw / wide / tilt` 遥测值，方便对照 `config.js` 里的 `surprise.*` / `chin.tiltRadians` 调阈值。

---

## 代码结构

```
mood- booth/
├── server.py                    # 本地静态服务器（python3 标准库，无依赖）
├── index.html / styles.css      # 页面：video + 叠加 canvas + HUD
├── vendor/mediapipe/            # tasks-vision 0.10.14 JS + wasm（本地化）
├── models/                      # face / hand / pose 三个 .task 模型
└── src/
    ├── main.js                  # 入口：主循环、HUD、调试图层、快捷键
    ├── config.js                # ★ 所有可调参数集中在这里
    ├── core/
    │   ├── webcam.js            # 1. Webcam：摄像头调用与显示
    │   └── math.js              #    工具 + 轻量伪噪声
    ├── tracking/
    │   ├── tracker.js           # 2. Tracking：三个模型加载与逐帧检测
    │   └── scene.js             #    关键点换算（镜像）、手/脸姿态分析
    ├── gestures/
    │   ├── recognizer.js        # 3. Gesture 汇聚：输出 {events, states} + 锚点缓存
    │   └── detectors/           #    7 个动作各一个文件，可独立调参/替换
    ├── fx/
    │   ├── element.js           # 4. 元素基类：生命周期/淡入淡出/锚点/贴图
    │   ├── fx-layer.js          #    图层：生成/回收/绘制/统计
    │   └── elements/            #    花/星/水滴/爆炸线/圆环/云/水流/风向线/烟花/弯曲线
    ├── animation/
    │   ├── easing.js            # 5. Animation：缓动函数
    │   └── behaviors.js         #    下落/漂浮/抖动/阻尼等运动行为
    ├── controller/
    │   └── interaction-controller.js  # 6. Controller：触发/持续/冷却/退出
    └── demo.js                  # ?demo=1 合成动作时间表
```

**坐标约定**：视频 CSS 镜像（自拍视角），JS 里对 x 做 `(1-x)` 翻转，所有模块拿到的都是屏幕像素坐标。
特效位置不写死：水滴绑定眼睛、花朵绑定手掌、爆炸线绑定拳头、圆环锚定脸中心（脸短暂丢失时停在最后位置）。

---

## 调参（src/config.js）

所有阈值集中配置，常用项：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `stillness.requiredMs` | 5000 | 静止触发时长 |
| `stillness.motionThreshold` | 0.045 | 低于视为静止（归一化速度/秒），嫌太敏感就调大 |
| `approach.triggerRatio` | 1.28 | 脸宽相对基线的触发倍数 |
| `blink.cooldownMs` | 600 | 眨眼冷却 |
| `chin.cooldownMs` / `radiusOfFaceWidth` | 2800 / 0.55 | 托下巴的冷却 / 判定半径 |
| `hand.openFingersNeeded` / `fistMaxFingers` | 4 / 1 | 张开/握拳的手指数阈值 |
| `coverFace.ringIntervalMs` | 380 | 遮脸时圆环生成间隔 |

---

## 替换正式视觉素材

占位图形全部是 Canvas 矢量绘制（`src/fx/elements/*.js` 的 `paint()`）。
元素基类内置贴图通道——**形状类**元素（花朵/星星/水滴/云/圆环等）不用改结构即可换成你的 PNG/SVG：

```js
import { FlowerElement } from "./fx/elements/flower.js";
const el = new FlowerElement({ pos, color });
el.sprite = new Image();
el.sprite.src = "/assets/flower.png";   // 贴图加载完成后自动替代矢量绘制
// 缩放/旋转/淡入淡出/锚点逻辑全部不变；SVG 同理（需有内在尺寸）
controller.fx.spawn(el);
```

更彻底的做法：在 `fx/elements/` 里新增自己的类，继承 `FxElement`，只重写 `paint(ctx)`（局部坐标系、以原点为中心）。
线条类效果（爆炸线/烟花/弯曲线/水流/风向线）目前是程序化动画，替换素材时建议做成序列帧或保留程序化绘制。

如果之后提供精灵图，也可以在 `config.js` 加一个素材表，由 Controller 生成元素时统一带上 `sprite`。

---

## 技术说明

- 识别：MediaPipe Tasks Vision 0.10.14（FaceLandmarker + blendshapes / HandLandmarker / PoseLandmarker），
  优先 GPU delegate，失败自动回退 CPU；身体检测隔帧运行以省性能。
- 模型与 wasm 已本地化（来源 Google MediaPipe，Apache-2.0），运行时不依赖外网。
- 身体定位：PoseLandmarker 肩+髋中心 = 身体中心；运动量取鼻尖/身体中心/手掌位移的均值并按画布宽度归一化。

## 已知限制 / 下一步

- 手的左右命名按屏幕位置（0=左 1=右），未区分解剖学左右手；对当前效果无影响。
- 阈值是为 1280×720、正常坐姿标定的，换场地/距离后大概率需要微调 `config.js`。
- 摄像头权限被拒时页面会显示提示和「重试」按钮；刷新页面重新授权即可。
- 若个别机器上 GPU 人脸检测异常（HUD 出现 `FACE-ERR`），把 `config.js` 里
  `models.faceDelegate` 改成 `"CPU"` 即可绕过。
