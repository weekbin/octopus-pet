#!/usr/bin/env bash
# lint-octopus-plugin.sh — validate a plugin directory against agent-plugins.org v1.0.0
#
# Per plan §1.8 + §1.9.6: enforces spec §5 (plugin.json), §7.2 (mcp.json), §9.2
# (path placeholders, command tokens), plus Agent Skills spec (SKILL.md frontmatter).
#
# Usage:
#   scripts/lint-octopus-plugin.sh [plugin_root]
#   scripts/lint-octopus-plugin.sh --root <plugin_root>
#
# Default plugin_root: current working directory.
#
# Checks (per spec):
#   1. plugin.json exists at root, valid JSON, contains $schema (pointing to
#      https://agent-plugins.org/schemas/1.0.0/plugin.schema.json) and name.
#   2. mcp.json exists, valid JSON, contains $schema (pointing to
#      https://agent-plugins.org/schemas/1.0.0/mcp.schema.json) and mcpServers
#      object.
#   3. Every server entry in mcpServers has type (closed union: stdio,
#      streamable-http, sse) per spec §7.2.1.
#   4. For stdio servers: command is a single token (no shell metachars, no
#      spaces), starts with ./ OR is a bare name (NOT an absolute path).
#   5. args, env, cwd only use ${PLUGIN_ROOT} and ${PLUGIN_DATA} placeholders.
#   6. skills/<name>/SKILL.md exists with YAML frontmatter containing name and
#      description fields.
#   7. All plugin-relative paths begin with ./.
#
# Exit codes:
#   0  all checks PASS
#   1  one or more checks FAIL
#   2  bad usage / missing dependencies
#
# Dependencies: bash 3.2+, python3 (for YAML + JSON parsing). No jq needed.

set -euo pipefail

# ---------- paths ----------
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEFAULT_ROOT="$(pwd)"

# ---------- color codes ----------
if [ -t 1 ]; then
  C_RED=$'\033[0;31m'
  C_GREEN=$'\033[0;32m'
  C_YELLOW=$'\033[0;33m'
  C_BLUE=$'\033[0;34m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_RED="" C_GREEN="" C_YELLOW="" C_BLUE="" C_BOLD="" C_RESET=""
fi

# ---------- counters ----------
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass()  { printf "  %s✓%s %s\n"  "$C_GREEN"  "$C_RESET" "$*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail()  { printf "  %s✗%s %s\n"  "$C_RED"    "$C_RESET" "$*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
warn()  { printf "  %s!%s %s\n"  "$C_YELLOW" "$C_RESET" "$*"; WARN_COUNT=$((WARN_COUNT + 1)); }
info()  { printf "  %s·%s %s\n"  "$C_BLUE"   "$C_RESET" "$*"; }
section(){ printf "\n%s%s%s\n"   "$C_BOLD"   "$*" "$C_RESET"; }

usage() {
  cat <<'EOF'
Usage:
  scripts/lint-octopus-plugin.sh [plugin_root]
  scripts/lint-octopus-plugin.sh --root <plugin_root>

If plugin_root is omitted, the current working directory is used.

Validates the plugin against agent-plugins.org v1.0.0:
  - plugin.json (§5)
  - mcp.json (§7.2)
  - skills/<name>/SKILL.md (Agent Skills spec)
  - path placeholders (§9.2)
  - command tokens (§9.2)

Exit 0 on PASS, 1 on any FAIL.
EOF
}

# ---------- arg parse ----------
PLUGIN_ROOT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root)        PLUGIN_ROOT="${2:-}"; shift 2 ;;
    -h|--help)     usage; exit 0 ;;
    -*)            printf "[FAIL]  Unknown argument: %s\n" "$1" >&2; usage >&2; exit 2 ;;
    *)             PLUGIN_ROOT="$1"; shift ;;
  esac
done

