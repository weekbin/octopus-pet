// AUTO-GENERATED from scenes.json by scripts/build_scene_registry.py.
// DO NOT EDIT — re-run the script after editing scenes.json.


import type { OctopusScene } from "./types";

/** Scene id union — derived from scenes.json */
export const SCENE_IDS = ["detective-study", "worker-construction", "drink-coffee", "breakdown", "friday-5pm", "pretend-busy", "stay-late", "treat-milk-tea"] as const;

/** First-occurrence order — used by V2.1 pickRandomScene */
export const SCENE_ORDER: readonly OctopusScene[] = SCENE_IDS;

/** Bubble lines per scene — read by FSM onClick action */
export const BUBBLE_BY_SCENE: Record<OctopusScene, readonly string[]> = {
  "detective-study": ["在研究", "放大看看", "找到了", "等一下", "认真脸", "让我看看...", "用户不好糊弄"],
  "worker-construction": ["施工中", "砸一下", "放桌子", "建好了", "戴好安全帽", "让我想想...", "我摸鱼应该不会被发现"],
  "drink-coffee": ["喝咖啡", "好香啊", "续杯吗", "今日份咖啡", "早八续命", "摸鱼时间", "让我清醒一下"],
  "breakdown": ["抱头", "撑不住", "我裂了", "不行了", "想下班", "累死了", "救救我"],
  "friday-5pm": ["跑了", "起飞", "下班咯", "冲鸭", "周末啦", "自由了", "收工"],
  "pretend-busy": ["忙死了", "别烦", "敲键盘", "好累", "加班中", "努力搬砖", "假装"],
  "stay-late": ["叹气", "好累", "加班中", "想家", "撑住", "摸鱼", "躺平"],
  "treat-milk-tea": ["喝奶茶", "好喝", "续杯", "奶茶", "吨吨吨", "加糖", "放松"],
} as const;

/**
 * Scene → animation descriptor (给 useAnimation 查 provider 用).
 * `type` 对应 animationRegistry 里注册的 provider id;
 * `source` 格式特定 (URL / file path / JSON / 场景 id 走 1:1 命名).
 */
export interface SceneAnimation {
  readonly type: string;
  readonly source: string;
}
export interface Scene {
  readonly id: OctopusScene;
  readonly animation: SceneAnimation;
  readonly bubbleLines: readonly string[];
}
export const SCENES: readonly Scene[] = [
  {
    id: "detective-study",
    animation: { type: "apng", source: "detective-study" },
    bubbleLines: ["在研究", "放大看看", "找到了", "等一下", "认真脸", "让我看看...", "用户不好糊弄"],
  },
  {
    id: "worker-construction",
    animation: { type: "apng", source: "worker-construction" },
    bubbleLines: ["施工中", "砸一下", "放桌子", "建好了", "戴好安全帽", "让我想想...", "我摸鱼应该不会被发现"],
  },
  {
    id: "drink-coffee",
    animation: { type: "apng", source: "drink-coffee" },
    bubbleLines: ["喝咖啡", "好香啊", "续杯吗", "今日份咖啡", "早八续命", "摸鱼时间", "让我清醒一下"],
  },
  {
    id: "breakdown",
    animation: { type: "apng", source: "breakdown" },
    bubbleLines: ["抱头", "撑不住", "我裂了", "不行了", "想下班", "累死了", "救救我"],
  },
  {
    id: "friday-5pm",
    animation: { type: "apng", source: "friday-5pm" },
    bubbleLines: ["跑了", "起飞", "下班咯", "冲鸭", "周末啦", "自由了", "收工"],
  },
  {
    id: "pretend-busy",
    animation: { type: "apng", source: "pretend-busy" },
    bubbleLines: ["忙死了", "别烦", "敲键盘", "好累", "加班中", "努力搬砖", "假装"],
  },
  {
    id: "stay-late",
    animation: { type: "apng", source: "stay-late" },
    bubbleLines: ["叹气", "好累", "加班中", "想家", "撑住", "摸鱼", "躺平"],
  },
  {
    id: "treat-milk-tea",
    animation: { type: "apng", source: "treat-milk-tea" },
    bubbleLines: ["喝奶茶", "好喝", "续杯", "奶茶", "吨吨吨", "加糖", "放松"],
  },
];
