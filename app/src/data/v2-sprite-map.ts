// v2-sprite-map.ts — V2 表情 sprite 映射表.
//
// 设计原则 (跟用户 2026-08-17 17:18 拍板的" 表情轮换 + 不要硬编码" 一致):
//   - 14 scene 各对应一个 V2 sprite (RGBA WebM, VP9 alpha, 6.6s 循环)
//   - OctopusPet.tsx 读 state.context.scene, 查本表, 不用硬编码
//   - 后续补 V2 sprite: 改本表 URL 即可, **不需要改 OctopusPet.tsx**
//
// V2.1: 用 WebM 替代 APNG (体积小 17x, 135KB vs 2.3MB).
//   - WebM VP9 alpha 由 ffmpeg-full 编码 (keg-only, 见 scripts/encode-webm-alpha.sh)
//   - 桌宠 <video autoplay loop muted> 元素监听 onEnded → 发 SCENE_ENDED → 切 scene
//   - 切 scene 跟视频时长严格同步 (6.6s 循环), 不用 setInterval 计时
//
// 当前状态 (2026-08-21 W1 D5):
//   - 14 scene 中, 7 个用 01 戴帽研究 webm, 7 个用 02 工人施工 webm
//   - 主题分组: "研究类" 7 个 → 01 戴帽研究, "干活/摸鱼类" 7 个 → 02 工人施工
//   - 未来每个 scene 配独立 V2 表情时, 把对应 URL 改成 `v2/<scene>.webm` 即可
//
// 命名约定:
//   - 文件名: app/public/assets/octopus/v2/<NN>-<scene>.webm
//   - URL:   /assets/octopus/v2/<NN>-<scene>.webm
//   - 透明 + 192×192 + WebM VP9 alpha + 50 帧 × 15fps = 6.6s 循环

import type { OctopusScene } from "../state/types";

/**
 * V2 sprite 映射: scene → WebM URL.
 *
 * 当前 2 个 V2 sprite 分两类 (研究类 / 干活类). V2 调度在 SCENE_ENDED 事件触发时
 * 切 scene, 章鱼在 2 个 webm 间随机跳, 视觉上" 表情变".
 */
export const V2_SPRITE_BY_SCENE: Record<OctopusScene, string> = {
  // 研究类 → 01 戴帽研究 (举放大镜, 好奇表情)
  "stay-late": "/assets/octopus/v2/01-detective-study.webm",
  "multi-tasking": "/assets/octopus/v2/01-detective-study.webm",
  "waiting-m3pro": "/assets/octopus/v2/01-detective-study.webm",
  "soul-leaving": "/assets/octopus/v2/01-detective-study.webm",
  "multitask": "/assets/octopus/v2/01-detective-study.webm",
  "breakdown": "/assets/octopus/v2/01-detective-study.webm",
  "payday": "/assets/octopus/v2/01-detective-study.webm",

  // 干活/摸鱼类 → 02 工人施工 (戴安全帽+木锤+小木桌, 严肃表情)
  "pretend-busy": "/assets/octopus/v2/02-worker-construction.webm",
  "lying-flat": "/assets/octopus/v2/02-worker-construction.webm",
  "salary-rejected": "/assets/octopus/v2/02-worker-construction.webm",
  "treat-milk-tea": "/assets/octopus/v2/02-worker-construction.webm",
  "friday-5pm": "/assets/octopus/v2/02-worker-construction.webm",
  "toilet-slacking": "/assets/octopus/v2/02-worker-construction.webm",
  "touch-fish": "/assets/octopus/v2/02-worker-construction.webm",
};
