// OctopusPet.tsx — V1.5 渲染: 2 个 V2 视频 APNG + 8s 随机轮转.
//
// 2026-08-21 重写: 用户明确"不要走 14 V1 spritesheet 表情包思路, 默认 2 个 V2
// 视频成品 (detective-study + worker-construction)". V2 APNG 浏览器原生循环
// (`<img>` 即可, 不需要背景步长), 8s 切 scene 触发 src 切换. 不再需要 frame
// 计数器, 不需要背景缩放, 不需要 cellSize 步长 (上轮鬼畜图 bug 也消失了).
//
// 116×116 透明窗口, APNG 192×192 用 img 元素默认 objectFit="fill" 缩放适配.

import { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { octopusMachine } from "../state/octopus-fsm";
import type { OctopusEvent } from "../state/types";
import { getApngUrl } from "../state/scenes";
import { Bubble } from "./Bubble";
import { useTauriWindowDrag } from "../hooks/useTauriWindowDrag";
import { useMcpBridge } from "../hooks/useMcpBridge";
import { useStateSync } from "../hooks/useStateSync";

const WINDOW_SIZE = 116;

export function OctopusPet() {
  const [state, send, actor] = useMachine(octopusMachine);
  const dragRef = useRef<HTMLDivElement>(null);

  useTauriWindowDrag(dragRef, (x, y) => {
    send({ type: "DRAG", x, y } as OctopusEvent);
  });
  useMcpBridge(send);
  useStateSync(actor);

  // V1 调度: TIMER_TICK 33Hz 触发 FSM, 由 FSM shouldRotate 判定
  // (8s 切 scene + 3s 后切 bubble). 跟 V2 pickRandomScene 调度兼容.
  // APNG 自身的帧循环由浏览器处理, 不需要 React 端 frame 计数器.
  useEffect(() => {
    const id = setInterval(() => {
      send({ type: "TIMER_TICK", now: Date.now() } as OctopusEvent);
    }, 33);
    return () => clearInterval(id);
  }, [send]);

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
      <img
        src={getApngUrl(state.context.scene)}
        alt={`scene-${state.context.scene}`}
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
