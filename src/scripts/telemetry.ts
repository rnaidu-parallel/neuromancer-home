// telemetry.ts — client logic for the usage dashboard. Vanilla, no framework.

type Day = {
  date: string; total: number; input: number; output: number;
  cacheRead: number; cacheCreation: number; reasoning: number; convs: number;
};

const raw = document.getElementById('bb-data')?.textContent;
if (raw) {
  const daily = (JSON.parse(raw) as { daily: Day[] }).daily;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const compact = (n: number): string => {
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  };
  const dUTC = (s: string) => new Date(s + 'T00:00:00Z');
  const shortDate = (s: string) => dUTC(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dayMs = 86400000;

  // ---- hero count-up ----
  const numEl = document.querySelector<HTMLElement>('.hero__num');
  if (numEl) {
    const target = Number(numEl.dataset.count || 0);
    if (reduce) {
      numEl.textContent = target.toLocaleString('en-US');
    } else {
      const dur = 1300, t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        numEl.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('en-US');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  // ---- range: trend + table ----
  const lastDate = daily.length ? dUTC(daily[daily.length - 1].date) : new Date();
  const sliceRange = (range: string): Day[] => {
    if (range === 'all') return daily;
    const cut = lastDate.getTime() - (Number(range) - 1) * dayMs;
    return daily.filter((d) => dUTC(d.date).getTime() >= cut);
  };

  const barsEl = document.getElementById('trend-bars');
  const axFrom = document.getElementById('trend-from');
  const axPeak = document.getElementById('trend-peak');
  const axTo = document.getElementById('trend-to');
  const tbody = document.getElementById('table-body');
  const moreBtn = document.getElementById('table-more') as HTMLButtonElement | null;

  const TABLE_CAP = 30;
  let expanded = false;
  let rows: Day[] = [];

  const cell = (text: string, cls?: string) => {
    const td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  };
  const renderTable = () => {
    if (!tbody) return;
    const ordered = [...rows].reverse();
    const show = expanded ? ordered : ordered.slice(0, TABLE_CAP);
    const frag = document.createDocumentFragment();
    for (const d of show) {
      const tr = document.createElement('tr');
      tr.append(
        cell(shortDate(d.date), 'l'), cell(compact(d.total)), cell(compact(d.input)),
        cell(compact(d.output)), cell(compact(d.cacheRead), 'cache'),
        cell(compact(d.reasoning)), cell(String(d.convs)),
      );
      frag.appendChild(tr);
    }
    tbody.replaceChildren(frag);
    if (moreBtn) {
      moreBtn.hidden = ordered.length <= TABLE_CAP;
      moreBtn.textContent = expanded ? 'Show less' : `Show all ${ordered.length}`;
    }
  };

  const setRange = (range: string) => {
    rows = sliceRange(range);
    if (barsEl) {
      const max = Math.max(1, ...rows.map((d) => d.total));
      let peak = 0;
      rows.forEach((d, i) => { if (d.total > rows[peak].total) peak = i; });
      const frag = document.createDocumentFragment();
      rows.forEach((d, i) => {
        const bar = document.createElement('div');
        bar.className = 'trend__bar';
        bar.style.height = Math.max(2, (d.total / max) * 100) + '%';
        bar.dataset.tip = `${shortDate(d.date)} · ${compact(d.total)}`;
        bar.setAttribute('aria-hidden', 'true');
        if (i === peak) bar.dataset.peak = 'true';
        frag.appendChild(bar);
      });
      barsEl.replaceChildren(frag);
      if (axFrom) axFrom.textContent = rows.length ? shortDate(rows[0].date) : '';
      if (axTo) axTo.textContent = rows.length ? shortDate(rows[rows.length - 1].date) : '';
      if (axPeak) axPeak.textContent = rows.length ? `peak ${compact(rows[peak].total)}` : '';
    }
    expanded = false;
    renderTable();
  };

  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'));
  const selectTab = (btn: HTMLButtonElement, focus = false) => {
    tabs.forEach((tb) => { const on = tb === btn; tb.setAttribute('aria-selected', String(on)); tb.tabIndex = on ? 0 : -1; });
    if (focus) btn.focus();
    setRange(btn.dataset.range || '30');
  };
  tabs.forEach((btn, i) => {
    btn.addEventListener('click', () => selectTab(btn));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        selectTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length], true);
      }
    });
  });
  moreBtn?.addEventListener('click', () => { expanded = !expanded; renderTable(); });
  setRange('30');

  // ---- heatmap ----
  const grid = document.getElementById('heat-grid');
  const monthsEl = document.getElementById('heat-months');
  if (grid && daily.length) {
    const byDate = new Map(daily.map((d) => [d.date, d.total]));
    // ABSOLUTE daily-token thresholds (fixed, not percentile) so a cell's color reflects
    // the real volume that day and reads consistently across the whole timeline — a quiet
    // month still shows real green instead of being ranked down against the busy months.
    // Tune these round numbers if usage scale shifts. Zero-activity days keep the backing.
    const thr = [200_000, 1_500_000, 10_000_000, 50_000_000];
    const level = (v: number) => (v <= thr[0] ? 0 : v <= thr[1] ? 1 : v <= thr[2] ? 2 : v <= thr[3] ? 3 : 4);

    const first = dUTC(daily[0].date);
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    const end = dUTC(daily[daily.length - 1].date);
    const COL = 19; // 15px cell + 4px gap
    const frag = document.createDocumentFragment();
    const months: { col: number; label: string }[] = [];
    let col = 0, lastMonth = -1;
    for (let ts = start.getTime(); ts <= end.getTime(); ts += dayMs) {
      const dt = new Date(ts);
      const iso = dt.toISOString().slice(0, 10);
      if (dt.getUTCDay() === 0) {
        const m = dt.getUTCMonth();
        if (m !== lastMonth) { months.push({ col, label: dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) }); lastMonth = m; }
        if (ts !== start.getTime()) col++;
      }
      const c = document.createElement('div');
      c.className = 'heat__cell';
      if (ts < first.getTime()) {
        c.dataset.empty = 'true';
      } else {
        const v = byDate.get(iso) || 0;
        if (v > 0) c.dataset.l = String(level(v)); // zero days keep the neutral backing
        const dl = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        c.title = v > 0 ? `${dl} · ${compact(v)} tokens` : `${dl} · no activity`;
      }
      frag.appendChild(c);
    }
    grid.appendChild(frag);
    if (monthsEl) {
      monthsEl.style.width = (col + 1) * COL + 'px';
      for (const mk of months) {
        const s = document.createElement('span');
        s.textContent = mk.label;
        s.style.left = mk.col * COL + 'px';
        monthsEl.appendChild(s);
      }
    }
  }
}
