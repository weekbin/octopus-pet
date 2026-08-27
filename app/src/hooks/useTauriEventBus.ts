// useTauriEventBus — Subscribe to events from the Rust side (Tauri event bus)
// and forward them as FSM events.
//
// Naming note: this used to be called useMcpBridge but the actual mechanism is
// Tauri's window event bus, not MCP stdio. MCP tool calls come in via Rust
// (actions.rs), which emits them on the event bus, which we listen to here.
//
// In V1 we also listened on `window.addEventListener("octopus:test-event", ...)`
// for browser-dev-mode testing. That hook was never wired up to any actual
// emitter and is removed (M1).

import { useEffect } from "react";
import type { OctopusEvent } from "../state/types";

type Send = (event: OctopusEvent) => void;

const EVENT_NAME = "octopus://event";

export function useTauriEventBus(send: Send): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<OctopusEvent>(EVENT_NAME, (e) => {
          send(e.payload);
        });
      } catch {
        // Browser dev mode — no tauri backend, no-op.
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [send]);
}
