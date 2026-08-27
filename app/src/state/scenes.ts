// Octopus Pet — scene → APNG URL mapping.
// 1:1 命名约定: `app/public/assets/octopus/v2/<scene>.png` (无需 manifest).
// 加新场景流程见 `docs/v2-h3-to-pet-workflow.md` + `scripts/check-scenes-sync.sh` 校验.

import type { OctopusScene } from "./types";

export function getApngUrl(scene: OctopusScene): string {
  return `/assets/octopus/v2/${scene}.png`;
}
