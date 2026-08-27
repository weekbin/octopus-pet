// AUTO-GENERATED from scenes.json by scripts/build_scene_registry.py.
// DO NOT EDIT — re-run the script after editing scenes.json.


import type { OctopusScene } from "./types";

/** Scene id union — derived from scenes.json */
export const SCENE_IDS = ["detective-study", "worker-construction"] as const;

/** First-occurrence order — used by V2.1 pickRandomScene */
export const SCENE_ORDER: readonly OctopusScene[] = SCENE_IDS;

/** Bubble lines per scene — read by FSM onClick action */
export const BUBBLE_BY_SCENE: Record<OctopusScene, readonly string[]> = {
  "detective-study": ["在研究", "放大看看", "找到了", "等一下", "认真脸", "让我看看...", "用户不好糊弄"],
  "worker-construction": ["施工中", "砸一下", "放桌子", "建好了", "戴好安全帽", "让我想想...", "我摸鱼应该不会被发现"],
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
];
