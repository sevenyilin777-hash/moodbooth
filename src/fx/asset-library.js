// 素材库：加载上传的 PNG 贴图，并提供“随机素材 + 随机颜色”的运行时取用。
//
// - 加载时预缩放到最长边 320px（内存友好、缩放质量稳定）。
// - 兜底处理 JPG 白底：若四角均为不透明浅色，则把接近白色的像素转透明。
// - 换色（recolor）：保留像素结构与透明通道，只按亮度重构颜色 ——
//   亮度低于参考值的像素向黑色方向缩放，高于参考值（花芯等浅色）向白色方向提亮；
//   因此换色后图案的明暗结构完全一致，只是色相变化，且不会给透明区域上色。

const ASSET_MANIFEST = [
  { id: "flower-small", src: "/assets/happy/flower-small.png" },
  { id: "flower-4p", src: "/assets/happy/flower-4p.png" },
  { id: "flower-5p", src: "/assets/happy/flower-5p.png" },
  { id: "star-diamond", src: "/assets/happy/star-diamond.png" },
  { id: "star-chunky", src: "/assets/happy/star-chunky.png" },
  // 水滴：加载时做一次饱和度提升（sat），PNG 文件本身保持原样
  { id: "drop-1", src: "/assets/sad/drop-1.png", sat: 1.45 },
  { id: "drop-2", src: "/assets/sad/drop-2.png", sat: 1.45 },
  { id: "drop-3", src: "/assets/sad/drop-3.png", sat: 1.45 },
  // 爆炸纹样：保持原始红色与像素边缘（有方向性，元素层负责定向旋转）
  { id: "blast-1", src: "/assets/angry/blast-1.png" },
  { id: "blast-2", src: "/assets/angry/blast-2.png" },
  { id: "blast-3", src: "/assets/angry/blast-3.png" },
  { id: "blast-4", src: "/assets/angry/blast-4.png" },
  // 问号：深色素材，flat 平涂染色（形状来自 alpha，颜色为色相纯色、无渐变）；
  // trim 裁掉透明边距，让缩放对准整排问号内容
  { id: "qrow-big", src: "/assets/confused/qrow-big.png", flat: true, trim: true },
  { id: "qrow-small", src: "/assets/confused/qrow-small.png", flat: true, trim: true },
  // 头顶大问号：保持原始红色
  { id: "head-q", src: "/assets/confused/head-q.png" },
];

// 烟花素材（SURPRISED）：9 种独立透明 PNG（assets/surprised/，黑色剪影 + alpha 细节）
for (let i = 1; i <= 9; i++) {
  const id = `fw-${String(i).padStart(2, "0")}`;
  ASSET_MANIFEST.push({ id, src: `/assets/surprised/${id}.png`, flat: true });
}

/** 烟花素材 id 列表（供 PixelFireworkElement 随机选用） */
export const FW_ASSET_IDS = Array.from({ length: 9 }, (_, i) => `fw-${String(i + 1).padStart(2, "0")}`);

const library = new Map(); // id -> { canvas, refLum, flat }
let loadPromise = null;

// 单个素材加载：大图并发解码偶发 "The source image cannot be decoded"，带重试
async function loadOne(a, attempt = 0) {
  try {
    const img = new Image();
    img.src = a.src;
    await img.decode();
    library.set(a.id, analyze(img, a));
  } catch (err) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      return loadOne(a, attempt + 1);
    }
    console.warn("[assets] 素材加载失败，已跳过:", a.src, err);
  }
}

export function loadAssetLibrary() {
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all(ASSET_MANIFEST.map((a) => loadOne(a))).then(() => undefined);
  return loadPromise;
}

export function assetLibraryReady() {
  return library.size > 0;
}

