/**
 * projects.ts — Phase 3 motion for span 02 (get_projects()).
 *
 * Registers into motion.ts's resolved branch via onMotionReady, so it never
 * touches gsap.matchMedia() itself. It reads `desktop` (added to the ctx in
 * motion.ts) and pins ONLY when `desktop && !reduced`.
 *
 * Final-state DOM contract: the four project cards ship as a plain vertical
 * stack (span-body's normal flow). The absolute-stacking styles live behind the
 * `.is-pinned-stage` class, which is added HERE at runtime — so with JS off /
 * reduced motion / mobile the page is a readable stack and nothing overlaps.
 *
 *   desktop + motion : pin the card stack for (N-1) viewports and scrub a
 *                      crossfade+drift swap through the four cards, with a snap
 *                      per card, a diegetic [i/N] progress readout, and a
 *                      per-card typeOn that fires as each card becomes active
 *                      (finishNow() if you scrub past mid-type). Inactive cards
 *                      are inert + aria-hidden while stacked.
 *   mobile (motion)  : no pin; each terminal typeOns once on enter (top 80%),
 *                      finishNow() on viewport exit.
 *   reduced motion   : nothing — the full text is already in the DOM.
 *
 * Pin / rail interplay: the stage lives inside span-content, so pinSpacing grows
 * the section by the pin distance and the trace rail (100% of section height)
 * stretches with it. thread.ts triggers are created first (imported earlier in
 * the page), so after building the pin we call ScrollTrigger.refresh() — that
 * re-sorts pinned triggers ahead of the thread's draw triggers and re-measures
 * every start/end against the now-taller section.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { onMotionReady } from './motion';
import { typeOn, type TypeHandle } from './text-fx';

const TERM_CPS = 55; // terminal typing speed
const DRIFT = 24; // px y-drift on swap

onMotionReady(({ reduced, desktop }) => {
  const stage = document.querySelector<HTMLElement>('[data-projects-stage]');
  if (!stage) return;

  const cards = gsap.utils.toArray<HTMLElement>('[data-card]', stage);
  if (!cards.length) return;
  const N = cards.length;

  // Reduced motion: full text already visible in a plain stack. Nothing to do.
  if (reduced) return;

  const handles: (TypeHandle | null)[] = new Array(N).fill(null);
  const ensureType = (i: number): void => {
    if (!handles[i]) handles[i] = typeOn(cards[i]!, { cps: TERM_CPS });
  };

  // ---------------- mobile (< 768px): no pin, per-terminal typeOn ----------
  if (!desktop) {
    cards.forEach((card, i) => {
      ScrollTrigger.create({
        trigger: card,
        start: 'top 80%',
        end: 'bottom 20%',
        onEnter: () => ensureType(i),
        onLeave: () => handles[i]?.finishNow(),
        onLeaveBack: () => handles[i]?.finishNow(),
      });
    });
    return;
  }

  // ---------------- desktop: pin the stack, scrub the card swap -------------
  const progress = stage.querySelector<HTMLElement>('[data-projects-progress]');

  // Measure the tallest card while still in normal flow, freeze the stage to
  // that height, THEN switch to absolute stacking. Keeps the pinned box a fixed
  // size regardless of which card is showing (no jump on swap). Card width is
  // unchanged (inset:0 → same column width as flow), so heights stay valid.
  const maxH = Math.max(...cards.map((c) => c.offsetHeight));
  stage.style.minHeight = `${maxH}px`;
  stage.classList.add('is-pinned-stage');

  // Initial stacked state: card 0 shown, the rest hidden + drifted down.
  gsap.set(cards[0]!, { opacity: 1, y: 0 });
  gsap.set(cards.slice(1), { opacity: 0, y: DRIFT });

  // Active-card bookkeeping: classes, inert/aria-hidden, progress readout, and
  // typing (start the new card, finish any we scrubbed away mid-type).
  let current = -1;
  const setActive = (raw: number): void => {
    const idx = Math.max(0, Math.min(N - 1, raw));
    if (idx === current) return;
    current = idx;
    if (progress) progress.textContent = `[${idx + 1}/${N}]`;
    cards.forEach((c, i) => {
      const on = i === idx;
      c.classList.toggle('is-active', on);
      if (on) {
        c.removeAttribute('inert');
        c.removeAttribute('aria-hidden');
      } else {
        c.setAttribute('inert', '');
        c.setAttribute('aria-hidden', 'true');
        handles[i]?.finishNow();
      }
    });
    ensureType(idx);
  };

  // Seed initial state (card 0 active) without typing — it types on enter below.
  cards.forEach((c, i) => {
    if (i === 0) {
      c.classList.add('is-active');
    } else {
      c.setAttribute('inert', '');
      c.setAttribute('aria-hidden', 'true');
    }
  });
  current = 0;
  if (progress) progress.textContent = `[1/${N}]`;

  // Swap timeline (scrubbed by the pin): each transition i occupies one time
  // unit — outgoing card drifts up + fades, incoming drifts in + fades, a brief
  // full-overlap crossfade. Total length N-1; snap lands on whole-card stops.
  const swap = gsap.timeline();
  for (let i = 0; i < N - 1; i++) {
    swap.to(cards[i]!, { opacity: 0, y: -DRIFT, ease: 'none', duration: 1 }, i);
    swap.to(cards[i + 1]!, { opacity: 1, y: 0, ease: 'none', duration: 1 }, i);
  }

  // First card types when the stack scrolls into view (before the pin locks).
  ScrollTrigger.create({
    trigger: stage,
    start: 'top 80%',
    once: true,
    onEnter: () => ensureType(0),
  });

  // Pin + scrub. start 'center center' locks the stack when centered; end is
  // (N-1) viewport heights of scroll (≡ +=300vh for N=4), recomputed on refresh
  // so 900px- and 1440px-tall viewports both get a clean per-card scroll budget.
  ScrollTrigger.create({
    trigger: stage,
    start: 'center center',
    end: () => '+=' + window.innerHeight * (N - 1),
    pin: true,
    pinSpacing: true,
    scrub: 0.5,
    snap: { snapTo: 1 / (N - 1), duration: 0.3 },
    animation: swap,
    onUpdate: (self) => setActive(Math.round(self.progress * (N - 1))),
  });

  // Re-sort/re-measure all triggers now that the pin spacer has grown the span.
  ScrollTrigger.refresh();
});
