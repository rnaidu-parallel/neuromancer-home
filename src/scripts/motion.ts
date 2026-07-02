/**
 * motion.ts — global motion plumbing.
 *
 * Sets up smooth scrolling (Lenis) driven by the GSAP ticker, and gates
 * everything behind prefers-reduced-motion via gsap.matchMedia().
 *
 * Later-phase scripts should NOT call gsap.matchMedia() again — instead they
 * register callbacks with `onMotionReady(cb)`. Each callback fires ONCE, inside
 * the resolved matchMedia branch, receiving `{ reduced, desktop }`:
 *   - reduced  → prefers-reduced-motion: reduce (no Lenis, no scrubs/pins).
 *   - desktop  → viewport ≥ 768px at resolve time. Consumers that pin (e.g.
 *                projects.ts) gate on `desktop && !reduced`.
 * Both conditions come from a single gsap.matchMedia() conditions object so the
 * media queries live in one place. onMotionReady is one-shot: `desktop` reflects
 * the viewport at first resolve and does not re-fire on a later breakpoint cross
 * (matching the existing boot.ts/thread.ts contract). boot.ts and thread.ts read
 * only `reduced` and are unaffected.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

declare global {
  interface Window {
    __motion?: { reducedMotion: boolean; lenis: boolean };
  }
}

type MotionCtx = { reduced: boolean; desktop: boolean };
type MotionCb = (ctx: MotionCtx) => void;

// Callbacks registered before the branch resolves are queued and flushed once
// the matchMedia branch runs; callbacks registered afterwards fire immediately.
const pending: MotionCb[] = [];
let resolvedCtx: MotionCtx | null = null;

/** Register a callback to run once inside the resolved motion branch. */
export function onMotionReady(cb: MotionCb): void {
  if (resolvedCtx) {
    cb(resolvedCtx);
  } else {
    pending.push(cb);
  }
}

function flush(ctx: MotionCtx): void {
  resolvedCtx = ctx;
  while (pending.length) pending.shift()!(ctx);
}

export const mm = gsap.matchMedia();

// One conditions object → gsap exposes matching booleans on context.conditions
// and re-runs the callback when either query flips (running the returned cleanup
// first). Lenis is set up only when motion is allowed.
mm.add(
  {
    reduced: '(prefers-reduced-motion: reduce)',
    desktop: '(min-width: 768px)',
  },
  (context) => {
    const { reduced, desktop } = context.conditions as {
      reduced: boolean;
      desktop: boolean;
    };

    let tick: ((t: number) => void) | null = null;
    let lenis: Lenis | null = null;

    if (!reduced) {
      lenis = new Lenis({ autoRaf: false });
      lenis.on('scroll', ScrollTrigger.update);
      tick = (t) => lenis!.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    window.__motion = { reducedMotion: reduced, lenis: !!lenis };
    flush({ reduced, desktop });

    return () => {
      if (tick) gsap.ticker.remove(tick);
      lenis?.destroy();
    };
  },
);