function analyze(img, a = {}) {
  const maxSide = 320;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  let w = Math.max(1, Math.round(img.naturalWidth * scale));
  let h = Math.max(1, Math.round(img.naturalHeight * scale));
  let cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  let g = cv.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.drawImage(img, 0, 0, w, h);

  // 透明边距裁剪（可选）：取不透明像素包围盒，缩放即对准实际内容
  if (a.trim) {
    const src = g.getImageData(0, 0, w, h);
    const spx = src.data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (spx[(y * w + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= minX && maxY >= minY) {
      const cw = maxX - minX + 1;
      const ch = maxY - minY + 1;
      const tv = document.createElement("canvas");
      tv.width = cw;
      tv.height = ch;
      tv.getContext("2d").drawImage(cv, minX, minY, cw, ch, 0, 0, cw, ch);
      cv = tv;
      g = cv.getContext("2d");
      w = cw;
      h = ch;
    }
  }

  const data = g.getImageData(0, 0, w, h);
  const px = data.data;

  // 饱和度提升（可选）：亮度不变，把每个像素相对亮度的色偏放大 k 倍
  if (a.sat && a.sat !== 1) {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      px[i]     = Math.max(0, Math.min(255, lum + (px[i] - lum) * a.sat));
      px[i + 1] = Math.max(0, Math.min(255, lum + (px[i + 1] - lum) * a.sat));
      px[i + 2] = Math.max(0, Math.min(255, lum + (px[i + 2] - lum) * a.sat));
    }
  }

  // 亮度提升（可选）：把深色素材整体提亮（保持通道比例），换色时才能得到明亮色相
  if (a.lum && a.lum !== 1) {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      px[i]     = Math.min(255, px[i] * a.lum);
      px[i + 1] = Math.min(255, px[i + 1] * a.lum);
      px[i + 2] = Math.min(255, px[i + 2] * a.lum);
    }
  }

  // JPG 白底兜底：四角均为不透明浅色 => 白底图，把接近白色的像素变透明
  const corner = (x, y) => {
    const i = (y * w + x) * 4;
    return (
      px[i + 3] > 200 &&
      px[i] > 238 && px[i + 1] > 238 && px[i + 2] > 238
    );
  };
  if (corner(0, 0) && corner(w - 1, 0) && corner(0, h - 1) && corner(w - 1, h - 1)) {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] > 232 && px[i + 1] > 232 && px[i + 2] > 232) px[i + 3] = 0;
    }
  }

  // 参考亮度：不透明像素亮度的 60 分位（约等于主色亮度）
  const lums = [];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 60) {
      lums.push((0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255);
    }
  }
  lums.sort((a, b) => a - b);
  const refLum = lums.length ? lums[Math.floor(lums.length * 0.6)] : 0.5;

  g.putImageData(data, 0, 0);
  return { canvas: cv, refLum: Math.min(0.9, Math.max(0.15, refLum)), flat: !!a.flat };
}

function hslToRgb(h, s, l) {
  const f = (k) => {
    const t = (k + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1))));
  };
  return [f(0), f(8), f(4)];
}

const spriteCache = new Map();

/** 按色相重上色的素材画布（保留 alpha 结构与明暗层次）；
 *  flat 素材按色相平涂（形状来自 alpha，无渐变）；hue 为 null 时返回原始素材 */
export function getAssetSprite(assetId, hue) {
  const a = library.get(assetId);
  if (!a) return null;
  const key = `${assetId}|${hue ?? "orig"}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  if (hue == null) {
    spriteCache.set(key, a.canvas);
    return a.canvas;
  }

  const [mr, mg, mb] = hslToRgb(hue, 0.85, 0.62);
  const white = [255, 255, 255];

  const src = a.canvas;
  const cv = document.createElement("canvas");
  cv.width = src.width;
  cv.height = src.height;
  const g = cv.getContext("2d");
  g.drawImage(src, 0, 0); // 先绘制原图，保留 alpha 结构
  const data = g.getImageData(0, 0, cv.width, cv.height);
  const px = data.data;

  if (a.flat) {
    // 平涂：纯黑等无亮度层次的素材，形状来自 alpha，颜色 = 色相纯色（无渐变）
    const [fr, fg, fb] = hslToRgb(hue, 0.85, 0.6);
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      px[i] = fr;
      px[i + 1] = fg;
      px[i + 2] = fb;
    }
  } else {
    const ref = a.refLum * 255;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      let r, gg, b;
      if (lum <= ref) {
        const f = ref > 0 ? lum / ref : 0;
        r = mr * f; gg = mg * f; b = mb * f;
      } else {
        const t = Math.min(1, (lum - ref) / (255 - ref));
        r = mr + (white[0] - mr) * t;
        gg = mg + (white[1] - mg) * t;
        b = mb + (white[2] - mb) * t;
      }
      px[i] = r; px[i + 1] = gg; px[i + 2] = b;
    }
  }
  g.putImageData(data, 0, 0);

  spriteCache.set(key, cv);
  return cv;
}
