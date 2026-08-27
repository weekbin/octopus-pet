// OctopusPet.tsx — 116×116 透明窗口, <canvas> + apng-js 渲染 V2 APNG.
// 事件链路: apng-js 'end' 事件 → send SCENE_LOOPED → FSM rotateScene → 重挂载.
// bubble 3s 计时: 单独 useEffect setTimeout, 不用全局 timer.
// 详见 AGENTS.md V2.1 章节.

import { useCallback, useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { octopusMachine } from "../state/octopus-fsm";
import {
  BUBBLE_DURATION_MS,
  type OctopusEvent,
} from "../state/types";
import { Bubble } from "./Bubble";
import { useApngPlayer } from "../hooks/useApngPlayer";
import { useTauriWindowDrag } from "../hooks/useTauriWindowDrag";
// useTauriEventBus: M3.1 改名 (原 useMcpBridge), 删 dead test-event listener
import { useTauriEventBus } from "../hooks/useTauriEventBus";
import { useStateSync } from "../hooks/useStateSync";

const WINDOW_SIZE = 116;
const APNG_NATIVE_SIZE = 192; // APNG 原生 192×192, canvas 内部用这个

export function OctopusPet() {
  const [state, send, actor] = useMachine(octopusMachine);
  const dragRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useTauriWindowDrag(dragRef, (x, y) => {
    send({ type: "DRAG", x, y } as OctopusEvent);
  });
  useTauriEventBus(send);
  useStateSync(actor);

  // V2.1 事件驱动: APNG 播完一轮 → 回调 → send SCENE_LOOPED → FSM rotateScene.
  const onSceneLoopEnd = useCallback(() => {
    send({ type: "SCENE_LOOPED" } as OctopusEvent);
  }, [send]);
  useApngPlayer(canvasRef.current, state.context.scene, onSceneLoopEnd);

  // Bubble 3s 计时: 单独 setTimeout, 不用全局 timer.
  useEffect(() => {
    if (!state.context.bubble) return;
    const id = setTimeout(() => {
      send({ type: "DISMISS_BUBBLE" } as OctopusEvent);
    }, BUBBLE_DURATION_MS);
    return () => clearTimeout(id);
  }, [state.context.bubble, send]);

  return (
    <div
      ref={dragRef}
      className="octopus-pet"
      style={{
        width: WINDOW_SIZE,
        height: WINDOW_SIZE,
        position: "relative",
        cursor: "grab",
        userSelect: "none",
        WebkitUserSelect: "none",
        overflow: "hidden",
        background: "transparent",
      }}
      onClick={() => send({ type: "CLICK", now: Date.now() } as OctopusEvent)}
      onContextMenu={(e) => {
        e.preventDefault();
        send({ type: "PET", now: Date.now() } as OctopusEvent);
      }}
    >
      <canvas
        ref={canvasRef}
        width={APNG_NATIVE_SIZE}
        height={APNG_NATIVE_SIZE}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: WINDOW_SIZE,
          height: WINDOW_SIZE,
          pointerEvents: "none",
          imageRendering: "auto",
        }}
        data-scene={state.context.scene}
      />
      {state.context.bubble && (
        <Bubble text={state.context.bubble} />
      )}
    </div>
  );
}
