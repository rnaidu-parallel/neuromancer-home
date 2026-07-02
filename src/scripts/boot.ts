/**
 * boot.ts — Phase 1 hero boot sequence (single orchestrated GSAP timeline).
 *
 * Registers into motion.ts's resolved matchMedia branch via `onMotionReady`, so
 * it never touches gsap.matchMedia() itself and always runs inside the correct
 * reduced/no-preference branch.
 *
 * Contract: all pre-boot hidden states are applied HERE at runtime (never CSS),
 * so with JS off the hero is fully visible. Only opacity/transform/clip animate.
 * The name (h1) is the LCP element and is NEVER hidden — it scrambles in place.
 */
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { CustomEase } from 'gsap/CustomEase';
import { onMotionReady } from './motion';
import { typeOn, scrambleResolve } from './text-fx';

gsap.registerPlugin(SplitText, CustomEase);

// Exact match for --ease-out: cubic-bezier(0.22, 1, 0.36, 1).
const EASE = CustomEase.create('traceOut', 'M0,0 C0.22,1 0.36,1 1,1');
const SEEN_KEY = 'trace-boot-seen';

onMotionReady(({ reduced }) => {
  const hero = document.getElementById('boot');
  if (!hero) return;

  const pick = (sel: string) => hero.querySelector<HTMLElement>(sel)!;
  const query = pick('[data-boot="query"]');
  const run = pick('[data-boot="run"]');
  const name = pick('[data-boot="name"]');
  const headline = pick('[data-boot="headline"]');
  const status = pick('[data-boot="status"]');
  const cue = pick('[data-boot="cue"]');

  // --- reduced motion: content immediately readable, no hidden pre-states. ---
  // A single sub-400ms opacity settle on the meta lines, nothing more.
  if (reduced) {
    gsap.from([run, status, cue], { autoAlpha: 0.6, duration: 0.35, ease: EASE });
    return;
  }

  // --- revisit: skip the full boot, quick 0.3s fade of the non-name lines. ---
  // Starts from current (visible) state; the name is never hidden.
  if (sessionStorage.getItem(SEEN_KEY)) {
    gsap.from([query, run, headline, status, cue], {
      opacity: 0.6,
      duration: 0.3,
      ease: EASE,
    });
    return;
  }

  // ============================ full boot ================================== //

  // Shared state for fast-forward + re-split coordination.
  let revealed = false; // headline mask reveal has started
  let finished = false; // whole boot fast-forwarded/completed
  const scrambleAbort = new AbortController();

  // 1) Pre-boot hidden state — applied SYNCHRONOUSLY, before the first animated
  //    paint. Name stays at full opacity (LCP).
  gsap.set([run, status, cue], { opacity: 0 });

  //    Query: typeOn captures + hides the typed line and starts typing at t≈0.
  const typeHandle = typeOn(query, { cps: 35 });

  //    Headline: split into masked lines and push them below their masks.
  //    autoSplit re-splits on font-load/resize; onSplit reapplies the correct
  //    hidden/revealed state so a late font swap can't flash the copy.
  const split = SplitText.create(headline, {
    type: 'lines',
    mask: 'lines',
    autoSplit: true,
    // aria 'auto' would pin aria-label on the <p> — prohibited on generic
    // roles (Lighthouse aria-prohibited-attr). Lines stay real text in DOM
    // order, so 'none' loses nothing for AT.
    aria: 'none',
    onSplit(self) {
      gsap.set(self.lines, { yPercent: revealed ? 0 : 110 });
      return undefined;
    },
  });

  // 2) Master timeline is the clock. typeOn/scrambleResolve run their own rAF
  //    loops, triggered from the timeline so everything stays one orchestration.
  //    Beat budget (seconds):
  //      0.00  query typeOn      (~0.6s @ 35cps)
  //      0.70  run snaps in      (0.20s) -> 0.90
  //      0.90  name scramble     (0.90s) -> 1.80
  //      1.50  headline reveal   (0.50s + 0.12 stagger over the lines)
  //      2.10  status + cue fade (0.30s) -> 2.40   (<= 2.5s total)
  const tl = gsap.timeline({
    onComplete() {
      finished = true;
      sessionStorage.setItem(SEEN_KEY, '1');
      teardown();
    },
  });

  tl.fromTo(
    run,
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: 0.2, ease: EASE },
    0.7,
  );

  // Scramble the name in place. Guarded so a fast-forward's progress(1) — which
  // re-fires this call — does not kick off a second scramble.
  tl.call(
    () => {
      if (!finished) scrambleResolve(name, { duration: 900, signal: scrambleAbort.signal });
    },
    [],
    0.9,
  );

  tl.add(() => {
    revealed = true;
  }, 1.5);
  tl.to(split.lines, { yPercent: 0, stagger: 0.12, duration: 0.5, ease: EASE }, 1.5);

  tl.to([status, cue], { opacity: 1, duration: 0.3, ease: EASE }, 2.1);

  // 3) Fast-forward: first user intent to move finishes everything instantly.
  //    No scroll-jail — listeners are passive and never preventDefault().
  const finish = (): void => {
    if (finished) return;
    finished = true;
    typeHandle.finishNow();
    scrambleAbort.abort(); // snaps the name to final text
    revealed = true;
    gsap.set(split.lines, { yPercent: 0 });
    tl.progress(1); // completes run / headline / status / cue tweens
    sessionStorage.setItem(SEEN_KEY, '1');
    teardown();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.key === 'PageDown' || e.key === 'ArrowDown') finish();
  };

  function teardown(): void {
    window.removeEventListener('wheel', finish);
    window.removeEventListener('touchstart', finish);
    window.removeEventListener('click', finish);
    window.removeEventListener('keydown', onKey);
  }

  window.addEventListener('wheel', finish, { passive: true });
  window.addEventListener('touchstart', finish, { passive: true });
  window.addEventListener('click', finish, { passive: true });
  window.addEventListener('keydown', onKey);
});
