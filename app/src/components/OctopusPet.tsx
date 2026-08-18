// OctopusPet.tsx — The single root component of the desktop pet.
// Per plan §1.9.3: shows the current scene's spritesheet, animates the frame index,
// renders a bubble above the head, and handles click/drag interactions.
//
// The 200x200 transparent window IS the pet — no chrome, no decorations, always-on-top.

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
import manifestJson from "../data/spritesheet-manifest.json";

const manifest = manifestJson as unknown as SpritesheetManifest;

const SPRITE_SIZE = 192;
const WINDOW_SIZE = 200;
const SPRITE_OFFSET = Math.floor((WINDOW_SIZE - SPRITE_SIZE) / 2); // 4

export function OctopusPet() {
  const [state, send] = useMachine(octopusMachine);
  const dragRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);

  // Subscribe to Tauri window drag (move window when user drags the pet).
  useTauriWindowDrag(dragRef, (x, y) => {
    send({ type: "DRAG", x, y } as OctopusEvent);
  });

  // Bridge MCP server events from Rust → FSM events.
  useMcpBridge(send);

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
      <div
        className="octopus-sprite"
        style={{
          position: "absolute",
          top: SPRITE_OFFSET,
          left: SPRITE_OFFSET,
          width: SPRITE_SIZE,
          height: SPRITE_SIZE,
          backgroundImage: `url(${getSpritesheetUrl(state.context.scene, manifest)})`,
          backgroundPosition: `-${col * SPRITE_SIZE}px -${row * SPRITE_SIZE}px`,
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
