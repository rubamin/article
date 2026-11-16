import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../api';
import SharePanel from '../components/SharePanel';
import { downloadCsv, formatDateTime, formatDuration } from '../utils/format';

// Accepts lines pasted from Excel (tab separated) or typed as "Name, email, Department"
function parseRecipients(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', email = '', department = ''] = line.split(/\t|,/).map((p) => p.trim());
      return { name, email, department };
    });
}

function RecipientDetail({ recipientId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    adminApi.recipient(recipientId).then(setData).catch((e) => setError(e.message));
  }, [recipientId]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div className="detail">
      <div>
        <h4>Each time the article was opened</h4>
        {data.sessions.length === 0 ? (
          <p className="muted">Not opened yet.</p>
        ) : (
          <table className="table compact">
            <thead>
              <tr><th>Opened</th><th>Closed / last seen</th><th className="num">On page</th><th className="num">Away</th><th className="num">Left page</th><th className="num">Total open</th><th className="num">Scrolled</th></tr>
            </thead>
            <tbody>
              {data.sessions.map((s, i) => (
                <tr key={i}>
                  <td>{formatDateTime(s.openedAt)}</td>
                  <td>{formatDateTime(s.closedAt || s.lastSeenAt)}{!s.closedAt && <span className="muted"> (no close signal)</span>}</td>
                  <td className="num">{formatDuration(s.activeSeconds)}</td>
                  <td className="num">{formatDuration(s.awaySeconds)}</td>
                  <td className="num">{s.awayCount ? `${s.awayCount}×` : '—'}</td>
                  <td className="num">{formatDuration(s.openSeconds)}</td>
                  <td className="num">{s.maxScrollPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <h4>Answers</h4>
        {data.answers.length === 0 ? (
          <p className="muted">No answers submitted yet.</p>
        ) : (
          <ol className="answers">
            {data.answers.map((a) => (
              <li key={a.order}>
                <p className="a-q">{a.question}</p>
                {a.type === 'MCQ' ? (
                  <p className={a.isCorrect ? 'ok' : 'bad'}>
                    {a.selectedOption} {a.isCorrect ? '— correct' : `— correct answer: ${a.correctOption}`}
                  </p>
                ) : (
                  <p className="a-text">{a.answerText}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export default function ArticleReport() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState('');
  const [openRow, setOpenRow] = useState(null);
  const [copied, setCopied] = useState(null);

  const load = useCallback(() => {
    adminApi.report(id).then(setReport).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    // Refresh every 30 s so new opens show up while the page is open
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function toggleShare(active) {
    try {
      await adminApi.setShare(id, active);
      setReport((r) => ({ ...r, article: { ...r.article, shareActive: active } }));
    } catch (e) {
      setError(e.message);
    }
  }

  async function addRecipients(e) {
    e.preventDefault();
    setAddMsg('');
    setError('');
    const list = parseRecipients(paste);
    if (!list.length) return;
    setAdding(true);
    try {
      const r = await adminApi.addRecipients(id, list);
      setAddMsg(`Added ${r.added}.${r.skipped ? ` Skipped ${r.skipped} already on the list.` : ''}`);
      setPaste('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function copy(text, key) {
    try { await navigator.clipboard.writeText(text); } catch { window.prompt('Copy this', text); }
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  function exportCsv() {
    const rows = [[
      'Name', 'Email', 'Department', 'Joined via', 'Personal link', 'Times opened', 'First opened', 'Last opened',
      'Time on page (sec)', 'Away time (sec)', 'Times left page', 'Total open time (sec)', 'Max scroll %',
      'Submitted at', 'MCQ correct', 'MCQ total',
    ]];
    report.recipients.forEach((r) => rows.push([
      r.name, r.email, r.department, r.source === 'LINK' ? 'Share link' : 'Invited', r.link, r.openCount,
      formatDateTime(r.firstOpenedAt), formatDateTime(r.lastOpenedAt),
      r.totalActiveSeconds, r.totalAwaySeconds, r.totalAwayCount, r.totalOpenSeconds, r.maxScrollPct,
      r.submittedAt ? formatDateTime(r.submittedAt) : '', r.mcqCorrect ?? '', r.mcqTotal ?? '',
    ]));
    downloadCsv(`${report.article.title.replace(/[^\w-]+/g, '_')}_report.csv`, rows);
  }

  if (error && !report) return <p className="error">{error}</p>;
  if (!report) return <p className="muted">Loading report…</p>;

  const { article } = report;
  const rs = report.recipients;
  const opened = rs.filter((r) => r.openCount > 0);
  const submitted = rs.filter((r) => r.submittedAt);
  const totalOpens = rs.reduce((s, r) => s + r.openCount, 0);
  const avgReading = opened.length ? opened.reduce((s, r) => s + r.totalActiveSeconds, 0) / opened.length : 0;
  const avgAway = opened.length ? opened.reduce((s, r) => s + r.totalAwaySeconds, 0) / opened.length : 0;
  const avgLeaves = opened.length ? opened.reduce((s, r) => s + r.totalAwayCount, 0) / opened.length : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/admin" className="back">My articles</Link>
          <h1>{article.title}</h1>
        </div>
        <div className="head-actions">
          <Link className="btn ghost" to={`/admin/articles/${id}/edit`}>Edit article</Link>
          <button className="btn ghost" onClick={exportCsv} disabled={!rs.length}>Export to Excel (CSV)</button>
        </div>
      </div>

      <SharePanel title={article.title} link={article.shareLink} active={article.shareActive} onToggle={toggleShare} />

      <dl className="stats">
        <div><dt>People who opened</dt><dd>{opened.length}</dd></div>
        <div><dt>Total opens</dt><dd>{totalOpens}</dd></div>
        <div><dt>Avg. time on page</dt><dd>{formatDuration(avgReading)}</dd></div>
        <div><dt>Avg. time away</dt><dd>{formatDuration(avgAway)}</dd></div>
        <div><dt>Avg. times left</dt><dd>{opened.length ? avgLeaves.toFixed(1).replace(/\.0$/, '') : '—'}</dd></div>
        <div><dt>Answered</dt><dd>{submitted.length}</dd></div>
      </dl>
      {error && <p className="error">{error}</p>}

      {rs.length === 0 ? (
        <div className="empty"><p>Nobody has opened this article yet. Copy the link above and share it.</p></div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Reader</th>
                  <th>Joined via</th>
                  <th className="num">Opened</th>
                  <th>Last opened</th>
                  <th className="num">On page</th>
                  <th className="num">Away</th>
                  <th className="num">Left page</th>
                  <th className="num">Scrolled</th>
                  <th>Answers</th>
                </tr>
              </thead>
              <tbody>
                {rs.map((r) => (
                  <Fragment key={r.recipientId}>
                    <tr
                      className={`clickable ${openRow === r.recipientId ? 'expanded' : ''}`}
                      onClick={() => setOpenRow(openRow === r.recipientId ? null : r.recipientId)}
                    >
                      <td>
                        <div className="strong">{r.name}</div>
                        <div className="muted small">{r.email}{r.department ? ` — ${r.department}` : ''}</div>
                      </td>
                      <td>{r.source === 'LINK' ? 'Share link' : 'Invited'}</td>
                      <td className="num">{r.openCount ? `${r.openCount}×` : <span className="muted">Not yet</span>}</td>
                      <td>{formatDateTime(r.lastOpenedAt)}</td>
                      <td className="num">{formatDuration(r.totalActiveSeconds)}</td>
                      <td className="num">{formatDuration(r.totalAwaySeconds)}</td>
                      <td className="num">{r.totalAwayCount ? `${r.totalAwayCount}×` : '—'}</td>
                      <td className="num">{r.openCount ? `${r.maxScrollPct}%` : '—'}</td>
                      <td>
                        {r.submittedAt
                          ? <span className="pill done">{r.mcqCorrect}/{r.mcqTotal} correct</span>
                          : <span className="pill">Pending</span>}
                      </td>
                    </tr>
                    {openRow === r.recipientId && (
                      <tr className="detail-row">
                        <td colSpan={9}><RecipientDetail recipientId={r.recipientId} /></td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small legend">
            “On page” counts only time the article tab was in front and the browser window was active.
            “Away” is time the article was open while the reader was on another tab, window or app;
            “Left page” is how many times they went away. Click a row for every open (with total open time) and the answers.
          </p>
        </>
      )}

      <details className="invite">
        <summary>Invite specific people with personal links (optional)</summary>
        <form onSubmit={addRecipients}>
          <p className="muted small">
            Each person gets their own link and is not asked for name or email. Useful when you must send to a fixed list.
          </p>
          <label className="field">
            <span>One per line: Name, Email, Department (you can paste columns from Excel)</span>
            <textarea
              rows={4}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Ravi Patel, ravi.patel@company.com, Zinc\nAnita Shah, anita.shah@company.com, Corporate'}
            />
          </label>
          <div className="add-foot">
            {addMsg && <span className="ok">{addMsg}</span>}
            <button className="btn primary" disabled={adding || !paste.trim()}>
              {adding ? 'Adding…' : 'Add people and create links'}
            </button>
          </div>
          {rs.some((r) => r.source === 'INVITE') && (
            <div className="invite-links">
              <button
                type="button"
                className="btn ghost small"
                onClick={() => copy(rs.filter((r) => r.source === 'INVITE')
                  .map((r) => `${r.name}\t${r.email}\t${r.link}`).join('\n'), 'all')}
              >
                {copied === 'all' ? 'Copied' : 'Copy all personal links'}
              </button>
            </div>
          )}
        </form>
      </details>
    </>
  );
}
