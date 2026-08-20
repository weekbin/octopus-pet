// OctopusPet.tsx — The single root component of the desktop pet.
// Per plan §1.9.3: shows the current scene's spritesheet, animates the frame index,
// renders a bubble above the head, and handles click/drag interactions.
//
// The 192x192 transparent window (== sprite size, zero margin) IS the pet — no chrome, no decorations, always-on-top.

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
const SPRITE_OFFSET = 0; // 无 4px 边距 (原 200 窗口留缝, 透出桌面色看起来像白边)

export function OctopusPet() {
  const [state, send, actor] = useMachine(octopusMachine);
  const dragRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);

  // Subscribe to Tauri window drag (move window when user drags the pet).
  useTauriWindowDrag(dragRef, (x, y) => {
    send({ type: "DRAG", x, y } as OctopusEvent);
  });

  // Bridge MCP server events from Rust → FSM events.
  useMcpBridge(send);

  // Mirror FSM context (single source of truth) back to Rust SharedState,
  // so pet_get_state / HTTP /state match what's on screen.
  useStateSync(actor);

  // Frame counter: advance at FRAME_INTERVAL_MS; reset on scene change.
  useEffect(() => {
    setFrame(0);
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % 141);
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.context.scene]);

  // FSM timer tick: ~30Hz for rotation/bubble checks.
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
        src="/assets/octopus/breath-idle.png"
        alt="breath-idle"
        style={{
          position: "absolute",
          top: SPRITE_OFFSET,
          left: SPRITE_OFFSET,
          width: SPRITE_SIZE,
          height: SPRITE_SIZE,
          pointerEvents: "none",
          imageRendering: "auto",
        }}
        data-scene="breath-idle"
        data-frame={frame}
      />
      {state.context.bubble && (
        <Bubble text={state.context.bubble} />
      )}
    </div>
  );
}
