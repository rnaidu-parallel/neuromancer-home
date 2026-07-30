#!/usr/bin/env bash
# refresh.sh — one-shot stats refresh for neuromancer.in.
#
#   npm run refresh
#
# Does the mechanical, non-destructive refresh end to end: exports the local
# tokscale graph, rebuilds src/data/stats.json from it, verifies the production
# build, then (only if the numbers changed) commits + pushes so Vercel redeploys.
#
# CLEAN-ROOM: the tokscale graph export carries date/model/client/token/cost only —
#   no project, path, or prompt fields. Nothing per-project can leak.
#
# PEER DATA: this is a LOCAL export. The old TokenTracker path scp'd helios's rollup
#   and merged it; tokscale has no equivalent offline peer merge, so helios-only usage
#   is no longer counted. (Local tokscale already exceeds the old merged figure — it
#   reaches further back and covers more clients — but the peer gap is real.)
#
# MANUAL STEP LEFT OUT: public/og.png is a static browser capture of the hero, so
#   it is NOT regenerated here — if the headline total changed, recapture the OG
#   card and commit it separately, or the social preview drifts.
set -euo pipefail
cd "$(dirname "$0")/.."

GRAPH="${TOKSCALE_GRAPH:-/tmp/tokscale-graph.json}"

echo "▸ [0/3] exporting tokscale graph…"
if command -v tokscale >/dev/null 2>&1; then
  tokscale graph > "$GRAPH"
else
  npx --yes tokscale graph > "$GRAPH"
fi
echo "  ✓ $GRAPH"

echo "▸ [1/3] regenerating stats.json…"
TOKSCALE_GRAPH="$GRAPH" npm run stats

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
