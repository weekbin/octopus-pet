#!/usr/bin/env bash
# build-scene-registry.sh — wrapper around build_scene_registry.py
# usage: bash scripts/build-scene-registry.sh           # generate
#        bash scripts/build-scene-registry.sh --check   # CI mode

set -euo pipefail
cd "$(dirname "$0")/.."
exec python3 scripts/build_scene_registry.py "$@"
