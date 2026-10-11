# PROJECT_CONTEXT — Mood Booth 开发上下文

> 本文件是项目的轻量上下文档案，供后续开发快速恢复现场。
> **使用规则**：每次修改前先读本文件 + 与当前任务直接相关的代码；任务完成后只更新发生变化的章节（当前状态 / 已知问题 / 下一步），不重写全文。只记结论和规则，不贴大段代码。
> 详细交互说明见 `README.md`（注意：README 部分章节落后于代码，以代码为准，差异在下方"已知问题"标注）。

---

## 1. 项目目标与技术架构

**目标**：基于电脑摄像头的互动视觉原型。识别上半身动作（手势 / 表情 / 头部 / 身体），在**正确的身体位置**生成对应视觉动画。HAPPY / SAD / ANGRY 等只是效果分类名，不判断真实情绪。

**架构**：纯前端 ES Modules，无构建步骤、无 npm 依赖。单页 + requestAnimationFrame 主循环，数据流单向：

```
情绪选择首页（底部情绪栏）→ MoodState.activeMood（null=首页 / 情绪名=互动模式）
Webcam / DemoDriver → Tracker.detect()（MediaPipe 三模型）
  → scene（屏幕像素坐标的关键点 + 姿态分析）
  → GestureRecognizer.update() → { events(边沿触发), states(持续状态) }
  → InteractionController.update(…, activeMood)（模式隔离门控 + 触发/冷却/退出规则 → spawn 特效元素）
  → FxLayer.update()/draw()（生命周期 + Canvas 绘制）
```

演示模式 `?demo=1` 用 DemoDriver 生成合成 scene，走完全相同的下游管线，且传 `activeMood="ALL"` 绕过模式隔离（保留原有全流程演示行为，含 SHY 圆环）。

## 2. 文件结构与各文件作用

```
mood- booth/                        ← 注意目录名含空格
├── server.py                       # python3 标准库静态服务器（端口 5173），无依赖
├── index.html / styles.css         # video + 叠加 canvas(#fx) + HUD + 权限遮罩层
│                                   # + 底部情绪选择栏(#mood-bar，入口由 main.js 生成)
│                                   # + 互动模式界面(#back-home 左上返回 / #mode-badge 右上模式提示，body[data-view] 控制显隐)
├── vendor/mediapipe/               # tasks-vision 0.10.14 JS + wasm（本地化，代码只引用这个目录）
├── vendor/mediapipe-0.10.14-bak/   # 备份，代码未引用
├── models/*.task / *.tflite        # face / hand / pose 三模型 + selfie_segmenter 人物分割（本地化）
├── assets/{happy,sad,angry,confused,surprised}/*.png   # 上传的像素素材，经 asset-library.js 清单加载（surprised/ = 用户上传的 9 种烟花剪影，已裁剪透明底）
└── src/
    ├── main.js                     # 入口：boot（摄像头/模型并行加载+错误引导）、主循环、HUD、调试图层、快捷键
    ├── config.js                   # ★ 所有可调参数集中于此（手势阈值/冷却/模型路径/配色）
    ├── demo.js                     # ?demo=1 合成动作时间表（28s 循环 7 个动作）
    ├── core/webcam.js              # getUserMedia 封装
    ├── core/math.js                # rand / pick / noise1
    ├── tracking/tracker.js         # 三模型加载（GPU 优先，人脸可单独降级 CPU）、逐帧检测
    ├── tracking/scene.js           # 关键点镜像换算、手指数统计、脸/眼/下巴分析、HAND_CONNECTIONS
    ├── gestures/recognizer.js      # 聚合 9 个检测器 → {events, states}；锚点缓存（脸丢失 1.2s 内仍可用）
    ├── gestures/detectors/*.js     # 每个动作一个独立检测器（含各自防抖/冷却），可单独调参    ├── fx/element.js               # FxElement 基类：age/duration 生命周期、淡入淡出、anchor 跟随、sprite 通道
    ├── fx/fx-layer.js              # 元素容器：spawn/回收/绘制/统计；超上限淘汰非 permanent 元素
    ├── fx/asset-library.js         # 素材库：清单(ASSET_MANIFEST) + 加载预缩放(320px) + JPG白底兜底 + 按色相换色 + sprite 缓存
    ├── fx/elements/                # 各特效元素类（见第 3 节）；firework.js 与 head-question.js 已被新效果替代、文件保留未引用
    ├── animation/easing.js         # smoothstep / easeOutBack 等缓动
    ├── animation/behaviors.js      # fall / driftWave / wobble / applyDamping 运动行为
    └── controller/interaction-controller.js  # 7 种情绪的触发/持续/冷却/退出 → 生成对应元素；update() 按 activeMood 门控（EVENT_MOOD 映射），resetMoodState() 供模式切换重置冷却
    └── controller/mood-state.js      # ★ activeMood 唯一状态源：MOODS 开放清单 / MOOD_META（含 SHY enabled:false）/ MoodState 订阅
```

