import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { animationRegistry } from "./animation/registry";
import { apngProvider } from "./animation/providers/apng";
import "./styles/global.css";

// 注册内置 animation provider. 加新动画格式 (lottie / video / ...):
//   1. 在 animation/providers/ 下加文件实现 AnimationProvider
//   2. 在这里 import + register
//   3. scenes.json 加 entry, animation.type = 新 type id
animationRegistry.register(apngProvider.type, apngProvider);

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("root element not found");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
