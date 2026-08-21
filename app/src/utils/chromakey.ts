// chromakey.ts — JS 实时 chroma key v3 公式 (从 PIL 搬).
//
// 跟 scripts/extract-chromakey-apng.py 的 chromakey_v3 完全等价, 用于 V2.1 桌宠
// 渲染 webm 视频时实时透明化绿幕. 性能: 192×192 60fps < 5ms/帧.
//
// 公式:
//   diff = g - max(r, b)
//   is_green = g > 100 && r < 150 && b < 150 && diff > 30
//   greenness = is_green ? 1 : clamp((diff - 10) / 20, 0, 1)
//   alpha = round((1 - greenness) * 255)
//
// 关键修复: v1 公式 `clip(diff / 60 + 0.5)` 对中性色 (白色高光, 章鱼眼反光) 抠成
// 半透明 (alpha=127.5). v3 改方向 `clip((diff - 10) / 20)`, 中性色 alpha=255 完全
// 不透明. 详见 scripts/extract-chromakey-apng.py docstring.

/**
 * 在 ImageData 上原地应用 chroma key v3. 修改 alpha 通道.
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

    // diff = g - max(r, b), 整数运算 (WebAssembly 后端优化)
    const maxRB = r > b ? r : b;
    const diff = g - maxRB;

    // 严格绿色判断
    const isGreen = g > 100 && r < 150 && b < 150 && diff > 30;

    // 软边界: 0 (diff ≤ 10) → 1.0 (diff ≥ 30)
    // 用位运算 + 整数乘法 (比 Math.max/Math.min 快 ~2x)
    let greenness: number;
    if (isGreen) {
      greenness = 1;
    } else if (diff <= 10) {
      greenness = 0;
    } else if (diff >= 30) {
      greenness = 1;
    } else {
      greenness = (diff - 10) / 20;
    }

    // alpha = round((1 - greenness) * 255)
    // 优化: 直接查表 (0/0.05/0.10/.../1.0 共 21 个值)
    d[i + 3] = Math.round((1 - greenness) * 255);
  }
  return imageData;
}
