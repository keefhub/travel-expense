#!/usr/bin/env bash
# Ports this repo's feature-discovery -> feature-spec -> writing-plans -> sdd pipeline into
# another repo. Copies the working skills verbatim, merges generic workflow docs into the
# target's AGENTS.md/CLAUDE.md (creating them if absent, appending idempotently if not), and
# drops TODO-stub versions of the repo-specific docs (REFERENCE.md, features/OVERVIEW.md,
# design.md, .claude/repo-profile.md, memories/repo/<slug>-context.md) only where the target
# doesn't already have its own.
#
# Never overwrites an existing skill, doc, or file unless --force is passed (and then only for
# skills, with a timestamped backup kept alongside).
#
# Standalone use: this file can be downloaded on its own into a repo that has no local checkout
# of the source project. When its sibling scripts/ai-workflow-template/ and .claude/skills/ can't
# be found next to it, it shallow-clones the source repo into a temp dir to fetch them, then
# cleans the clone up. Point it at a fork with --source-repo/--source-ref if needed.
#
# Usage:
#   scaffold-ai-workflow.sh <target-repo-path> [--force] [--dry-run] [--repo-name NAME]
#                            [--source-repo URL] [--source-ref REF]

set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$SOURCE_DIR/scripts/ai-workflow-template"

DEFAULT_SOURCE_REPO_URL="https://github.com/keefhub/travel-expense.git"
DEFAULT_SOURCE_REF="master"

FORCE=0
DRY_RUN=0
TARGET_DIR=""
REPO_NAME=""
SOURCE_REPO_URL="${AI_WORKFLOW_SOURCE_REPO:-$DEFAULT_SOURCE_REPO_URL}"
SOURCE_REF="${AI_WORKFLOW_SOURCE_REF:-$DEFAULT_SOURCE_REF}"
CLONE_DIR=""

usage() {
  echo "Usage: $0 <target-repo-path> [--force] [--dry-run] [--repo-name NAME] [--source-repo URL] [--source-ref REF]" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --repo-name) REPO_NAME="${2:-}"; shift 2 ;;
    --source-repo) SOURCE_REPO_URL="${2:-}"; shift 2 ;;
    --source-ref) SOURCE_REF="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *)
      if [ -z "$TARGET_DIR" ]; then TARGET_DIR="$1"; shift;
      else echo "Unexpected argument: $1" >&2; usage; fi
      ;;
  esac
done

[ -n "$TARGET_DIR" ] || usage

cleanup_clone() {
  [ -n "$CLONE_DIR" ] && rm -rf "$CLONE_DIR"
}
trap cleanup_clone EXIT

if [ ! -d "$TEMPLATE_DIR" ] || [ ! -d "$SOURCE_DIR/.claude/skills" ]; then
  echo "Running standalone (no sibling scripts/ai-workflow-template/ or .claude/skills/ found)." >&2
  echo "Fetching pipeline source from $SOURCE_REPO_URL@$SOURCE_REF ..." >&2
  CLONE_DIR="$(mktemp -d)"
  if ! git clone --depth 1 --branch "$SOURCE_REF" "$SOURCE_REPO_URL" "$CLONE_DIR/source" >/dev/null 2>&1; then
    echo "Could not clone $SOURCE_REPO_URL@$SOURCE_REF." >&2
    echo "Pass --source-repo/--source-ref for a fork or different branch, or run this script" >&2
    echo "from inside an existing checkout of the source repo instead." >&2
    exit 1
  fi
  SOURCE_DIR="$CLONE_DIR/source"
  TEMPLATE_DIR="$SOURCE_DIR/scripts/ai-workflow-template"
fi

[ -d "$SOURCE_DIR/.claude/skills" ] || { echo "Source skills dir not found at $SOURCE_DIR/.claude/skills." >&2; exit 1; }

if [ -d "$TARGET_DIR" ]; then
  TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
