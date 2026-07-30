#!/usr/bin/env node
// export-stats.mjs — build the public token-stats snapshot for neuromancer.in.
//
// Reads a LOCAL tokscale graph export and writes an aggregated, whitelisted JSON
// snapshot to src/data/stats.json. Run manually whenever you want to refresh the
// site, then commit + push (Vercel redeploys).
//
//   tokscale graph > /tmp/tokscale-graph.json
//   node scripts/export-stats.mjs /tmp/tokscale-graph.json     # or: npm run stats
//
// Source note: this replaced the TokenTracker `queue.jsonl` rollup on 2026-07-30 when
// TokenTracker was uninstalled. tokscale re-parses the raw CLI logs itself, so it is an
// independent counter rather than a derived rollup — no cumulative-snapshot collapse is
// needed here (tokscale's `contributions[]` are already one entry per day).
//
// ccusage is an ALTERNATIVE source, not an additive one: it parses the same Claude logs
// tokscale does, so summing the two would double-count. Pick one.
//
// SECURITY / CLEAN-ROOM RULES (do not relax):
//   - Read ONLY the tokscale graph export. It carries date/model/client/token/cost fields
//     and NO project, path, prompt, or file identifiers.
//   - We NEVER read or emit credentials/identifiers (auth tokens, machine ids, cookies).
//   - Output granularity is DAILY, never hourly (hourly leaks working-hours patterns).
//   - The output is a field whitelist, not a redacted dump.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../src/data/stats.json');
const SRC = process.argv[2];

if (!SRC || !existsSync(SRC)) {
  console.error(
    `[export-stats] usage: node scripts/export-stats.mjs <tokscale-graph.json>\n` +
      `Generate one with:  tokscale graph > /tmp/tokscale-graph.json`,
  );
  process.exit(1);
}

const graph = JSON.parse(readFileSync(SRC, 'utf8'));
const days = Array.isArray(graph?.contributions) ? graph.contributions : [];
if (days.length === 0) {
  console.error(`[export-stats] no contributions[] in ${SRC} — aborting without overwriting ${OUT}`);
  process.exit(1);
}

const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

const totals = { total: 0, input: 0, output: 0, cacheRead: 0, cacheCreation: 0, reasoning: 0, conversations: 0 };
const byModel = new Map(); // model -> {model,total,valueUsd}
const byTool = new Map(); // client -> {total, models:Set}
const daily = new Map(); // date -> {...}
let value = 0;
let pricedTokens = 0;

// A (client, model) pair that produces cost anywhere in the dataset counts as "priced".
// Some clients legitimately report zero cost (subscription seats), so this is measured
// across the whole set rather than per row.
const pricedModels = new Set();
for (const d of days) {
  for (const c of d?.clients ?? []) {
    if (n(c.cost) > 0 && c.modelId) pricedModels.add(c.modelId);
  }
}

for (const d of days) {
  const date = typeof d?.date === 'string' ? d.date.slice(0, 10) : null;
  if (!date) continue;

  const tb = d.tokenBreakdown ?? {};
  const inp = n(tb.input);
  const out = n(tb.output);
  const cr = n(tb.cacheRead);
  const cc = n(tb.cacheWrite); // tokscale calls it cacheWrite; the site's field is cacheCreation
  const rsn = n(tb.reasoning);
  const total = n(d.totals?.tokens);
  const convs = n(d.totals?.messages);

  totals.total += total;
  totals.input += inp;
  totals.output += out;
  totals.cacheRead += cr;
  totals.cacheCreation += cc;
  totals.reasoning += rsn;
  totals.conversations += convs;
  value += n(d.totals?.cost);

  daily.set(date, {
    total,
    input: inp,
    output: out,
    cacheRead: cr,
    cacheCreation: cc,
    reasoning: rsn,
    convs,
  });

  for (const c of d.clients ?? []) {
    const t =
      n(c.tokens?.input) + n(c.tokens?.output) + n(c.tokens?.cacheRead) + n(c.tokens?.cacheWrite) + n(c.tokens?.reasoning);

    const model = c.modelId || 'unknown';
    const m = byModel.get(model) || { model, total: 0, valueUsd: 0 };
    m.total += t;
    m.valueUsd += n(c.cost);
    byModel.set(model, m);
    if (pricedModels.has(model)) pricedTokens += t;

    const src = c.client || 'unknown';
    const tl = byTool.get(src) || { total: 0, models: new Set() };
    tl.total += t;
    if (c.modelId && c.modelId !== 'unknown') tl.models.add(c.modelId);
    byTool.set(src, tl);
  }
}

const dates = [...daily.keys()].sort();
if (!totals.total || dates.length === 0) {
  console.error(`[export-stats] no usable days in ${SRC} — aborting without overwriting ${OUT}`);
  process.exit(1);
}

const from = dates[0];
const to = dates[dates.length - 1];
const authored = totals.input + totals.output; // fresh, non-cache tokens
const cachePct = totals.total ? (totals.cacheRead / totals.total) * 100 : 0;
const leverage = authored ? totals.total / authored : 0;

let peak = { date: null, total: 0, convs: 0 };
for (const [d, v] of daily) if (v.total > peak.total) peak = { date: d, total: v.total, convs: v.convs };

const clientTokenTotal = [...byTool.values()].reduce((s, v) => s + v.total, 0) || 1;

const models = [...byModel.values()]
  .filter((m) => m.total > 0 && m.model !== 'unknown')
  .sort((a, b) => b.total - a.total)
  .map((m) => ({
    model: m.model,
    total: m.total,
    share: +((m.total / clientTokenTotal) * 100).toFixed(1),
    valueUsd: +m.valueUsd.toFixed(2),
  }));

const tools = [...byTool.entries()]
  .sort((a, b) => b[1].total - a[1].total)
  .map(([source, v]) => ({
    source,
    total: v.total,
    share: +((v.total / clientTokenTotal) * 100).toFixed(1),
    models: v.models.size,
  }));

const out = {
  // generatedAt is intentionally date-only (no time) to avoid churn/timezone leak.
  generatedAt: to, // snapshot is "as of" the last day of data
  range: { from, to, activeDays: daily.size },
  totals: {
    total: totals.total,
    input: totals.input,
    output: totals.output,
    cacheRead: totals.cacheRead,
    cacheCreation: totals.cacheCreation,
    reasoning: totals.reasoning,
    authored,
    conversations: totals.conversations,
    cachePct: +cachePct.toFixed(1),
    leverage: +leverage.toFixed(1),
    estValueUsd: Math.round(value),
    valueCoveragePct: +((pricedTokens / clientTokenTotal) * 100).toFixed(1),
  },
  peak,
  byModel: models,
  byTool: tools,
  daily: dates.map((d) => ({ date: d, ...daily.get(d) })),
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`[export-stats] wrote ${OUT}`);
console.log(`  source: tokscale graph (${SRC})`);
console.log(`  ${out.totals.total.toLocaleString()} tokens · ${out.range.activeDays} active days · ${out.totals.cachePct}% cache`);
console.log(`  est value $${out.totals.estValueUsd.toLocaleString()} (pricing coverage ${out.totals.valueCoveragePct}%) · ${models.length} models · ${tools.length} tools`);
