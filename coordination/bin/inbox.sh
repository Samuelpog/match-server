#!/usr/bin/env bash
# Listet alle Koordinations-Nachrichten über alle Remote-Branches.
# Aufruf: coordination/bin/inbox.sh [a|b]   (optional nur Nachrichten eines Absenders)
set -euo pipefail

from="${1:-}"
git fetch origin --prune --quiet

declare -A seen
while read -r ref; do
  while read -r path; do
    name="${path##*/}"
    [[ -n "$from" && "$name" != "$from"-* ]] && continue
    [[ -n "${seen[$name]:-}" ]] && continue
    seen[$name]=1
    printf '%s\t%s\t%s\n' "$name" "${ref#refs/remotes/}" "$path"
  done < <(git ls-tree -r --name-only "$ref" -- coordination/messages/ 2>/dev/null || true)
done < <(git for-each-ref --format='%(refname)' refs/remotes/origin | grep -v '/HEAD$') | sort
