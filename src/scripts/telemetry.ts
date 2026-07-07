// telemetry.ts — client logic for the Black Box readout.
// Vanilla, no framework. All data comes pre-aggregated from the #bb-data island.

type Day = {
  date: string;
  total: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  reasoning: number;
  convs: number;
};

const raw = document.getElementById('bb-data')?.textContent;
if (raw) {
  const data = JSON.parse(raw) as { daily: Day[] };
  const daily = data.daily;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- format helpers ----------
  const compact = (n: number): string => {
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  };
  const dUTC = (s: string) => new Date(s + 'T00:00:00Z');
  const shortDate = (s: string) =>
    dUTC(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dayMs = 86400000;

  // ---------- 1. hero count-up ----------
  const numEl = document.querySelector<HTMLElement>('.bb-readout__num');
  if (numEl) {
    const target = Number(numEl.dataset.count || 0);
    if (reduce) {
      numEl.textContent = target.toLocaleString('en-US');
    } else {
      const dur = 1400;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        numEl.textContent = Math.round(target * eased).toLocaleString('en-US');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  // ---------- 2. dual-trace oscilloscope ----------
  const W = 1000;
  const H = 160;
  const pad = 8;
  const buildPath = (vals: number[], scale: number, close: boolean): string => {
    const n = vals.length;
    if (n === 0) return '';
    const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v: number) => H - pad - (v / scale) * (H - pad * 2);
    let d = `M ${x(0).toFixed(1)} ${y(vals[0]).toFixed(1)}`;
    for (let i = 1; i < n; i++) d += ` L ${x(i).toFixed(1)} ${y(vals[i]).toFixed(1)}`;
    if (close) d += ` L ${W} ${H} L 0 ${H} Z`;
    return d;
  };
  const cacheSeries = daily.map((d) => d.cacheRead + d.cacheCreation);
  const authSeries = daily.map((d) => d.input + d.output);
  const scopeScale = Math.max(1, ...cacheSeries); // shared scale → authored reads as nearly flat
  const cacheP = document.querySelector<SVGPathElement>('.bb-scope__cache');
  const cacheF = document.querySelector<SVGPathElement>('.bb-scope__cachefill');
  const authP = document.querySelector<SVGPathElement>('.bb-scope__auth');
  cacheF?.setAttribute('d', buildPath(cacheSeries, scopeScale, true));
  cacheP?.setAttribute('d', buildPath(cacheSeries, scopeScale, false));
  authP?.setAttribute('d', buildPath(authSeries, scopeScale, false));
  if (!reduce) {
    for (const p of [cacheP, authP]) {
      if (!p) continue;
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      p.getBoundingClientRect(); // reflow
      p.style.transition = 'stroke-dashoffset 1600ms cubic-bezier(0.65,0,0.35,1)';
      p.style.strokeDashoffset = '0';
    }
    if (cacheF) {
      cacheF.style.opacity = '0';
      cacheF.style.transition = 'opacity 1400ms ease 300ms';
      requestAnimationFrame(() => (cacheF.style.opacity = '1'));
    }
  }

  // ---------- 3. range dashboard (tiles + trend + ledger) ----------
  const lastDate = daily.length ? dUTC(daily[daily.length - 1].date) : new Date();
  const sliceRange = (range: string): Day[] => {
    if (range === 'all') return daily;
    const n = Number(range);
    const cutoff = lastDate.getTime() - (n - 1) * dayMs;
    return daily.filter((d) => dUTC(d.date).getTime() >= cutoff);
  };

  const tileEls = {
    total: document.querySelector<HTMLElement>('[data-tile="total"]'),
    avg: document.querySelector<HTMLElement>('[data-tile="avg"]'),
    convs: document.querySelector<HTMLElement>('[data-tile="convs"]'),
    days: document.querySelector<HTMLElement>('[data-tile="days"]'),
    rangelabel: document.querySelector<HTMLElement>('[data-tile="rangelabel"]'),
  };
  const barsEl = document.getElementById('bb-trend-bars');
  const axFrom = document.getElementById('bb-trend-from');
  const axPeak = document.getElementById('bb-trend-peak');
  const axTo = document.getElementById('bb-trend-to');
  const tbody = document.getElementById('bb-table-body');
  const moreBtn = document.getElementById('bb-table-more') as HTMLButtonElement | null;

  const TABLE_CAP = 30;
  let tableExpanded = false;
  let currentRows: Day[] = [];

  const renderTable = () => {
    if (!tbody) return;
    const rows = [...currentRows].reverse(); // most recent first
    const show = tableExpanded ? rows : rows.slice(0, TABLE_CAP);
    const frag = document.createDocumentFragment();
    const cell = (text: string, cls?: string) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (cls) td.className = cls;
      return td;
    };
    for (const d of show) {
      const tr = document.createElement('tr');
      tr.append(
        cell(shortDate(d.date), 'l'),
        cell(compact(d.total)),
        cell(compact(d.input)),
        cell(compact(d.output)),
        cell(compact(d.cacheRead), 'cache'),
        cell(String(d.convs)),
      );
      frag.appendChild(tr);
    }
    tbody.replaceChildren(frag);
    if (moreBtn) {
      if (rows.length > TABLE_CAP) {
        moreBtn.hidden = false;
        moreBtn.textContent = tableExpanded ? 'show less' : `show all ${rows.length} days in range`;
      } else {
        moreBtn.hidden = true;
      }
    }
  };

  const setRange = (range: string) => {
    const rows = sliceRange(range);
    currentRows = rows;
    const total = rows.reduce((s, d) => s + d.total, 0);
    const convs = rows.reduce((s, d) => s + d.convs, 0);
    const days = rows.length;
    const avg = days ? total / days : 0;
    const label = range === 'all' ? 'all time' : range + 'd';
    if (tileEls.total) tileEls.total.textContent = compact(total);
    if (tileEls.avg) tileEls.avg.textContent = compact(avg);
    if (tileEls.convs) tileEls.convs.textContent = convs.toLocaleString('en-US');
    if (tileEls.days) tileEls.days.textContent = String(days);
    if (tileEls.rangelabel) tileEls.rangelabel.textContent = label;

    // trend bars
    if (barsEl) {
      const max = Math.max(1, ...rows.map((d) => d.total));
      let peakIdx = 0;
      rows.forEach((d, i) => { if (d.total > rows[peakIdx].total) peakIdx = i; });
      const frag = document.createDocumentFragment();
      rows.forEach((d, i) => {
        const bar = document.createElement('div');
        bar.className = 'bb-trend__bar';
        bar.style.height = Math.max(2, (d.total / max) * 100) + '%';
        bar.dataset.tip = `${shortDate(d.date)} · ${compact(d.total)}`;
        // decorative: the container is role="img" with a summary label, and every
        // value is available in the accessible ledger table below.
        bar.setAttribute('aria-hidden', 'true');
        if (i === peakIdx) bar.dataset.peak = 'true';
        frag.appendChild(bar);
      });
      barsEl.replaceChildren(frag);
      if (axFrom) axFrom.textContent = rows.length ? shortDate(rows[0].date) : '';
      if (axTo) axTo.textContent = rows.length ? shortDate(rows[rows.length - 1].date) : '';
      if (axPeak) axPeak.textContent = rows.length ? `peak ${compact(rows[peakIdx].total)}` : '';
    }

    tableExpanded = false;
    renderTable();
  };

  // tabs — roving tabindex + arrow keys
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.bb-tab'));
  const selectTab = (btn: HTMLButtonElement, focus = false) => {
    tabs.forEach((t) => {
      const on = t === btn;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    if (focus) btn.focus();
    setRange(btn.dataset.range || '30');
  };
  tabs.forEach((btn, i) => {
    btn.addEventListener('click', () => selectTab(btn));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        selectTab(tabs[(i + dir + tabs.length) % tabs.length], true);
      }
    });
  });
  moreBtn?.addEventListener('click', () => { tableExpanded = !tableExpanded; renderTable(); });

  // initial range
  setRange('30');

  // ---------- 4. activity heatmap ----------
  const grid = document.getElementById('bb-heat-grid');
  const monthsEl = document.getElementById('bb-heat-months');
  if (grid && daily.length) {
    const byDate = new Map(daily.map((d) => [d.date, d.total]));
    const actives = daily.map((d) => d.total).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p: number) => actives[Math.floor(p * (actives.length - 1))] || 0;
    // 4 non-empty buckets; top level is the busiest ~10% of active days (GitHub-like)
    const thresholds = [q(0.4), q(0.7), q(0.9)];
    const level = (v: number) => {
      if (v <= 0) return 0;
      if (v <= thresholds[0]) return 1;
      if (v <= thresholds[1]) return 2;
      if (v <= thresholds[2]) return 3;
      return 4;
    };
    // calendar from the Sunday on/before the first date → last date
    const first = dUTC(daily[0].date);
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    const end = dUTC(daily[daily.length - 1].date);
    const CELL = 12, GAP = 3, COL = CELL + GAP;
    const frag = document.createDocumentFragment();
    const monthMarks: { col: number; label: string }[] = [];
    let col = 0, lastMonth = -1;
    for (let ts = start.getTime(); ts <= end.getTime(); ts += dayMs) {
      const dt = new Date(ts);
      const iso = dt.toISOString().slice(0, 10);
      const dow = dt.getUTCDay();
      if (dow === 0) {
        const m = dt.getUTCMonth();
        if (m !== lastMonth) {
          monthMarks.push({ col, label: dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) });
          lastMonth = m;
        }
        if (ts !== start.getTime()) col++;
      }
      const cell = document.createElement('div');
      cell.className = 'bb-heat__cell';
      const inRange = ts >= first.getTime();
      if (!inRange) {
        cell.dataset.empty = 'true';
      } else {
        const v = byDate.get(iso) || 0;
        cell.dataset.l = String(level(v));
        cell.title = v > 0
          ? `${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} · ${compact(v)} tokens`
          : `${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} · no activity`;
      }
      frag.appendChild(cell);
    }
    grid.appendChild(frag);
    if (monthsEl) {
      monthsEl.style.width = (col + 1) * COL + 'px';
      for (const mk of monthMarks) {
        const s = document.createElement('span');
        s.textContent = mk.label;
        s.style.left = mk.col * COL + 'px';
        monthsEl.appendChild(s);
      }
    }
  }
}
