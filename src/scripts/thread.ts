/**
 * thread.ts — Phase 2 trace-spine motion.
 *
 * Registers into motion.ts's resolved matchMedia branch via `onMotionReady`,
 * so it never touches gsap.matchMedia() itself. No pinning: nothing blocks
 * scroll in this phase.
 *
 * Contract (matches the rest of the site): final-state DOM is fully drawn. The
 * undrawn pre-state (scaleY(0) vertical rule, dashed-out elbow, `.is-idle`
 * marker/cap, clip-path wipe) is only ever applied HERE at runtime, inside the
 * no-preference branch. With JS off or under reduced motion, the thread is
 * drawn and static.
 *
 * Per span segment:
 *  - draw scrub: ScrollTrigger start 'top 75%' → end 'bottom 75%', scrub 0.5.
 *    The end is CLAMPED to ScrollTrigger.maxScroll(window) so segments near the
 *    page bottom (whose natural 'bottom 75%' is unreachable) still finish at
 *    max scroll — the thread reads fully executed at page bottom.
 *  - the vertical rule draws via scaleY (transform-origin top) — exact and
 *    resize-stable regardless of the stretched rail; elbows draw via
 *    stroke-dashoffset (fixed-aspect SVG, getTotalLength is exact).
 *  - marker activation: a second trigger at start 'top 75%' — onEnter removes
 *    `.is-idle` (fills amber, stays filled), onLeaveBack re-adds it.
 *  - terminal cap (answer span): `.is-idle` until the segment's draw completes.
 *  - content wipe: clip-path inset(0 0 100% 0) → inset(0), 0.6s, start
 *    'top 70%', once (plays forward, never reverses).
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { onMotionReady } from './motion';

onMotionReady(({ reduced }) => {
  const spans = gsap.utils.toArray<HTMLElement>('[data-span]');
  if (!spans.length) return;

  if (reduced) {
    // Fully drawn, static: no triggers, no wipes. Defaults are already drawn,
    // but be explicit so nothing is left in a stray undrawn/idle state.
    spans.forEach((span) => {
      span
        .querySelectorAll<HTMLElement>('[data-thread-v]')
        .forEach((v) => gsap.set(v, { scaleY: 1 }));
      span
        .querySelectorAll<SVGGeometryElement>('[data-thread-draw]')
        .forEach((p) => gsap.set(p, { strokeDasharray: 'none', strokeDashoffset: 0 }));
      span
        .querySelectorAll<HTMLElement>('.thread-marker, .thread-cap')
        .forEach((m) => m.classList.remove('is-idle'));
    });
    return;
  }

  spans.forEach((span) => {
    const vertical = span.querySelector<HTMLElement>('[data-thread-v]');
    const elbows = Array.from(
      span.querySelectorAll<SVGGeometryElement>('[data-thread-draw]'),
    );
    const marker = span.querySelector<HTMLElement>('.thread-marker');
    const cap = span.querySelector<HTMLElement>('.thread-cap');
    const content = span.querySelector<HTMLElement>('[data-span-content]');

    // --- pre-state: undraw the segment, idle the marker/cap. ---
    const lengths = new Map<SVGGeometryElement, number>();
    const measure = () => {
      elbows.forEach((p) => {
        const len = p.getTotalLength();
        lengths.set(p, len);
        gsap.set(p, { strokeDasharray: len });
      });
    };
    const applyProgress = (progress: number) => {
      if (vertical) gsap.set(vertical, { scaleY: progress });
      elbows.forEach((p) => {
        const len = lengths.get(p) ?? p.getTotalLength();
        gsap.set(p, { strokeDashoffset: len * (1 - progress) });
      });
      cap?.classList.toggle('is-idle', progress < 0.999);
    };
    // GSAP overrides CSS transform-origin once it manages an element's
    // transforms — re-assert the top origin so the rule draws downward.
    if (vertical) gsap.set(vertical, { transformOrigin: '50% 0%' });
    measure();
    applyProgress(0);
    marker?.classList.add('is-idle');

    // --- draw scrub. End is 'bottom 75%' clamped to max scroll so the last
    //     segments complete when the user hits the bottom of the page. ---
    ScrollTrigger.create({
      trigger: span,
      start: 'top 75%',
      end: () => {
        const r = span.getBoundingClientRect();
        const startPx = r.top + window.scrollY - window.innerHeight * 0.75;
        const naturalEnd = r.bottom + window.scrollY - window.innerHeight * 0.75;
        return Math.max(startPx + 1, Math.min(naturalEnd, ScrollTrigger.maxScroll(window)));
      },
      scrub: 0.5,
      onRefresh: measure, // elbow lengths can change if layout shifts
      onUpdate: (self) => applyProgress(self.progress),
    });

    // --- marker activation (stays filled once reached; un-fills scrolling back up) ---
    ScrollTrigger.create({
      trigger: span,
      start: 'top 75%',
      onEnter: () => marker?.classList.remove('is-idle'),
      onLeaveBack: () => marker?.classList.add('is-idle'),
    });

    // --- content clip-path entry wipe (once, forward only) ---
    if (content) {
      gsap.set(content, { clipPath: 'inset(0 0 100% 0)' });
      gsap.to(content, {
        clipPath: 'inset(0 0 0% 0)',
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: span, start: 'top 70%', once: true },
      });
    }
  });
});
