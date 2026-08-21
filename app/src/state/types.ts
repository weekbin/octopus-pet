// Octopus Pet — Type definitions for state machine
// Per plan §1.9.2: 14 scenes, simple FSM rotation, mcode events deferred to V1.1+.

/**
 * The 14 pet states. Order is the rotation order (timer auto-advance cycles through
 * these in sequence, wrapping back to `pretend-busy` after `multitask`).
 */
export const SCENE_ORDER = [
  "pretend-busy",
  "stay-late",
  "breakdown",
  "lying-flat",
  "multi-tasking",
  "payday",
  "salary-rejected",
  "treat-milk-tea",
  "friday-5pm",
  "toilet-slacking",
  "touch-fish",
  "waiting-m3pro",
  "soul-leaving",
  "multitask",
] as const;

export type OctopusScene = (typeof SCENE_ORDER)[number];

/**
 * Bubble (speech) line. ≤ 12 characters to match "打工人" tone (per plan §1.9.2).
 * Cute / resigned / sardonic — never mean.
 */
export const BUBBLE_BY_SCENE: Record<OctopusScene, readonly string[]> = {
  "pretend-busy": ["忙死了", "改完这版就休息", "看起来很忙", "代码在飞", "在思考", "让我想想...", "用户又提需求了..."],
  "stay-late": ["再熬一会", "夜宵时间", "就差一点了", "咖啡续命", "月亮真圆", "让我想想...", "用户不好糊弄"],
  "breakdown": ["我裂开了", "求救信号", "想回家", "脑子空白", "为什么", "让我看看...", "用户又提需求了..."],
  "lying-flat": ["摆烂中", "充电模式", "别叫我", "躺平第一", "我是土豆", "让我想想...", "我摸鱼应该不会被发现"],
  "multi-tasking": ["一心多用", "5 个 tab", "分身乏术", "我能行", "稳住", "让我看看...", "用户又提需求了..."],
  "payday": ["发工资!", "今天吃好", "奶茶自由", "终于到了", "我活了", "让我想想...", "用户不好糊弄"],
  "salary-rejected": ["退款中", "系统抽风", "明天再试", "保住心态", "算了", "让我看看...", "用户又提需求了..."],
  "treat-milk-tea": ["奶茶第一", "加珍珠", "半糖去冰", "今天你请", "快乐水", "让我想想...", "我摸鱼应该不会被发现"],
  "friday-5pm": ["TGIF", "周末快乐", "倒计时", "下班万岁", "我自由了", "让我看看...", "用户不好糊弄"],
  "toilet-slacking": ["蹲坑中", "带薪休息", "腿麻了", "思考人生", "摸鱼时间", "我摸鱼应该不会被发现", "让我想想..."],
  "touch-fish": ["假装在工作", "刷新一下", "甩锅中", "策划未来", "看下手机", "我摸鱼应该不会被发现", "用户不好糊弄"],
  "waiting-m3pro": ["等新电脑", "性能焦虑", "渲染中", "时间静止", "耐心等待", "让我想想...", "用户又提需求了..."],
  "soul-leaving": ["灵魂出窍", "身体在工位", "意识漂浮", "我不在", "眼睛失焦", "让我看看...", "用户不好糊弄"],
  "multitask": ["三屏模式", "并行处理", "CPU 满载", "我在哪", "快进快出", "让我想想...", "用户又提需求了..."],
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
 * - TIMER_TICK: 33Hz tick (V1 setInterval), FSM 用 shouldRotate 判定 8s 切 scene,
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
 * V1 主调度: 8s 自动切 scene (跟 V1 8 切 scene 行为一致).
 * V2 调度: rotateScene action 内部用 pickRandomScene 替代 nextScene, 时间间隔仍 8s.
 * 用户操作 (CLICK / PET) 重置 autoNextAt 计时, 避免气泡还没看完就被切走.
 */
export const ROTATION_INTERVAL_MS = 8_000;
export const BUBBLE_DURATION_MS = 3_000;
export const FRAME_INTERVAL_MS = 83; // 12 fps for 141-frame loop ≈ 11.7s
export const MAX_AFFECTION = 100;

/**
 * V2 调度: 随机播放去重窗口大小.
 *
 * 14 场景里排除最近 5 个, 等概率从剩下 9 个里选.
 * - 太小 (N=1): 仍可能"假装很忙 → 假装很忙"连续 2 次, 用户感觉在循环
 * - 太大 (N=10): 只剩 4 候选, 跟顺序轮转没区别
 * - N=5: 14-1-5=8 候选, 概率 1/8 每次, 跟 6s×14/8 ≈ 1.5min 内不重复, 体感"真随机"
 */
export const RECENT_WINDOW_SIZE = 5;
