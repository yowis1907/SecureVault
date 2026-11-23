import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';
import type { VaultScene } from './vault-scene';
import { mediaQuery } from '../../lib/motion';
import { subscribeScene } from './signal';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

/**
 * The decorative 3D scene. three.js is loaded only when this mounts, in its own chunk.
 * If WebGL is unavailable the canvas stays empty and the page's CSS background shows instead.
 * Hidden from assistive technology; it carries no information.
 */
export function SceneBackdrop({
  intensity = 'ambient',
  className,
}: {
  intensity?: 'hero' | 'ambient';
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: VaultScene | undefined;
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    const motion = mediaQuery(reducedMotionQuery);
    // Test DOMs and very old browsers lack these; the page simply has no scene there.
    if (
      !motion ||
      typeof IntersectionObserver === 'undefined' ||
      typeof ResizeObserver === 'undefined'
    ) {
      return;
    }

    void import('./vault-scene')
      .then(({ VaultScene }) => {
        if (cancelled) return;
        try {
          scene = new VaultScene(canvas, { intensity, reducedMotion: motion.matches });
        } catch {
          return; // No WebGL: keep the plain background.
        }
        const s = scene;
        setReady(true);
        s.start();

        const onMotion = (e: MediaQueryListEvent) => {
          s.setReducedMotion(e.matches);
        };
        motion.addEventListener('change', onMotion);
        cleanups.push(() => {
          motion.removeEventListener('change', onMotion);
        });

        const onPointer = (e: PointerEvent) => {
          s.setPointer(
            (e.clientX / window.innerWidth) * 2 - 1,
            (e.clientY / window.innerHeight) * 2 - 1,
          );
        };
        window.addEventListener('pointermove', onPointer, { passive: true });
        const onScroll = () => {
          s.setScroll(window.scrollY / Math.max(1, window.innerHeight));
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        cleanups.push(() => {
          window.removeEventListener('scroll', onScroll);
        });
        cleanups.push(() => {
          window.removeEventListener('pointermove', onPointer);
        });

        const resize = new ResizeObserver(() => {
          s.resize();
        });
        if (canvas.parentElement) resize.observe(canvas.parentElement);
        cleanups.push(() => {
          resize.disconnect();
        });

        // Stop drawing while the scene is scrolled away or the tab is hidden.
        let onScreen = true;
        const sync = () => {
          if (onScreen && document.visibilityState === 'visible') s.start();
          else s.stop();
        };
        const io = new IntersectionObserver(([entry]) => {
          onScreen = entry?.isIntersecting ?? true;
          sync();
        });
        io.observe(canvas);
        document.addEventListener('visibilitychange', sync);
        cleanups.push(() => {
          io.disconnect();
          document.removeEventListener('visibilitychange', sync);
        });

        // Follow theme changes, whether from the setting or from the system.
        const theme = new MutationObserver(() => {
          s.applyTheme();
        });
        theme.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme'],
        });
        const scheme = window.matchMedia('(prefers-color-scheme: dark)');
        const onScheme = () => {
          s.applyTheme();
        };
        scheme.addEventListener('change', onScheme);
        cleanups.push(() => {
          theme.disconnect();
          scheme.removeEventListener('change', onScheme);
        });

        cleanups.push(
          subscribeScene((event) => {
            if (event.kind === 'pulse') s.burst(event.strength);
            else s.setMode(event.mode);
          }),
        );
      })
      .catch(() => {
        // The chunk failed to load; the page works without it.
      });

    return () => {
      cancelled = true;
      for (const c of cleanups) c();
      scene?.dispose();
    };
  }, [intensity]);

  return (
    <div
      aria-hidden="true"
      className={clsx(
        'pointer-events-none overflow-hidden transition-opacity duration-[1200ms] ease-out',
        ready ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
