// OctopusPet.tsx — V1 渲染: 14 scene 14 spritesheet + frameToGrid 选帧.
//
// 2026-08-17 回退说明: V2.1 (canvas + webm + HSV chroma key) 视觉比 V1 差 (canvas
// 实时 chroma key 边缘有半透明瑕疵, 跟 V1 APNG 透明度比不了). 用户要求回退到
// 舒服的版本. 保留 V2 调度 (FSM 随机 + 去重), 渲染层回 V1 风格: 14 scene 14 sprite
// 切 + spritesheet 141 帧循环 (FRAME_INTERVAL_MS 12fps 帧动画).
//
// **2026-08-21 bug 修复**: 之前用 `<img>` + `objectPosition: -col*116 -row*116` 是
// 错的 — spritesheet cell 实际是 192×192 (manifest.cellSize), 步长也应是 192 不是
// 显示尺寸 116. 错步长导致 cell 边界错位, frame 推进时显示的是 spritesheet
// 任意位置的"切块"而非完整 cell, 视觉上是"鬼畜图"闪烁. 改回原 V1 的
// `backgroundImage` + `backgroundSize: <manifest.width>×<manifest.height>` 方案:
// CSS 自动按 spritesheet 原始尺寸缩放, objectPosition 等同于 backgroundPosition,
// 步长用 cellSize=192, 显示尺寸用 116 = 60% 缩放.
//
// 116×116 透明窗口, 跟素材零边距 (background-size 缩放, 跟 V1 原版一致).

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

// 窗口 116×116, 缩放显示 spritesheet (cellSize=192, total 13632×384 per 2×71 布局).
// backgroundSize = manifest.width × manifest.height 让 CSS 自动按 116/192 ≈ 60% 缩放.
const WINDOW_SIZE = 116;
const SPRITE_OFFSET = 0;

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
  // 单 cell 在原始 spritesheet 坐标系里的尺寸 (col*cellW 是该 cell 起点 x).
  // backgroundSize: meta.width × meta.height 让 CSS 按 116/cellW 自动缩放,
  // backgroundPosition 在原始坐标里步进 (cellW 而非显示尺寸 116). 错步长 (116)
  // 之前导致 cell 错位闪烁.
  const cellW = meta.width / meta.cols; // 192
  const cellH = meta.height / meta.rows; // 192

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
      <div
        className="octopus-sprite"
        style={{
          position: "absolute",
          top: SPRITE_OFFSET,
          left: SPRITE_OFFSET,
          width: WINDOW_SIZE,
          height: WINDOW_SIZE,
          backgroundImage: `url(${getSpritesheetUrl(state.context.scene, manifest)})`,
          backgroundPosition: `-${col * cellW}px -${row * cellH}px`,
          backgroundSize: `${meta.width}px ${meta.height}px`,
          backgroundRepeat: "no-repeat",
          imageRendering: "auto",
          pointerEvents: "none",
        }}
        data-scene={state.context.scene}
        data-frame={row * meta.cols + col}
      />
      {state.context.bubble && (
        <Bubble text={state.context.bubble} />
      )}
    </div>
  );
}
