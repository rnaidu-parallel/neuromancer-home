/**
 * text-fx.ts — shared text-effect utilities.
 *
 * CRITICAL PRINCIPLE: every effect operates on final-state DOM that is ALREADY
 * fully rendered in the HTML the server sent. JS captures that text, then
 * rewinds and replays it — content is NEVER inserted by JS, only revealed. So
 * with JS disabled (and for crawlers / assistive tech) the real, complete text
 * is always present. We only mutate what is shown frame-to-frame.
 *
 * Accessibility approach (used by every effect here): while an effect mutates
 * the visible textContent, we pin the accessible name with
 * `el.setAttribute('aria-label', originalText)` and remove it when done. This is
 * the simplest robust option — the element keeps announcing its true text
 * throughout the scramble/type, and reverts to reading its (now-final,
 * identical) textContent afterwards. A visually-hidden duplicate would also
 * work but doubles the DOM; aria-label is enough because the final text equals
 * the label.
 *
 * Every effect also respects reduced motion: if `window.__motion?.reducedMotion`
 * is true, it resolves immediately and leaves the final DOM state untouched.
 */

const SCRAMBLE_POOL = '▪▓░<>/\\|=+*';

function prefersReduced(): boolean {
  return window.__motion?.reducedMotion === true;
}

function randPool(target: string): string {
  const pool = SCRAMBLE_POOL + target;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export interface ScrambleOpts {
  /** total animation duration in ms (default 900) */
  duration?: number;
  /**
   * Optional cancellation. When the signal aborts, the effect snaps the element
   * to its final text and resolves immediately. Backward-compatible: existing
   * callers pass no signal and get the original run-to-completion behaviour.
   */
  signal?: AbortSignal;
}

/**
 * scrambleResolve — scramble the element's text, then resolve it left-to-right.
 * Content is captured from the existing DOM and replayed; never inserted.
 * Pass `opts.signal` to allow a fast-forward that snaps to the final text.
 */
export function scrambleResolve(el: HTMLElement, opts: ScrambleOpts = {}): Promise<void> {
  const original = el.textContent ?? '';
  const duration = opts.duration ?? 900;
  const signal = opts.signal;

  // Reduced motion, empty text, or already-aborted → leave final text as-is.
  if (prefersReduced() || original.length === 0 || signal?.aborted) {
    return Promise.resolve();
  }

  el.setAttribute('aria-label', original);
  const chars = [...original];
  const start = performance.now();

  return new Promise<void>((resolve) => {
    let raf = 0;

    const finalize = (): void => {
      el.textContent = original;
      el.removeAttribute('aria-label');
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };

    const onAbort = (): void => {
      cancelAnimationFrame(raf);
      finalize();
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    function frame(now: number): void {
      if (signal?.aborted) return; // onAbort has (or will) finalize.
      const t = Math.min(1, (now - start) / duration);
      // number of characters fully resolved so far (left-to-right)
      const resolvedCount = Math.floor(t * chars.length);
      let out = '';
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i]!;
        if (i < resolvedCount || c === ' ' || c === '\n') {
          out += c;
        } else {
          out += randPool(c);
        }
      }
      el.textContent = out;

      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        finalize();
      }
    }
    raf = requestAnimationFrame(frame);
  });
}

export interface TypeOpts {
  /** characters per second (default 40) */
  cps?: number;
}

export interface TypeHandle {
  /** resolves when typing completes naturally or via finishNow() */
  done: Promise<void>;
  /** completes the animation instantly — used when the section scrolls past */
  finishNow(): void;
}

const CURSOR = '▋';

/**
 * typeOn — terminal typewriter over lines marked `[data-type-line]` inside `el`.
 * Captures each line's existing final text, hides the lines, then types them
 * line-by-line, char-by-char, with a blinking block cursor on the active line.
 * Returns a handle exposing a `done` promise and a `finishNow()` escape hatch.
 */
export function typeOn(el: HTMLElement, opts: TypeOpts = {}): TypeHandle {
  const cps = opts.cps ?? 40;
  const lines = Array.from(el.querySelectorAll<HTMLElement>('[data-type-line]'));

  // Capture originals up front (final-state DOM is the source of truth).
  const originals = lines.map((line) => line.textContent ?? '');

  const finalize = (): void => {
    lines.forEach((line, i) => {
      line.textContent = originals[i]!;
      line.removeAttribute('aria-label');
      line.style.removeProperty('visibility');
    });
  };

  if (prefersReduced() || lines.length === 0) {
    return { done: Promise.resolve(), finishNow: () => {} };
  }

  // Hide + pin accessible names, then reveal via typing.
  lines.forEach((line, i) => {
    line.setAttribute('aria-label', originals[i]!);
    line.style.visibility = 'hidden';
  });

  let cancelled = false;
  let raf = 0;
  let finishNow!: () => void;

  const done = new Promise<void>((resolve) => {
    finishNow = () => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(raf);
      finalize();
      resolve();
    };

    let lineIdx = 0;

    const typeLine = (): void => {
      if (cancelled) return;
      if (lineIdx >= lines.length) {
        finalize();
        resolve();
        return;
      }
      const line = lines[lineIdx]!;
      const text = originals[lineIdx]!;
      line.style.visibility = 'visible';
      const start = performance.now();

      const frame = (now: number): void => {
        if (cancelled) return;
        const elapsed = (now - start) / 1000;
        const shown = Math.min(text.length, Math.floor(elapsed * cps));
        // Blink the block cursor at ~2Hz while this line types.
        const blinkOn = Math.floor(now / 250) % 2 === 0;
        line.textContent = text.slice(0, shown) + (blinkOn ? CURSOR : '');

        if (shown < text.length) {
          raf = requestAnimationFrame(frame);
        } else {
          line.textContent = text;
          line.removeAttribute('aria-label');
          lineIdx++;
          typeLine();
        }
      };
      raf = requestAnimationFrame(frame);
    };

    typeLine();
  });

  return { done, finishNow };
}

// NOTE: the former `maskedLines` stub was removed in Phase 1 — the line-masked
// reveal is now done directly with GSAP SplitText (type/mask: 'lines') inside
// boot.ts, which is the natural home for GSAP-timeline-coordinated animation.
