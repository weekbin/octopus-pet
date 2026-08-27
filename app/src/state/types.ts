// Octopus Pet — Type definitions for the 2-scene FSM.
// V2.1 (2026-08-27): 事件驱动 (apng-js end → SCENE_LOOPED), 0 累积延迟.
// 完整演进历史见 CHANGELOG.md; 协作规则见 AGENTS.md.
//
// 场景数据从 scenes.json (单一源) 自动生成:
//   bash scripts/build-scene-registry.sh
// 生成的 SCENE_IDS / SCENE_ORDER / BUBBLE_BY_SCENE 来自
// scene-registry.generated.ts, 跟 Rust SCENES 共享 scenes.json.

export type OctopusScene = "detective-study" | "worker-construction";

export {
  SCENE_IDS,
  SCENE_ORDER,
  BUBBLE_BY_SCENE,
} from "./scene-registry.generated";

export interface OctopusState {
  /** Current pet scene. */
  scene: OctopusScene;
  /** Bubble text shown above the pet, or null when no bubble. */
  bubble: string | null;
  /**
   * Wall-clock ms timestamp at which the current bubble should be dismissed.
   * FSM 只管存, 实际 setTimeout 由 OctopusPet 组件 useEffect 调度
   * (不依赖全局 TIMER_TICK). Rust SharedState 镜像此字段供 pet_get_state 读.
   */
  bubbleHideAt: number | null;
  /** Affection counter, 0..100 (no UI in V1, just stored). */
  affection: number;
  /** Pet position on screen, in physical pixels. */
  position: { x: number; y: number };
  /**
   * V2 调度: 最近 N 个已播放场景 (按时间顺序, 最旧在前).
   * rotateScene 选下一个场景时排除此集合 (避免短时间重复).
   * 不包含当前 scene (当前 scene 在 context.scene, 不在历史里).
   * FORCE_SCENE 不更新此字段 (MCP 显式控制不影响自然轮转序列).
   */
  recentScenes: OctopusScene[];
}

/**
 * Events the FSM reacts to. `now: number` only on events that need it for
 * time-based context (currently: bubbleHideAt computation).
 * - SCENE_LOOPED: apng-js Player 完成一轮循环 (numPlays=1). 触发 rotateScene.
 * - ROTATE_NOW: user or MCP asks to skip to the next scene immediately.
 * - FORCE_SCENE: jump to a specific scene (MCP pet_show).
 * - CLICK: show a random bubble, +1 affection.
 * - PET: show "啊~" bubble, +5 affection.
 * - ASK: external agent says something (MCP pet_ask) — show bubble.
 * - DISMISS_BUBBLE: hide the bubble (setTimeout in OctopusPet 自动触发).
 * - DRAG: user is dragging the window.
 */
export type OctopusEvent =
  | { type: "SCENE_LOOPED" }
  | { type: "ROTATE_NOW" }
  | { type: "FORCE_SCENE"; scene: OctopusScene }
  | { type: "CLICK"; now: number }
  | { type: "PET"; now: number }
  | { type: "ASK"; text: string; now: number }
  | { type: "DISMISS_BUBBLE" }
  | { type: "DRAG"; x: number; y: number };

/**
 * V2.1 调度 (2026-08-24 实装, 替代 V1.5 setInterval 33Hz): 用 apng-js Player
 * 的 frame 事件检测 APNG 循环边界, 切 scene 严格对齐 frame 0. 0 累积延迟,
 * 不受 NTP/DST/手动校时影响, 治中段剪切 (P1) + 高频 IPC 压力 (P3) + wall-clock
 * 漂移 (P2) 一并解决. 8s setInterval 完全拆掉, scene 切只走 SCENE_LOOPED.
 *
 * bubble 计时单独用 setTimeout 3s, 不依赖全局 33Hz tick.
 */
export const BUBBLE_DURATION_MS = 3_000;
export const MAX_AFFECTION = 100;

/**
 * V2 调度: 随机播放去重窗口大小.
 *
 * 2 场景里排除最近 1 个 (RECENT_WINDOW_SIZE 不能 ≥ 2, 否则候选为空).
 * - N=1: 候选 1 个, 2 个场景随机不重复 (10/14 自动用这值, 2 场景同样工作)
 * - N=0: 跟当前一起, 候选 0 个, 防御分支随机一个 (跟 N=1 等价)
 * - N=2: 候选空, 退化为随机所有 (跟 N=0 等价)
 *
 * 注: 14 场景时期 N=5 调优 14-1-5=8 候选. 2 场景时期 N=1 即可.
 */
export const RECENT_WINDOW_SIZE = 1;
