#!/usr/bin/env python3
"""
build_scene_registry.py — Generate TS + Rust scene registry from scenes.json.

Single source of truth: scenes.json. CI enforces sync via --check mode.

Outputs:
  app/src/state/scene-registry.generated.ts   — SCENE_ORDER, BUBBLE_BY_SCENE
  src-tauri/src/scene_registry.generated.rs  — SCENES, BUBBLE_LINES

Usage:
  python3 scripts/build_scene_registry.py           # generate (overwrite)
  python3 scripts/build_scene_registry.py --check   # verify in-sync (CI mode)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCENES_JSON = ROOT / "scenes.json"
TS_OUT = ROOT / "app/src/state/scene-registry.generated.ts"
# Rust module naming: dots not allowed in mod name. Use underscores in the
# filename so `mod scene_registry_generated;` resolves correctly.
RS_OUT = ROOT / "src-tauri/src/scene_registry_generated.rs"

HEADER = (
    "// AUTO-GENERATED from scenes.json by scripts/build_scene_registry.py.\n"
    "// DO NOT EDIT — re-run the script after editing scenes.json.\n"
)


def generate_ts(data: dict) -> str:
    ids = [s["id"] for s in data["scenes"]]
    lines = [
        HEADER,
        "",
        "import type { OctopusScene } from \"./types\";",
        "",
        "/** Scene id union — derived from scenes.json */",
        f"export const SCENE_IDS = [{', '.join(json.dumps(i) for i in ids)}] as const;",
        "",
        "/** First-occurrence order — used by V2.1 pickRandomScene */",
        "export const SCENE_ORDER: readonly OctopusScene[] = SCENE_IDS;",
        "",
        "/** Bubble lines per scene — read by FSM onClick action */",
        "export const BUBBLE_BY_SCENE: Record<OctopusScene, readonly string[]> = {",
    ]
    for s in data["scenes"]:
        lines.append(
            f"  {json.dumps(s['id'], ensure_ascii=False)}: "
            f"{json.dumps(s['bubbleLines'], ensure_ascii=False)},"
        )
    lines.append("} as const;")
    lines.append("")
    return "\n".join(lines)


def generate_rs(data: dict) -> str:
    ids = [s["id"] for s in data["scenes"]]
    lines = [
        HEADER,
        "",
        "/** Scene ids exposed to MCP `pet_list_states` and validated by `pet_show`. */",
        "pub static SCENES: &[&str] = &[",
    ]
    for i in ids:
        lines.append(f'    "{i}",')
    lines.append("];")
    lines.append("")
    lines.append("/** Bubble lines per scene — surfaced for diagnostics / future use. */")
    lines.append("pub static BUBBLE_LINES: &[(&str, &[&str])] = &[")
    for s in data["scenes"]:
        items = ", ".join(f'"{l}"' for l in s["bubbleLines"])
        lines.append(f'    ("{s["id"]}", &[{items}]),')
    lines.append("];")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    if not SCENES_JSON.exists():
        print(f"ERROR: {SCENES_JSON} not found", file=sys.stderr)
        return 1
    try:
        data = json.loads(SCENES_JSON.read_text())
    except json.JSONDecodeError as e:
        print(f"ERROR: {SCENES_JSON} invalid JSON: {e}", file=sys.stderr)
        return 1

    ts_text = generate_ts(data)
    rs_text = generate_rs(data)

    if "--check" in sys.argv:
        ts_ok = TS_OUT.exists() and TS_OUT.read_text() == ts_text
        rs_ok = RS_OUT.exists() and RS_OUT.read_text() == rs_text
        if not ts_ok or not rs_ok:
            print(
                f"ERROR: generated files out of sync with scenes.json — "
                f"run `python3 scripts/build_scene_registry.py`",
                file=sys.stderr,
            )
            return 1
        print("OK: generated files in sync with scenes.json")
        return 0

    TS_OUT.write_text(ts_text)
    RS_OUT.write_text(rs_text)
    print(f"Generated: {TS_OUT.relative_to(ROOT)}")
    print(f"Generated: {RS_OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
