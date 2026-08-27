// OctopusPet.tsx — V2.1 事件驱动渲染: canvas + apng-js + SCENE_LOOPED.
//
// 2026-08-24 重写 (替代 V1.5 <img> + setInterval 33Hz):
//   - 渲染: <canvas> + apng-js (在 JS 端解码 APNG, 拿到 frame 事件)
//   - 调度: apng-js Player 'frame' 事件检测循环边界 → send SCENE_LOOPED
//   - bubble 计时: 单独 useEffect setTimeout(BUBBLE_DURATION_MS)
//   - 拆掉: setInterval(33Hz) TIMER_TICK 路径, autoNextAt 字段, shouldRotate guard
//
// 116×116 透明窗口, 192×192 APNG 画在 canvas 内部, CSS 缩放到 116×116
// (跟 V1.5 <img> 视觉一致). apng-js 1.1.5 Player 用 rAF 驱动.
//
// 事件链路:
//   1. Player.renderNextFrame → emit 'frame' (idx)
//   2. 检测 idx 0 + 上一帧 = last → 循环边界 → send SCENE_LOOPED
//   3. FSM rotateScene → context.scene 变化 → 当前 useEffect cleanup
//   4. 新的 useEffect 加载新 APNG → 新的 Player 自动开始 rAF 循环

import { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
// apng-js 是 CJS/UMD 模块. Vite 的 CJS 互操作已经自动 unwrap:
//   `__esModule=true` → apngJsModule 就是 parseAPNG 函数本身
//   `__esModule=false` → apngJsModule 是 { default: parseAPNG, ... } exports 对象
// 兼容两种 + esm.sh 的 default export 形态, 拿到 parseAPNG 函数.
import apngJsModuleRaw from "apng-js";
import { octopusMachine } from "../state/octopus-fsm";
import {
  BUBBLE_DURATION_MS,
  type OctopusEvent,
} from "../state/types";
import { getApngUrl } from "../state/scenes";
import { Bubble } from "./Bubble";
import { useTauriWindowDrag } from "../hooks/useTauriWindowDrag";
import { useMcpBridge } from "../hooks/useMcpBridge";
import { useStateSync } from "../hooks/useStateSync";

const parseAPNG: (buf: ArrayBuffer) => any =
  typeof apngJsModuleRaw === "function"
    ? apngJsModuleRaw  // Vite + CJS __esModule=true: 已经 unwrap 成函数
    : (apngJsModuleRaw as any).default?.parseAPNG
      ?? (apngJsModuleRaw as any).parseAPNG
      ?? (apngJsModuleRaw as any).default;

const WINDOW_SIZE = 116;
const APNG_NATIVE_SIZE = 192; // APNG 原生 192×192, canvas 内部用这个

// apng-js Player 类型 (避免拉 type-only 依赖, 简化)
// 1.1.5 实际就是 extends EventEmitter 的类
// 只声明我们用到的 'end' 事件 (num_plays=1 APNG 播完一轮触发 → SCENE_LOOPED)
type ApngPlayer = {
  stop(): void;
  on(event: "end", listener: () => void): ApngPlayer;
  on(event: string, listener: (...args: any[]) => void): ApngPlayer;
};

export function OctopusPet() {
  const [state, send, actor] = useMachine(octopusMachine);
  const dragRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useTauriWindowDrag(dragRef, (x, y) => {
    send({ type: "DRAG", x, y } as OctopusEvent);
  });
  useMcpBridge(send);
  useStateSync(actor);

  // === V2.1 事件驱动 scene 渲染 ===
  // 监听 context.scene 变化: 停旧 Player → 加载新 APNG → 启新 Player
  // 新 Player 的 frame 事件 → 循环边界 → send SCENE_LOOPED → FSM 切 scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    let player: ApngPlayer | null = null;

    (async () => {
      try {
        const url = getApngUrl(state.context.scene);
        const buf = await fetch(url).then((r) => r.arrayBuffer());
        if (cancelled) return;
        const apng = parseAPNG(buf);
        if (!apng || apng instanceof Error) {
          console.error(`APNG parse failed for ${url}:`, apng);
          return;
        }
        // apng-js getPlayer 第 2 个参数是 autoPlay, 返回 Promise<Player>
        // (test-c-apngjs.html 验证过: 第 2 形参名误导, 实际是 canvas 2D context)
        const p = (await apng.getPlayer(ctx, true)) as ApngPlayer;
        if (cancelled) {
          p.stop();
          return;
        }
        player = p;
        // V2.1 事件驱动核心: 听 'end' 事件 (num_plays=1 的 APNG 播完一轮
        // 就触发). 这跟 V1.5 setInterval 8s 不同 — scene 切严格对齐 APNG
        // 最后一帧, 0 累积延迟, 治中段剪切 (P1).
        // 注: num_plays=0 (无限循环) 的 APNG 不会触发 'end', 但本项目
        // V1.5 默认 loop=1 (PIL 脚本注释: "配合桌宠 8s 切 scene 的事件
        // 驱动设计"), 所以 'end' 是可靠信号.
        p.on("end", () => {
          send({ type: "SCENE_LOOPED", now: performance.now() } as OctopusEvent);
        });
      } catch (err) {
        console.error("APNG load failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (player) {
        try {
          player.stop();
        } catch {
          // ignore: player may already be stopped
        }
      }
    };
  }, [state.context.scene, send]);

  // === Bubble 3s 计时: 单独 setTimeout, 不依赖全局 timer tick ===
  // bubble 出现时调度, bubble 变 null / 切换时 cleanup 取消
  useEffect(() => {
    if (!state.context.bubble) return;
    const id = setTimeout(() => {
      send({ type: "DISMISS_BUBBLE", now: Date.now() } as OctopusEvent);
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
        background: "transparent",
      }}
      onClick={() => send({ type: "CLICK", now: Date.now() } as OctopusEvent)}
      onContextMenu={(e) => {
        e.preventDefault();
        send({ type: "PET", now: Date.now() } as OctopusEvent);
      }}
    >
      <canvas
        ref={canvasRef}
        width={APNG_NATIVE_SIZE}
        height={APNG_NATIVE_SIZE}
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
