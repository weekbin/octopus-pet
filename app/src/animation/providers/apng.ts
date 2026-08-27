// APNG animation provider. 把现有 useApngPlayer 的 apng-js 加载 + Player 管理
// 逻辑搬到 animation provider 形式, 跟 animation interface 对齐.

import { loadApng } from "../../state/apng";
import type { OctopusScene } from "../../state/types";
import type { Animation, AnimationProvider } from "../types";

// 1:1 命名约定: scene id → /assets/octopus/v2/<id>.png. 来源单一, 不放
// 通用 layer (因为是 APNG 实现细节).
function getApngUrl(source: string): string {
  if (source.startsWith("/") || source.startsWith("http")) return source;
  return `/assets/octopus/v2/${source as OctopusScene}.png`;
}

// apng-js 1.1.5 package types 字段只指向 parser.d.ts, Player 类不在 exported
// types. 用最小本地结构类型.
type ApngPlayer = {
  stop(): void;
  on(event: "end", listener: () => void): ApngPlayer;
};

/** 包装一个 apng-js Player 为 Animation interface. */
class ApngAnimation implements Animation {
  private cycleEndCallbacks: Array<() => void> = [];

  constructor(
    private readonly player: ApngPlayer,
    apng: { width: number; height: number; playTime: number },
  ) {
    this.nativeWidth = apng.width;
    this.nativeHeight = apng.height;
    this.cycleMs = apng.playTime;
    this.player.on("end", () => {
      for (const cb of this.cycleEndCallbacks) cb();
    });
  }

  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly cycleMs: number;

  start(): void {
    // apng-js Player autoPlay=true 时 create() 内部就开始了; 这里不重复启动.
  }

  stop(): void {
    try {
      this.player.stop();
    } catch {
      // already stopped — ignore
    }
  }

  onCycleEnd(callback: () => void): () => void {
    this.cycleEndCallbacks.push(callback);
    return () => {
      const i = this.cycleEndCallbacks.indexOf(callback);
      if (i >= 0) this.cycleEndCallbacks.splice(i, 1);
    };
  }
}

/**
 * APNG provider. source 接受 OctopusScene id (走 1:1 命名约定) 或直接 URL.
 */
export const apngProvider: AnimationProvider = {
  type: "apng",
  async create(ctx, source) {
    const url = getApngUrl(source);
    const apng = await loadApng(url);
    const player = (await apng.getPlayer(ctx, true)) as unknown as ApngPlayer;
    return new ApngAnimation(player, apng);
  },
};