elif [ "$DRY_RUN" = "1" ]; then
  echo "[dry-run] mkdir -p $TARGET_DIR"
  case "$TARGET_DIR" in
    /*) : ;;
    *) TARGET_DIR="$(pwd)/$TARGET_DIR" ;;
  esac
else
  mkdir -p "$TARGET_DIR"
  TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
fi
[ -n "$REPO_NAME" ] || REPO_NAME="$(basename "$TARGET_DIR")"

ADDED=()
SKIPPED=()
UPDATED=()
NOTES=()

report_added()   { ADDED+=("$1"); }
report_skipped() { SKIPPED+=("$1"); }
report_updated() { UPDATED+=("$1"); }
report_note()    { NOTES+=("$1"); }

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

# --- skills -----------------------------------------------------------------

SKILLS=(feature-discovery feature-spec writing-plans sdd spec-review git-commit)

copy_skill() {
  local name="$1"
  local src="$SOURCE_DIR/.claude/skills/$name"
  local dest="$TARGET_DIR/.claude/skills/$name"

  if [ ! -d "$src" ]; then
    report_note "source skill '$name' not found — skipped"
    return
  fi

  if [ -d "$dest" ]; then
    if [ "$FORCE" = "1" ]; then
      local backup="$dest.bak.$(date +%Y%m%d%H%M%S)"
      run mv "$dest" "$backup"
      run cp -r "$src" "$dest"
      report_updated "skill '$name' (previous version backed up to $(basename "$backup"))"
    else
      report_skipped "skill '$name' — already exists at .claude/skills/$name (use --force to overwrite; a backup is kept either way)"
    fi
  else
    run mkdir -p "$(dirname "$dest")"
    run cp -r "$src" "$dest"
    report_added "skill '$name'"
  fi
}

# --- idempotent managed-block merge into an existing or new markdown file ---

BEGIN_MARK="<!-- ai-agent-workflow:begin -->"
END_MARK="<!-- ai-agent-workflow:end -->"

merge_block() {
  local file="$1" content_file="$2" label="$3"

  if [ ! -f "$file" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "[dry-run] create $file with managed workflow block"
    else
      { echo "$BEGIN_MARK"; cat "$content_file"; echo "$END_MARK"; } > "$file"
    fi
    report_added "$label (new file, managed block only)"
    return
  fi

  if grep -qF "$BEGIN_MARK" "$file"; then
    if [ "$DRY_RUN" = "1" ]; then
      echo "[dry-run] replace managed block in $file"
    else
      local tmp; tmp="$(mktemp)"
      awk -v begin="$BEGIN_MARK" -v end="$END_MARK" -v contentfile="$content_file" '
        BEGIN { while ((getline line < contentfile) > 0) content = content line "\n" }
        $0 == begin { print; printf "%s", content; skip = 1; next }
        $0 == end   { print; skip = 0; next }
        skip        { next }
        { print }
      ' "$file" > "$tmp"
      mv "$tmp" "$file"
    fi
    report_updated "$label (existing managed block replaced in place)"
  else
    if [ "$DRY_RUN" = "1" ]; then
      echo "[dry-run] append managed block to end of $file"
    else
      { cat "$file"; echo ""; echo "$BEGIN_MARK"; cat "$content_file"; echo "$END_MARK"; } > "$file.tmp"
      mv "$file.tmp" "$file"
    fi
    report_updated "$label (existing file kept; managed block appended at the end — review placement, the pipeline docs usually read best near the top)"
  fi
}

# --- stub docs: only ever created, never overwritten ------------------------

write_stub_if_missing() {
  local dest="$1" template="$2" label="$3"
  if [ -e "$dest" ]; then
    report_skipped "$label — already exists, left untouched"
    return
  fi
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] create $dest from stub template"
  else
    mkdir -p "$(dirname "$dest")"
    sed "s/{{REPO_NAME}}/$REPO_NAME/g" "$template" > "$dest"
  fi
  report_added "$label (stub — needs filling in)"
}

# --- other AI-tool configs: detect, never touch ------------------------------

check_other_ai_configs() {
  local candidates=(".cursor/rules" ".cursorrules" ".github/copilot-instructions.md" ".windsurfrules" ".clinerules" "GEMINI.md")
  for c in "${candidates[@]}"; do
    if [ -e "$TARGET_DIR/$c" ]; then
      report_note "found existing AI tool config at $c — not modified; consider pointing it at AGENTS.md/CLAUDE.md so the pipeline is visible from there too"
    fi
  done
}

# --- run ----------------------------------------------------------------

echo "Scaffolding AI workflow from $SOURCE_DIR into $TARGET_DIR"
[ "$DRY_RUN" = "1" ] && echo "(dry run — no files will be written)"
echo

echo "Skills:"
for s in "${SKILLS[@]}"; do copy_skill "$s"; done

echo
echo "Workflow docs:"
merge_block "$TARGET_DIR/AGENTS.md" "$TEMPLATE_DIR/AGENTS.workflow.md" "AGENTS.md"
merge_block "$TARGET_DIR/CLAUDE.md" "$TEMPLATE_DIR/CLAUDE.workflow.md" "CLAUDE.md"

echo
echo "Repo-specific stub docs:"
write_stub_if_missing "$TARGET_DIR/REFERENCE.md" "$TEMPLATE_DIR/REFERENCE.stub.md" "REFERENCE.md"
write_stub_if_missing "$TARGET_DIR/features/OVERVIEW.md" "$TEMPLATE_DIR/OVERVIEW.stub.md" "features/OVERVIEW.md"
write_stub_if_missing "$TARGET_DIR/design.md" "$TEMPLATE_DIR/design.stub.md" "design.md"
write_stub_if_missing "$TARGET_DIR/.claude/repo-profile.md" "$TEMPLATE_DIR/repo-profile.stub.md" ".claude/repo-profile.md"
write_stub_if_missing "$TARGET_DIR/memories/repo/${REPO_NAME}-context.md" "$TEMPLATE_DIR/memories-context.stub.md" "memories/repo/${REPO_NAME}-context.md"

echo
echo "Supporting directories:"
for d in "doc/features" "doc/requirements" "doc/workflow" "output/error" "memories/repo/slices"; do
  if [ -d "$TARGET_DIR/$d" ]; then
    report_skipped "$d/ — already exists"
  else
    run mkdir -p "$TARGET_DIR/$d"
    report_added "$d/"
  fi
done

check_other_ai_configs

# --- summary ------------------------------------------------------------

echo
echo "=================================================================="
echo "Summary"
echo "=================================================================="
if [ "${#ADDED[@]}" -gt 0 ]; then
  echo; echo "Added:"
  for l in "${ADDED[@]}"; do echo "  + $l"; done
fi
if [ "${#UPDATED[@]}" -gt 0 ]; then
  echo; echo "Updated:"
  for l in "${UPDATED[@]}"; do echo "  ~ $l"; done
fi
if [ "${#SKIPPED[@]}" -gt 0 ]; then
  echo; echo "Skipped (already present):"
  for l in "${SKIPPED[@]}"; do echo "  - $l"; done
fi
if [ "${#NOTES[@]}" -gt 0 ]; then
  echo; echo "Needs manual attention:"
  for l in "${NOTES[@]}"; do echo "  ! $l"; done
fi

echo
echo "Next steps:"
echo "  1. Fill in the TODOs in REFERENCE.md, features/OVERVIEW.md, .claude/repo-profile.md,"
echo "     memories/repo/${REPO_NAME}-context.md (and design.md, or delete it if there's no UI)."
echo "  2. Review .claude/skills/*/SKILL.md for stack-specific assumptions (this source repo's"
echo "     skills mention Next.js/Playwright/App Router in places) and adjust for the target stack."
echo "  3. Fill in the Implementation order table in CLAUDE.md once features/ has real feature files."
echo "  4. Add memories/repo/slices/*.md tagged by this repo's own architecture layers, if wanted."
