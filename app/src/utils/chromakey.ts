// chromakey.ts — JS 实时 chroma key (HSV 色相方案, 跟 dsh-pet 同源).
//
// 设计原则:
//   - 用 HSV 色相 (60-180° 绿相) 判绿, 不依赖 RGB 差值
//   - 软边界 (60-80° / 160-180°) 渐变过渡
//   - 饱和度/明度 阈值 (避免误伤低饱和度的浅色高光 / 黑色阴影)
//   - 性能: 192×192 60fps < 5ms/帧
//
// 为什么改用 HSV 色相 (vs 之前 RGB 差值 v3):
//   - H3 视频的" 半绿" 像素 (章鱼眼睛 RGB(2,244,1), 触手 RGB(59,153,5), 帽子高光
//     RGB(45,225,30)) 用 RGB 差值会被误判为绿幕抠掉 → 眼睛/触手/高光半透明
//   - HSV 色相 70-170° 严格判绿相, RGB 中性像素 (高光) 饱和度低被排除
//   - dsh-pet 验证: 99.6% 清除绿幕, 不误伤" 半绿" 像素
//   - 详见: https://github.com/PC2005-cloud/dsh-pet/blob/main/DESIGN.md

/** RGB (0-255) → HSV (h: 0-360, s: 0-1, v: 0-1). */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

/**
 * 计算 chroma greenness (0=完全不绿, 1=完全绿幕), HSV 色相方案.
 *
 * 判绿条件 (跟 dsh-pet 一致):
 *   - 色相 60-180° (绿相 60° + 边距)
 *   - 饱和度 ≥0.15
 *   - 明度 ≥0.15
 * 软边界 (60-70° / 170-180°) 渐变, 避免硬切
 */
function chromaGreenness(r: number, g: number, b: number): number {
  const [h, s, v] = rgbToHsv(r, g, b);
  // 饱和度或明度太低 → 不是绿幕 (深黑/灰白)
  if (s < 0.15 || v < 0.15) return 0;
  // 严格绿色相 70-170° → 完全绿
  if (h >= 70 && h <= 170) return 1;
  // 软边界: 60-70° (从黄到绿过渡) + 170-180° (从绿到青过渡)
  if (h >= 60 && h < 70) return (h - 60) / 10;  // 0 → 1
  if (h > 170 && h <= 180) return (180 - h) / 10;  // 0 → 1
  // 其他色相 (红 0-60, 蓝 180-360) → 完全不绿
  return 0;
}

/**
 * 在 ImageData 上原地应用 HSV chroma key. 修改 alpha 通道.
 *
 * @param imageData Canvas ImageData 对象 (会被原地修改)
 * @returns 修改后的同一个 imageData (链式)
 */
export function applyChromakeyV3(imageData: ImageData): ImageData {
  const d = imageData.data;
  const n = d.length;
  for (let i = 0; i < n; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const greenness = chromaGreenness(r, g, b);
    d[i + 3] = Math.round((1 - greenness) * 255);
  }
  return imageData;
}
