#!/usr/bin/env bash
# refresh.sh — one-shot stats refresh for neuromancer.in.
#
#   npm run refresh
#
# Does the mechanical, non-destructive refresh end to end: pulls the helios peer
# rollup, rebuilds src/data/stats.json from local logs, verifies the production
# build, then (only if the numbers changed) commits + pushes so Vercel redeploys.
#
# CLEAN-ROOM: only ever pulls queue.jsonl (aggregate, project-free). NEVER
#   project.queue.jsonl (that carries project_key/project_ref = employer names).
#
# MANUAL STEP LEFT OUT: public/og.png is a static browser capture of the hero, so
#   it is NOT regenerated here — if the headline total changed, recapture the OG
#   card and commit it separately, or the social preview drifts.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ [0/3] pulling helios rollup (queue.jsonl only)…"
if scp -o ConnectTimeout=8 rahul@helios.local:'~/.tokentracker/tracker/queue.jsonl' \
       ~/.tokentracker/tracker/queue.helios.jsonl 2>/dev/null; then
  echo "  ✓ queue.helios.jsonl updated"
else
  echo "  ⚠ helios unreachable — refreshing with local + last-synced peer data only"
fi

echo "▸ [1/3] regenerating stats.json…"
npm run stats

echo "▸ [2/3] verifying build…"
npm run build >/dev/null && echo "  ✓ build passes"

if git diff --quiet -- src/data/stats.json; then
  echo "▸ stats.json unchanged — nothing to deploy."
  exit 0
fi

echo "▸ [3/3] committing + pushing (Vercel auto-deploys neuromancer.in)…"
AS_OF="$(node -e "process.stdout.write(require('./src/data/stats.json').generatedAt)")"
git add src/data/stats.json
git commit -m "stats: refresh (as of ${AS_OF})"
git push
echo "  ✓ pushed — neuromancer.in redeploys shortly."
echo
echo "⚠ REMINDER: public/og.png was NOT regenerated (manual browser capture)."
echo "  If the headline total changed, recapture the OG hero + commit it separately."
