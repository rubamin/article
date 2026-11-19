import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { authApi } from '../api';
import { TOURS } from './tourSteps';
import './tour.css';

/**
 * Software tour
 * - Each admin page calls usePageTour('<key>', ready) once its data has loaded.
 * - The first time an admin sees a page, its tour opens by itself. Finishing or skipping it is saved
 *   in the database (AdminUsers.ToursSeen), so it does not open again — on any computer.
 * - The "Software tour" button in the top bar starts the current page's tour any time.
 */

const TourContext = createContext(null);
const AUTO_DELAY_MS = 500; // let the page settle (fonts, images) before measuring positions

const isVisible = (el) => !!el && el.getClientRects().length > 0;

function buildSteps(key, ctx) {
  return (TOURS[key] || [])
    .map((s) => ({ ...s, node: s.el ? document.querySelector(s.el) : null }))
    .filter((s) => !s.el || isVisible(s.node))
    .map((s) => ({
      element: s.node || undefined,
      popover: {
        title: typeof s.title === 'function' ? s.title(ctx) : s.title,
        description: typeof s.text === 'function' ? s.text(ctx) : s.text,
        side: s.side,
        align: s.align || 'start',
      },
    }));
}

export function TourProvider({ admin, children }) {
  const [seen, setSeen] = useState(null); // Set of seen tour keys; null = not known (no auto start)
  const [page, setPage] = useState(null); // { key, ready }
  const active = useRef(null); // { driver, key, quiet }

  useEffect(() => {
    let cancelled = false;
    authApi.me()
      .then((r) => { if (!cancelled && Array.isArray(r.toursSeen)) setSeen(new Set(r.toursSeen)); })
      .catch(() => { /* no auto tour if this fails; the button still works */ });
    return () => { cancelled = true; };
  }, []);

  const seenRef = useRef(seen);
  seenRef.current = seen;

  const markSeen = useCallback((key) => {
    if (seenRef.current && seenRef.current.has(key)) return;
    authApi.markTourSeen(key).catch(() => { /* saved next time it is finished */ });
    setSeen((s) => new Set([...(s || []), key]));
  }, []);

  const stop = useCallback((quiet = true) => {
    const a = active.current;
    if (!a) return;
    a.quiet = quiet;
    a.driver.destroy();
  }, []);

  const start = useCallback((key) => {
    if (!key || !TOURS[key]) return;
    stop();
    const firstName = String((admin && admin.fullName) || '').trim().split(/\s+/)[0];
    const steps = buildSteps(key, { firstName });
    if (!steps.length) return;

    const entry = { key, quiet: false, driver: null };
    const d = driver({
      steps,
      animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      showProgress: steps.length > 1,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Finish',
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 6,
      popoverClass: 'at-tour',
      disableActiveInteraction: true, // clicks during the tour must not navigate away
      onPopoverRender: (popover, { state }) => {
        if (state.activeIndex === 0) popover.previousButton.style.display = 'none'; // nothing to go back to
        // "Skip tour" on every step except the last one
        if (state.activeIndex === steps.length - 1) return;
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'at-tour-skip';
        skip.textContent = 'Skip tour';
        skip.addEventListener('click', () => d.destroy());
        popover.footer.insertBefore(skip, popover.footer.firstChild);
      },
      onDestroyed: () => {
        if (active.current === entry) active.current = null;
        if (!entry.quiet) markSeen(key); // finished, skipped or closed with Esc / ✕
      },
    });
    entry.driver = d;
    active.current = entry;
    d.drive();
  }, [admin, markSeen, stop]);

  // Auto start: first visit to a page whose tour this admin has not seen
  useEffect(() => {
    if (!page || !page.ready || !seen || seen.has(page.key)) return undefined;
    const t = setTimeout(() => { if (!active.current) start(page.key); }, AUTO_DELAY_MS);
    return () => clearTimeout(t);
  }, [page, seen, start]);

  // Leaving a page closes its tour without marking it seen
  useEffect(() => () => stop(), [page && page.key, stop]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = { page, setPage, start, stop };
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

/** Call in each admin page: usePageTour('report', !!report) */
export function usePageTour(key, ready) {
  const ctx = useContext(TourContext);
  const setPage = ctx && ctx.setPage;
  useEffect(() => {
    if (!setPage) return undefined;
    setPage({ key, ready: !!ready });
    return () => setPage((p) => (p && p.key === key ? null : p));
  }, [key, ready, setPage]);
}

/** "Software tour" button for the top bar */
export function TourButton() {
  const ctx = useContext(TourContext);
  const page = ctx && ctx.page;
  const canStart = !!(page && page.ready);
  return (
    <button
      type="button"
      className="btn ghost small tour-btn"
      data-tour="tour-button"
      onClick={() => ctx.start(page.key)}
      disabled={!canStart}
      title="Show what each part of this page does"
    >
      <span className="tour-btn-icon" aria-hidden="true">?</span>
      <span className="tour-btn-label">Software tour</span>
    </button>
  );
}
