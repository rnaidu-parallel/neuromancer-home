/**
 * answer.ts — Phase 5 stream orchestration for span 06 (the answer).
 *
 * Registers into motion.ts's resolved branch via onMotionReady; never touches
 * gsap.matchMedia() itself. No pinning.
 *
 * Final-state DOM contract: Answer.astro + McpCard.astro ship fully rendered.
 * All pre-states (hidden status lines, masked paragraph lines, faded-out
 * avail/contacts/mcp) are applied HERE, only in the non-reduced branch — with
 * JS off or reduced motion everything is visible and static.
 *
 * Sequence (one ScrollTrigger on the span, plays once at 'top 70%'):
 *   1. status line typeOn (text-fx)         — "[synthesize] streaming final answer"
 *   2. paragraph SplitText line reveal      — type/mask 'lines', y 110%→0, stagger 0.12
 *   3. avail + contacts + mcp card fade in
 * If the span scrolls past mid-stream (onLeave), everything snaps to its final
 * state instantly via typeOn's finishNow() + gsap sets.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { CustomEase } from 'gsap/CustomEase';
import { onMotionReady } from './motion';
import { typeOn, type TypeHandle } from './text-fx';

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase);

// Exact match for --ease-out: cubic-bezier(0.22, 1, 0.36, 1).
const EASE = CustomEase.create('answerOut', 'M0,0 C0.22,1 0.36,1 1,1');

onMotionReady(({ reduced }) => {
  if (reduced) return; // final-state DOM is already fully visible

  const section = document.getElementById('answer');
  if (!section) return;

  const pick = (sel: string) => section.querySelector<HTMLElement>(sel);
  const status = pick('[data-answer="status"]');
  const text = pick('[data-answer="text"]');
  const avail = pick('[data-answer="avail"]');
  const contacts = pick('[data-answer="contacts"]');
  const mcp = pick('[data-mcp]');
  if (!status || !text) return;

  // --- pre-states (runtime only) ------------------------------------------
  // Status: hide the typed lines now; typeOn re-hides/reveals them when it
  // runs on enter (it manages the same visibility property, so this hands off
  // cleanly and its finalize() clears it).
  const statusLines = Array.from(status.querySelectorAll<HTMLElement>('[data-type-line]'));
  statusLines.forEach((line) => {
    line.style.visibility = 'hidden';
  });

  // Paragraph: split into masked lines pushed below their masks. autoSplit
  // re-splits on font-load/resize; onSplit reapplies the correct state so a
  // late font swap can't flash the copy.
  let revealed = false;
  const split = SplitText.create(text, {
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

  // Trailing block: fade targets.
  const fadeEls = [avail, contacts, mcp].filter((el): el is HTMLElement => el !== null);
  gsap.set(fadeEls, { opacity: 0, y: 8 });

  // --- stream ---------------------------------------------------------------
  let started = false;
  let finished = false;
  let handle: TypeHandle | null = null;
  let tl: gsap.core.Timeline | null = null;

  const play = (): void => {
    if (started || finished) return;
    started = true;
    handle = typeOn(status, { cps: 45 });
    void handle.done.then(() => {
      if (finished) return;
      revealed = true;
      tl = gsap.timeline({
        onComplete() {
          finished = true;
        },
      });
      tl.to(split.lines, { yPercent: 0, stagger: 0.12, duration: 0.5, ease: EASE });
      tl.to(
        fadeEls,
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, ease: EASE },
        '>-0.1',
      );
    });
  };

  // Instant final state — used when the span scrolls past mid-stream (or was
  // already below the fold on load in an edge state).
  const finishNow = (): void => {
    if (finished) return;
    finished = true;
    if (handle) {
      handle.finishNow();
    } else {
      // typeOn never ran: clear our pre-hide by hand.
      statusLines.forEach((line) => line.style.removeProperty('visibility'));
    }
    tl?.kill();
    revealed = true;
    gsap.set(split.lines, { yPercent: 0 });
    gsap.set(fadeEls, { opacity: 1, y: 0 });
  };

  // One trigger: enters once (guarded), and finishes instantly if the span
  // scrolls out the top mid-stream.
  ScrollTrigger.create({
    trigger: section,
    start: 'top 70%',
    end: 'bottom top',
    onEnter: play,
    onLeave: finishNow,
  });
});
