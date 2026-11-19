import { useMemo, useRef, useState } from 'react';
import { publicApi } from '../api';
import { FILE_KIND_EXT, GRID_TYPES } from '../utils/questionTypes';

const shuffled = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Is this answer empty? (for the "required" check before sending)
function isEmpty(q, a) {
  if (!a) return q.type !== 'RANKING';
  switch (q.type) {
    case 'SHORT': case 'TEXT': return !a.text || !a.text.trim();
    case 'MCQ': case 'DROPDOWN': return a.other ? !(a.otherText || '').trim() : !a.optionId;
    case 'CHECKBOX': return !(a.optionIds || []).length && !(a.other && (a.otherText || '').trim());
    case 'SCALE': case 'RATING': case 'NPS': return a.value === undefined || a.value === null;
    case 'GRID': case 'LIKERT': return Object.keys(a.rows || {}).length < q.settings.rows.length;
    case 'CHECKGRID': return q.settings.rows.some((_, r) => !((a.rows || {})[r] || []).length);
    case 'DATE': case 'TIME': return !a.value;
    case 'FILE': return !(a.files || []).length;
    default: return false;
  }
}

/* ---------- one input per type ---------- */

function Choice({ type, name, checked, onChange, children }) {
  return (
    <label className={`choice ${checked ? 'picked' : ''}`}>
      <input type={type} name={name} checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

function OtherChoice({ type, name, a, onPick, onText }) {
  const inputRef = useRef(null);
  return (
    <label className={`choice other ${a.other ? 'picked' : ''}`}>
      <input type={type} name={name} checked={!!a.other} onChange={(e) => { onPick(e.target.checked); if (e.target.checked) setTimeout(() => inputRef.current?.focus(), 0); }} />
      <span>Other:</span>
      <input
        ref={inputRef}
        className="other-input"
        value={a.otherText || ''}
        maxLength={500}
        placeholder="Your answer"
        aria-label="Other answer"
        onChange={(e) => onText(e.target.value)}
        onFocus={() => !a.other && onPick(true)}
      />
    </label>
  );
}

const SYMBOL = { star: '★', heart: '♥', thumb: '👍' };

function ScaleButtons({ values, value, onPick, name, minLabel, maxLabel, className = '' }) {
  return (
    <div className={`scale ${className}`}>
      <div className="scale-row" role="radiogroup" aria-label={name}>
        {values.map((v) => (
          <label key={v} className={`scale-pt ${value === v ? 'on' : ''}`}>
            <input type="radio" name={name} checked={value === v} onChange={() => onPick(v)} />
            <span>{v}</span>
          </label>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="scale-labels"><span>{minLabel}</span><span>{maxLabel}</span></div>
      )}
    </div>
  );
}

function Rating({ q, value, onPick }) {
  const [hover, setHover] = useState(0);
  const { levels, symbol } = q.settings;
  if (symbol === 'number') {
    return <ScaleButtons values={range(1, levels)} value={value} onPick={onPick} name={`q${q.questionId}`} />;
  }
  const lit = hover || value || 0;
  return (
    <div className={`rating sym-${symbol}`} role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
      {range(1, levels).map((v) => (
        <label key={v} className={`rating-pt ${v <= lit ? 'on' : ''}`} onMouseEnter={() => setHover(v)} title={`${v} of ${levels}`}>
          <input type="radio" name={`q${q.questionId}`} checked={value === v} onChange={() => onPick(v)} />
          <span aria-hidden="true">{SYMBOL[symbol] || '★'}</span>
          <span className="sr-only">{v} of {levels}</span>
        </label>
      ))}
      {value ? <span className="rating-val muted small">{value} / {levels}</span> : null}
    </div>
  );
}

function Grid({ q, a, set }) {
  const { rows, columns } = q.settings;
  const multi = q.type === 'CHECKGRID';
  const sel = (a && a.rows) || {};
  const pick = (r, c, checked) => {
    const next = { ...sel };
    if (multi) {
      const cur = new Set(next[r] || []);
      if (checked) cur.add(c); else cur.delete(c);
      next[r] = [...cur].sort((x, y) => x - y);
    } else next[r] = c;
    set({ rows: next });
  };
  return (
    <div className="grid-wrap">
      <table className="q-grid">
        <thead>
          <tr><th aria-hidden="true" />{columns.map((c, ci) => <th key={ci} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              <th scope="row">{row}</th>
              {columns.map((col, ci) => {
                const checked = multi ? (sel[ri] || []).includes(ci) : sel[ri] === ci;
                return (
                  <td key={ci}>
                    <label className="grid-cell">
                      <input
                        type={multi ? 'checkbox' : 'radio'}
                        name={`q${q.questionId}-r${ri}`}
                        checked={checked}
                        onChange={(e) => pick(ri, ci, e.target.checked)}
                      />
                      <span className="sr-only">{row}: {col}</span>
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ranking({ q, a, set }) {
  const order = (a && a.order) || q.options.map((o) => o.optionId);
  const byId = new Map(q.options.map((o) => [o.optionId, o]));
  const move = (i, d) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set({ order: next });
  };
  return (
    <ol className="ranking">
      {order.map((id, i) => (
        <li key={id} className="rank-item">
          <span className="rank-num">{i + 1}</span>
          <span className="rank-text">{byId.get(id)?.text}</span>
          <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move “${byId.get(id)?.text}” up`}>↑</button>
          <button type="button" className="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move “${byId.get(id)?.text}” down`}>↓</button>
        </li>
      ))}
    </ol>
  );
}

function FileAnswer({ q, a, set, token, preview }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const files = (a && a.files) || [];
  const { kinds, maxFiles, maxSizeMb } = q.settings;
  const exts = kinds.flatMap((k) => FILE_KIND_EXT[k] || []);

  async function pick(e) {
    const list = [...(e.target.files || [])];
    e.target.value = '';
    if (!list.length) return;
    setErr('');
    const room = maxFiles - files.length;
    if (list.length > room) { setErr(`You can add ${room} more file(s).`); return; }
    setBusy(true);
    const added = [];
    try {
      for (const f of list) {
        if (f.size > maxSizeMb * 1024 * 1024) throw new Error(`“${f.name}” is larger than ${maxSizeMb} MB.`);
        added.push(await publicApi.uploadFile(token, q.questionId, f));
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      if (added.length) set({ files: [...files, ...added] });
      setBusy(false);
    }
  }

  function remove(fileId) {
    set({ files: files.filter((f) => f.fileId !== fileId) });
    publicApi.removeFile(token, fileId).catch(() => {});
  }

  return (
    <div className="file-answer">
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.fileId}>
              <span className="file-name">📄 {f.name}</span>
              <span className="muted small">{kb(f.size)}</span>
              <button type="button" className="btn ghost small" onClick={() => remove(f.fileId)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {files.length < maxFiles && (
        <button type="button" className="btn ghost" onClick={() => ref.current.click()} disabled={busy || preview}>
          {busy ? 'Uploading…' : files.length ? 'Add another file' : 'Add file'}
        </button>
      )}
      <input ref={ref} type="file" hidden multiple={maxFiles > 1} accept={exts.map((x) => '.' + x).join(',')} onChange={pick} />
      <p className="muted small">
        Up to {maxFiles} file{maxFiles > 1 ? 's' : ''}, {maxSizeMb} MB each. Allowed: {exts.map((x) => '.' + x).join(', ')}
      </p>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

function QuestionInput({ q, a, set, token, preview }) {
  const name = `q${q.questionId}`;
  const cur = a || {};
  switch (q.type) {
    case 'SHORT':
      return <input className="short-input" maxLength={500} placeholder="Your answer" value={cur.text || ''} onChange={(e) => set({ text: e.target.value })} />;
    case 'TEXT':
      return <textarea rows={4} maxLength={4000} placeholder="Write your answer" value={cur.text || ''} onChange={(e) => set({ text: e.target.value })} />;
    case 'MCQ':
      return (
        <div className="choices">
          {q.options.map((o) => (
            <Choice key={o.optionId} type="radio" name={name} checked={!cur.other && cur.optionId === o.optionId} onChange={() => set({ optionId: o.optionId })}>
              {o.text}
            </Choice>
          ))}
          {q.settings.other && (
            <OtherChoice type="radio" name={name} a={cur}
              onPick={(on) => on && set({ other: true, otherText: cur.otherText || '' })}
              onText={(t) => set({ other: true, otherText: t })} />
          )}
        </div>
      );
    case 'CHECKBOX': {
      const ids = cur.optionIds || [];
      const toggle = (id, on) => set({ ...cur, optionIds: on ? [...ids, id] : ids.filter((x) => x !== id) });
      return (
        <div className="choices">
          {q.options.map((o) => (
            <Choice key={o.optionId} type="checkbox" name={name} checked={ids.includes(o.optionId)} onChange={(e) => toggle(o.optionId, e.target.checked)}>
              {o.text}
            </Choice>
          ))}
          {q.settings.other && (
            <OtherChoice type="checkbox" name={name} a={cur}
              onPick={(on) => set({ ...cur, other: on })}
              onText={(t) => set({ ...cur, other: true, otherText: t })} />
          )}
        </div>
      );
    }
    case 'DROPDOWN':
      return (
        <select className="dropdown" value={cur.optionId || ''} onChange={(e) => set(e.target.value ? { optionId: Number(e.target.value) } : null)}>
          <option value="">Choose</option>
          {q.options.map((o) => <option key={o.optionId} value={o.optionId}>{o.text}</option>)}
        </select>
      );
    case 'SCALE':
      return (
        <ScaleButtons values={range(q.settings.min, q.settings.max)} value={cur.value} onPick={(v) => set({ value: v })}
          name={name} minLabel={q.settings.minLabel} maxLabel={q.settings.maxLabel} />
      );
    case 'NPS':
      return (
        <ScaleButtons className="nps" values={range(0, 10)} value={cur.value} onPick={(v) => set({ value: v })}
          name={name} minLabel={q.settings.minLabel} maxLabel={q.settings.maxLabel} />
      );
    case 'RATING':
      return <Rating q={q} value={cur.value} onPick={(v) => set({ value: v })} />;
    case 'GRID': case 'CHECKGRID': case 'LIKERT':
      return <Grid q={q} a={a} set={set} />;
    case 'RANKING':
      return <Ranking q={q} a={a} set={set} />;
    case 'DATE':
      return <input className="date-input" type={q.settings.includeTime ? 'datetime-local' : 'date'} value={cur.value || ''} onChange={(e) => set({ value: e.target.value })} />;
    case 'TIME':
      return <input className="date-input" type="time" value={cur.value || ''} onChange={(e) => set({ value: e.target.value })} />;
    case 'FILE':
      return <FileAnswer q={q} a={a} set={set} token={token} preview={preview} />;
    default:
      return null;
  }
}

// What the server expects for each type
function toPayload(q, a) {
  if (q.type === 'RANKING') return { order: (a && a.order) || q.options.map((o) => o.optionId) };
  if (!a) return {};
  if (q.type === 'FILE') return { fileIds: (a.files || []).map((f) => f.fileId) };
  return a;
}

/* ---------- the quiz ---------- */
/** preview: admin view, nothing is sent. hideSubmit: leave out the submit button (PDF). */
export default function QuizForm({ token, quizTitle, quizNote, questions: rawQuestions, onDone, preview = false, hideSubmit = false }) {
  // Shuffle once per page load for questions that ask for it
  const questions = useMemo(() => rawQuestions.map((q) => (q.shuffle ? { ...q, options: shuffled(q.options) } : q)), [rawQuestions]);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [badQ, setBadQ] = useState(null);

  const setAnswer = (qid, value) => {
    setAnswers((s) => ({ ...s, [qid]: value }));
    if (badQ === qid) setBadQ(null);
  };
  const scrollTo = (qid) => document.getElementById(`q-${qid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const allRequired = questions.every((q) => q.required);
  const note = quizNote || (allRequired
    ? `Answer all ${questions.length} question${questions.length > 1 ? 's' : ''}. You can submit only once.`
    : 'Questions marked * are required. You can submit only once.');

  async function submit(e) {
    e.preventDefault();
    if (preview) return;
    setError('');
    const missing = questions.findIndex((q) => q.required && isEmpty(q, answers[q.questionId]));
    if (missing !== -1) {
      const q = questions[missing];
      setBadQ(q.questionId);
      setError(GRID_TYPES.includes(q.type) || q.type === 'CHECKGRID'
        ? `Answer every row in question ${missing + 1} before submitting.`
        : `Answer question ${missing + 1} before submitting.`);
      scrollTo(q.questionId);
      return;
    }
    setSubmitting(true);
    try {
      await publicApi.submit(token, questions.map((q) => ({ questionId: q.questionId, ...toPayload(q, answers[q.questionId]) })));
      onDone();
    } catch (err) {
      if (err.status === 409) onDone();
      else {
        setError(err.message);
        const m = /^Question (\d+)|question (\d+)/.exec(err.message);
        const n = m && Number(m[1] || m[2]);
        if (n && questions[n - 1]) { setBadQ(questions[n - 1].questionId); scrollTo(questions[n - 1].questionId); }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2 id="quiz-title">{quizTitle}</h2>
      <p className="muted quiz-note">{note}</p>

      {questions.map((q, i) => (
        <fieldset key={q.questionId} id={`q-${q.questionId}`} className={`quiz-q type-${q.type.toLowerCase()} ${badQ === q.questionId ? 'needs-answer' : ''}`}>
          <legend>
            <span className="q-num">{i + 1}.</span> {q.text}
            {q.required && <span className="req" aria-label="required"> *</span>}
          </legend>
          {q.description && <p className="q-help muted">{q.description}</p>}
          {q.type === 'CHECKBOX' && <p className="q-help muted small">Select all that apply.</p>}
          {q.type === 'RANKING' && <p className="q-help muted small">Use the arrows to put the items in order (1 = top).</p>}
          <QuestionInput q={q} a={answers[q.questionId]} set={(v) => setAnswer(q.questionId, v)} token={token} preview={preview} />
        </fieldset>
      ))}

      {error && <p className="error">{error}</p>}
      {!hideSubmit && (
        <button className="btn primary large" disabled={submitting || preview} title={preview ? 'Preview only: answers are not sent' : undefined}>
          {submitting ? 'Submitting…' : 'Submit answers'}
        </button>
      )}
    </form>
  );
}
