// useStateSync — 把 XState (唯一状态权威) 的 context 变化回写到 Rust
// SharedState 镜像, 让 pet_get_state / HTTP /state 与屏幕显示一致。
//
// 字段级节流: 只在 scene/bubble/bubbleHideAt/affection/position 变化时
// invoke, 忽略 autoNextAt 这类高频内部调度字段, 避免 60fps 轰炸 IPC。
// (渲染帧 frame 由组件 useState 持有, 不同步 — Rust 侧无消费方)

import { useEffect, useRef } from "react";
import type { ActorRefFrom } from "xstate";
import { octopusMachine } from "../state/octopus-fsm";
import type { OctopusState } from "../state/types";

type Actor = ActorRefFrom<typeof octopusMachine>;

// 与 src-tauri/src/state_bridge.rs SyncPayload 字段对齐
interface SyncPayload {
  scene: string;
  bubble: string | null;
  bubbleHideAt: number | null;
  affection: number;
  position: { x: number; y: number };
}

function toPayload(ctx: OctopusState): SyncPayload {
  return {
    scene: ctx.scene,
    bubble: ctx.bubble,
    bubbleHideAt: ctx.bubbleHideAt,
    affection: ctx.affection,
    position: ctx.position,
  };
}

function same(a: SyncPayload, b: SyncPayload): boolean {
  return (
    a.scene === b.scene &&
    a.bubble === b.bubble &&
    a.bubbleHideAt === b.bubbleHideAt &&
    a.affection === b.affection &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y
  );
}

export function useStateSync(actor: Actor) {
  const lastRef = useRef<SyncPayload | null>(null);

  useEffect(() => {
    const sub = actor.subscribe((snap) => {
      const next = toPayload(snap.context);
      if (lastRef.current && same(lastRef.current, next)) {
        return; // 无实质变化, 不 invoke
      }
      lastRef.current = next;
      (async () => {
        try {
          // Lazy import: browser dev 模式没有 tauri 后端, catch 掉
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("sync_state", { payload: next });
        } catch {
          // browser dev mode — no tauri backend
        }
      })();
    });
    return () => sub.unsubscribe();
  }, [actor]);
}