if [ -z "$PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$DEFAULT_ROOT"
fi

if [ ! -d "$PLUGIN_ROOT" ]; then
  printf "[FAIL]  Plugin root not found: %s\n" "$PLUGIN_ROOT" >&2
  exit 2
fi

# Normalize trailing slash
PLUGIN_ROOT="${PLUGIN_ROOT%/}"

# Verify python3 is available
if ! command -v python3 >/dev/null 2>&1; then
  printf "[FAIL]  python3 not found on PATH\n" >&2
  exit 2
fi

# Verify PyYAML is available (for SKILL.md frontmatter parsing). PyYAML is NOT
# a hard dependency — the script ships with a stdlib-only YAML frontmatter
# parser that handles the Agent Skills spec subset (top-level keys, scalar
# values, `|` and `>` block scalars). PyYAML is preferred when present.
if python3 -c 'import yaml' 2>/dev/null; then
  HAS_YAML=1
else
  HAS_YAML=0
  printf "[INFO]  PyYAML not installed; using stdlib YAML parser (handles Agent Skills frontmatter subset)\n"
fi

# ---------- constants ----------
PLUGIN_SCHEMA="https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
MCP_SCHEMA="https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"
ALLOWED_TYPES=("stdio" "streamable-http" "sse")
ALLOWED_PLACEHOLDERS=("PLUGIN_ROOT" "PLUGIN_DATA")
# env var pattern: ${NAME} where NAME is in ALLOWED_PLACEHOLDERS

# ---------- helpers ----------
# read JSON field; usage: jq_get <file> <key-path>
# key-path is dotted, e.g. "mcpServers.octopus-pet.type"
jq_get() {
  local file="$1"
  local path="$2"
  python3 - "$file" "$path" <<'PYEOF'
import json
import sys

path = sys.argv[2]
with open(sys.argv[1]) as f:
    data = json.load(f)

cur = data
for part in path.split("."):
    if isinstance(cur, dict) and part in cur:
        cur = cur[part]
    else:
        sys.exit(0)  # not found, print nothing
print(cur)
PYEOF
}

# Check whether a string contains shell metacharacters.
has_shell_metachars() {
  case "$1" in
    *' '*|*'\t'*|*';'*|*'&'*|*'|'*|*'<'*|*'>'*|*'$'*|*'`'*|*'('*|*')'*|*'{'*|*'}'*|*'!'*|*'*'*|*'?'*|*'['*|*']'*|*'\\'*|*'"'*|*"'"*)
      return 0 ;;  # has metachars
    *)
      return 1 ;;  # clean
  esac
}

