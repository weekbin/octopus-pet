// OctopusPet.tsx — V2.1 渲染: hidden webm video + visible canvas + 实时 chroma key
import { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { octopusMachine } from "../state/octopus-fsm";
import type { OctopusEvent } from "../state/types";
import { Bubble } from "./Bubble";
import { useTauriWindowDrag } from "../hooks/useTauriWindowDrag";
import { useMcpBridge } from "../hooks/useMcpBridge";
import { useStateSync } from "../hooks/useStateSync";
import { V2_SPRITE_BY_SCENE } from "../data/v2-sprite-map";
import { applyChromakeyV3 } from "../utils/chromakey";

const SPRITE_SIZE = 116;
const CANVAS_SIZE = 192;
const WINDOW_SIZE = 116;
const SPRITE_OFFSET = 0;

export function OctopusPet() {
  const [state, send, actor] = useMachine(octopusMachine);
  const dragRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafIdRef = useRef<number | null>(null);

  useTauriWindowDrag(dragRef, (x, y) => send({ type: "DRAG", x, y } as OctopusEvent));
  useMcpBridge(send);
  useStateSync(actor);

  // V2.1 调度: 用 video.timeupdate 触发切 scene, 替代 onEnded.
  // 根因: WKWebView 上 webm VP9 的 ended 事件有时不可靠 (尤其当 video 元素被 React
  // 重新挂载 + 立即 autoplay 时). timeupdate 事件稳定, 60Hz 触发, 准到 16ms.
  // 切 scene 条件: video.currentTime >= video.duration - 0.05 (留 50ms 余量, 避免
  // 视频还没播完就切). 第二次循环时 React 重挂载 video 元素, useEffect 重跑
  // 重新绑定 timeupdate 监听, scene 继续切.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleTimeUpdate = () => {
      // 视频自然播完最后一帧 → 切 scene. (1/15s 一帧, 0.05s 提前避免跨帧判定)
      if (
        video.duration > 0 &&
        video.currentTime >= video.duration - 0.05
      ) {
        send({ type: "SCENE_ENDED", now: Date.now() } as OctopusEvent);
      }
    };
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
    // 关键: deps 加 state.context.scene, scene 变时 useEffect 重跑, 重新绑定
    // 新 video 元素的 timeupdate 监听 (因为 React 重新挂载 video 元素).
  }, [send, state.context.scene]);

  // V2.1 渲染: requestAnimationFrame 循环抓 video 帧到 canvas + chroma key
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const tick = () => {
      if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        ctx.drawImage(video, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        applyChromakeyV3(imageData);
        ctx.putImageData(imageData, 0, 0);
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // bubble hide 计时 (3s)
  useEffect(() => {
    const id = setInterval(() => send({ type: "TIMER_TICK", now: Date.now() } as OctopusEvent), 33);
    return () => clearInterval(id);
  }, [send]);

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
      {/* V2.1: video offscreen 跑循环 + onEnded 切 scene. canvas 实时抓帧 + chroma key. */}
      <video
        key={state.context.scene}
        ref={videoRef}
        src={V2_SPRITE_BY_SCENE[state.context.scene]}
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: "absolute",
          top: -CANVAS_SIZE,
          left: -CANVAS_SIZE,
          width: CANVAS_SIZE,
          height: CANVAS_SIZE,
          pointerEvents: "none",
          opacity: 0,
        }}
        data-scene={state.context.scene}
      />
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{
          position: "absolute",
          top: SPRITE_OFFSET,
          left: SPRITE_OFFSET,
          width: SPRITE_SIZE,
          height: SPRITE_SIZE,
          pointerEvents: "none",
        }}
        data-scene={state.context.scene}
      />
      {state.context.bubble && <Bubble text={state.context.bubble} />}
    </div>
  );
}