## 3. 已实现的核心功能（6 种互动）

> TIRED（静止触发云/水流/风向线）已按需求整体移除（检测器与元素文件已删除）。
>
> **模式结构**（2026-10）：页面为「情绪选择首页 + 独立互动模式」。首页底部情绪栏只显示
> HAPPY / SAD / ANGRY / SURPRISED / CONFUSED 五个入口；SHY（害羞）代码与素材全部保留但
> 暂停开放（`mood-state.js` 中 `enabled: false`，不显示入口、不触发互动）。进入某模式后
> 只有该情绪的触发逻辑生效；左上角「← 返回首页」退出。各情绪的检测阈值、生成逻辑、
> 动画表现与拆分前完全一致（隔离只做在 controller 事件消费层，见第 4 节规则 10）。

| 情绪 | 触发 | 视觉实现（元素类） |
| --- | --- | --- |
| HAPPY | 张开手掌（上升沿，600ms 冷却） | `pixel-motif.js`：PNG 花卉/星屑贴图（assets/happy/），随机色相换色，掌心周围 pop 出现后原地安家，持续轻风摆动+倾摆；**手掌带动**见第 4 节 |
| SAD | 眨眼（blendshape 滞回，单眼 600ms） | `teardrop.js`：PNG 水滴（assets/sad/），重力下落 → 底部圆形碰撞堆成小球堆（固定步长求解器），堆积期间 `permanent=true` 不被淘汰 |
| ANGRY | 握拳+明显挥动（速度阈值 380px/s） | `angry-blast.js`：PNG 爆炸纹样（assets/angry/）绕拳头 8 罗盘方向取 5-7 个，朝向=拳心→图案位置（尖角向外），生成后固定不跟随 |
| SHY | 双手遮脸（持续状态） | `ring.js`：每 380ms 一个圆环从脸中心扩散，锚定脸中心；结束加速淡出 |
| TIRED | 静止 5s（闭眼最短 3s） | `cloud/water-flow/wind-line.js`：程序化云/水流/风向线，恢复移动全部淡出 |
| SURPRISED | 张大嘴 ≥0.5 保持 0.25s **或** 靠近（脸宽/基线>1.28），共用 1s 冷却 | `pixel-firework.js` 三阶段烟花齐射：每次触发 **10–14 枚**从底部密集错峰升空（像素方块阶梯尾迹，程序绘制）→ 上部散开目标点（y∈[0.06H,0.48H]，最小间距防扎堆）→ 烟花 PNG 按源像素分块、按「块到像素质心的距离」由内向外揭示（复用原素材像素，不重绘）→ 完整停留 0.9–1.6s → 淡出 0.7–1s（单枚全生命周期约 2.9–4.4s，各阶段时长在 `surpriseFx.riseMs/revealMs/holdMs/fadeMs` 可调）。素材 assets/surprised/fw-01..09.png（用户上传的 9 种黑色剪影烟花，提取时 alpha 膨胀 +4px/侧加粗线条后裁剪，flat 平涂染色，半宽 60–135 逐枚随机形成大小层次），每次随机样式+1 种明亮色相（黄/粉/紫/蓝/青绿），场上上限 48 枚（`surpriseFx`）。旧 `firework.js` 已弃用（文件保留未引用） |
| CONFUSED | 食指靠近下巴（<0.55×脸宽，2.8s 冷却） | `question-group.js`（PNG 问号按色相平涂，每次触发固定 **3 种**配色）+ 弹幕：每次触发 **44–56 组**从右向左**快速**横穿全屏（速度 280–400px/s），完全离开左缘才结束；编组用**预排版的整排问号素材**（qrow-big=3 个/组、qrow-small=4 个/组）；整组半宽三档 s[48,64]/m[82,104]/l[96,112]，组数配比 小25%/中55%/大20%；**组间横向距离靠三重错开**：右画外 x 错位(60–1260px)、入场延迟(0–7s，弹幕整体持续更久)、速度差；**behindPerson=true：绘制在人物图层之下，满屏飘过、遇人物从背后经过不被遮挡**。头顶大问号已按需求移除（`head-question.js` 文件保留但无人引用） |

