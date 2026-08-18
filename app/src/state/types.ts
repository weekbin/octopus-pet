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
  "pretend-busy": ["忙死了", "改完这版就休息", "看起来很忙", "代码在飞", "在思考"],
  "stay-late": ["再熬一会", "夜宵时间", "就差一点了", "咖啡续命", "月亮真圆"],
  "breakdown": ["我裂开了", "求救信号", "想回家", "脑子空白", "为什么"],
  "lying-flat": ["摆烂中", "充电模式", "别叫我", "躺平第一", "我是土豆"],
  "multi-tasking": ["一心多用", "5 个 tab", "分身乏术", "我能行", "稳住"],
  "payday": ["发工资!", "今天吃好", "奶茶自由", "终于到了", "我活了"],
  "salary-rejected": ["退款中", "系统抽风", "明天再试", "保住心态", "算了"],
  "treat-milk-tea": ["奶茶第一", "加珍珠", "半糖去冰", "今天你请", "快乐水"],
  "friday-5pm": ["TGIF", "周末快乐", "倒计时", "下班万岁", "我自由了"],
  "toilet-slacking": ["蹲坑中", "带薪休息", "腿麻了", "思考人生", "摸鱼时间"],
  "touch-fish": ["假装在工作", "刷新一下", "甩锅中", "策划未来", "看下手机"],
  "waiting-m3pro": ["等新电脑", "性能焦虑", "渲染中", "时间静止", "耐心等待"],
  "soul-leaving": ["灵魂出窍", "身体在工位", "意识漂浮", "我不在", "眼睛失焦"],
  "multitask": ["三屏模式", "并行处理", "CPU 满载", "我在哪", "快进快出"],
} as const;

export interface OctopusState {
  /** Current pet scene. */
  scene: OctopusScene;
  /** Current frame index within the scene's spritesheet (0..frameCount-1). */
  frame: number;
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
}

/**
 * Events the FSM reacts to.
 * - TIMER_TICK: emitted every animation frame (60Hz) to advance the frame counter.
 * - ROTATE_NOW: user or MCP asks to skip to the next scene immediately.
 * - FORCE_SCENE: jump to a specific scene (MCP pet_show / pet_set_state).
 * - CLICK: single click on the pet — show a random bubble, +1 affection, pause rotation.
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

export const ROTATION_INTERVAL_MS = 8_000; // per plan §1.9.2: 8s auto-rotation
export const BUBBLE_DURATION_MS = 3_000;
export const FRAME_INTERVAL_MS = 83; // 12 fps for 141-frame loop ≈ 11.7s
export const MAX_AFFECTION = 100;
