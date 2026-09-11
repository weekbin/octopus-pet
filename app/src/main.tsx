import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { animationRegistry } from "./animation/registry";
import { apngProvider } from "./animation/providers/apng";
import { lottieProvider } from "./animation/providers/lottie";
import "./styles/global.css";

// 2026-09-11 诊断 (B/D canvas 未绘制): webview 端 log 通过 DOM overlay +
// emit 两条路径. Rust 端 listen "webview-log" 事件, tracing::info! 写到 gui.log.
// 同时 webview 内 fixed 定位 log div, screencapture 可见 (webview 0,0 = 物理 200,200,
// log 框在 (126, 0) 逻辑 → 物理 (326, 200) 右边 200x150).
const logDiv = document.createElement("div");
logDiv.id = "webview-log-overlay";
logDiv.style.cssText =
  "position:fixed; top:0; left:126px; width:240px; height:150px; " +
  "background:rgba(0,0,0,0.85); color:#0f0; font:9px monospace; " +
  "z-index:999999; overflow:auto; padding:4px; pointer-events:none; " +
  "white-space:pre-wrap; word-break:break-all;";
document.body.appendChild(logDiv);
const appendLog = (level: string, args: unknown[]) => {
  const line = `[${new Date().toISOString().slice(11, 19)}][${level}] ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}\n`;
  logDiv.textContent = (logDiv.textContent + line).slice(-8000);
  logDiv.scrollTop = logDiv.scrollHeight;
};
const webviewLog = (level: "log" | "error" | "warn") => {
  const orig = console[level];
  console[level] = (...args: unknown[]) => {
    orig.apply(console, args);
    appendLog(level, args);
    try {
      // @ts-expect-error - __TAURI__ injected at runtime
      const tauri = window.__TAURI__;
      if (tauri?.event?.emit) {
        tauri.event.emit("webview-log", `[${level}] ${args.map(String).join(" ")}`);
      }
    } catch {
      // best effort
    }
  };
};
webviewLog("log");
webviewLog("error");
webviewLog("warn");
appendLog("info", [
  "main.tsx loaded, animationRegistry size: " + animationRegistry.list().length,
]);

// 注册内置 animation provider. 加新动画格式 (new format):
//   1. 在 animation/providers/ 下加文件实现 AnimationProvider
//   2. 在这里 import + register
//   3. scenes.json 加 entry, animation.type = 新 type id
animationRegistry.register(apngProvider.type, apngProvider);
animationRegistry.register(lottieProvider.type, lottieProvider);

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("root element not found");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
