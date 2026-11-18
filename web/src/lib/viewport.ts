import { useEffect, useState } from 'react';

export interface ViewportBox {
  /** Visible height in CSS px (shrinks when the on-screen keyboard opens). */
  height: number;
  /** Distance the visible area has been scrolled down the layout viewport (iOS moves this when the keyboard opens). */
  top: number;
  /** True when an on-screen keyboard is taking up a big chunk of the screen. */
  keyboard: boolean;
}

/**
 * Tracks the *visual* viewport — the part of the page actually visible above
 * the on-screen keyboard. Browsers differ (Firefox and Chrome on Android
 * resize differently, iOS scrolls the page instead), so we pin the round
 * screen to this box rather than trusting 100vh/100dvh.
 */
export function useVisualViewport(): ViewportBox {
  const read = (): ViewportBox => {
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    return { height, top: vv ? vv.offsetTop : 0, keyboard: false };
  };
  const [box, setBox] = useState(read);
  useEffect(() => {
    let tallest = Math.max(window.innerHeight, window.visualViewport?.height ?? 0);
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = read();
        // Orientation changes reset the baseline.
        if (next.height > tallest || Math.abs(window.innerWidth - lastWidth) > 50) tallest = next.height;
        lastWidth = window.innerWidth;
        next.keyboard = next.height < tallest * 0.75;
        setBox((b) => (b.height === next.height && b.top === next.top && b.keyboard === next.keyboard ? b : next));
      });
    };
    let lastWidth = window.innerWidth;
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return box;
}