# Check whether a path begins with ./
is_plugin_relative() {
  case "$1" in
    ./*) return 0 ;;
    *)   return 1 ;;
  esac
}

# Check whether a path is absolute
is_absolute() {
  case "$1" in
    /*) return 0 ;;
    ~/*) return 0 ;;
    *)  return 1 ;;
  esac
}

# Check whether a value uses only allowed ${...} placeholders
# Returns the list of unknown placeholders, one per line, on stdout.
find_unknown_placeholders() {
  local value="$1"
  python3 - "$value" "${ALLOWED_PLACEHOLDERS[@]}" <<'PYEOF'
import re
import sys

value = sys.argv[1]
allowed = set(sys.argv[2:])
# Find all ${NAME} placeholders
found = re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", value)
for name in found:
    if name not in allowed:
        print(name)
PYEOF
}

# Extract YAML frontmatter from a markdown file.
# Uses PyYAML if available, else a stdlib-only parser that handles the Agent
# Skills spec subset: top-level keys, scalar values, `|` (literal block) and
# `>` (folded block) multi-line scalars, comments.
#
# Output format: "key::value" per line, one per key. For block scalars, the
# value spans multiple lines, all prefixed with "key::".
extract_frontmatter() {
  local file="$1"
  if [ "$HAS_YAML" -eq 1 ]; then
    python3 - "$file" <<'PYEOF'
import sys
import yaml

with open(sys.argv[1]) as f:
    text = f.read()

m = text.split("---", 2)
if len(m) < 3 or not m[0].strip() == "":
    sys.exit(0)
fm = yaml.safe_load(m[1])
if not isinstance(fm, dict):
    sys.exit(0)
for k, v in fm.items():
    if v is None:
        print(f"{k}::")
    elif isinstance(v, list):
        # emit as list markers
        print(f"{k}::")
        for item in v:
            print(f"{k}::  - {item}")
    else:
        s = str(v)
        for line in s.split("\n"):
            print(f"{k}::{line}")
PYEOF
  else
    python3 - "$file" <<'PYEOF'
import re
import sys

with open(sys.argv[1]) as f:
    text = f.read()

m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
if not m:
    sys.exit(0)
body = m.group(1)

# Handle the Agent Skills spec YAML subset:
#   - top-level `key: value` (scalar)
#   - top-level `key: |` followed by indented lines (literal block)
#   - top-level `key: >` followed by indented lines (folded block)
#   - top-level `key:` (null)
#   - `# comments` anywhere
lines = body.split("\n")
i = 0
while i < len(lines):
    line = lines[i]
    # skip comments and blank lines between top-level keys
    if not line.strip() or line.lstrip().startswith("#"):
        i += 1
        continue
    m2 = re.match(r"^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$", line)
    if not m2:
        # Could be a continuation line of the previous block scalar; already
        # printed. Skip.
        i += 1
        continue
    key, value = m2.group(1), m2.group(2)
    if value in ("|", ">"):
        # Block scalar; consume indented lines
        block_style = value  # "|" or ">"
        i += 1
        block_lines = []
        while i < len(lines):
            cont = lines[i]
            if not cont.strip():
                block_lines.append("")
                i += 1
                continue
            if cont.startswith("  ") or cont.startswith("\t"):
                # Strip one level of indent (2 spaces) or one tab
                if cont.startswith("  "):
                    block_lines.append(cont[2:])
                else:
                    block_lines.append(cont[1:])
                i += 1
            else:
                break
        # Emit
        if block_style == ">":
            # folded: join non-empty lines with space, blank line = paragraph break
            out = []
            for bl in block_lines:
                if bl == "":
                    out.append("")
                elif out and out[-1] != "":
                    out[-1] = out[-1] + " " + bl.strip()
                else:
                    out.append(bl.strip())
            text_out = "\n".join(out).strip("\n")
        else:
            # literal: join with \n preserving blank lines
            text_out = "\n".join(block_lines).strip("\n")
        for bl in text_out.split("\n"):
            print(f"{key}::{bl}")
    else:
        # plain scalar; strip surrounding quotes if present
        v = value
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        print(f"{key}::{v}")
        i += 1
PYEOF
  fi
}

# ---------- main lint ----------
printf "%s== Linting plugin: %s ==%s\n" "$C_BOLD" "$PLUGIN_ROOT" "$C_RESET"
info "agent-plugins.org spec v1.0.0"

# ===== Check 1: plugin.json =====
section "[1/7] plugin.json (§5)"

PLUGIN_JSON="$PLUGIN_ROOT/plugin.json"
if [ ! -f "$PLUGIN_JSON" ]; then
  fail "plugin.json missing at $PLUGIN_JSON"
else
  pass "plugin.json exists"

  if ! python3 -c "import json; json.load(open('$PLUGIN_JSON'))" 2>/dev/null; then
    fail "plugin.json is not valid JSON"
  else
    pass "plugin.json is valid JSON"

    SCHEMA=$(jq_get "$PLUGIN_JSON" '$schema')
    if [ -z "$SCHEMA" ]; then
      fail "plugin.json missing required field '\$schema' (spec §5.3)"
    elif [ "$SCHEMA" != "$PLUGIN_SCHEMA" ]; then
      fail "plugin.json \$schema is '$SCHEMA', expected '$PLUGIN_SCHEMA'"
    else
      pass "plugin.json \$schema = $PLUGIN_SCHEMA"
    fi

    NAME=$(jq_get "$PLUGIN_JSON" 'name')
    if [ -z "$NAME" ]; then
      fail "plugin.json missing required field 'name' (spec §5.3)"
    else
      pass "plugin.json name = '$NAME'"
      PLUGIN_NAME="$NAME"
    fi
  fi
fi

# ===== Check 2: mcp.json =====
section "[2/7] mcp.json (§7.2)"

MCP_JSON="$PLUGIN_ROOT/mcp.json"
if [ ! -f "$MCP_JSON" ]; then
  fail "mcp.json missing at $MCP_JSON"
else
  pass "mcp.json exists"

  if ! python3 -c "import json; json.load(open('$MCP_JSON'))" 2>/dev/null; then
    fail "mcp.json is not valid JSON"
  else
    pass "mcp.json is valid JSON"

    SCHEMA=$(jq_get "$MCP_JSON" '$schema')
    if [ -z "$SCHEMA" ]; then
      fail "mcp.json missing required field '\$schema' (spec §7.2)"
    elif [ "$SCHEMA" != "$MCP_SCHEMA" ]; then
      fail "mcp.json \$schema is '$SCHEMA', expected '$MCP_SCHEMA'"
    else
      pass "mcp.json \$schema = $MCP_SCHEMA"
    fi

    # mcpServers is an object, not array
    MCP_SERVERS_TYPE=$(python3 -c "import json; d=json.load(open('$MCP_JSON')); v=d.get('mcpServers'); print(type(v).__name__ if v is not None else 'MISSING')")
    if [ "$MCP_SERVERS_TYPE" = "MISSING" ]; then
      fail "mcp.json missing 'mcpServers' object (spec §7.2)"
    elif [ "$MCP_SERVERS_TYPE" != "dict" ]; then
      fail "mcp.json 'mcpServers' must be an object, got $MCP_SERVERS_TYPE"
    else
      pass "mcp.json has mcpServers object"
    fi
  fi
fi

# ===== Check 3: every server entry has type =====
section "[3/7] mcpServers[*].type (§7.2.1, closed union)"

if [ -f "$MCP_JSON" ] && python3 -c "import json; json.load(open('$MCP_JSON'))" 2>/dev/null; then
  # Iterate servers
  while IFS=$'\t' read -r server_name server_type; do
    [ -z "$server_name" ] && continue
    if [ -z "$server_type" ]; then
      fail "mcpServers.$server_name missing required field 'type' (spec §7.2.1)"
    else
      ok=0
      for t in "${ALLOWED_TYPES[@]}"; do
        if [ "$server_type" = "$t" ]; then
          ok=1
          break
        fi
      done
      if [ "$ok" -eq 1 ]; then
        pass "mcpServers.$server_name.type = '$server_type'"
      else
        allowed_str=$(IFS='|'; echo "${ALLOWED_TYPES[*]}")
        fail "mcpServers.$server_name.type = '$server_type', must be one of: $allowed_str (spec §7.2.1)"
      fi
    fi
  done < <(python3 - "$MCP_JSON" <<'PYEOF'
import json
import sys
with open(sys.argv[1]) as f:
    data = json.load(f)
servers = data.get("mcpServers", {})
if isinstance(servers, dict):
    for name, cfg in servers.items():
        if isinstance(cfg, dict):
            t = cfg.get("type", "")
            print(f"{name}\t{t}")
PYEOF
  )
fi

# ===== Check 4: stdio command token validation =====
section "[4/7] stdio command tokens (§9.2)"

if [ -f "$MCP_JSON" ] && python3 -c "import json; json.load(open('$MCP_JSON'))" 2>/dev/null; then
  while IFS=$'\t' read -r server_name command; do
    [ -z "$server_name" ] && continue

    if has_shell_metachars "$command"; then
      fail "mcpServers.$server_name.command contains shell metacharacters: '$command'"
      continue
    fi

    case "$command" in
      *' '*)
        fail "mcpServers.$server_name.command is not a single token (contains spaces): '$command'"
        ;;
      ./*)
        pass "mcpServers.$server_name.command = '$command' (plugin-relative)"
        ;;
      /*)
        fail "mcpServers.$server_name.command is an absolute path: '$command' (spec §9.2: must be bare name or plugin-relative)"
        ;;
      ~/*)
        fail "mcpServers.$server_name.command uses home-relative path: '$command' (spec §9.2: must be bare name or plugin-relative)"
        ;;
      *)
        # bare name: spec allows platform search (e.g., "node", "python3")
        pass "mcpServers.$server_name.command = '$command' (bare name, platform-resolved)"
        ;;
    esac
  done < <(python3 - "$MCP_JSON" <<'PYEOF'
import json
import sys
with open(sys.argv[1]) as f:
    data = json.load(f)
servers = data.get("mcpServers", {})
if isinstance(servers, dict):
    for name, cfg in servers.items():
        if isinstance(cfg, dict) and cfg.get("type") == "stdio":
            print(f"{name}\t{cfg.get('command', '')}")
PYEOF
  )
fi

# ===== Check 5: placeholder validation in args/env/cwd =====
section "[5/7] placeholders in args/env/cwd (§9.2)"

if [ -f "$MCP_JSON" ] && python3 -c "import json; json.load(open('$MCP_JSON'))" 2>/dev/null; then
  while IFS=$'\t' read -r server_name field_name value; do
    [ -z "$server_name" ] && continue
    # Find unknown placeholders
    unknown=$(find_unknown_placeholders "$value")
    if [ -n "$unknown" ]; then
      for u in $unknown; do
        fail "mcpServers.$server_name.$field_name uses unknown placeholder '\${$u}' (spec §9.2: only \${PLUGIN_ROOT} and \${PLUGIN_DATA} allowed)"
      done
    else
      if [ "$field_name" = "env_value" ] || [ "$field_name" = "cwd" ]; then
        pass "mcpServers.$server_name.$field_name uses only allowed placeholders"
      else
        pass "mcpServers.$server_name.$field_name: '$value' uses only allowed placeholders"
      fi
    fi
  done < <(python3 - "$MCP_JSON" <<'PYEOF'
import json
import sys
with open(sys.argv[1]) as f:
    data = json.load(f)
servers = data.get("mcpServers", {})
if isinstance(servers, dict):
    for name, cfg in servers.items():
        if not isinstance(cfg, dict):
            continue
        # args: list of strings
        args = cfg.get("args", [])
        if isinstance(args, list):
            for arg in args:
                if isinstance(arg, str):
                    print(f"{name}\targs\t{arg}")
        # env: dict of str -> str
        env = cfg.get("env", {})
        if isinstance(env, dict):
            for k, v in env.items():
                if isinstance(v, str):
                    print(f"{name}\tenv_value\t{v}")
        # cwd: single string
        cwd = cfg.get("cwd", "")
        if isinstance(cwd, str) and cwd:
            print(f"{name}\tcwd\t{cwd}")
PYEOF
  )
fi

# ===== Check 6: SKILL.md =====
section "[6/7] skills/<name>/SKILL.md (Agent Skills spec)"

# Derive expected skill dir name from plugin name (kebab-case)
EXPECTED_SKILL_DIR=""
if [ -n "${PLUGIN_NAME:-}" ]; then
  EXPECTED_SKILL_DIR="$PLUGIN_NAME"
fi

# Look for skills/*/SKILL.md
SKILL_FILES=( )
while IFS= read -r sf; do
  SKILL_FILES+=( "$sf" )
done < <(find "${PLUGIN_ROOT%/}/" -maxdepth 3 -type f -name SKILL.md 2>/dev/null | sort)

if [ "${#SKILL_FILES[@]}" -eq 0 ]; then
  fail "no SKILL.md found under $PLUGIN_ROOT/skills/<name>/SKILL.md"
else
  for sf in "${SKILL_FILES[@]}"; do
    # check parent dir name matches plugin name (or is at least one of them)
    rel="${sf#${PLUGIN_ROOT%/}/}"
    info "found: $rel"

    # Extract frontmatter
    fm=$(extract_frontmatter "$sf")
    if [ -z "$fm" ]; then
      fail "$rel: no YAML frontmatter found (must start with --- and end with ---)"
      continue
    fi
    pass "$rel: has YAML frontmatter"

    # Check 'name' field
    fm_name=$(printf "%s\n" "$fm" | awk -F'::' '/^name::/ {print $2; exit}')
    if [ -z "$fm_name" ]; then
      fail "$rel: frontmatter missing required field 'name'"
    else
      pass "$rel: frontmatter name = '$fm_name'"
    fi

    # Check 'description' field
    fm_desc=$(printf "%s\n" "$fm" | awk -F'::' '
      /^description::/ { sub(/^description::/, ""); desc=desc $0 "\n"; in_desc=1; next }
      in_desc && /^[a-zA-Z_-]+::/ { in_desc=0 }
      in_desc && !/^[a-zA-Z_-]+::/ { desc=desc $0 "\n" }
      END { print desc }')
    if [ -z "$fm_desc" ]; then
      fail "$rel: frontmatter missing required field 'description'"
    else
      # truncate for display
      short=$(printf "%s" "$fm_desc" | head -1 | cut -c1-80)
      pass "$rel: frontmatter description = '${short}...'"
    fi
  done

  # If we know the plugin name, warn if no skill dir matches
  if [ -n "$EXPECTED_SKILL_DIR" ]; then
    found_match=0
    for sf in "${SKILL_FILES[@]}"; do
      skill_dir=$(basename "$(dirname "$sf")")
      if [ "$skill_dir" = "$EXPECTED_SKILL_DIR" ]; then
        found_match=1
        break
      fi
    done
    if [ "$found_match" -eq 0 ]; then
      warn "no SKILL.md found under skills/$EXPECTED_SKILL_DIR/ (plugin name)"
      warn "consider creating skills/$EXPECTED_SKILL_DIR/SKILL.md for client-side discoverability"
    fi
  fi
fi

# ===== Check 7: plugin-relative paths begin with ./ =====
section "[7/7] plugin-relative paths use ./ prefix (spec §4.1)"

if [ -f "$MCP_JSON" ] && python3 -c "import json; json.load(open('$MCP_JSON'))" 2>/dev/null; then
  # Validate command, args, cwd all start with ./ OR are bare names (for commands)
  # For other plugin-relative refs (not stdio command), require ./
  # We already validated stdio command tokens in [4]. Here we focus on non-stdio
  # commands, and any other path-like field (args that look like paths, env values
  # that look like paths).
  while IFS=$'\t' read -r server_name field value; do
    [ -z "$server_name" ] && continue
    # Skip values that contain ${...} placeholders — they're substituted at
    # load time, not literal paths.
    if printf "%s" "$value" | grep -qE '\$\{[A-Za-z_][A-Za-z0-9_]*\}'; then
      continue
    fi
    # Heuristic: if the value contains a "/" and is not a URL, it should start with ./
    if printf "%s" "$value" | grep -q "/" && ! printf "%s" "$value" | grep -qE '^(https?|file|//)'; then
      if ! is_plugin_relative "$value"; then
        if is_absolute "$value"; then
          fail "mcpServers.$server_name.$field is an absolute path: '$value' (must be plugin-relative, prefix with ./)"
        else
          warn "mcpServers.$server_name.$field = '$value' is path-like but not plugin-relative (consider prefixing with ./)"
        fi
      fi
    fi
  done < <(python3 - "$MCP_JSON" <<'PYEOF'
import json
import sys
with open(sys.argv[1]) as f:
    data = json.load(f)
servers = data.get("mcpServers", {})
if isinstance(servers, dict):
    for name, cfg in servers.items():
        if not isinstance(cfg, dict):
            continue
        for field in ("command", "cwd"):
            v = cfg.get(field, "")
            if isinstance(v, str) and v:
                print(f"{name}\t{field}\t{v}")
        for arg in cfg.get("args", []):
            if isinstance(arg, str) and arg:
                print(f"{name}\targ\t{arg}")
PYEOF
  )
fi

# Also check all "com.example.client/" style client extension paths exist
# and are inside the plugin root. (spec §8.2)
COM_DIR=$(find "${PLUGIN_ROOT%/}/" -maxdepth 1 -type d -name 'com.*' 2>/dev/null)
if [ -n "$COM_DIR" ]; then
  for d in $COM_DIR; do
    info "client extension dir: $(basename "$d")/"
  done
fi

# ---------- summary ----------
section "Summary"
printf "  passed:   %d\n" "$PASS_COUNT"
printf "  failed:   %d\n" "$FAIL_COUNT"
printf "  warned:   %d\n" "$WARN_COUNT"
printf "  root:     %s\n" "$PLUGIN_ROOT"

printf "\n"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf "%s== LINT FAILED (%d failure(s)) ==%s\n" "$C_RED" "$FAIL_COUNT" "$C_RESET"
  exit 1
fi

printf "%s== LINT PASSED ==%s\n" "$C_GREEN" "$C_RESET"
exit 0
