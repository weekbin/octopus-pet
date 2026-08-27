// Lottie animation provider. lottie-web 是 LottieFiles 出品的
// After Effects → web 渲染器, 业界矢量动画标准 (Bodymovin).
// 跟 apng-js 完全不同渲染管线: Lottie 自己画到内部 canvas, 我们用
// drawImage 搬运到目标 ctx. 适合「循环矢量动画 / 复杂遮罩 / 表达式驱动」场景.
//
// 这是 animation abstraction 的第 2 个 provider, 证明换格式不动 FSM / hook / 组件.

import type { Animation, AnimationProvider } from "../types";

// lottie-web 类型复杂, 用最小本地结构.
type LottieItem = {
  play(): void;
  stop(): void;
  destroy(): void;
  /** lottie-web EventEmitter 风格的订阅 */
  on(event: string, listener: (...args: any[]) => void): LottieItem;
  removeEventListener?(event: string, listener: (...args: any[]) => void): void;
  canvas: HTMLCanvasElement;
  totalFrames: number;
  frameRate: number;
};

/** 把 lottie-web canvas 画到目标 ctx 的 bridge. 内部用 rAF 同步. */
class LottieCanvasBridge implements Animation {
  private cycleEndCallbacks: Array<() => void> = [];
  private rafId: number | null = null;
  private stopped = false;
  private cycleEndHandler: () => void;

  constructor(
    private readonly item: LottieItem,
    private readonly targetCtx: CanvasRenderingContext2D,
    private readonly wrapper: HTMLElement,
  ) {
    this.nativeWidth = item.canvas.width;
    this.nativeHeight = item.canvas.height;
    // 单 cycle 时长 = totalFrames / frameRate (秒) → ms
    this.cycleMs = Math.round((item.totalFrames / item.frameRate) * 1000);

    this.cycleEndHandler = () => {
      if (this.stopped) return;
      for (const cb of this.cycleEndCallbacks) cb();
    };
    this.item.on("complete", this.cycleEndHandler);
  }

  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly cycleMs: number;

  start(): void {
    this.item.play();
    const syncFrame = () => {
      if (this.stopped) return;
      const t = this.targetCtx;
      t.clearRect(0, 0, t.canvas.width, t.canvas.height);
      t.drawImage(this.item.canvas, 0, 0);
      this.rafId = requestAnimationFrame(syncFrame);
    };
    this.rafId = requestAnimationFrame(syncFrame);
  }

  stop(): void {
    this.stopped = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    try {
      this.item.stop();
    } catch {
      // ignore
    }
    try {
      this.item.destroy();
    } catch {
      // ignore
    }
    try {
      this.wrapper.remove();
    } catch {
      // ignore
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
 * Lottie provider. source 接受 Lottie JSON 的 URL.
 * 用 canvas renderer (不是 svg): lottie-web 自己维护一个内部 canvas,
 * 我们用 rAF drawImage 同步到目标 ctx, 跟 apng provider 行为一致
 * (调用方拿 ctx, 不用管下面是位图还是矢量).
 */
export const lottieProvider: AnimationProvider = {
  type: "lottie",
  async create(targetCtx, source) {
    // 动态 import 避免 lottie-web 进 initial bundle (它 100KB+)
    const lottieMod = await import("lottie-web");
    const lottieLib: any = (lottieMod as any).default ?? lottieMod;

    // lottie-web canvas renderer 需要一个 wrapper HTMLElement 持有 canvas.
    // 放屏幕外避免干扰 UI.
    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "position:absolute;left:-9999px;top:0;width:192px;height:192px;pointer-events:none;";
    document.body.appendChild(wrapper);

    const item: LottieItem = await new Promise((resolve, reject) => {
      let resolved = false;
      try {
        const a: any = lottieLib.loadAnimation({
          container: wrapper,
          renderer: "canvas",
          loop: true,
          autoplay: false,
          path: source,
        });
        const onReady = () => {
          if (resolved) return;
          if (a.canvas) {
            resolved = true;
            resolve(a as LottieItem);
          }
        };
        a.on("data_failed", () => {
          if (!resolved) {
            resolved = true;
            reject(new Error(`Lottie load failed: ${source}`));
          }
        });
        a.on("enterFrame", onReady);
        // 兜底: 5s 还没 ready 就 reject
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            if (a.canvas) resolve(a as LottieItem);
            else reject(new Error("Lottie load timeout"));
          }
        }, 5000);
      } catch (e) {
        reject(e);
      }
    });

    return new LottieCanvasBridge(item, targetCtx, wrapper);
  },
};
