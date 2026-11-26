import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../api';
import HeaderBranding from '../components/HeaderBranding';
import WordEditor from '../components/WordEditor';
import HtmlEditor from '../components/HtmlEditor';
import QuestionBuilder from '../components/QuestionBuilder';
import { defaultHeader, pickHeader } from '../utils/color';
import { blankQuestion, fromApi, toApi } from '../utils/questionTypes';
import { usePageTour } from '../tour/TourProvider';

const FALLBACK_CONFIG = {
  maxQuestions: 20, defaultQuestions: 5, maxOptions: 20, maxGridRows: 20, maxGridCols: 10,
  defaultQuizTitle: 'Check your understanding',
};
const isEmptyHtml = (h) => !h || (!/<img\s/i.test(h) && !h.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());

export default function ArticleEditor() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const docxRef = useRef(null);

  const [config, setConfig] = useState(FALLBACK_CONFIG);
  const [title, setTitle] = useState('');
  const [contentSource, setContentSource] = useState('WORD');
  const [contentHtml, setContentHtml] = useState('');
  const [header, setHeader] = useState(() => defaultHeader());
  const [logo, setLogo] = useState(null); // { assetId, url }
  const [quizTitle, setQuizTitle] = useState('');
  const [quizNote, setQuizNote] = useState('');
  const [questions, setQuestions] = useState(() => Array.from({ length: FALLBACK_CONFIG.defaultQuestions }, () => blankQuestion()));
  const [withQuestions, setWithQuestions] = useState(true); // off = article only, no questions
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
        setConfig({ ...FALLBACK_CONFIG, ...cfg });
        if (isEdit) {
          const a = await adminApi.get(id);
          if (cancelled) return;
          setTitle(a.title);
          setContentSource(a.contentSource);
          setContentHtml(a.contentHtml);
          setHeader(pickHeader(a));
          setLogo(a.logoAssetId ? { assetId: a.logoAssetId, url: a.logoUrl } : null);
          setQuizTitle(a.quizTitle || '');
          setQuizNote(a.quizNote || '');
          setLocked(a.responseCount > 0);
          setWithQuestions(a.questions.length > 0);
          setQuestions(a.questions.length ? a.questions.map(fromApi) : [blankQuestion()]);
        } else {
          setQuestions(Array.from({ length: cfg.defaultQuestions || 5 }, () => blankQuestion()));
          const d = await adminApi.defaults(); // reuse last header look, logo and quiz heading
          if (cancelled) return;
          setHeader(pickHeader(d));
          setLogo(d.logoAssetId ? { assetId: d.logoAssetId, url: d.logoUrl } : null);
          setQuizTitle(d.quizTitle || '');
          setQuizNote(d.quizNote || '');
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

  usePageTour('editor', !loading);

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
        title, contentHtml, contentSource,
        ...header,
        logoAssetId: logo ? logo.assetId : null,
        quizTitle, quizNote,
        questions: withQuestions ? questions.map(toApi) : [],
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
          <button className="btn primary" disabled={saving} data-tour="save-article">{saving ? 'Saving…' : 'Save article'}</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <label className="field" data-tour="article-title-field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
      </label>

      <h2 className="section-title">Header</h2>
      <div data-tour="header-branding">
        <HeaderBranding
          title={title}
          header={header}
          onChange={(patch) => setHeader((h) => ({ ...h, ...patch }))}
          logo={logo}
          onLogoChange={setLogo}
        />
      </div>

      <h2 className="section-title">Content</h2>
      <div className="mode-bar">
        <div className="mode-tabs" data-tour="content-mode" role="tablist" aria-label="How to write the article">
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
        <button type="button" className="btn ghost" data-tour="import-docx" onClick={() => docxRef.current.click()} disabled={importing}>
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
      <label className="view-check">
        <input
          type="checkbox"
          checked={withQuestions}
          disabled={locked}
          onChange={(e) => setWithQuestions(e.target.checked)}
        />
        <span>Ask questions after the article</span>
      </label>
      {locked ? (
        <p className="notice" data-tour="questions-locked">
          {withQuestions
            ? 'People have already answered this article, so the questions are locked.'
            : 'People have already read this article, so you can no longer add questions.'}
          {' '}You can still change the title, header and content.
        </p>
      ) : withQuestions ? (
        <p className="muted">
          Add 1 to {config.maxQuestions} questions of any type. Choice and short-answer questions are scored when you mark the
          correct answer; other types (rating, scale, grid, date, file…) are collected for you to review.
        </p>
      ) : (
        <p className="muted">
          Article only — readers just read it and click “I have read this article”. Reading time is still tracked.
        </p>
      )}

      {withQuestions && (
        <QuestionBuilder
          questions={questions}
          setQuestions={setQuestions}
          quizTitle={quizTitle}
          setQuizTitle={setQuizTitle}
          quizNote={quizNote}
          setQuizNote={setQuizNote}
          config={config}
          locked={locked}
        />
      )}

      <div className="form-foot">
        <button className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save article'}</button>
      </div>
    </form>
  );
}
