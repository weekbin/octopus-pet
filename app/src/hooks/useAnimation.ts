// useAnimation — 通用动画 hook. 取代 useApngPlayer.
// 接收 scene 描述 (含 animation 字段), 查 animationRegistry 拿 provider,
// 工厂方法构造 Animation 实例, 绑到 canvas context 上播放.
// 监听 onCycleEnd → 调用方收到回调 (OctopusPet 把它转成 SCENE_LOOPED).

import { useEffect } from "react";
import { animationRegistry } from "../animation/registry";
import type { Animation } from "../animation/types";

/** 场景描述 (最小子集, 跟 scene-registry.generated.ts 对齐). */
export interface AnimationScene {
  readonly id: string;
  readonly animation: { readonly type: string; readonly source: string };
}

export function useAnimation(
  canvas: HTMLCanvasElement | null,
  scene: AnimationScene,
  onCycleEnd: () => void,
): void {
  useEffect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const provider = animationRegistry.get(scene.animation.type);
    if (!provider) {
      console.error(
        `useAnimation: no provider registered for type="${scene.animation.type}" (scene=${scene.id}). Available: ${animationRegistry.list().join(", ") || "(none)"}`,
      );
      return;
    }

    let cancelled = false;
    let anim: Animation | null = null;
    let unsubCycle: (() => void) | null = null;

    provider
      .create(ctx, scene.animation.source)
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
        console.error(`useAnimation: failed to create animation for scene=${scene.id}`, err);
      });

    return () => {
      cancelled = true;
      if (unsubCycle) unsubCycle();
      if (anim) anim.stop();
    };
  }, [canvas, scene, onCycleEnd]);
}
