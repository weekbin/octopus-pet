// useMcpBridge — Subscribe to events from the Rust MCP server (running as a child
// of the Tauri .app) and translate them to FSM events.
//
// In V1, the Rust side emits events via Tauri events (tauri::WindowEvent::...). The
// MCP server is launched as a sidecar; it sends tool calls via stdio JSON-RPC; the
// Tauri main process relays each tool call to the webview via emit().
//
// For V1 demo (W1 D3-D5), we can simulate by exposing a window-level event helper
// that any side code can fire (e.g. for testing). Real MCP wiring is W2.

import { useEffect } from "react";
import type { OctopusEvent } from "../state/types";

type Send = (event: OctopusEvent) => void;

export function useMcpBridge(send: Send) {
  useEffect(() => {
    // Browser dev mode: listen on window for test events.
    const onTestEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as OctopusEvent;
      if (detail && typeof detail === "object" && "type" in detail) {
        send(detail);
      }
    };
    window.addEventListener("octopus:test-event", onTestEvent as EventListener);

    // Tauri 2 production: listen on the tauri event bus.
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const handle = await listen<OctopusEvent>("octopus://event", (e) => {
          send(e.payload);
        });
        unlisten = handle;
      } catch (err) {
        // Browser dev mode — fine, just no tauri bridge.
      }
    })();

    return () => {
      window.removeEventListener(
        "octopus:test-event",
        onTestEvent as EventListener,
      );
      if (unlisten) unlisten();
    };
  }, [send]);
}
