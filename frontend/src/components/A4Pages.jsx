import { useLayoutEffect, useRef, useState } from 'react';

// A4 = 210 x 297 mm. At CSS 96 dpi the sheet is ~794 px wide; used to fit the sheet to the screen.
const SHEET_PX = (210 / 25.4) * 96;
const MAX_RUNS = 12; // re-layout limit (late images), so a bad image can never loop forever

/**
 * Shows already-sanitised article HTML as A4 sheets, like Word's print layout.
 * Top-level blocks (paragraphs, headings, tables, images, lists) are placed one by one;
 * a block that does not fit moves whole to the next sheet. A single block taller than
 * a sheet stays on one (taller) sheet rather than being cut.
 */
/** fill: scale the sheets UP to the full width too (full screen). Otherwise only shrink on narrow screens. */
export default function A4Pages({ html, fill = false }) {
  const deskRef = useRef(null);
  const sheetsRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [count, setCount] = useState(0);

  // Fit the sheet width to the desk's inner width
  useLayoutEffect(() => {
    const desk = deskRef.current;
    const fit = () => {
      const cs = getComputedStyle(desk);
      const inner = desk.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const z = inner / SHEET_PX;
      setZoom(fill ? z : Math.min(1, z));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(desk);
    return () => ro.disconnect();
  }, [fill]);

  // Split content into sheets. Done directly in the DOM: it needs real measured heights.
  useLayoutEffect(() => {
    const root = sheetsRef.current;
    let cancelled = false;
    let timer = null;
    let runs = 0;

    const layout = () => {
      if (cancelled || runs >= MAX_RUNS) return;
      runs += 1;
      root.textContent = '';

      const src = document.createElement('div');
      src.innerHTML = html;
      const blocks = Array.from(src.childNodes)
        .filter((n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent.trim()));

      let body = null;
      let limit = 0;
      const newSheet = () => {
        const sheet = document.createElement('section');
        sheet.className = 'a4-sheet';
        body = document.createElement('div');
        body.className = 'article-body a4-body';
        sheet.appendChild(body);
        root.appendChild(sheet);
        if (!limit) limit = body.clientHeight; // usable height of one sheet
      };

      newSheet();
      for (const block of blocks) {
        body.appendChild(block);
        if (body.childNodes.length > 1 && body.scrollHeight > limit + 1) {
          body.removeChild(block);
          newSheet();
          body.appendChild(block);
        }
      }

      const sheets = Array.from(root.children);
      sheets.forEach((sheet, i) => {
        sheet.setAttribute('aria-label', `Page ${i + 1} of ${sheets.length}`);
        const foot = document.createElement('div');
        foot.className = 'a4-foot';
        foot.setAttribute('aria-hidden', 'true');
        foot.textContent = `${i + 1} / ${sheets.length}`;
        sheet.appendChild(foot);
      });
      setCount(sheets.length);

      // Images that finish loading later change heights: lay out again once they arrive.
      root.querySelectorAll('img').forEach((img) => {
        if (!img.complete) img.addEventListener('load', schedule, { once: true });
      });
    };

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(layout, 120);
    }

    layout();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [html]);

  return (
    <div className="a4-desk" ref={deskRef}>
      <div className="a4-sheets" ref={sheetsRef} style={{ zoom }} />
      {count > 0 && <p className="a4-count muted small">{count} {count === 1 ? 'page' : 'pages'} (A4)</p>}
    </div>
  );
}
