#!/usr/bin/env node
// export-stats.mjs — build the public token-stats snapshot for neuromancer.in.
//
// Reads the LOCAL TokenTracker hourly rollup and writes an aggregated, whitelisted
// JSON snapshot to src/data/stats.json. Run manually whenever you want to refresh
// the site, then commit + push (Vercel redeploys).
//
//   node scripts/export-stats.mjs        # or: npm run stats
//
// SECURITY / CLEAN-ROOM RULES (do not relax):
//   - Source is queue.jsonl ONLY. It is aggregated by (hour, model, tool) with NO
//     project fields, so nothing per-project can leak.
//   - We NEVER read project.queue.jsonl (it carries project_key / project_ref).
//   - We NEVER read or emit credentials/identifiers (relay-cookies.json,
//     config.json machineId/baseUrl, auth files).
//   - Output granularity is DAILY, never hourly (hourly leaks working-hours patterns).
//   - The output is a field whitelist, not a redacted dump.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
const SRC = join(HOME, '.tokentracker/tracker/queue.jsonl'); // safe, project-free rollup
const PRICING = join(HOME, '.tokentracker/cache/pricing.json');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/data/stats.json');

if (!existsSync(SRC)) {
  console.error(`[export-stats] source not found: ${SRC}\nIs TokenTracker installed and has it synced at least once?`);
  process.exit(1);
}

const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const rows = readFileSync(SRC, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

// hour_start may be epoch-ms or an ISO string; we only ever keep the DATE.
const dayOf = (hs) => {
  if (hs == null) return null;
  if (typeof hs === 'number') return new Date(hs).toISOString().slice(0, 10);
  return String(hs).slice(0, 10);
};

// Pricing: exact model id, else common bedrock-style prefixes, else null (uncovered).
let pricing = {};
try { pricing = JSON.parse(readFileSync(PRICING, 'utf8')); } catch { /* value stays best-effort */ }
const priceFor = (model) => {
  for (const key of [model, `anthropic.${model}`, `us.anthropic.${model}`, `global.anthropic.${model}`]) {
    if (pricing[key]) return pricing[key];
  }
  return null;
};

const totals = { total: 0, input: 0, output: 0, cacheRead: 0, cacheCreation: 0, reasoning: 0, conversations: 0 };
const byModel = new Map(); // model -> {total, valueUsd, covered}
const byTool = new Map();  // source -> {total, models:Set}
const daily = new Map();   // date -> {total,input,output,cacheRead,cacheCreation,reasoning,convs}
let value = 0;
let uncoveredValueTokens = 0;

const blankDay = () => ({ total: 0, input: 0, output: 0, cacheRead: 0, cacheCreation: 0, reasoning: 0, convs: 0 });

for (const r of rows) {
  const t = n(r.total_tokens);
  const inp = n(r.input_tokens), out = n(r.output_tokens);
  const cr = n(r.cached_input_tokens), cc = n(r.cache_creation_input_tokens);
  totals.total += t;
  totals.input += inp;
  totals.output += out;
  totals.cacheRead += cr;
  totals.cacheCreation += cc;
  totals.reasoning += n(r.reasoning_output_tokens);
  totals.conversations += n(r.conversation_count);

  const model = r.model || 'unknown';
  const p = priceFor(model);
  let rowVal = 0;
  if (p) {
    rowVal = inp * n(p.input_cost_per_token)
      + out * n(p.output_cost_per_token)
      + cr * n(p.cache_read_input_token_cost)
      + cc * n(p.cache_creation_input_token_cost);
  } else {
    uncoveredValueTokens += t;
  }
  value += rowVal;

  const m = byModel.get(model) || { model, total: 0, valueUsd: 0, covered: !!p };
  m.total += t; m.valueUsd += rowVal; m.covered = m.covered || !!p;
  byModel.set(model, m);

  const src = r.source || 'unknown';
  const tl = byTool.get(src) || { total: 0, models: new Set() };
  tl.total += t;
  if (r.model && r.model !== 'unknown') tl.models.add(r.model);
  byTool.set(src, tl);

  const d = dayOf(r.hour_start);
  if (d) {
    const day = daily.get(d) || blankDay();
    day.total += t;
    day.input += inp;
    day.output += out;
    day.cacheRead += cr;
    day.cacheCreation += cc;
    day.reasoning += n(r.reasoning_output_tokens);
    day.convs += n(r.conversation_count);
    daily.set(d, day);
  }
}

const dates = [...daily.keys()].sort();
if (!totals.total || dates.length === 0) {
  console.error('[export-stats] no usable rows in queue.jsonl — aborting without overwriting src/data/stats.json');
  process.exit(1);
}
const from = dates[0], to = dates[dates.length - 1];
const authored = totals.input + totals.output; // fresh, non-cache tokens
const cachePct = totals.total ? (totals.cacheRead / totals.total) * 100 : 0;
const leverage = authored ? totals.total / authored : 0;

// peak day
let peak = { date: null, total: 0, convs: 0 };
for (const [d, v] of daily) if (v.total > peak.total) peak = { date: d, total: v.total, convs: v.convs };

const models = [...byModel.values()]
  .filter((m) => m.total > 0 && m.model !== 'unknown') // drop empty/placeholder models from the count
  .sort((a, b) => b.total - a.total)
  .map((m) => ({
    model: m.model,
    total: m.total,
    share: +((m.total / totals.total) * 100).toFixed(1),
    valueUsd: +m.valueUsd.toFixed(2),
  }));

const tools = [...byTool.entries()]
  .sort((a, b) => b[1].total - a[1].total)
  .map(([source, v]) => ({
    source,
    total: v.total,
    share: +((v.total / totals.total) * 100).toFixed(1),
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
    valueCoveragePct: +(100 - (uncoveredValueTokens / totals.total) * 100).toFixed(1),
  },
  peak,
  byModel: models,
  byTool: tools,
  daily: dates.map((d) => {
    const v = daily.get(d);
    return {
      date: d,
      total: v.total,
      input: v.input,
      output: v.output,
      cacheRead: v.cacheRead,
      cacheCreation: v.cacheCreation,
      reasoning: v.reasoning,
      convs: v.convs,
    };
  }),
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`[export-stats] wrote ${OUT}`);
console.log(`  ${out.totals.total.toLocaleString()} tokens · ${out.range.activeDays} active days · ${out.totals.cachePct}% cache`);
console.log(`  est value $${out.totals.estValueUsd.toLocaleString()} (pricing coverage ${out.totals.valueCoveragePct}%) · ${models.length} models · ${tools.length} tools`);
