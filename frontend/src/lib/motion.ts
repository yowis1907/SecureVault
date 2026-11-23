import { useEffect, useRef, useState } from 'react';

/** A media query list, or null where the browser (or a test DOM) has no matchMedia. */
export function mediaQuery(query: string): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
}

const REDUCED = '(prefers-reduced-motion: reduce)';

/** Live value of prefers-reduced-motion, updated if the user changes it mid-session. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => mediaQuery(REDUCED)?.matches ?? false);
  useEffect(() => {
    const mq = mediaQuery(REDUCED);
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => {
      setReduced(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, []);
  return reduced;
}

/**
 * Tilts an element toward the pointer in 3D (CSS class `tilt`). Values are written as CSS
 * variables through CSSOM, which the CSP allows. Touch and reduced motion leave it flat.
 */
export function useTilt<T extends HTMLElement>(maxDegrees = 7) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--rx', `${(-y * maxDegrees).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(x * maxDegrees).toFixed(2)}deg`);
      el.dataset.active = 'true';
    };
    const leave = () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.dataset.active = 'false';
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [maxDegrees, reduced]);
  return ref;
}

/** Marks an element visible the first time it scrolls into view (CSS class `reveal`). */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.dataset.visible = 'true';
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = 'true';
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, []);
  return ref;
}

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789+/=';

/**
 * Text that starts as random glyphs and resolves left to right, like ciphertext being opened.
 * Returns the full text immediately under reduced motion. Visual only; the glyphs come from
 * crypto.getRandomValues simply so no Math.random appears in this codebase.
 */
export function useDecodeText(text: string, durationMs = 1100): string {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? text : '');
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const random = new Uint8Array(text.length);
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const fixed = Math.floor(progress * text.length);
      crypto.getRandomValues(random);
      let out = text.slice(0, fixed);
      for (let i = fixed; i < text.length; i++) {
        const c = text[i] ?? '';
        out += c === ' ' ? ' ' : (GLYPHS[(random[i] ?? 0) % GLYPHS.length] ?? c);
      }
      setShown(out);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [text, durationMs, reduced]);
  return reduced ? text : shown;
}

/** Counts up from 0 to the target with an ease-out, once per target change. */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [target, durationMs, reduced]);
  return reduced ? target : value;
}
