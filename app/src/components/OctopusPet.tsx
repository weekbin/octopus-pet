// OctopusPet.tsx — 116×116 透明窗口, 通过 animation abstraction 渲染
// 当前 scene 指定的动画 (默认 apng, 可换 lottie/video).
// 事件链路: Animation onCycleEnd → send SCENE_LOOPED → FSM rotateScene → 重挂载.
// bubble 3s 计时: 单独 useEffect setTimeout, 不用全局 timer.
// 详见 AGENTS.md V2.1 + animation 章节.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMachine } from "@xstate/react";
import { octopusMachine } from "../state/octopus-fsm";
import {
  BUBBLE_DURATION_MS,
  type OctopusEvent,
} from "../state/types";
import { SCENES } from "../state/scene-registry.generated";
import { Bubble } from "./Bubble";
import { useAnimation } from "../hooks/useAnimation";
import { useTauriWindowDrag } from "../hooks/useTauriWindowDrag";
import { useTauriEventBus } from "../hooks/useTauriEventBus";
import { useStateSync } from "../hooks/useStateSync";

const WINDOW_SIZE = 116;

// 2026-09-11 二次修复 (跟 cc9274e 反向): macOS GUI 模式 + mcode 客户端同进程下
// transparent 浮窗实际不可见 (B/D fail), 对照实验验证 transparent: false 跟 true 一样.
// 改回 f43780e 治标: transparent: false + .octopus-pet #ff8298 兜底, NUC 端验证
// 浮窗至少可见为珊瑚色方块. 章鱼渲染问题留给 W3 真治本 (GTK cairo 换 webview 后端,
// 1.5 天, 跟 V2.3 主线条件编译隔离).

export function OctopusPet() {
  const [state, send, actor] = useMachine(octopusMachine);
  const dragRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useTauriWindowDrag(dragRef, (x, y) => {
    send({ type: "DRAG", x, y } as OctopusEvent);
  });
  useTauriEventBus(send);
  useStateSync(actor);

  // 当前 scene 描述 (从生成 registry 查). useMemo 避免每次 render 重建
  // 触发 useEffect 重启 animation player.
  const currentScene = useMemo(
    () => SCENES.find((s) => s.id === state.context.scene)!,
    [state.context.scene],
  );

  // Animation onCycleEnd → send SCENE_LOOPED → FSM rotateScene.
  const onCycleEnd = useCallback(() => {
    send({ type: "SCENE_LOOPED" } as OctopusEvent);
  }, [send]);
  useAnimation(canvasRef, currentScene, onCycleEnd);

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
        background: "#ff8298",
      }}
      onClick={() => send({ type: "CLICK", now: Date.now() } as OctopusEvent)}
      onContextMenu={(e) => {
        e.preventDefault();
        send({ type: "PET", now: Date.now() } as OctopusEvent);
      }}
    >
      <canvas
        ref={canvasRef}
        width={currentScene.animation.type === "apng" ? 192 : 1280}
        height={currentScene.animation.type === "apng" ? 192 : 720}
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
