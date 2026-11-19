import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api';
import { formatDateTime } from '../utils/format';
import { TYPE_LABEL } from '../utils/questionTypes';

/* Reader columns the admin can pick. kind: how the value is written to Excel. */
const COLUMNS = [
  { key: 'name', label: 'Name', on: true, value: (r) => r.name },
  { key: 'email', label: 'Email', on: true, value: (r) => r.email },
  { key: 'department', label: 'Department', on: true, value: (r) => r.department },
  { key: 'source', label: 'Joined via', on: false, value: (r) => (r.source === 'LINK' ? 'Share link' : 'Invited') },
  { key: 'link', label: 'Personal link', on: false, value: (r) => r.link },
  { key: 'openCount', label: 'Times opened', on: true, kind: 'num', value: (r) => r.openCount },
  { key: 'firstOpenedAt', label: 'First opened', on: false, kind: 'date', value: (r) => r.firstOpenedAt },
  { key: 'lastOpenedAt', label: 'Last opened', on: true, kind: 'date', value: (r) => r.lastOpenedAt },
  { key: 'active', label: 'Time on page (sec)', on: true, kind: 'num', value: (r) => r.totalActiveSeconds },
  { key: 'away', label: 'Away time (sec)', on: false, kind: 'num', value: (r) => r.totalAwaySeconds },
  { key: 'leaves', label: 'Times left page', on: false, kind: 'num', value: (r) => r.totalAwayCount },
  { key: 'open', label: 'Total open time (sec)', on: false, kind: 'num', value: (r) => r.totalOpenSeconds },
  { key: 'scroll', label: 'Max scroll %', on: false, kind: 'num', value: (r) => r.maxScrollPct },
  { key: 'submittedAt', label: 'Submitted at', on: true, kind: 'date', value: (r) => r.submittedAt },
  { key: 'correct', label: 'Correct answers', on: true, kind: 'num', value: (r) => r.mcqCorrect },
  { key: 'scored', label: 'Scored questions', on: false, kind: 'num', value: (r) => r.mcqTotal },
];

const STORE_KEY = 'atExcelColumns';
const loadSaved = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
};
const save = (cols) => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cols)); } catch { /* private mode */ }
};

const PREVIEW_ROWS = 50;
const fileName = (title) => `${String(title || 'article').replace(/[^\w-]+/g, '_')}_report.xlsx`;
// Excel has no time zone: store the local clock time so it matches what the report shows
const localDate = (v) => {
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
};

/** Builds the sheets (header + rows of plain values) from the current choices. */
function buildSheets({ recipients, questions, answers, cols, qIds, withResult, withQuestionSheet }) {
  const colDefs = COLUMNS.filter((c) => cols.includes(c.key));
  const qs = questions.filter((q) => qIds.includes(q.questionId));

  const header = colDefs.map((c) => ({ label: c.label, kind: c.kind }));
  qs.forEach((q) => {
    header.push({ label: `Q${q.order}. ${q.text}`, kind: 'answer' });
    if (withResult && q.correctOption) header.push({ label: `Q${q.order} result`, kind: 'result' });
  });

  const rows = recipients.map((r) => {
    const row = colDefs.map((c) => c.value(r) ?? '');
    const mine = answers[r.recipientId] || {};
    qs.forEach((q) => {
      const a = mine[q.questionId];
      row.push(a ? a.text : '');
      if (withResult && q.correctOption) row.push(!a ? '' : a.isCorrect === true ? 'Correct' : a.isCorrect === false ? 'Wrong' : '');
    });
    return row;
  });

  const sheets = [{ name: 'Readers', header, rows }];
  if (withQuestionSheet && qs.length) {
    sheets.push({
      name: 'Questions',
      header: [{ label: 'No.' , kind: 'num' }, { label: 'Question' }, { label: 'Type' }, { label: 'Correct answer' }],
      rows: qs.map((q) => [q.order, q.text, TYPE_LABEL[q.type] || q.type, q.correctOption || '']),
    });
  }
  return sheets;
}

const showCell = (v, kind) => {
  if (v === '' || v === null || v === undefined) return '';
  return kind === 'date' ? formatDateTime(v) : String(v);
};

