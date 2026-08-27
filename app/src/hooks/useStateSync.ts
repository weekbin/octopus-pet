// useStateSync — 把 XState (唯一状态权威) 的 context 变化回写到 Rust
// SharedState 镜像, 让 pet_get_state / HTTP /state 与屏幕显示一致.
//
// 字段级节流: scene/bubble/bubbleHideAt/affection/position/recentScenes
// 任意一个变化才 invoke, 避免高频内部调度字段轰炸 IPC.

import { useEffect, useRef } from "react";
import type { ActorRefFrom } from "xstate";
import { invoke } from "@tauri-apps/api/core";
import { octopusMachine } from "../state/octopus-fsm";
import type { OctopusScene, OctopusState } from "../state/types";

type Actor = ActorRefFrom<typeof octopusMachine>;

// 与 src-tauri/src/state_bridge.rs SyncPayload 字段对齐
interface SyncPayload {
  scene: string;
  bubble: string | null;
  bubbleHideAt: number | null;
  affection: number;
  position: { x: number; y: number };
  recentScenes: OctopusScene[];
}

function toPayload(ctx: OctopusState): SyncPayload {
  return {
    scene: ctx.scene,
    bubble: ctx.bubble,
    bubbleHideAt: ctx.bubbleHideAt,
    affection: ctx.affection,
    position: ctx.position,
    recentScenes: ctx.recentScenes,
  };
}

function same(a: SyncPayload, b: SyncPayload): boolean {
  if (
    a.scene !== b.scene ||
    a.bubble !== b.bubble ||
    a.bubbleHideAt !== b.bubbleHideAt ||
    a.affection !== b.affection ||
    a.position.x !== b.position.x ||
    a.position.y !== b.position.y
  ) {
    return false;
  }
  if (a.recentScenes.length !== b.recentScenes.length) return false;
  for (let i = 0; i < a.recentScenes.length; i++) {
    if (a.recentScenes[i] !== b.recentScenes[i]) return false;
  }
  return true;
}

export function useStateSync(actor: Actor) {
  const lastRef = useRef<SyncPayload | null>(null);

  useEffect(() => {
    const sub = actor.subscribe((snap) => {
      const next = toPayload(snap.context);
      if (lastRef.current && same(lastRef.current, next)) {
        return;
      }
      lastRef.current = next;
      (async () => {
        try {
          await invoke("sync_state", { payload: next });
        } catch {
          // browser dev mode — no tauri backend
        }
      })();
    });
    return () => sub.unsubscribe();
  }, [actor]);
}
