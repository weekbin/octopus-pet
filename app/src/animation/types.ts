// Octopus Pet — Animation abstraction. 让 "scene" 不再绑死 APNG,
// 业务代码只用 `Animation` 接口, 换格式只注册新 provider 不动 FSM/hook.
//
// 调用流程 (OctopusPet → useAnimation → provider):
//   useAnimation(containerRef, scene)        // 取 scene.animation.type
//     → registry.get(type).create(target, source)  // target = container div
//       → Animation instance (start/stop/onCycleEnd)
//         + onCycleEnd 内部触发 → 调用方回调
//
// 加新动画类型 (e.g. lottie, video, gif) 的 3 步:
//   1. 实现 AnimationProvider (LottieProvider.ts) — create() 返回 Animation
//   2. 在 main.tsx 注册: animationRegistry.register("lottie", lottieProvider)
//   3. scenes.json 里加 entry: { "id": "...", "animation": { "type": "lottie", "source": "..." } }
//   4. 跑 bash scripts/build-scene-registry.sh
// 业务代码 (FSM / useAnimation 等) 零修改.
//
// 设计原因 (2026-09-11 macOS WebKit canvas 渲染 0 像素):
//   - V2.1 用 (ctx, source) 签名, provider 内部 ctx.drawImage / apng-js
//     getPlayer(ctx). chromium work, Tauri macOS WKWebView canvas 0 像素.
//   - 改 (target: HTMLElement, source) 后, apng provider 在 target 内
//     appendChild <img>, 浏览器原生 APNG 循环, 跨平台兼容
//     (macOS WKWebView / Linux WebKitGTK / Windows WebView2 / 任何 chromium).
//   - lottie 仍可在 target 内创建 hidden canvas 走 rAF, 走原来的 ctx 路径.

/** 一个可在 HTML element 上播放的动画. 由 AnimationProvider.create() 构造. */
export interface Animation {
  /** 启动 (autoPlay=true 时 create() 内部可立即 start, 调用方也可手动控制). */
  start(): void;
  /** 停止 + 释放资源. 组件 unmount / scene 切时必调. */
  stop(): void;

  /**
   * 注册一个 cycle-end 回调. 多数动画 1 个 cycle = 1 个完整播放.
   * 无限循环动画 (e.g. GIF) cycle-end 永不触发, 适合"播放一次"动画.
   * 返回 unsubscribe 函数.
   */
  onCycleEnd(callback: () => void): () => void;

  /**
   * 原始 (native) 显示尺寸. apng 192×192, webm 1920×1080.
   */
  readonly nativeWidth: number;
  readonly nativeHeight: number;

  /**
   * 单次 cycle 时长 (ms). 给上层做进度条 / 总时长显示用.
   * 无限循环传 0.
   */
  readonly cycleMs: number;
}

/** 动画 provider. 每种格式 (apng / lottie / video / ...) 注册一个. */
export interface AnimationProvider {
  /** 类型 id, scenes.json 的 animation.type 字段对应这个. */
  readonly type: string;

  /**
   * 异步构造一个 Animation 实例, 把显示元素 append 到 target 容器.
   * Provider 内部决定用 <img>/<canvas>/<video>/<svg>, 调用方不感知.
   * @param target 容器 div, provider 会把自己的 element 放进去. scene 切时调用方会清空 target.
   * @param source 格式特定的资源 (URL / 文件路径 / 内嵌 data URL / JSON)
   */
  create(target: HTMLElement, source: string): Promise<Animation>;
}
