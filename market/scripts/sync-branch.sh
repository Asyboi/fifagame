#!/usr/bin/env bash
#
# Publish the current market/ directory to the `market` branch, which is what
# Render deploys.
#
# The branch is an orphan carrying only market/ and .gitignore: no game source,
# no node_modules. It is built with plumbing commands so that nothing here ever
# checks out, stashes, or otherwise disturbs the working tree -- someone else is
# usually editing the game in it while this runs.
#
# Usage:  npm run deploy       (from market/)

set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root

BRANCH=market

if ! git diff --quiet -- market/ || ! git diff --cached --quiet -- market/; then
  echo "error: market/ has uncommitted changes. Commit them first:" >&2
  echo "         git add market/ && git commit" >&2
  exit 1
fi

mtree=$(git rev-parse HEAD:market)
ign=$(git rev-parse HEAD:.gitignore)
newtree=$(printf "040000 tree %s\tmarket\n100644 blob %s\t.gitignore\n" "$mtree" "$ign" | git mktree)

parent=$(git rev-parse --verify --quiet "$BRANCH" || true)

if [ -n "$parent" ] && [ "$(git rev-parse "$BRANCH^{tree}")" = "$newtree" ]; then
  echo "market branch already matches market/ — nothing to publish."
  exit 0
fi

subject=$(git log -1 --format=%s -- market/)
commit=$(printf '%s\n\nPublished from %s on main.\n' "$subject" "$(git rev-parse --short HEAD)" \
  | if [ -n "$parent" ]; then git commit-tree "$newtree" -p "$parent"; else git commit-tree "$newtree"; fi)

git branch -f "$BRANCH" "$commit"
git push origin "$BRANCH"

echo
echo "published to origin/$BRANCH — Render will redeploy"
git ls-tree -r --name-only "$BRANCH" | sed 's/^/  /'