最新一轮开发：HAPPY 花卉 PNG 素材体系 + 摆动/手掌带动；CONFUSED 问号弹幕（整排素材编组、全屏分布带、3 配色、组间三重错开、人后飘过的人物分割图层 + 掩码极性自校准、头顶大问号已移除）。

## 4. 关键交互逻辑与不可破坏的设计规则

1. **坐标约定**：视频 CSS 镜像（自拍视角），JS 对 x 做 `(1-x)` 翻转；所有模块统一使用屏幕像素坐标。特效位置不写死，一律锚定身体部位（水滴→眼、爆炸→拳、圆环→脸中心等）。
2. **events 与 states 分离**：瞬时动作用边沿事件（一次生成），持续状态由 controller 每帧 sustain（如 SHY 圆环、TIRED 环境）。防重复靠：检测器内防抖/滞回 + controller 冷却 Map + "退出后重新进入才再触发"。
3. **误触发抑制**：遮脸/托下巴时抑制张开手掌与握拳的判定（recognizer.js 中 `suppressHandGestures`）。调整手势判定时不得绕过该抑制。
4. **元素生命周期**：`FxElement` 的 age/duration/fadeIn/fadeOut 统一由基类管理；提前退场用 `beginFadeOut(ms)`，不得直接改 done。子类只重写 `onUpdate()` 和 `paint()`（局部坐标，中心为原点）。`anchor(scene)=>{x,y}` 返回 null 时停在原地（脸短暂丢失不断裂）。
5. **HAPPY 花卉物理**（pixel-motif.js，调参勿改结构）：花安家在 `base` 点，`pos = base + 摆动/浮动`；手掌只在 `PUSH_RADIUS=115px` 内按"掌心速度×距离权重"带动 `vel`（刚度 9/s），离开后阻尼 3.2/s 滑停在新位置；速度上限 640px/s；只拦截出画面方向，不做硬回拉。**手掌不是固定跟随点**——这是设计意图，勿改回全局跟随。
6. **素材管线**：新素材必须加进 `asset-library.js` 的 `ASSET_MANIFEST`（支持 `sat` 饱和度 / `lum` 提亮 / `flat` 平涂染色 / `trim` 裁透明边）。换色按亮度重构（保留明暗层次与 alpha），sprite 缓存键为 `assetId|hue`。加载时预缩放到最长边 320px。
7. **所有阈值集中在 `src/config.js`**，不要在模块里散落魔法数字（pixel-motif 的手掌物理常量除外，在文件头部集中定义）。
8. **场上元素上限** `fx.maxElements=240`，超出淘汰最老的非 permanent 元素（水滴堆受保护）。
9. **图层堆叠（人后飘过机制）**：#stage 内画布顺序 = `#cam`(视频) → `#fx-back`(背景特效) → `#person`(人物剪影) → `#fx`(前景特效)。`behindPerson=true` 的元素画到 #fx-back；#person 每帧用 tracker 的 `scene.personMask`（ImageSegmenter 剪影，白=人物）对视频帧做 `destination-in` 抠出人像，其 CSS 与视频同样 `scaleX(-1)` 镜像。**掩码极性随输入分辨率而变**（实测 256×256 输入时人物=非0，1280×720 时人物=0），因此 tracker 内置自校准：用人脸检测位置当真值采样（脸区域应为人物、四角应为背景）判定极性并自动翻转；极性未定、四角持续被判成人物、或覆盖率 >92%/<2% 时该帧不产出人物层，特效整体回到人前显示（宁可可见不可误遮）；连续异常 240 帧停用分割。分割模型加载失败或 demo 模式 → 人物层留空，特效照常人前显示。
10. **模式隔离（activeMood 门控）**：`mood-state.js` 的 `MoodState.active` 是唯一状态源（null=首页，`"ALL"`=演示模式）。隔离只做在 `InteractionController.update()` 的事件消费层（`EVENT_MOOD` 事件→情绪映射）：非当前情绪的事件直接忽略、`sustainShy` 仅 SHY 模式运行；**追踪/识别服务（tracker/recognizer/全部检测器）照常共享运行，不改检测阈值与防抖逻辑**（遮脸/托下巴对手势的抑制链路保持原样，保证各情绪"动作识别"与拆分前一致）。首页(activeMood=null)任何事件都不消费、不生成特效。模式退出/切换 = `fxLayer.clear()`（沿用快捷键 C 的清理语义，含带入场延迟的烟花/问号）+ `controller.resetMoodState()`（仅清冷却 Map，不清检测器内部状态）→ 摄像头/追踪不重启、不重复初始化、主循环只有一个 rAF。

