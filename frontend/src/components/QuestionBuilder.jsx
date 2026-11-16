import {
  TYPE_GROUPS, TYPE_LABEL, OPTION_TYPES, SHUFFLE_TYPES, FILE_KIND_LABELS,
  blankQuestion, changeType, newKey,
} from '../utils/questionTypes';

/* ---------- small editors used inside a question card ---------- */

// Editable list of short texts (grid rows / columns, accepted answers)
function TextList({ items, onChange, placeholder, addLabel, max, min = 1 }) {
  const set = (i, v) => onChange(items.map((x, j) => (j === i ? v : x)));
  return (
    <div className="text-list">
      {items.map((t, i) => (
        <div className="opt-row" key={i}>
          <span className="list-num">{i + 1}.</span>
          <input className="opt-input" value={t} maxLength={300} placeholder={`${placeholder} ${i + 1}`} onChange={(e) => set(i, e.target.value)} />
          {items.length > min && (
            <button type="button" className="icon-btn" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${placeholder} ${i + 1}`}>✕</button>
          )}
        </div>
      ))}
      {items.length < max && (
        <button type="button" className="btn ghost small" onClick={() => onChange([...items, ''])}>{addLabel}</button>
      )}
    </div>
  );
}

function OptionsEditor({ q, maxOptions, update }) {
  const single = q.type === 'MCQ' || q.type === 'DROPDOWN';
  const canMark = q.type !== 'RANKING';
  const setOpt = (i, patch) => update({ options: q.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const toggleCorrect = (i) => update({
    options: q.options.map((o, j) => {
      if (j === i) return { ...o, isCorrect: !o.isCorrect };
      return single ? { ...o, isCorrect: false } : o;
    }),
  });
  const move = (i, d) => {
    const opts = [...q.options];
    [opts[i], opts[i + d]] = [opts[i + d], opts[i]];
    update({ options: opts });
  };
  const marker = q.type === 'MCQ' ? '○' : q.type === 'CHECKBOX' ? '☐' : null;

  return (
    <div className="options">
      {q.options.map((o, i) => (
        <div className="opt-row" key={i}>
          <span className="list-num" aria-hidden="true">{marker || `${i + 1}.`}</span>
          <input
            className="opt-input"
            placeholder={`Option ${i + 1}`}
            value={o.text}
            maxLength={500}
            onChange={(e) => setOpt(i, { text: e.target.value })}
          />
          {canMark && (
            <button
              type="button"
              className={`correct-btn ${o.isCorrect ? 'on' : ''}`}
              onClick={() => toggleCorrect(i)}
              aria-pressed={o.isCorrect}
              title={o.isCorrect ? 'Correct answer (click to unmark)' : 'Mark as correct answer'}
            >
              ✓ <span>{o.isCorrect ? 'Correct' : 'Mark correct'}</span>
            </button>
          )}
          <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move option ${i + 1} up`}>↑</button>
          <button type="button" className="icon-btn" disabled={i === q.options.length - 1} onClick={() => move(i, 1)} aria-label={`Move option ${i + 1} down`}>↓</button>
          {q.options.length > (q.settings.other ? 1 : 2) && (
            <button type="button" className="icon-btn" onClick={() => update({ options: q.options.filter((_, j) => j !== i) })} aria-label={`Remove option ${i + 1}`}>✕</button>
          )}
        </div>
      ))}
      {q.settings.other && (
        <div className="opt-row other-row">
          <span className="list-num" aria-hidden="true">{marker}</span>
          <span className="other-preview">Other: <em>reader types their own answer</em></span>
          <button type="button" className="icon-btn" onClick={() => update({ settings: { ...q.settings, other: false } })} aria-label="Remove Other">✕</button>
        </div>
      )}
      <div className="opt-foot">
        <div className="opt-add">
          {q.options.length < maxOptions && (
            <button type="button" className="btn ghost small" onClick={() => update({ options: [...q.options, { text: '', isCorrect: false }] })}>Add option</button>
          )}
          {(q.type === 'MCQ' || q.type === 'CHECKBOX') && !q.settings.other && (
            <button type="button" className="btn ghost small" onClick={() => update({ settings: { ...q.settings, other: true } })}>Add “Other”</button>
          )}
        </div>
        <span className="muted small">
          {q.type === 'RANKING'
            ? 'Readers put these in order. Ranking is not scored.'
            : single
              ? 'Mark one correct option to score this question, or none for an opinion question.'
              : 'Mark every correct option to score this question (all must be picked), or none.'}
        </span>
      </div>
    </div>
  );
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function TypeSettings({ q, update, config }) {
  const s = q.settings;
  const setS = (patch) => update({ settings: { ...s, ...patch } });

  switch (q.type) {
    case 'SHORT':
      return (
        <div className="q-settings">
          <span className="setting-label">Correct answers <span className="muted small">(optional — to score this question; not case-sensitive)</span></span>
          {s.answers.length ? (
            <TextList items={s.answers} onChange={(answers) => setS({ answers })} placeholder="Answer" addLabel="Add another accepted answer" max={10} min={0} />
          ) : (
            <button type="button" className="btn ghost small" onClick={() => setS({ answers: [''] })}>Add correct answer</button>
          )}
          <div className="answer-preview"><input disabled placeholder="Short answer text" /></div>
        </div>
      );
    case 'TEXT':
      return <div className="answer-preview"><textarea disabled rows={2} placeholder="Long answer text" /></div>;
    case 'SCALE':
      return (
        <div className="q-settings">
          <div className="inline-fields">
            <label>From
              <select value={s.min} onChange={(e) => setS({ min: Number(e.target.value) })}>
                <option value={0}>0</option><option value={1}>1</option>
              </select>
            </label>
            <label>to
              <select value={s.max} onChange={(e) => setS({ max: Number(e.target.value) })}>
                {range(2, 10).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div className="inline-fields">
            <label>Label for {s.min} <input value={s.minLabel} maxLength={60} placeholder="optional, e.g. Not useful" onChange={(e) => setS({ minLabel: e.target.value })} /></label>
            <label>Label for {s.max} <input value={s.maxLabel} maxLength={60} placeholder="optional, e.g. Very useful" onChange={(e) => setS({ maxLabel: e.target.value })} /></label>
          </div>
        </div>
      );
    case 'RATING':
      return (
        <div className="q-settings inline-fields">
          <label>Levels
            <select value={s.levels} onChange={(e) => setS({ levels: Number(e.target.value) })}>
              {range(2, 10).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>Symbol
            <select value={s.symbol} onChange={(e) => setS({ symbol: e.target.value })}>
              <option value="star">★ Star</option>
              <option value="heart">♥ Heart</option>
              <option value="thumb">👍 Thumbs up</option>
              <option value="number">Numbers</option>
            </select>
          </label>
        </div>
      );
    case 'NPS':
      return (
        <div className="q-settings">
          <p className="muted small">Readers pick 0 to 10. The report groups them later if you export.</p>
          <div className="inline-fields">
            <label>Label for 0 <input value={s.minLabel} maxLength={60} onChange={(e) => setS({ minLabel: e.target.value })} /></label>
            <label>Label for 10 <input value={s.maxLabel} maxLength={60} onChange={(e) => setS({ maxLabel: e.target.value })} /></label>
          </div>
        </div>
      );
    case 'GRID': case 'CHECKGRID': case 'LIKERT':
      return (
        <div className="q-settings grid-settings">
          <div>
            <span className="setting-label">{q.type === 'LIKERT' ? 'Statements (rows)' : 'Rows'}</span>
            <TextList items={s.rows} onChange={(rows) => setS({ rows })} placeholder={q.type === 'LIKERT' ? 'Statement' : 'Row'} addLabel={q.type === 'LIKERT' ? 'Add statement' : 'Add row'} max={config.maxGridRows} />
          </div>
          <div>
            <span className="setting-label">{q.type === 'LIKERT' ? 'Scale (columns)' : 'Columns'}</span>
            <TextList items={s.columns} onChange={(columns) => setS({ columns })} placeholder="Column" addLabel="Add column" max={config.maxGridCols} min={2} />
          </div>
          {q.required && <p className="muted small">Required: the reader must answer every row.</p>}
        </div>
      );
    case 'DATE':
      return (
        <div className="q-settings">
          <label className="check-line">
            <input type="checkbox" checked={s.includeTime} onChange={(e) => setS({ includeTime: e.target.checked })} />
            Include time
          </label>
        </div>
      );
    case 'TIME':
      return <div className="answer-preview"><input disabled type="time" /></div>;
    case 'FILE':
      return (
        <div className="q-settings">
          <span className="setting-label">Allowed file types</span>
          <div className="check-wrap">
            {Object.entries(FILE_KIND_LABELS).map(([k, label]) => (
              <label key={k} className="check-line">
                <input
                  type="checkbox"
                  checked={s.kinds.includes(k)}
                  onChange={(e) => setS({ kinds: e.target.checked ? [...s.kinds, k] : s.kinds.filter((x) => x !== k) })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="inline-fields">
            <label>Maximum number of files
              <select value={s.maxFiles} onChange={(e) => setS({ maxFiles: Number(e.target.value) })}>
                {[1, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>Maximum file size
              <select value={s.maxSizeMb} onChange={(e) => setS({ maxSizeMb: Number(e.target.value) })}>
                {[1, 5, 10].map((n) => <option key={n} value={n}>{n} MB</option>)}
              </select>
            </label>
          </div>
        </div>
      );
    default:
      return null;
  }
}

/* ---------- the whole questions section ---------- */
export default function QuestionBuilder({
  questions, setQuestions, quizTitle, setQuizTitle, quizNote, setQuizNote, config, locked,
}) {
  const max = config.maxQuestions;
  const update = (i, patch) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i, d) => setQuestions((qs) => {
    const next = [...qs];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return next;
  });
  const duplicate = (i) => setQuestions((qs) => {
    if (qs.length >= max) return qs;
    const copy = JSON.parse(JSON.stringify(qs[i]));
    copy.key = newKey();
    return [...qs.slice(0, i + 1), copy, ...qs.slice(i + 1)];
  });
  const remove = (i) => setQuestions((qs) => (qs.length > 1 ? qs.filter((_, j) => j !== i) : qs));
  const add = () => setQuestions((qs) => (qs.length < max ? [...qs, blankQuestion('MCQ')] : qs));

  return (
    <>
      <section className="q-card quiz-head-card">
        <label className="field">
          <span>Quiz heading (shown to readers above the questions)</span>
          <input
            value={quizTitle}
            maxLength={300}
            placeholder={config.defaultQuizTitle}
            onChange={(e) => setQuizTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Note under the heading (optional)</span>
          <textarea
            rows={2}
            value={quizNote}
            maxLength={1000}
            placeholder="Leave empty to show: Answer all questions. You can submit only once."
            onChange={(e) => setQuizNote(e.target.value)}
          />
        </label>
      </section>

      <fieldset disabled={locked} className="questions">
      {questions.map((q, i) => (
        <section key={q.key} className="q-card">
          <div className="q-head">
            <h3>Question {i + 1}</h3>
            <select
              className="type-select"
              value={q.type}
              onChange={(e) => update(i, changeType(q, e.target.value))}
              aria-label={`Question ${i + 1} type`}
            >
              {TYPE_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          <textarea
            className="q-text"
            placeholder="Type the question"
            value={q.text}
            maxLength={1000}
            onChange={(e) => update(i, { text: e.target.value })}
            rows={2}
          />
          {q.showDescription && (
            <textarea
              className="q-desc"
              placeholder="Description (optional help text under the question)"
              value={q.description}
              maxLength={1000}
              onChange={(e) => update(i, { description: e.target.value })}
              rows={2}
            />
          )}

          {OPTION_TYPES.includes(q.type) && (
            <OptionsEditor q={q} maxOptions={config.maxOptions} update={(p) => update(i, p)} />
          )}
          {!OPTION_TYPES.includes(q.type) && <TypeSettings q={q} update={(p) => update(i, p)} config={config} />}

          <div className="q-foot">
            <div className="q-toggles">
              <label className="check-line">
                <input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />
                Required
              </label>
              <label className="check-line">
                <input type="checkbox" checked={q.showDescription} onChange={(e) => update(i, { showDescription: e.target.checked })} />
                Description
              </label>
              {SHUFFLE_TYPES.includes(q.type) && (
                <label className="check-line">
                  <input type="checkbox" checked={q.shuffle} onChange={(e) => update(i, { shuffle: e.target.checked })} />
                  Shuffle option order
                </label>
              )}
            </div>
            <div className="q-actions">
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up" aria-label={`Move question ${i + 1} up`}>↑</button>
              <button type="button" className="icon-btn" disabled={i === questions.length - 1} onClick={() => move(i, 1)} title="Move down" aria-label={`Move question ${i + 1} down`}>↓</button>
              <button type="button" className="btn ghost small" disabled={questions.length >= max} onClick={() => duplicate(i)}>Duplicate</button>
              <button type="button" className="btn ghost small danger" disabled={questions.length <= 1} onClick={() => remove(i)}>Delete</button>
            </div>
          </div>
          <p className="sr-only">{TYPE_LABEL[q.type]}</p>
        </section>
      ))}

      <div className="q-add-bar">
        <button type="button" className="btn primary" onClick={add} disabled={questions.length >= max}>+ Add question</button>
        <span className="muted small">{questions.length} of {max} questions{questions.length >= max ? ' — maximum reached' : ''}</span>
      </div>
      </fieldset>
    </>
  );
}
