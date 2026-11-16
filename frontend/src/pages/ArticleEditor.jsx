import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../api';
import HeaderBranding from '../components/HeaderBranding';
import WordEditor from '../components/WordEditor';
import HtmlEditor from '../components/HtmlEditor';

const DEFAULT_COUNT = 5;
const MAX_OPTIONS = 6;
const DEFAULT_HEADER = '#1D2B38';

const blankOption = () => ({ text: '', isCorrect: false });
const blankQuestion = (type = 'MCQ') => ({
  type,
  text: '',
  options: type === 'MCQ' ? [blankOption(), blankOption(), blankOption(), blankOption()] : [],
});
const isEmptyHtml = (h) => !h || (!/<img\s/i.test(h) && !h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());

export default function ArticleEditor() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const docxRef = useRef(null);

  const [count, setCount] = useState(DEFAULT_COUNT);
  const [title, setTitle] = useState('');
  const [contentSource, setContentSource] = useState('WORD');
  const [contentHtml, setContentHtml] = useState('');
  const [headerColor, setHeaderColor] = useState(DEFAULT_HEADER);
  const [logo, setLogo] = useState(null); // { assetId, url }
  const [questions, setQuestions] = useState(() => Array.from({ length: DEFAULT_COUNT }, () => blankQuestion()));
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const cfg = await adminApi.config();
        if (cancelled) return;
        setCount(cfg.questionCount);
        if (isEdit) {
          const a = await adminApi.get(id);
          if (cancelled) return;
          setTitle(a.title);
          setContentSource(a.contentSource);
          setContentHtml(a.contentHtml);
          setHeaderColor(a.headerColor);
          setLogo(a.logoAssetId ? { assetId: a.logoAssetId, url: a.logoUrl } : null);
          setLocked(a.responseCount > 0);
          setQuestions(a.questions.map((q) => ({
            type: q.type,
            text: q.text,
            options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
          })));
        } else {
          setQuestions(Array.from({ length: cfg.questionCount }, () => blankQuestion()));
          const d = await adminApi.defaults(); // reuse last header colour + logo
          if (cancelled) return;
          setHeaderColor(d.headerColor);
          setLogo(d.logoAssetId ? { assetId: d.logoAssetId, url: d.logoUrl } : null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, isEdit]);

  const uploadImage = async (file) => (await adminApi.uploadImage(file)).url;

  function switchMode(next) {
    if (next === contentSource) return;
    if (next === 'WORD' && !isEmptyHtml(contentHtml)) {
      const ok = window.confirm(
        'The Word editor keeps headings, lists, tables, links and images. Custom HTML styles may be removed. Switch?'
      );
      if (!ok) return;
    }
    setContentSource(next);
  }

  async function importDocx(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!isEmptyHtml(contentHtml) && !window.confirm('Replace the current content with this Word file?')) return;
    setImportNote('');
    setError('');
    setImporting(true);
    try {
      const r = await adminApi.importDocx(file);
      setContentHtml(r.html);
      if (!title.trim()) setTitle(file.name.replace(/\.docx$/i, ''));
      setImportNote([`Imported “${file.name}”.`, ...r.warnings].join(' '));
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  const updateQ = (qi, patch) =>
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)));
  const setType = (qi, type) =>
    updateQ(qi, { type, options: type === 'MCQ' ? [blankOption(), blankOption(), blankOption(), blankOption()] : [] });
  const updateOpt = (qi, oi, patch) =>
    setQuestions((qs) => qs.map((q, i) => (i !== qi ? q : {
      ...q, options: q.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)),
    })));
  const markCorrect = (qi, oi) =>
    setQuestions((qs) => qs.map((q, i) => (i !== qi ? q : {
      ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === oi })),
    })));
  const addOpt = (qi) =>
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, options: [...q.options, blankOption()] } : q)));
  const removeOpt = (qi, oi) =>
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, options: q.options.filter((_, j) => j !== oi) } : q)));

  async function save(e) {
    e.preventDefault();
    setError('');
    if (isEmptyHtml(contentHtml)) {
      setError('Article content is required.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title, contentHtml, contentSource, headerColor,
        logoAssetId: logo ? logo.assetId : null,
        questions,
      };
      if (isEdit) {
        await adminApi.update(id, payload);
        navigate(`/admin/articles/${id}`);
      } else {
        const r = await adminApi.create(payload);
        navigate(`/admin/articles/${r.articleId}`);
      }
    } catch (err) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <form onSubmit={save} className="editor">
      <div className="page-head">
        <h1>{isEdit ? 'Edit article' : 'New article'}</h1>
        <div className="head-actions">
          <Link className="btn ghost" to={isEdit ? `/admin/articles/${id}` : '/admin'}>Cancel</Link>
          <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save article'}</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
      </label>

      <h2 className="section-title">Header</h2>
      <HeaderBranding
        title={title}
        headerColor={headerColor}
        logo={logo}
        onColorChange={setHeaderColor}
        onLogoChange={setLogo}
      />

      <h2 className="section-title">Content</h2>
      <div className="mode-bar">
        <div className="mode-tabs" role="tablist" aria-label="How to write the article">
          <button
            type="button" role="tab" aria-selected={contentSource === 'WORD'}
            className={contentSource === 'WORD' ? 'on' : ''} onClick={() => switchMode('WORD')}
          >
            Word document
          </button>
          <button
            type="button" role="tab" aria-selected={contentSource === 'HTML'}
            className={contentSource === 'HTML' ? 'on' : ''} onClick={() => switchMode('HTML')}
          >
            HTML code
          </button>
        </div>
        <button type="button" className="btn ghost" onClick={() => docxRef.current.click()} disabled={importing}>
          {importing ? 'Importing…' : 'Import Word file (.docx)'}
        </button>
        <input
          ref={docxRef}
          type="file"
          hidden
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={importDocx}
        />
      </div>
      <p className="muted small mode-help">
        {contentSource === 'WORD'
          ? 'Type like in Word, or import a .docx file — its text, headings, tables and pictures come in and stay editable.'
          : 'Paste or write HTML. Use “Insert image” to upload a picture at the cursor.'}
      </p>
      {importNote && <p className="ok small">{importNote}</p>}

      {contentSource === 'WORD' ? (
        <WordEditor value={contentHtml} onChange={setContentHtml} onUploadImage={uploadImage} />
      ) : (
        <HtmlEditor value={contentHtml} onChange={setContentHtml} onUploadImage={uploadImage} />
      )}

      <h2 className="section-title">Questions</h2>
      {locked ? (
        <p className="notice">
          People have already answered this article, so the questions are locked.
          You can still change the title, header and content.
        </p>
      ) : (
        <p className="muted">Exactly {count} questions. Multiple choice needs one correct option; written answers are read by you.</p>
      )}

      <fieldset disabled={locked} className="questions">
        {questions.map((q, qi) => (
          <section key={qi} className="q-card">
            <div className="q-head">
              <h3>Question {qi + 1}</h3>
              <div className="seg" role="radiogroup" aria-label={`Question ${qi + 1} type`}>
                <button type="button" className={q.type === 'MCQ' ? 'on' : ''} onClick={() => setType(qi, 'MCQ')}>
                  Multiple choice
                </button>
                <button type="button" className={q.type === 'TEXT' ? 'on' : ''} onClick={() => setType(qi, 'TEXT')}>
                  Written answer
                </button>
              </div>
            </div>

            <textarea
              className="q-text"
              placeholder="Type the question"
              value={q.text}
              onChange={(e) => updateQ(qi, { text: e.target.value })}
              rows={2}
            />

            {q.type === 'MCQ' && (
              <div className="options">
                {q.options.map((o, oi) => (
                  <div className="opt-row" key={oi}>
                    <label className="correct" title="Mark as correct answer">
                      <input
                        type="radio"
                        name={`correct-${qi}`}
                        checked={o.isCorrect}
                        onChange={() => markCorrect(qi, oi)}
                      />
                      <span className="sr-only">Correct</span>
                    </label>
                    <input
                      className="opt-input"
                      placeholder={`Option ${oi + 1}`}
                      value={o.text}
                      onChange={(e) => updateOpt(qi, oi, { text: e.target.value })}
                    />
                    {q.options.length > 2 && (
                      <button type="button" className="btn ghost small" onClick={() => removeOpt(qi, oi)}>Remove</button>
                    )}
                  </div>
                ))}
                <div className="opt-foot">
                  <span className="muted small">Select the circle next to the correct option.</span>
                  {q.options.length < MAX_OPTIONS && (
                    <button type="button" className="btn ghost small" onClick={() => addOpt(qi)}>Add option</button>
                  )}
                </div>
              </div>
            )}
            {q.type === 'TEXT' && <p className="muted small">The reader gets a text box for their answer.</p>}
          </section>
        ))}
      </fieldset>

      <div className="form-foot">
        <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save article'}</button>
      </div>
    </form>
  );
}