## 5. 当前已知问题

- **README 部分内容过时**：其"替换正式视觉素材"章节（sprite 通道用法）和互动表格中 HAPPY/SAD/ANGRY/CONFUSED 的视觉描述落后于代码现状，以代码为准；后续改功能时顺带更新 README 对应行即可。
- 阈值按 1280×720、正常坐姿标定，换场地/距离需微调 `config.js`。
- 个别机器 GPU 人脸检测异常（HUD 出现 `FACE-ERR`）→ 把 `models.faceDelegate` 改 `"CPU"`。
- 手的左右命名按屏幕位置，未区分解剖学左右手（当前无影响）。
- 摄像头启动失败/权限被拒时，#overlay 权限遮罩常驻并盖住舞台内的「← 返回首页」（z-index 低于遮罩）；此时底部情绪栏（舞台外）仍可切换模式，摄像头就绪后遮罩消失、返回按钮恢复可点。
- Git 仓库尚无任何提交（全部文件处于未跟踪状态），无回滚点。

## 6. 下一步开发计划

- 恢复 SHY 入口：在 `mood-state.js` 把 SHY 的 `enabled` 改回 true 并加入 `MOODS` 数组即可（检测器/ring 元素/配置均保留，controller 门控按 activeMood==="SHY" 自动放行）。
- SHY / SURPRISED 的视觉仍是程序化矢量/线条，尚未素材化（HAPPY/SAD/ANGRY/CONFUSED 已完成 PNG 化）——如需继续，按 asset-library 管线扩展。
- 视实际反馈微调花卉摆动幅度/手掌带动参数（pixel-motif.js 头部常量）。
- 建议尽快做一次初始 git 提交，建立回滚点。
- 涉及结构调整的模块化建议需先征得用户同意再动手（见第 1 节使用规则）。

## 7. 运行方式与技术注意事项

```bash
cd "mood- booth"     # 目录名含空格，命令行要加引号
python3 server.py    # → http://localhost:5173
```

- 必须 localhost 访问（摄像头安全上下文），不能双击 index.html；推荐 Chrome/Edge/Safari。IDE 内嵌预览浏览器不支持摄像头，页面会给出复制链接引导。
- `?demo=1` 无摄像头自动演示；快捷键 `D` 开关关键点调试图层、`C` 清空特效。
- 完全离线运行：MediaPipe wasm 与四模型（face/hand/pose/selfie_segmenter）均已本地化；GPU delegate 优先，失败自动回退 CPU；pose 隔帧检测省性能；人物分割连续失败 30 次自动停用。
- 素材库加载失败不阻塞启动（特效走兜底表现），控制台会有 `[assets]` 警告。
