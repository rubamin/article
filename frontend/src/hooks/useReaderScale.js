import { useEffect, useState } from 'react';

/**
 * Makes the reader page look the same on every screen size.
 *
 * The page is designed at BASE_WIDTH (a 14" laptop at 150% Windows scaling is about 1280 CSS px).
 * On wider screens (15" laptops ~1536 px, desktops ~1920 px) the whole page is scaled up by the
 * same factor with CSS zoom, so the reading column, text, header, logo, A4 sheets and quiz all
 * take the same share of the screen as on the base laptop.
 *
 *  - Below BASE_WIDTH the scale stays 1; the normal responsive CSS handles small laptops and phones.
 *  - MAX_SCALE stops text from getting too large on very wide monitors (2K / 4K at 100%).
 *
 * Tune these two numbers if you want the article bigger or smaller on desktops.
 */
export const BASE_WIDTH = 1280;
export const MAX_SCALE = 1.35;

function computeScale() {
  if (typeof window === 'undefined') return 1;
  const s = window.innerWidth / BASE_WIDTH;
  return Math.round(Math.min(MAX_SCALE, Math.max(1, s)) * 100) / 100;
}

export function useReaderScale() {
  const [scale, setScale] = useState(computeScale);

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScale(computeScale()));
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return scale;
}
