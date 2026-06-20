#!/usr/bin/env bash
# Validate Waterfall Claude OS registry <-> skill-mirror integrity.
# Checks: JSON validity, required fields, arrays sorted by name, no duplicate
# names within a type, every registered skill path exists with a SKILL.md, and
# every on-disk skill folder is registered (no drift either direction).
# Portable: resolves the git root and no-ops cleanly when run outside the OS home.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

registry="assets/global/registry.json"
if [ ! -f "$registry" ]; then
  echo "skill-scout: no $registry here — not the OS home; nothing to audit."
  exit 0
fi

command -v python3 >/dev/null 2>&1 || { echo "skill-scout: python3 required"; exit 2; }

REGISTRY="$registry" python3 - <<'PY'
import json, os, sys

reg_path = os.environ["REGISTRY"]
errors, warnings = [], []

try:
    reg = json.load(open(reg_path))
except Exception as e:
    print(f"FAIL  invalid JSON in {reg_path}: {e}")
    sys.exit(1)

REQUIRED = ["name", "type", "path", "description", "source", "applies_to",
            "installed_in", "dependencies", "integration_notes",
            "recommended_usage", "status"]

registered_paths = set()
for arr_key in ("agents", "skills", "tools", "workflows", "templates"):
    arr = reg.get(arr_key, [])
    if not isinstance(arr, list):
        continue
    names = [e.get("name", "") for e in arr]
    if names != sorted(names):
        errors.append(f"{arr_key}: not sorted by name -> expected {sorted(names)}")
    seen = set()
    for e in arr:
        n = e.get("name", "<unnamed>")
        if n in seen:
            errors.append(f"{arr_key}: duplicate name '{n}'")
        seen.add(n)
        for f in REQUIRED:
            if f not in e:
                errors.append(f"{arr_key}:{n}: missing required field '{f}'")
        p = e.get("path")
        if p:
            registered_paths.add(p)
            if not os.path.isdir(p):
                errors.append(f"{arr_key}:{n}: path '{p}' does not exist")
            elif not os.path.isfile(os.path.join(p, "SKILL.md")):
                errors.append(f"{arr_key}:{n}: '{p}/SKILL.md' missing")

# Drift the other direction: on-disk skill folders not in the registry.
for root in (".claude/skills", ".agents/skills"):
    if not os.path.isdir(root):
        continue
    for d in sorted(os.listdir(root)):
        full = os.path.join(root, d)
        if not os.path.isdir(full):
            continue
        if not os.path.isfile(os.path.join(full, "SKILL.md")):
            continue
        if full not in registered_paths:
            errors.append(f"mirror: '{full}' has a SKILL.md but is not registered")

total = sum(len(reg.get(k, [])) for k in
            ("agents", "skills", "tools", "workflows", "templates"))
print(f"skill-scout audit · {reg_path} · {total} registered asset(s) · "
      f"updated_at={reg.get('updated_at','?')}")

for w in warnings:
    print(f"WARN  {w}")
if errors:
    for e in errors:
        print(f"FAIL  {e}")
    print(f"\n{len(errors)} problem(s) found.")
    sys.exit(1)
print("OK    registry and skill mirror are consistent (no drift).")
PY
