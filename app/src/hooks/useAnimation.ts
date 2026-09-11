// useAnimation — 通用动画 hook. 取代 useApngPlayer (V1 era) / useApngPlayer V2.1.
//
// V1.5+ (2026-09-11) 跨平台兼容方案:
//   - V1.5 era: 用 <img> 渲染, 浏览器原生循环. scene 切 = 改 src. 跨平台 work.
//   - V2.1 (2026-08-27): 改 apng-js + canvas + RAF. 治 P1-P4 long-term bug.
//     但 macOS WKWebView 浮窗 canvas 0 像素, 章鱼不可见.
//   - V1.5+ 现在: 退回到 <img> 渲染 (跨平台兼容), onCycleEnd 用 setTimeout
//     模拟 (替代 apng-js 'end' 事件). 接受 P1 调度精度回退, 换 P0 macOS 可见性.
//
// 接收 containerRef (HTMLDivElement) 替代 canvasRef (HTMLCanvasElement).
// Provider 内部决定用 <img>/<canvas>/<video>/<svg>, 调用方不感知.
// scene 切时清空 container, 防止旧 element 残留.

import { useEffect, type RefObject } from "react";
import { animationRegistry } from "../animation/registry";
import type { Animation } from "../animation/types";

/** 场景描述 (最小子集, 跟 scene-registry.generated.ts 对齐). */
export interface AnimationScene {
  readonly id: string;
  readonly animation: { readonly type: string; readonly source: string };
}

export function useAnimation(
  containerRef: RefObject<HTMLDivElement | null>,
  scene: AnimationScene,
  onCycleEnd: () => void,
): void {
  useEffect(() => {
    const target = containerRef.current;
    if (!target) {
      console.error(
        `[useAnimation] containerRef.current is null on mount for scene=${scene.id}`,
      );
      return;
    }

    const provider = animationRegistry.get(scene.animation.type);
    if (!provider) {
      console.error(
        `[useAnimation] no provider for type="${scene.animation.type}" (scene=${scene.id}). Available: ${animationRegistry.list().join(", ") || "(none)"}`,
      );
      return;
    }

    // scene 切时清空 container 旧 element (防止上一个 scene 残留).
    target.replaceChildren();

    let cancelled = false;
    let anim: Animation | null = null;
    let unsubCycle: (() => void) | null = null;

    provider
      .create(target, scene.animation.source)
      .then((a) => {
        if (cancelled) {
          a.stop();
          return;
        }
        anim = a;
        a.start();
        unsubCycle = a.onCycleEnd(onCycleEnd);
      })
      .catch((err) => {
        console.error(
          `[useAnimation] provider.create failed scene=${scene.id} type=${scene.animation.type}`,
          err,
        );
      });

    return () => {
      cancelled = true;
      if (unsubCycle) unsubCycle();
      if (anim) anim.stop();
      // 保险: 卸载时也清空 container, 避免下一个 effect 启动前残留.
      try {
        target.replaceChildren();
      } catch {
        // ignore
      }
    };
  }, [scene, onCycleEnd]);
}
