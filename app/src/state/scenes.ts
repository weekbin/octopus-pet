// Octopus Pet — V1.5 APNG scene mapping.
//
// V1.5 (2026-08-21): 14 V1 spritesheet 改 2 V2 APNG 视频成品.
// 14 V1 spritesheet 是 octopus-meme skill 出的"打工人"表情包, 不是桌宠, 移到
// `app/public/assets/octopus/_archive-v1-spritesheets/` 不再用. 新默认 2 个 V2
// 视频 (H3 戴帽研究 + gen_videos 工人施工), 走 `scripts/extract-chromakey-apng.py`
// 转 RGBA APNG. 浏览器原生支持 APNG 循环, 8s 切 scene 触发 src 切换.
//
// 加新场景流程:
//   1) 跑 H3 / gen_videos 生成绿幕视频 → 落到 `docs/v2-XX-name/`
//   2) `python3 scripts/extract-chromakey-apng.py -i <mp4> -o <apng>`
//   3) 复制到 `app/public/assets/octopus/v2/<scene>.png`
//   4) `types.ts` SCENE_ORDER + BUBBLE_BY_SCENE + `mcp_stdio.rs` SCENES 同步
//   5) `bash scripts/check-scenes-sync.sh` 校验三源一致

import type { OctopusScene } from "./types";

/** Public URL for a scene's APNG (transparent video). */
export function getApngUrl(scene: OctopusScene): string {
  return `/assets/octopus/v2/${scene}.png`;
}
