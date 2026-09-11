// OctopusPet.tsx — 116×116 透明窗口, 通过 animation abstraction 渲染
// 当前 scene 指定的动画 (默认 apng, 可换 lottie/video).
// 事件链路: Animation onCycleEnd → send SCENE_LOOPED → FSM rotateScene → 重挂载.
// bubble 3s 计时: 单独 useEffect setTimeout, 不用全局 timer.
// 详见 AGENTS.md V2.1 + animation 章节.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// 2026-09-11 macOS 端修复: NUC 端 f43780e 加的 .octopus-pet 兜底 #ff8298 在
// macOS 透明浮窗下会盖死 canvas. 用 platform check 切换背景:
// - macOS: transparent → canvas 透明 PNG 透桌面 + 章鱼
// - NUC/Linux: #ff8298 → solid 珊瑚粉卡片兜底 (canvas 渲染失败时也能看到窗口)
function detectMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = (navigator as Navigator).platform || "";
  return /Mac|Darwin/i.test(platform) || /Mac OS X/.test(ua);
}

export function OctopusPet() {
  const [state, send, actor] = useMachine(octopusMachine);
  const dragRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(detectMacOS());
  }, []);

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
      className={`octopus-pet ${isMac ? "platform-mac" : "platform-nuc"}`}
      style={{
        width: WINDOW_SIZE,
        height: WINDOW_SIZE,
        position: "relative",
        cursor: "grab",
        userSelect: "none",
        WebkitUserSelect: "none",
        overflow: "hidden",
        background: isMac ? "transparent" : "#ff8298",
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
