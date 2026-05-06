#!/bin/bash
# scripts/deploy-to-prod.sh
#
# Safe deploy from dev → main → production.
# Run from anywhere; will cd into the repo root.
#
# Steps:
#   1. Verify clean working tree.
#   2. Fetch and check what commits dev is ahead of main.
#   3. Show preview, ask for confirmation.
#   4. Create PR via gh CLI (or fall back to direct merge if you have admin override).
#   5. Auto-merge the PR (squash/merge per repo settings).
#   6. Surface verification URL for prod deploy.
#
# Requires:
#   - gh CLI installed and authenticated (`gh auth status`)
#   - GitHub repo allows auto-merge (Settings → Pull Requests → Allow auto-merge)
#
# Usage:
#   ./scripts/deploy-to-prod.sh
#   or `npm run deploy` if you wire it into package.json scripts.

set -euo pipefail

# ── colors ────────────────────────────────────────────────────────────────────
BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'

err()  { echo "${RED}❌ $*${RESET}" >&2; }
ok()   { echo "${GREEN}✅ $*${RESET}"; }
info() { echo "${BLUE}ℹ  $*${RESET}"; }
warn() { echo "${YELLOW}⚠  $*${RESET}"; }

# ── locate repo root ──────────────────────────────────────────────────────────
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  err "Not inside a git repository."
  exit 1
fi
cd "$REPO_ROOT"

# ── pre-flight: gh CLI present ────────────────────────────────────────────────
if ! command -v gh >/dev/null 2>&1; then
  err "GitHub CLI (gh) is not installed."
  echo "   Install: brew install gh && gh auth login"
  echo "   Or do the deploy manually via GitHub UI:"
  echo "     https://github.com/vladosda0/rovno/compare/main...dev"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  err "gh CLI is not authenticated."
  echo "   Run: gh auth login"
  exit 1
fi

# ── pre-flight: clean working tree ────────────────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
  err "Working tree not clean. Commit, stash, or revert before deploying."
  echo
  git status --short
  exit 1
fi

# ── fetch ─────────────────────────────────────────────────────────────────────
info "Fetching origin..."
git fetch origin --quiet

# ── compute diff: how far ahead is dev from main? ─────────────────────────────
COMMITS_AHEAD=$(git rev-list --count origin/main..origin/dev)
COMMITS_BEHIND=$(git rev-list --count origin/dev..origin/main)

if [[ "$COMMITS_AHEAD" -eq 0 ]]; then
  ok "main is already up-to-date with dev. Nothing to deploy."
  exit 0
fi

if [[ "$COMMITS_BEHIND" -gt 0 ]]; then
  warn "main has $COMMITS_BEHIND commits not in dev — unusual."
  warn "These will become part of the merge. If you didn't expect this, abort."
fi

# ── preview ───────────────────────────────────────────────────────────────────
echo
echo "${BOLD}🚀 Deploying $COMMITS_AHEAD commit(s) from dev → main:${RESET}"
echo
git log --oneline --pretty=format:"  ${DIM}%h${RESET} %s ${DIM}(%an, %ar)${RESET}" origin/main..origin/dev | head -30
echo
echo

FILES_CHANGED=$(git diff --name-only origin/main..origin/dev | wc -l | tr -d ' ')
echo "${BOLD}📁 Files changed:${RESET} $FILES_CHANGED"

# Touched migrations? Flag for extra attention
MIGRATIONS_TOUCHED=$(git diff --name-only origin/main..origin/dev | grep -c "supabase/migrations\|backend-truth/" || true)
if [[ "$MIGRATIONS_TOUCHED" -gt 0 ]]; then
  echo
  warn "$MIGRATIONS_TOUCHED migration/backend-truth file(s) in this deploy."
  warn "Make sure migrations have been applied to prod self-hosted DB BEFORE merging,"
  warn "otherwise frontend will break on schema mismatch."
fi
echo

# ── confirmation ──────────────────────────────────────────────────────────────
read -rp "${BOLD}Proceed with deploy to PRODUCTION (rovno.ai)? (y/N) ${RESET}" confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# ── create PR ─────────────────────────────────────────────────────────────────
PR_TITLE="deploy: $(date +'%Y-%m-%d %H:%M')"
PR_BODY="Auto-generated deploy PR. $COMMITS_AHEAD commits."

info "Creating PR..."
PR_URL=$(gh pr create \
  --base main \
  --head dev \
  --title "$PR_TITLE" \
  --body "$PR_BODY" 2>&1) || {
    err "Failed to create PR. Output:"
    echo "$PR_URL"
    echo
    echo "Possible causes:"
    echo "  - PR already exists (check: gh pr list --base main --head dev)"
    echo "  - branch protection requires checks that haven't run"
    exit 1
  }

ok "Created: $PR_URL"

# ── merge ─────────────────────────────────────────────────────────────────────
info "Merging PR..."
if ! gh pr merge "$PR_URL" --merge --delete-branch=false; then
  warn "Direct merge failed. Trying auto-merge (will merge once required checks pass)..."
  gh pr merge "$PR_URL" --merge --auto --delete-branch=false || {
    err "Auto-merge also failed. Open the PR in browser and review:"
    echo "  $PR_URL"
    exit 1
  }
  warn "PR set to auto-merge once checks pass. Watch the URL above."
  exit 0
fi

ok "Merged. Timeweb will start prod build in ~30 sec."
echo
echo "${BOLD}🌐 Verify deployment in 1-2 min:${RESET}"
echo "  Production: https://rovno.ai (hard refresh: Cmd+Shift+R)"
echo "  Stand-by:   https://стройагент.рф"
echo "  Build log:  https://timeweb.cloud/  → Cloud → Apps → rovno → History"
