#!/usr/bin/env bash
# refresh.sh — one-shot stats refresh for neuromancer.in.
#
#   npm run refresh
#
# Does the mechanical, non-destructive refresh end to end: snapshots this machine's
# tokscale graph into the private usage-telemetry repo (and pulls the other machines'
# snapshots), rebuilds src/data/stats.json from all of them, verifies the production
# build, then (only if the numbers changed) commits + pushes so Vercel redeploys.
#
# CLEAN-ROOM: the tokscale graph export carries date/model/client/token/cost only —
#   no project, path, or prompt fields. Nothing per-project can leak.
#
# PEER DATA: other machines push their own snapshot manually with
#   ~/usage-telemetry/push.sh whenever Rahul works there. A machine that has not
#   pushed recently is simply counted as of its last snapshot.
#
# MANUAL STEP LEFT OUT: public/og.png is a static browser capture of the hero, so
#   it is NOT regenerated here — if the headline total changed, recapture the OG
#   card and commit it separately, or the social preview drifts.
set -euo pipefail
cd "$(dirname "$0")/.."

TELEMETRY="${USAGE_TELEMETRY:-$HOME/usage-telemetry}"

echo "▸ [0/3] snapshotting this machine + pulling peers (usage-telemetry)…"
"$TELEMETRY/push.sh"

echo "▸ [1/3] regenerating stats.json…"
USAGE_TELEMETRY="$TELEMETRY" npm run stats

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
