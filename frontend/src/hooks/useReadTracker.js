import { useEffect } from 'react';
import { beacon, publicApi } from '../api';

const HEARTBEAT_MS = 15000;
const CHECK_MS = 1000;

/**
 * Records one "view session" per page open.
 *
 * The reader is ACTIVE only when the article tab is visible AND the browser window has focus.
 * Visibility alone is not enough: when the reader Alt-Tabs to another app or window, the tab
 * stays "visible" but the window loses focus. (Focus inside an embedded iframe, e.g. a video,
 * still counts as on the page: document.hasFocus() is true for the parent document.)
 *
 * Every switch from active -> away is counted once (tab switch, other app, other window,
 * minimise, phone home screen). Time is split into:
 *   activeDelta - seconds the reader was on the article
 *   awayDelta   - seconds the article was open but the reader was elsewhere
 *   awayCount   - number of times the reader left
 *
 *  - open      -> creates the session (OpenedAt)
 *  - heartbeat -> every 15s while active, and immediately on every leave / return
 *  - pagehide  -> closes the session (ClosedAt)
 */
export function useReadTracker(token, enabled) {
  useEffect(() => {
    if (!enabled || !token) return undefined;

    let sessionId = null;
    let pendingActive = 0;   // seconds counted but not yet sent
    let pendingAway = 0;
    let pendingLeaves = 0;
    let maxScroll = 0;
    let closed = false;

    const isActiveNow = () => document.visibilityState === 'visible' && document.hasFocus();

    let active = isActiveNow();
    let lastTick = Date.now();

    // Add the time since the last tick to the bucket of the CURRENT state.
    const tick = () => {
      const now = Date.now();
      const secs = Math.max(0, (now - lastTick) / 1000);
      if (active) pendingActive += secs; else pendingAway += secs;
      lastTick = now;
    };

    // In full screen the article stage scrolls by itself; otherwise the page does.
    const measureScroll = () => {
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      const el = fs || document.documentElement;
      const seen = el.scrollTop + (fs ? el.clientHeight : window.innerHeight);
      const pct = el.scrollHeight > 0 ? Math.round((seen / el.scrollHeight) * 100) : 100;
      maxScroll = Math.max(maxScroll, Math.min(100, pct));
    };

    const send = (kind) => {
      tick();
      if (!sessionId) return; // nothing to attach to yet; amounts stay pending
      const act = Math.floor(pendingActive);
      const away = Math.floor(pendingAway);
      pendingActive -= act;
      pendingAway -= away;
      const leaves = pendingLeaves;
      pendingLeaves = 0;
      beacon(`/public/${token}/${kind}`, {
        sessionId, activeDelta: act, awayDelta: away, awayCount: leaves, scrollPct: maxScroll,
      });
    };

    // Called on every focus / blur / visibility event and once a second as a safety net.
    const check = () => {
      if (closed) return;
      const now = isActiveNow();
      if (now === active) return;
      tick();                       // close the old state's time first
      if (!now) pendingLeaves += 1; // active -> away = one switch
      active = now;
      send('heartbeat');            // record the leave / return right away
    };
    // During a blur event some browsers still report hasFocus() = true; re-check after it settles.
    const checkSoon = () => setTimeout(check, 0);

    const close = () => {
      if (closed) return;
      closed = true;
      send('close');
    };

    publicApi.open(token)
      .then((r) => { sessionId = r.sessionId; measureScroll(); send('heartbeat'); })
      .catch(() => {}); // tracking failure must never block reading

    const beat = setInterval(() => { check(); if (active) send('heartbeat'); }, HEARTBEAT_MS);
    const poll = setInterval(check, CHECK_MS);
    // capture: scroll events of the full-screen stage do not bubble to the page
    document.addEventListener('scroll', measureScroll, { passive: true, capture: true });
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('blur', checkSoon);
    window.addEventListener('pagehide', close);

    return () => {
      clearInterval(beat);
      clearInterval(poll);
      document.removeEventListener('scroll', measureScroll, { capture: true });
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener('blur', checkSoon);
      window.removeEventListener('pagehide', close);
      close();
    };
  }, [token, enabled]);
}
