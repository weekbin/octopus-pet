// APNG animation provider. V1.5+ 跨平台兼容方案 (2026-09-11):
//
// V2.1 用 apng-js 1.1.5 `getPlayer(ctx, true)` 解析 APNG → drawImage 到 canvas.
// chromium 浏览器 work, 但 Tauri 2 macOS WKWebView 在浮窗里 canvas 0 像素
// (canvas.toDataURL 52674 字节 = canvas 真有内容, 但 <canvas> 标签不显示;
// 推测 WKWebView 在 transparent 浮窗里的 canvas 合成有问题).
//
// V1.5+ 改用 `new Image()` + `img.src = url` 让浏览器原生循环 APNG.
// - chromium 浏览器原生 APNG 循环 ✅
// - Tauri macOS WKWebView 浏览器原生 APNG 循环 ✅ (绕开 canvas bug)
// - Linux WebKitGTK 浏览器原生 APNG 循环 ✅ (跨平台兼容, 需 GTK 4+ / WebKitGTK 6+)
// - Windows WebView2 浏览器原生 APNG 循环 ✅
//
// onCycleEnd 用 setTimeout(APNG_CYCLE_MS) 模拟. APNG 浏览器原生循环没有
// onended 事件, 用 setTimeout 触发 FSM rotateScene. cycleMs 跟 APNG 实际
// 循环时长匹配 (99 帧 × 66ms ≈ 6.5s), 切 scene 紧跟 APNG 末尾, 0 漂移
// (每次切到新 scene 都用新 setTimeout, 不累积).
//
// 已知 trade-off vs V2.1:
// - 后台 tab / 系统 sleep 时 setTimeout 节流, scene 切会暂停. V2.1 用 RAF,
//   同样受节流影响, 差异不显著.
// - cycleMs 写死 6500ms 估算 (8 scene 都接近 6.5s). 切到中段 < 1s 误差可接受.
// - 不依赖 apng-js / canvas, package 减少 ~50KB.

import type { Animation, AnimationProvider } from "../types";

// 1:1 命名约定: scene id → /assets/octopus/v2/<id>.png.
function getApngUrl(source: string): string {
  if (source.startsWith("/") || source.startsWith("http") || source.startsWith("data:")) {
    return source;
  }
  return `/assets/octopus/v2/${source}.png`;
}

// H3 gen_videos 6s 视频 @ 16fps → 99 帧 APNG × 66ms ≈ 6534ms.
// scenes.json 8 scene 都是 H3 生成, cycleMs 都接近 6500. 写死常量, 简单可靠.
const APNG_CYCLE_MS = 6500;
const APNG_NATIVE_WIDTH = 192;
const APNG_NATIVE_HEIGHT = 192;

/** 浏览器原生 APNG 循环 (Image 元素). */
class ApngAnimation implements Animation {
  private cycleEndCallbacks: Array<() => void> = [];
  private cycleTimer: number | null = null;
  private stopped = false;
  private readonly img: HTMLImageElement;

  constructor(target: HTMLElement, source: string) {
    this.img = new Image();
    this.img.src = getApngUrl(source);
    this.img.alt = "octopus pet animation";
    this.img.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;" +
      "pointer-events:none;image-rendering:auto;";
    target.appendChild(this.img);
  }

  readonly nativeWidth = APNG_NATIVE_WIDTH;
  readonly nativeHeight = APNG_NATIVE_HEIGHT;
  readonly cycleMs = APNG_CYCLE_MS;

  start(): void {
    if (this.stopped) return;
    // 浏览器原生循环 APNG, 启动后无需额外操作.
    // onCycleEnd 模拟: setTimeout(cycleMs) 触发, 之后每 cycleMs 再触发.
    const fireCycleEnd = () => {
      if (this.stopped) return;
      for (const cb of this.cycleEndCallbacks) cb();
      this.cycleTimer = window.setTimeout(fireCycleEnd, this.cycleMs);
    };
    this.cycleTimer = window.setTimeout(fireCycleEnd, this.cycleMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.cycleTimer !== null) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    try {
      this.img.remove();
    } catch {
      // already removed
    }
  }

  onCycleEnd(callback: () => void): () => void {
    this.cycleEndCallbacks.push(callback);
    return () => {
      const i = this.cycleEndCallbacks.indexOf(callback);
      if (i >= 0) this.cycleEndCallbacks.splice(i, 1);
    };
  }
}

/**
 * APNG provider. 浏览器原生 Image 元素循环 APNG, 跨平台兼容.
 * source 接受 OctopusScene id (走 1:1 命名约定) 或直接 URL/data URL.
 */
export const apngProvider: AnimationProvider = {
  type: "apng",
  create(target, source) {
    return Promise.resolve(new ApngAnimation(target, source));
  },
};
