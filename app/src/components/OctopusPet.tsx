// OctopusPet.tsx — V1 渲染: 14 scene 14 spritesheet + frameToGrid 选帧.
//
// 2026-08-17 回退说明: V2.1 (canvas + webm + HSV chroma key) 视觉比 V1 差 (canvas
// 实时 chroma key 边缘有半透明瑕疵, 跟 V1 APNG 透明度比不了). 用户要求回退到
// 舒服的版本. 保留 V2 调度 (FSM 随机 + 去重), 渲染层回 V1 风格: 14 scene 14 sprite
// 切 + spritesheet 141 帧循环 (FRAME_INTERVAL_MS 12fps 帧动画).
//
// 116×116 透明窗口, 跟素材零边距.

import { useEffect, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { octopusMachine } from "../state/octopus-fsm";
import { FRAME_INTERVAL_MS } from "../state/types";
import type { OctopusEvent } from "../state/types";
import type { SpritesheetManifest, SceneMeta } from "../state/scenes";
import { getSceneMeta, getSpritesheetUrl, frameToGrid } from "../state/scenes";
import { Bubble } from "./Bubble";
import { useTauriWindowDrag } from "../hooks/useTauriWindowDrag";
import { useMcpBridge } from "../hooks/useMcpBridge";
import { useStateSync } from "../hooks/useStateSync";
import manifestJson from "../data/spritesheet-manifest.json";

const manifest = manifestJson as unknown as SpritesheetManifest;

const SPRITE_SIZE = 116;
const WINDOW_SIZE = 116; // == SPRITE_SIZE: 素材完全铺满窗口, 零边距
const SPRITE_OFFSET = 0; // 无 4px 边距

export function OctopusPet() {
  const [state, send, actor] = useMachine(octopusMachine);
  const dragRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);

  useTauriWindowDrag(dragRef, (x, y) => {
    send({ type: "DRAG", x, y } as OctopusEvent);
  });
  useMcpBridge(send);
  useStateSync(actor);

  // 帧计数器: scene 切时重置, 141 帧循环 (V1 风格)
  useEffect(() => {
    setFrame(0);
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % 141);
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.context.scene]);

  // V1 调度: TIMER_TICK 33Hz 触发 FSM, 由 FSM shouldRotate 判定
  // (8s 切 scene + 3s 后切 bubble). 跟 V2 pickRandomScene 调度兼容.
  useEffect(() => {
    const id = setInterval(() => {
      send({ type: "TIMER_TICK", now: Date.now() } as OctopusEvent);
    }, 33);
    return () => clearInterval(id);
  }, [send]);

  const meta: SceneMeta = getSceneMeta(manifest, state.context.scene);
  const { col, row } = frameToGrid(frame, meta);

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
        src={getSpritesheetUrl(state.context.scene, manifest)}
        alt={`scene-${state.context.scene}`}
        style={{
          position: "absolute",
          top: SPRITE_OFFSET,
          left: SPRITE_OFFSET,
          width: SPRITE_SIZE,
          height: SPRITE_SIZE,
          pointerEvents: "none",
          imageRendering: "auto",
          objectFit: "none",
          objectPosition: `-${col * SPRITE_SIZE}px -${row * SPRITE_SIZE}px`,
        }}
        data-scene={state.context.scene}
        data-frame={frame}
      />
      {state.context.bubble && (
        <Bubble text={state.context.bubble} />
      )}
    </div>
  );
}
