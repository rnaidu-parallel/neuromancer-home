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
 *   desktop + motion : pin the card stack and scrub a SEQUENTIAL swap through the
 *                      four cards — each card holds, then hands off with zero
 *                      opacity overlap (outgoing fully fades before incoming
 *                      begins). No snap (it fought Lenis and yanked scroll a full
 *                      viewport per step). A diegetic [i/N] progress readout and a
 *                      per-card typeOn fire as each card becomes active
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
const DRIFT = 16; // px y-drift on swap
const HOLD = 0.7; // fraction of each card's segment spent fully visible (rest = transition)

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
    if (handles[i]) return;
    const h = typeOn(cards[i]!, { cps: TERM_CPS });
    handles[i] = h;
    // When the terminal finishes typing (naturally or via finishNow), mark it
    // "live" so CSS parks a blinking cursor on the last output line.
    void h.done.then(() => cards[i]!.querySelector('.term')?.classList.add('term-live'));
  };

  // ---------------- stacked mode (mobile, or desktop that can't fit the pin):
  // no pin, per-terminal typeOn on enter.
  const setupStacked = (): void => {
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
  };

  if (!desktop) {
    setupStacked();
    return;
  }

  // ---------------- desktop: pin the stack, scrub the card swap -------------
  const progress = stage.querySelector<HTMLElement>('[data-projects-progress]');

  // Stage height = tallest card's NATURAL height at the CURRENT width. Cards
  // are absolutely stacked with height:auto (top/left/right only), so they lay
  // out at stage width and can never be squeezed — the stage adopts the max.
  // Re-measured on every ScrollTrigger refresh (resize/rotate) and after the
  // web fonts land (wrap changes = height changes).
  const measure = (): number => {
    const maxH = Math.max(...cards.map((c) => c.offsetHeight));
    stage.style.height = `${maxH}px`;
    return maxH;
  };
  stage.classList.add('is-pinned-stage');
  measure();

  // Initial stacked state: card 0 shown, the rest hidden + drifted down.
  gsap.set(cards[0]!, { opacity: 1, y: 0 });
  gsap.set(cards.slice(1), { opacity: 0, y: DRIFT });

  // Active-card bookkeeping: classes, inert/aria-hidden, progress readout, and
  // typing (start the new card, finish any we scrubbed away mid-type).
  let current = -1;
  const setActive = (idx: number): void => {
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

  // Swap timeline (scrubbed by the pin), built on a normalized 0..1 clock so
  // scroll progress maps straight through. Card i owns segment [i/N, (i+1)/N];
  // its first HOLD fraction is dead-still (fully visible, nothing moving) and the
  // last (1-HOLD) is the hand-off. Within that hand-off window the outgoing card
  // fully fades (opacity 1→0, y 0→-DRIFT) in the FIRST half, THEN the incoming
  // card fades in (opacity 0→1, y DRIFT→0) in the SECOND half — so at no scroll
  // position are two cards both above 0 opacity. The last card has no trailing
  // transition; a zero-duration spacer at t=1 extends the clock through its hold.
  const SEG = 1 / N;
  const swap = gsap.timeline();
  for (let i = 0; i < N - 1; i++) {
    const transStart = i * SEG + SEG * HOLD; // end of card i's hold
    const half = (SEG * (1 - HOLD)) / 2;
    swap.to(cards[i]!, { opacity: 0, y: -DRIFT, ease: 'none', duration: half }, transStart);
    swap.to(
      cards[i + 1]!,
      { opacity: 1, y: 0, ease: 'none', duration: half },
      transStart + half,
    );
  }
  // Extend the timeline to the full 0..1 range so the final card holds to the
  // pin's end (progress 1) instead of the clock stopping at the last hand-off.
  swap.to({}, { duration: 0.0001 }, 1);

  // First card types when the stack scrolls into view (before the pin locks).
  const enterTrigger = ScrollTrigger.create({
    trigger: stage,
    start: 'top 80%',
    once: true,
    onEnter: () => ensureType(0),
  });

  // Pin + scrub. start 'center center' locks the stack when centered; end is
  // (N-1)·85vh of scroll — a touch tighter than full viewports for a snappier
  // feel, and recomputed on refresh so short and tall viewports both get a clean
  // per-card budget. NO snap: it fought Lenis and yanked scroll a whole viewport
  // per step; the hold-then-handoff timeline gives the settled feel without it.
  // Active card switches at each segment boundary (hold start): idx = ⌊p·N⌋.
  const pinTrigger = ScrollTrigger.create({
    trigger: stage,
    start: 'center center',
    end: () => '+=' + window.innerHeight * 0.85 * (N - 1),
    pin: true,
    pinSpacing: true,
    scrub: 0.4,
    animation: swap,
    onUpdate: (self) => setActive(Math.min(N - 1, Math.floor(self.progress * N))),
  });

  // If the tallest card doesn't fit the viewport (narrow/short desktop windows
  // — cards get much taller at e.g. 788px wide), the pinned experience clips:
  // tear it down and fall back to the plain stacked layout for this session.
  let tornDown = false;
  const teardownPin = (): void => {
    if (tornDown) return;
    tornDown = true;
    ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
    enterTrigger.kill();
    pinTrigger.kill(true); // revert pin + spacer
    swap.kill();
    stage.classList.remove('is-pinned-stage');
    stage.style.height = '';
    cards.forEach((c, i) => {
      c.classList.remove('is-active');
      c.removeAttribute('inert');
      c.removeAttribute('aria-hidden');
      gsap.set(c, { clearProps: 'opacity,transform' });
      handles[i]?.finishNow();
    });
    setupStacked();
    ScrollTrigger.refresh();
  };

  const fitsViewport = (maxH: number): boolean => maxH <= window.innerHeight * 0.88;

  // Re-measure stage height whenever ScrollTrigger re-measures (resize/rotate),
  // BEFORE it recalculates trigger positions; bail out entirely if we no longer fit.
  const onRefreshInit = (): void => {
    const maxH = measure();
    if (!fitsViewport(maxH)) queueMicrotask(teardownPin);
  };
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit);

  // Fonts landing changes line wraps → card heights; re-measure and refresh.
  void document.fonts?.ready.then(() => {
    if (!tornDown) {
      measure();
      ScrollTrigger.refresh();
    }
  });

  // Initial fit check (covers loading directly in a short/narrow window).
  if (!fitsViewport(measure())) {
    teardownPin();
    return;
  }

  // Re-sort/re-measure all triggers now that the pin spacer has grown the span.
  ScrollTrigger.refresh();
});
