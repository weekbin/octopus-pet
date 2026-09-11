// useAnimation — 通用动画 hook. 取代 useApngPlayer.
// 接收 scene 描述 (含 animation 字段) + canvas ref, 查 animationRegistry
// 拿 provider, 工厂方法构造 Animation 实例, 绑到 canvas context 上播放.
// 监听 onCycleEnd → 调用方收到回调 (OctopusPet 把它转成 SCENE_LOOPED).
//
// ⚠️ 重要: 接 RefObject 而不是 ref.current. 原因是:
//   - 如果接 `canvasRef.current`, 在 render 阶段 canvasRef.current 是 null
//     (DOM 还没 commit), useEffect 早退, 永不再重跑
//   - 接 ref 对象本身, 在 useEffect 体内读 ref.current, 此时 commit 已完成,
//     canvas 已挂上, effect 正常运行
//   - 这是 M5 refactor 引入的 bug, 之前 useApngPlayer 一样有问题, 但 V1.5 用
//     `<img>` 渲染绕过, V2.1 后改 canvas 暴露出来

import { useEffect, type RefObject } from "react";
import { animationRegistry } from "../animation/registry";
import type { Animation } from "../animation/types";

/** 场景描述 (最小子集, 跟 scene-registry.generated.ts 对齐). */
export interface AnimationScene {
  readonly id: string;
  readonly animation: { readonly type: string; readonly source: string };
}

export function useAnimation(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  scene: AnimationScene,
  onCycleEnd: () => void,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      // canvas 还没挂上, 不应该发生 (ref 在 commit 后才用)
      console.error(
        `[webview-diag] useAnimation: canvasRef.current is null on mount for scene=${scene.id}`,
      );
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error(
        `[webview-diag] useAnimation: getContext('2d') returned null for scene=${scene.id}`,
      );
      return;
    }
    console.log(
      `[webview-diag] useAnimation: scene=${scene.id} type=${scene.animation.type} source=${scene.animation.source} canvas=${canvas.width}x${canvas.height} ctx=${ctx ? "ok" : "null"}`,
    );

    const provider = animationRegistry.get(scene.animation.type);
    if (!provider) {
      console.error(
        `[webview-diag] useAnimation: no provider for type="${scene.animation.type}" (scene=${scene.id}). Available: ${animationRegistry.list().join(", ") || "(none)"}`,
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
        console.log(
          `[webview-diag] useAnimation: provider.create ok scene=${scene.id} cycleMs=${a.cycleMs} native=${a.nativeWidth}x${a.nativeHeight}`,
        );
      })
      .catch((err) => {
        console.error(
          `[webview-diag] useAnimation: provider.create failed scene=${scene.id}`,
          err,
        );
      });

    return () => {
      cancelled = true;
      if (unsubCycle) unsubCycle();
      if (anim) anim.stop();
    };
    // scene 和 onCycleEnd 变化时重启 animation. canvasRef 对象稳定 (React 保证),
    // 不需要在 deps 里. canvas 实际 DOM 元素在 React 生命周期内不会换.
  }, [scene, onCycleEnd]);
}
