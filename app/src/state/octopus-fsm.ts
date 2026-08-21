// Octopus Pet — XState v5 machine for the 14-scene FSM.
// Per plan §1.9.2: simple timer rotation + click/pet events, MCP tool calls mapped to events.
//
// V2 调度: rotateScene 改用 pickRandomScene (随机 + 去重最近 N 个) 替代 V1 顺序轮转.
// 渲染层 2026-08-17 回退到 V1 风格 (14 spritesheet + frameToGrid 141 帧), canvas
// chroma key 路线被否 (视觉差). 桌宠 33Hz TIMER_TICK → FSM shouldRotate → 切 scene.
// (V1 用 8s setInterval 顺序切, V2 在 action 层用 pickRandomScene 替换, 跟 33Hz
// tick 兼容, 间隔通过 autoNextAt 字段判定.)
//
// 用户 2026-08-17 18:21 根因反馈: V2.1 事件驱动 (SCENE_ENDED) + canvas chroma key
// 视觉比 V1 差, 边缘半透明瑕疵. "回退吧, 我想别的办法做动画切换的效果".
// → 回退到 V1 渲染, 保留 V2 调度 (随机+去重). SCENE_ENDED 事件移除.
//
// XState v5 uses setup({...}).createMachine({...}) pattern. We use a single machine
// (no nested states) — the "scene" is just context. KISS for V1.

import { setup, assign } from "xstate";
import {
  BUBBLE_BY_SCENE,
  BUBBLE_DURATION_MS,
  MAX_AFFECTION,
  RECENT_WINDOW_SIZE,
  ROTATION_INTERVAL_MS,
  SCENE_ORDER,
  type OctopusEvent,
  type OctopusScene,
  type OctopusState,
} from "./types";

/**
 * V1 兼容: 顺序轮转 (currentIndex + 1) % 14. 保留导出, 用于测试 / 文档.
 * V2 调度 (rotateScene) 改用 pickRandomScene.
 */
function nextScene(scene: OctopusScene): OctopusScene {
  const i = SCENE_ORDER.indexOf(scene);
  return SCENE_ORDER[(i + 1) % SCENE_ORDER.length] as OctopusScene;
}

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
  return lines[Math.floor(rng() * lines.length)];
}

const initialContext: OctopusState = {
  scene: "detective-study",
  bubble: null,
  autoNextAt: Date.now() + ROTATION_INTERVAL_MS,
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
     * V2 调度: 切下一个 scene. 内部抽 pickRandomScene, 维护 recentScenes.
     * 跟 bubble 状态无关 — 切 scene 时清掉当前 bubble, 跟 V1 一致.
     * autoNextAt 用 event.now (触发 rotateScene 的事件时间戳) 重置, 不用
     * Date.now() — 跟测试的"虚拟时钟"兼容, 也跟运行时真实时钟一致.
     */
    rotateScene: assign(({ context, event }) => {
      const now = (event as { now?: number }).now ?? Date.now();
      const next = pickRandomScene(context.scene, context.recentScenes);
      return {
        scene: next,
        recentScenes: updateRecent(context.recentScenes, next),
        autoNextAt: now + ROTATION_INTERVAL_MS,
        bubble: null as string | null,
        bubbleHideAt: null as number | null,
      };
    }),
    /**
     * FORCE_SCENE: MCP 显式跳到指定场景, **不** 更新 recentScenes
     * (MCP 控制不影响自然轮转序列).
     */
    forceScene: assign(({ context, event }) => {
      if (event.type !== "FORCE_SCENE") return {};
      return {
        scene: event.scene,
        autoNextAt: event.now + ROTATION_INTERVAL_MS,
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
        // V1: 重置 autoNextAt 让 8s 计时从 click 时刻重新开始 (用户操作不立即被打断)
        autoNextAt: event.now + ROTATION_INTERVAL_MS,
        affection: Math.min(MAX_AFFECTION, context.affection + 1),
      };
    }),
    onPet: assign(({ context, event }) => {
      if (event.type !== "PET") return {};
      return {
        bubble: "啊~",
        bubbleHideAt: event.now + BUBBLE_DURATION_MS,
        autoNextAt: event.now + ROTATION_INTERVAL_MS,
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
  guards: {
    /**
     * V1 主调度: TIMER_TICK 触发时若 autoNextAt 已到 (≥ 8s), 切 scene.
     * V2: 切 scene 时用 pickRandomScene (随机 + 去重) 而非 nextScene (顺序).
     */
    shouldRotate: ({ context, event }) => {
      if (event.type !== "TIMER_TICK") return false;
      return event.now >= context.autoNextAt;
    },
    /**
     * V1: bubble hide 判定 (3s 计时). 跟 shouldRotate 独立, 同走 TIMER_TICK.
     */
    shouldHideBubble: ({ context, event }) => {
      if (event.type !== "TIMER_TICK") return false;
      return context.bubbleHideAt !== null && event.now >= context.bubbleHideAt;
    },
  },
}).createMachine({
  id: "octopus",
  initial: "active",
  context: initialContext,
  states: {
    active: {
      on: {
        /**
         * TIMER_TICK (33Hz): 两个 guard 互不冲突, 各管各的.
         * - shouldRotate (autoNextAt 已到) → rotateScene (V2: pickRandomScene)
         * - shouldHideBubble (bubbleHideAt 已到) → dismissBubble
         * XState v5 guard 列表按顺序求值, 第一个 true 触发. 但两个 guard 在不同
         * action 里互斥: autoNextAt 跟 bubbleHideAt 独立维护, 同时为 true 时两个
         * action 都会执行 (XState v5 multiple transitions are independent).
         */
        TIMER_TICK: [
          { guard: "shouldRotate", actions: "rotateScene" },
          { guard: "shouldHideBubble", actions: "dismissBubble" },
        ],
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

export { nextScene, pickBubble };
