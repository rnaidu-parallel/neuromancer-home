/**
 * motion.ts — global motion plumbing.
 *
 * Sets up smooth scrolling (Lenis) driven by the GSAP ticker, and gates
 * everything behind prefers-reduced-motion via gsap.matchMedia().
 *
 * Later-phase scripts should NOT call gsap.matchMedia() again — instead they
 * register callbacks with `onMotionReady(cb)`. Each callback fires once, inside
 * the correct matchMedia branch, receiving `{ reduced }` so it can decide
 * whether to build animations or leave the final DOM state untouched.
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

type MotionCtx = { reduced: boolean };
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

mm.add('(prefers-reduced-motion: no-preference)', () => {
  const lenis = new Lenis({ autoRaf: false });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  window.__motion = { reducedMotion: false, lenis: true };
  flush({ reduced: false });

  return () => {
    lenis.destroy();
  };
});

mm.add('(prefers-reduced-motion: reduce)', () => {
  // No Lenis, no pinned triggers — leave native scroll + final DOM state.
  window.__motion = { reducedMotion: true, lenis: false };
  flush({ reduced: true });
});