async function writeXlsx(sheets, name) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(s.header.map((h) => h.label));
    s.rows.forEach((row) => {
      ws.addRow(row.map((v, i) => {
        if (v === '' || v === null || v === undefined) return null;
        return s.header[i].kind === 'date' ? localDate(v) : v;
      }));
    });

    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.height = 32;
    head.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D2B38' } };
    });

    s.header.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      const longest = Math.max(h.label.length, ...s.rows.map((r) => showCell(r[i], h.kind).length));
      const wide = h.kind === 'answer' || s.name === 'Questions';
      col.width = Math.min(wide ? 50 : 32, Math.max(10, longest + 2));
      if (h.kind === 'date') col.numFmt = 'dd-mmm-yyyy hh:mm';
      if (wide) col.alignment = { vertical: 'top', wrapText: true };
      if (h.kind === 'result') {
        col.eachCell((cell, rowNo) => {
          if (rowNo === 1) return;
          if (cell.value === 'Correct') cell.font = { color: { argb: 'FF1F7A3A' }, bold: true };
          if (cell.value === 'Wrong') cell.font = { color: { argb: 'FFB42318' }, bold: true };
        });
      }
    });
    if (s.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.header.length } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Excel export dialog: choose reader columns and which questions (with each reader's answers),
 * see the sheet as it will be, then download a real .xlsx file.
 */
export default function ExcelExport({ articleId, title, recipients, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [cols, setCols] = useState(() => {
    const saved = loadSaved();
    return Array.isArray(saved) ? saved.filter((k) => COLUMNS.some((c) => c.key === k)) : COLUMNS.filter((c) => c.on).map((c) => c.key);
  });
  const [qIds, setQIds] = useState([]);
  const [withResult, setWithResult] = useState(true);
  const [withQuestionSheet, setWithQuestionSheet] = useState(false);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.answers(articleId).then(setData).catch((e) => setError(e.message));
  }, [articleId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const questions = (data && data.questions) || [];
  const anyScored = questions.some((q) => qIds.includes(q.questionId) && q.correctOption);

  const sheets = useMemo(() => (data ? buildSheets({
    recipients, questions, answers: data.answers, cols, qIds, withResult, withQuestionSheet,
  }) : []), [data, recipients, questions, cols, qIds, withResult, withQuestionSheet]);
  const sheet = sheets[Math.min(tab, sheets.length - 1)];
  const nothing = !sheets.length || !sheets[0].header.length;

  const toggle = (list, set, key, on) => set(on ? [...list, key] : list.filter((k) => k !== key));
  function setColumns(next) {
    // keep the order of COLUMNS, whatever order they were ticked in
    const ordered = COLUMNS.map((c) => c.key).filter((k) => next.includes(k));
    setCols(ordered);
    save(ordered);
  }
  const setQuestions = (next) => setQIds(questions.map((q) => q.questionId).filter((k) => next.includes(k)));

  async function download() {
    setBusy(true);
    setError('');
    try {
      await writeXlsx(sheets, fileName(title));
    } catch (e) {
      setError(`Could not create the Excel file: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal xl-modal" role="dialog" aria-modal="true" aria-labelledby="xl-title">
        <div className="modal-head">
          <h2 id="xl-title">Export to Excel</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="xl-body">
          <aside className="xl-options">
            <fieldset>
              <legend>Columns</legend>
              <div className="xl-quick">
                <button type="button" className="link-btn" onClick={() => setColumns(COLUMNS.map((c) => c.key))}>All</button>
                <button type="button" className="link-btn" onClick={() => setColumns([])}>None</button>
              </div>
              {COLUMNS.map((c) => (
                <label key={c.key} className="view-check">
                  <input type="checkbox" checked={cols.includes(c.key)} onChange={(e) => setColumns(e.target.checked ? [...cols, c.key] : cols.filter((k) => k !== c.key))} />
                  <span>{c.label}</span>
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>Questions and answers</legend>
              {!data && !error && <p className="muted small">Loading questions…</p>}
              {data && !questions.length && <p className="muted small">This article has no questions.</p>}
              {questions.length > 0 && (
                <>
                  <div className="xl-quick">
                    <button type="button" className="link-btn" onClick={() => setQuestions(questions.map((q) => q.questionId))}>All</button>
                    <button type="button" className="link-btn" onClick={() => setQuestions([])}>None</button>
                  </div>
                  {questions.map((q) => (
                    <label key={q.questionId} className="view-check xl-q">
                      <input type="checkbox" checked={qIds.includes(q.questionId)} onChange={(e) => toggle(qIds, setQuestions, q.questionId, e.target.checked)} />
                      <span>Q{q.order}. {q.text}</span>
                    </label>
                  ))}
                  <hr />
                  <label className="view-check" title="Adds a Correct / Wrong column after each scored question">
                    <input type="checkbox" checked={withResult} disabled={!anyScored} onChange={(e) => setWithResult(e.target.checked)} />
                    <span>Correct / Wrong column for scored questions</span>
                  </label>
                  <label className="view-check">
                    <input type="checkbox" checked={withQuestionSheet} disabled={!qIds.length} onChange={(e) => setWithQuestionSheet(e.target.checked)} />
                    <span>Extra sheet with the questions and correct answers</span>
                  </label>
                </>
              )}
            </fieldset>
          </aside>

          <section className="xl-preview" aria-label="Preview">
            <div className="xl-preview-head">
              <strong>Preview</strong>
              <span className="muted small">
                {sheets.length ? `${sheets[0].rows.length} reader${sheets[0].rows.length === 1 ? '' : 's'} · ${sheets[0].header.length} column${sheets[0].header.length === 1 ? '' : 's'}` : ''}
              </span>
            </div>
            {sheets.length > 1 && (
              <div className="seg xl-tabs" role="tablist">
                {sheets.map((s, i) => (
                  <button key={s.name} type="button" role="tab" aria-pressed={tab === i} onClick={() => setTab(i)}>{s.name}</button>
                ))}
              </div>
            )}
            {nothing ? (
              <p className="muted xl-empty">Choose at least one column or question.</p>
            ) : sheet && (
              <div className="xl-grid-wrap">
                <table className="xl-grid">
                  <thead>
                    <tr>
                      <th className="xl-rn" aria-hidden="true" />
                      {sheet.header.map((h, i) => <th key={i} title={h.label}>{h.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, PREVIEW_ROWS).map((row, ri) => (
                      <tr key={ri}>
                        <td className="xl-rn">{ri + 2}</td>
                        {row.map((v, ci) => {
                          const kind = sheet.header[ci].kind;
                          const t = showCell(v, kind);
                          return (
                            <td key={ci} className={`${kind === 'num' ? 'num' : ''} ${t === 'Correct' && kind === 'result' ? 'ok' : ''} ${t === 'Wrong' && kind === 'result' ? 'bad' : ''}`} title={t}>
                              {t}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sheet.rows.length > PREVIEW_ROWS && (
                  <p className="muted small xl-more">Showing the first {PREVIEW_ROWS} of {sheet.rows.length} rows. The file has all of them.</p>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="modal-foot">
          {error && <p className="error small inline">{error}</p>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={download} disabled={busy || nothing || !data}>
            {busy ? 'Creating file…' : 'Download Excel (.xlsx)'}
          </button>
        </div>
      </div>
    </div>
  );
}
