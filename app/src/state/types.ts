// Octopus Pet — Type definitions for state machine
// V1.5 (2026-08-21): 默认只跑 2 个 V2 视频成品 (detective-study + worker-construction),
// 不再用 14 个 V1 spritesheet (打工人 meme 是 octopus-meme skill 出的表情包, 不是桌宠).
// 14 V1 spritesheet 移到 `app/public/assets/octopus/_archive-v1-spritesheets/`.

/**
 * The 2 V2 pet scenes. 8s 轮转, V2 pickRandomScene (随机 + 去重).
 * 加新场景: 1) 跑 H3 / gen_videos 生成绿幕视频
 *         2) `scripts/extract-chromakey-apng.py` 转 APNG
 *         3) 放 `app/public/assets/octopus/v2/<scene>.png`
 *         4) SCENE_ORDER + BUBBLE_BY_SCENE + mcp_stdio.rs SCENES + 同步 manifest
 *         5) `bash scripts/check-scenes-sync.sh` 校验
 */
export const SCENE_ORDER = [
  "detective-study",
  "worker-construction",
] as const;

export type OctopusScene = (typeof SCENE_ORDER)[number];

/**
 * Bubble (speech) line. ≤ 12 characters, cute / resigned / sardonic — never mean.
 */
export const BUBBLE_BY_SCENE: Record<OctopusScene, readonly string[]> = {
  "detective-study": ["在研究", "放大看看", "找到了", "等一下", "认真脸", "让我看看...", "用户不好糊弄"],
  "worker-construction": ["施工中", "砸一下", "放桌子", "建好了", "戴好安全帽", "让我想想...", "我摸鱼应该不会被发现"],
} as const;

export interface OctopusState {
  /** Current pet scene. */
  scene: OctopusScene;
  /** Bubble text shown above the pet, or null when no bubble. */
  bubble: string | null;
  /** Wall-clock ms timestamp at which to auto-rotate to the next scene. */
  autoNextAt: number;
  /** Wall-clock ms timestamp at which to hide the current bubble (or null = no bubble). */
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
 * Events the FSM reacts to.
 * - TIMER_TICK: 33Hz tick, FSM 用 shouldRotate 判定 8s 切 scene,
 *               shouldHideBubble 判定 3s 后消 bubble. V2 切 scene 用 pickRandomScene.
 * - ROTATE_NOW: user or MCP asks to skip to the next scene immediately (V2: pickRandomScene).
 * - FORCE_SCENE: jump to a specific scene (MCP pet_show / pet_set_state).
 * - CLICK: single click on the pet — show a random bubble, +1 affection, reset autoNextAt.
 * - PET: pet the head (MCP pet_pet or right-click context) — +5 affection, "啊" bubble.
 * - ASK: external agent says something (MCP pet_ask) — show bubble.
 * - DISMISS_BUBBLE: hide the bubble.
 * - DRAG: user is dragging the window (handled outside FSM, just persists position).
 */
export type OctopusEvent =
  | { type: "TIMER_TICK"; now: number }
  | { type: "ROTATE_NOW"; now: number }
  | { type: "FORCE_SCENE"; scene: OctopusScene; now: number }
  | { type: "CLICK"; now: number }
  | { type: "PET"; now: number }
  | { type: "ASK"; text: string; now: number }
  | { type: "DISMISS_BUBBLE"; now: number }
  | { type: "DRAG"; x: number; y: number };

/**
 * V1 主调度: 8s 自动切 scene.
 * V2 调度: rotateScene action 内部用 pickRandomScene 替代 nextScene, 时间间隔仍 8s.
 * 用户操作 (CLICK / PET) 重置 autoNextAt 计时, 避免气泡还没看完就被切走.
 */
export const ROTATION_INTERVAL_MS = 8_000;
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
