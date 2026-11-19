import { useState } from 'react';

// One link per article: copy it or send it through the usual apps.
export default function SharePanel({ title, link, active, onToggle, compact = false }) {
  const [copied, setCopied] = useState(false);
  const [toggling, setToggling] = useState(false);
  const text = `Please read: ${title}`;
  const enc = encodeURIComponent;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copy this link', link); // clipboard blocked (http on some browsers)
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function nativeShare() {
    try { await navigator.share({ title, text, url: link }); } catch { /* user cancelled */ }
  }

  async function toggle() {
    setToggling(true);
    try { await onToggle(!active); } finally { setToggling(false); }
  }

  if (compact) {
    return (
      <button type="button" className="btn ghost small" onClick={copy}>
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    );
  }

  return (
    <section className={`share ${active ? '' : 'closed'}`} aria-labelledby="share-title" data-tour="share-link">
      <div className="share-top">
        <h2 id="share-title">Share link</h2>
        {onToggle && (
          <label className="switch" data-tour="share-toggle">
            <input type="checkbox" checked={active} onChange={toggle} disabled={toggling} />
            <span>{active ? 'Open for new readers' : 'Closed for new readers'}</span>
          </label>
        )}
      </div>
      <p className="muted small">
        Anyone with this link enters their name and email once, then reads the article. Every open is tracked below.
      </p>
      <div className="share-link">
        <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Share link" />
        <button type="button" className="btn primary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
      <div className="share-apps">
        {typeof navigator !== 'undefined' && navigator.share && (
          <button type="button" className="btn ghost small" onClick={nativeShare}>Share…</button>
        )}
        <a className="btn ghost small" href={`mailto:?subject=${enc(title)}&body=${enc(`${text}\n\n${link}`)}`}>Email</a>
        <a className="btn ghost small" href={`https://teams.microsoft.com/share?href=${enc(link)}&msgText=${enc(text)}`} target="_blank" rel="noreferrer">Teams</a>
      </div>
      {!active && <p className="notice small">New people cannot join through this link. People who already joined can still open it.</p>}
    </section>
  );
}
