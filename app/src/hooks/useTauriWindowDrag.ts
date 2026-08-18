// useTauriWindowDrag — Handle drag-to-move-window on the pet.
//
// Tauri 2 transparent windows have no title bar, so we move the window via
// `appWindow.startDragging()` when the user mousedowns + drags. The native
// drag system takes over from there; we don't get per-pixel events.
//
// In a non-Tauri context (e.g. running in Vite dev for browser preview), this
// hook is a no-op.

import { useEffect, type RefObject } from "react";

type DragCallback = (x: number, y: number) => void;

export function useTauriWindowDrag(
  ref: RefObject<HTMLElement | null>,
  onDragEnd: DragCallback,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let startY = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left-click only
      isDown = true;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onMouseUp = async (e: MouseEvent) => {
      if (!isDown) return;
      isDown = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // If the user actually dragged (not a click), notify.
      // Note: native Tauri dragging already moved the window; we just persist the final position.
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        try {
          // Lazy import to avoid bundling tauri API in browser dev mode.
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          const pos = await win.outerPosition();
          onDragEnd(pos.x, pos.y);
        } catch (err) {
          // Browser dev mode — silently ignore.
        }
      }
    };

    // Tauri 2 native drag: just set data-tauri-drag-region on the element.
    // This makes Tauri treat the element as a drag region. We don't need mouse
    // handlers for that — Tauri handles it natively.
    el.setAttribute("data-tauri-drag-region", "");
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeAttribute("data-tauri-drag-region");
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [ref, onDragEnd]);
}
