// Animation provider registry. 模块加载时为空, 业务启动时
// (main.tsx) 调 register() 注入. Provider 跟 scene 格式一一对应.

import type { AnimationProvider } from "./types";

const providers = new Map<string, AnimationProvider>();

export const animationRegistry = {
  /** 注册一个 provider. 同 type 重复注册会被覆盖. */
  register(type: string, provider: AnimationProvider): void {
    providers.set(type, provider);
  },

  /**
   * 取 provider. 未注册返回 undefined — 调用方应 fallback (显示空白
   * 或 fallback scene) 而不是 throw, 避免坏 scene metadata 把整个 pet
   * 进程挂掉.
   */
  get(type: string): AnimationProvider | undefined {
    return providers.get(type);
  },

  /** 列出所有已注册的 type (debug 用). */
  list(): string[] {
    return Array.from(providers.keys());
  },
};
