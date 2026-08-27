// useApngPlayer — Mounts an apng-js Player for the given scene, fires onEnd when
// the APNG completes one cycle. Cleans up on scene change or unmount.
//
// V2.1 事件驱动核心: scene 切到 → loadApng → getPlayer → 听 'end' → 上抛
// 给调用方, 调用方 (OctopusPet) 把它转成 SCENE_LOOPED 事件喂给 FSM.

import { useEffect } from "react";
import { loadApng } from "../state/apng";
import { getApngUrl } from "../state/scenes";
import type { OctopusScene } from "../state/types";

// apng-js 的 `types` field 只指向 parser.d.ts, 没有导出 Player 类.
// 只用 'end' 事件 + stop() 两个方法, 最小本地结构类型.
type ApngPlayer = {
  stop(): void;
  on(event: "end", listener: () => void): ApngPlayer;
};

export function useApngPlayer(
  canvas: HTMLCanvasElement | null,
  scene: OctopusScene,
  onLoopEnd: () => void,
): void {
  useEffect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    let player: ApngPlayer | null = null;

    (async () => {
      try {
        const apng = await loadApng(getApngUrl(scene));
        if (cancelled) return;
        const p = (await apng.getPlayer(ctx, true)) as unknown as ApngPlayer;
        if (cancelled) {
          p.stop();
          return;
        }
        player = p;
        // V2.1: numPlays=1 (PIL loop=1) 播完一轮就 emit 'end'.
        // numPlays=0 (无限) 不会 emit, 但本项目 APNG 都用 loop=1, 安全.
        p.on("end", onLoopEnd);
      } catch (err) {
        console.error(`useApngPlayer: failed for scene=${scene}`, err);
      }
    })();

    return () => {
      cancelled = true;
      if (player) {
        try {
          player.stop();
        } catch {
          // player may already be stopped
        }
      }
    };
  }, [canvas, scene, onLoopEnd]);
}

