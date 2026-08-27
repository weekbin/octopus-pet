// Octopus Pet — XState v5 machine for the 2-scene FSM.
// V2.1 (2026-08-27): 事件驱动, 0 累积延迟, 治 V1.5 33Hz 漂移 / 中段剪切 / 高频 IPC.
// 完整演进历史见 CHANGELOG.md; 协作规则见 AGENTS.md.
//
// 设计原则: scene 是 context, 不是 state (单 state 'active' 处理所有事件).
// KISS: 加新事件 → 加 action + handler, 不引入 nested state.

import { setup, assign } from "xstate";
import {
  BUBBLE_BY_SCENE,
  BUBBLE_DURATION_MS,
  MAX_AFFECTION,
  RECENT_WINDOW_SIZE,
  SCENE_ORDER,
  type OctopusEvent,
  type OctopusScene,
  type OctopusState,
} from "./types";

/**
 * V2 调度: 从 SCENE_ORDER 选一个不在 recent 集合里的场景, 等概率.
 *
 * - recent 通常是 context.recentScenes (最近 N 个已播放, 不含当前)
 * - 也包含当前 scene (避免同一 scene 连续 2 次, recent 维护不含当前)
 * - 候选为空时 (recent 含全部 14 个, 实际 N=5 不会发生) 退化到全候选等概率
 *
 * rng 参数可注入, 测试用. 默认 Math.random.
 */
export function pickRandomScene(
  currentScene: OctopusScene,
  recent: readonly OctopusScene[],
  rng: () => number = Math.random,
): OctopusScene {
  const exclude = new Set<OctopusScene>([...recent, currentScene]);
  const candidates = SCENE_ORDER.filter((s) => !exclude.has(s));
  // 防御: recent 太大或参数异常时退化
  if (candidates.length === 0) {
    return SCENE_ORDER[Math.floor(rng() * SCENE_ORDER.length)] as OctopusScene;
  }
  return candidates[Math.floor(rng() * candidates.length)] as OctopusScene;
}

/**
 * V2 调度: 维护滚动窗口. 追加 newScene, 超长裁剪最旧的.
 * 窗口大小默认 RECENT_WINDOW_SIZE (5). 窗口未满时直接返回追加后的列表.
 */
export function updateRecent(
  recent: readonly OctopusScene[],
  newScene: OctopusScene,
  windowSize: number = RECENT_WINDOW_SIZE,
): OctopusScene[] {
  const next = [...recent, newScene];
  if (next.length > windowSize) {
    return next.slice(next.length - windowSize);
  }
  return next;
}

function pickBubble(scene: OctopusScene, rng: () => number = Math.random): string {
  const lines = BUBBLE_BY_SCENE[scene];
  if (!lines || lines.length === 0) return ""; // 防御: 未来加新场景忘配 BUBBLE_BY_SCENE
  return lines[Math.floor(rng() * lines.length)];
}

const initialContext: OctopusState = {
  scene: "detective-study",
  bubble: null,
  bubbleHideAt: null,
  affection: 0,
  position: { x: 100, y: 100 },
  recentScenes: [],
};

export const octopusMachine = setup({
  types: {
    context: {} as OctopusState,
    events: {} as OctopusEvent,
  },
  actions: {
    /**
     * 切下一个 scene (V2: pickRandomScene 随机+去重). 触发源: SCENE_LOOPED
     * (apng-js end) / ROTATE_NOW (MCP/user). 切 scene 时清 bubble 跟 V1 一致.
     */
    rotateScene: assign(({ context }) => {
      const next = pickRandomScene(context.scene, context.recentScenes);
      return {
        scene: next,
        recentScenes: updateRecent(context.recentScenes, next),
        bubble: null as string | null,
        bubbleHideAt: null as number | null,
      };
    }),
    /**
     * FORCE_SCENE: MCP 显式跳到指定场景, **不** 更新 recentScenes
     * (MCP 控制不影响自然轮转序列).
     */
    forceScene: assign(({ event }) => {
      if (event.type !== "FORCE_SCENE") return {};
      return {
        scene: event.scene,
        bubble: null,
        bubbleHideAt: null,
      };
    }),
    onClick: assign(({ context, event }) => {
      if (event.type !== "CLICK") return {};
      const text = pickBubble(context.scene);
      return {
        bubble: text,
        bubbleHideAt: event.now + BUBBLE_DURATION_MS,
        affection: Math.min(MAX_AFFECTION, context.affection + 1),
      };
    }),
    onPet: assign(({ context, event }) => {
      if (event.type !== "PET") return {};
      return {
        bubble: "啊~",
        bubbleHideAt: event.now + BUBBLE_DURATION_MS,
        affection: Math.min(MAX_AFFECTION, context.affection + 5),
      };
    }),
    onAsk: assign(({ event }) => {
      if (event.type !== "ASK") return {};
      // V1 spec: ≤ 12 chars
      const text = event.text.length > 12 ? event.text.slice(0, 12) : event.text;
      return {
        bubble: text,
        bubbleHideAt: event.now + BUBBLE_DURATION_MS,
      };
    }),
    dismissBubble: assign(() => ({
      bubble: null as string | null,
      bubbleHideAt: null as number | null,
    })),
    onDrag: assign(({ event }) => {
      if (event.type !== "DRAG") return {};
      return { position: { x: event.x, y: event.y } };
    }),
  },
}).createMachine({
  id: "octopus",
  initial: "active",
  context: initialContext,
  states: {
    active: {
      on: {
        /**
         * V2.1 事件驱动调度:
         * - SCENE_LOOPED: apng-js Player 循环边界 → rotateScene (V2: pickRandomScene)
         * - DISMISS_BUBBLE: setTimeout 触发 → 清 bubble
         *
         * 两者独立, 可并发. 跟 V1.5 33Hz TIMER_TICK 完全不同 — 不再有
         * "高频 IPC + shouldRotate 漂移" 的问题.
         */
        SCENE_LOOPED: { actions: "rotateScene" },
        ROTATE_NOW: { actions: "rotateScene" },
        FORCE_SCENE: { actions: "forceScene" },
        CLICK: { actions: "onClick" },
        PET: { actions: "onPet" },
        ASK: { actions: "onAsk" },
        DISMISS_BUBBLE: { actions: "dismissBubble" },
        DRAG: { actions: "onDrag" },
      },
    },
  },
});

export { pickBubble };
