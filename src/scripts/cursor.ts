/**
 * cursor.ts — custom cursor (a span-marker echo) + magnetic hover.
 *
 * Pure enhancement, hard-gated: only runs for fine-pointer, non-reduced-motion
 * users. Registers into motion.ts's resolved branch via onMotionReady, checks
 * the pointer type inside, and NEVER hides the native cursor otherwise. All
 * cursor DOM is created at runtime and appended to <body> aria-hidden — with JS
 * off nothing exists and the native cursor is untouched. Only transform/opacity
 * animate; the interactive-hover fill swaps via a CSS class, not a JS paint.
 *
 * Restraint (Chanel rule): exactly two states — default, and interactive-hover.
 * No per-surface morphs.
 */
import gsap from 'gsap';
import { onMotionReady } from './motion';

// a, button, and explicit button roles are the only "interactive" surfaces.
const INTERACTIVE = 'a, button, [role="button"]';

onMotionReady(({ reduced }) => {
  if (reduced) return;
  if (!window.matchMedia('(pointer: fine)').matches) return;

  setupCursor();
  setupMagnetic();
});

function setupCursor(): void {
  const ring = document.createElement('div');
  ring.className = 'trace-cursor trace-cursor-ring';
  ring.setAttribute('aria-hidden', 'true');

  const dot = document.createElement('div');
  dot.className = 'trace-cursor trace-cursor-dot';
  dot.setAttribute('aria-hidden', 'true');

  document.body.append(ring, dot);
  // Scoped so any failure above leaves the native cursor intact.
  document.documentElement.classList.add('has-cursor');

  // Center both on the pointer; x/y then position them.
  gsap.set([ring, dot], { xPercent: -50, yPercent: -50 });

  // Ring trails with a slight lag; dot is pinned exactly on the pointer.
  const ringX = gsap.quickTo(ring, 'x', { duration: 0.15, ease: 'power3' });
  const ringY = gsap.quickTo(ring, 'y', { duration: 0.15, ease: 'power3' });
  const dotX = gsap.quickSetter(dot, 'x', 'px') as (v: number) => void;
  const dotY = gsap.quickSetter(dot, 'y', 'px') as (v: number) => void;

  let shown = false;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (!shown) {
        shown = true;
        gsap.to([ring, dot], { opacity: 1, duration: 0.2 });
      }
      ringX(e.clientX);
      ringY(e.clientY);
      dotX(e.clientX);
      dotY(e.clientY);
    },
    { passive: true },
  );

  // Interactive hover: ring scales up and fills. Scale via gsap (transform);
  // the amber-dim fill is a CSS class transition, not a JS-animated paint.
  const overInteractive = (n: EventTarget | null): boolean =>
    n instanceof Element && n.closest(INTERACTIVE) !== null;

  const setOver = (on: boolean): void => {
    ring.classList.toggle('is-over', on);
    gsap.to(ring, { scale: on ? 2.2 : 1, duration: 0.2, ease: 'power3', overwrite: 'auto' });
  };

  document.addEventListener('pointerover', (e) => {
    if (overInteractive(e.target)) setOver(true);
  });
  document.addEventListener('pointerout', (e) => {
    if (overInteractive(e.target) && !overInteractive(e.relatedTarget)) setOver(false);
  });

  // Leaving the window hides both; re-entering restores them.
  const root = document.documentElement;
  root.addEventListener('pointerleave', () => {
    gsap.to([ring, dot], { opacity: 0, duration: 0.15 });
  });
  root.addEventListener('pointerenter', () => {
    if (shown) gsap.to([ring, dot], { opacity: 1, duration: 0.15 });
  });
}

// Magnetic hover — restraint: applied ONLY to elements tagged [data-magnetic]
// (the schedule-a-call pill and the copy-config button). Within a 60px radius
// the element eases toward the pointer (max 6px); on leave it springs back.
function setupMagnetic(): void {
  const RADIUS = 60;
  const MAX = 6;
  const clamp = gsap.utils.clamp(-MAX, MAX);

  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-magnetic]')).map(
    (el) => ({
      el,
      xTo: gsap.quickTo(el, 'x', { duration: 0.3, ease: 'power3' }),
      yTo: gsap.quickTo(el, 'y', { duration: 0.3, ease: 'power3' }),
      active: false,
    }),
  );
  if (!items.length) return;

  window.addEventListener(
    'pointermove',
    (e) => {
      for (const it of items) {
        const r = it.el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) < RADIUS) {
          it.active = true;
          it.xTo(clamp(dx * (MAX / RADIUS)));
          it.yTo(clamp(dy * (MAX / RADIUS)));
        } else if (it.active) {
          it.active = false;
          gsap.to(it.el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)', overwrite: true });
        }
      }
    },
    { passive: true },
  );
}
