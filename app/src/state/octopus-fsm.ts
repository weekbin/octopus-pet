// Octopus Pet — XState v5 machine for the 2-scene FSM (V2.1, 2026-08-24).
//
// V2.1 (事件驱动, 替代 V1.5 33Hz setInterval):
//   - 调度: apng-js Player 的 frame 事件检测 APNG 循环边界, 发 SCENE_LOOPED →
//     rotateScene. 严格对齐 frame 0, 0 累积延迟, 不受 NTP/DST 影响.
//   - 渲染: OctopusPet 用 <canvas> + apng-js 解码, 替代 <img> 黑盒.
//   - bubble 计时: 组件 setTimeout(BUBBLE_DURATION_MS), 不用全局 33Hz tick.
//
// V1.5 → V2.1 变化清单:
//   - 拆: TIMER_TICK 事件, shouldRotate guard, autoNextAt 字段, ROTATION_INTERVAL_MS
//   - 加: SCENE_LOOPED 事件
//   - 行为: rotateScene 不再需要 now, recentScenes 维护逻辑不变
//
// V1.5 (2026-08-21): 默认只跑 2 个 V2 视频成品 (detective-study + worker-construction).
// 14 V1 spritesheet 表情包已废弃, 移到 _archive-v1-spritesheets/.
//
// Per plan §1.9.2: simple timer rotation + click/pet events, MCP tool calls mapped to events.
// V2 调度: rotateScene 改用 pickRandomScene (随机 + 去重最近 N 个) 替代 V1 顺序轮转.
//
// 用户 2026-08-21 19:14 反馈: "我们现在是默认的 2 个做好的成品啊, 之前那些
// (14 V1 打工人 meme 表情包) 不要用, 我们做的事桌面宠物, 思路不要走错了".
// → V1.5 治本: 14 spritesheet 替换为 2 V2 视频 APNG (浏览器原生循环).
//
// 用户 2026-08-24 23:19 反馈: "其实最理想的还是如果能用事件逻辑来控制动画会比较好,
// 定时器总是不太稳定的". → V2.1 治本: 事件驱动替代 setInterval, 用 apng-js
// 拿播放完成事件, 渲染到 canvas 保持 V1.5 视觉 (不走 V2.1 webm + chroma key 老路).
//
// XState v5 uses setup({...}).createMachine({...}) pattern. We use a single machine
// (no nested states) — the "scene" is just context. KISS for V2.1.

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
     * V2 调度: 切下一个 scene. 内部抽 pickRandomScene, 维护 recentScenes.
     * 跟 bubble 状态无关 — 切 scene 时清掉当前 bubble, 跟 V1 一致.
     *
     * V2.1 事件驱动: 触发源是 apng-js Player 的 SCENE_LOOPED (frame 0 边界),
     * 不再需要 now 参数. 保留 event.now 给日志 / 测试断言用.
     */
    rotateScene: assign(({ context, event }) => {
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
    forceScene: assign(({ context, event }) => {
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

export { nextScene, pickBubble };
