import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { adminApi } from '../api';
import { useReaderScale } from '../hooks/useReaderScale';
import ArticleHeader from '../components/ArticleHeader';
import QuizForm from '../components/QuizForm';
import { PDF_WIDTH_PX, buildArticlePdf, pdfFileName } from '../utils/articlePdf';

const DEFAULT_QUIZ_TITLE = 'Check your understanding'; // same default the server gives readers

/**
 * Admin preview: the article exactly as readers see it on their link (same header, article and
 * questions, same styles), plus "Generate PDF": the PDF opens in a preview first, with or without
 * the questions, and is downloaded from there.
 */
export default function ArticleView() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [withQuestions, setWithQuestions] = useState(true);
  const [exporting, setExporting] = useState(false); // page is laid out for the PDF and being captured
  const [pdf, setPdf] = useState(null); // { url, blob } shown in the preview
  const [pdfError, setPdfError] = useState('');
  const pageRef = useRef(null);
  const scale = useReaderScale();

  useEffect(() => {
    adminApi.get(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  const html = useMemo(() => (data ? DOMPurify.sanitize(data.contentHtml) : ''), [data]);
  const hasQuestions = !!(data && data.questions && data.questions.length);

  // Free the previous PDF when a new one replaces it or the page closes
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

  // Once the page has re-rendered in PDF layout (A4 width, PDF font size), capture it.
  useEffect(() => {
    if (!exporting) return undefined;
    let cancelled = false;
    const frame = requestAnimationFrame(() => requestAnimationFrame(async () => {
      try {
        const blob = await buildArticlePdf(pageRef.current);
        if (!cancelled) setPdf({ blob, url: URL.createObjectURL(blob) });
      } catch (e) {
        if (!cancelled) setPdfError(`Could not create the PDF: ${e.message || e}`);
      } finally {
        if (!cancelled) setExporting(false);
      }
    }));
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [exporting]);

  function generatePdf(questions = withQuestions) {
    setWithQuestions(questions);
    setPdfError('');
    setExporting(true);
  }

  function closePreview() {
    setPdf(null);
  }

  function download() {
    const a = document.createElement('a');
    a.href = pdf.url;
    a.download = pdfFileName(data.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  useEffect(() => {
    if (!pdf) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closePreview(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pdf]);

  if (error) return <div className="admin-main"><p className="error">{error}</p></div>;
  if (!data) return <div className="admin-main"><p className="muted">Loading article…</p></div>;

  const showQuiz = hasQuestions && (!exporting || withQuestions);

  return (
    <>
      <div className="view-bar">
        <div className="view-bar-inner">
          <Link to="/admin" className="btn ghost small">← Back to articles</Link>
          <span className="muted small view-bar-note">Preview — this is how readers see the article</span>
          <div className="view-bar-tools">
            <button type="button" className="btn primary small" onClick={() => generatePdf()} disabled={exporting}>
              {exporting ? 'Generating PDF…' : 'Generate PDF'}
            </button>
          </div>
        </div>
        {pdfError && <p className="error small view-bar-inner">{pdfError}</p>}
      </div>

      {exporting && <div className="pdf-busy" role="status">Generating PDF…</div>}

      {pdf && (
        <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) closePreview(); }}>
          <div className="modal pdf-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-title">
            <div className="modal-head">
              <h2 id="pdf-title">PDF preview</h2>
              <button type="button" className="icon-btn" onClick={closePreview} aria-label="Close">✕</button>
            </div>
            <iframe className="pdf-frame" src={`${pdf.url}#view=FitH`} title="PDF preview" />
            <div className="modal-foot">
              {hasQuestions && (
                <label className="view-check pdf-opt">
                  <input
                    type="checkbox"
                    checked={withQuestions}
                    disabled={exporting}
                    onChange={(e) => generatePdf(e.target.checked)}
                  />
                  <span>Include questions</span>
                </label>
              )}
              <button type="button" className="btn ghost" onClick={closePreview}>Close</button>
              <button type="button" className="btn primary" onClick={download} disabled={exporting}>Download PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Same markup and classes as the reader page (PublicArticle), so the look is identical.
          While a PDF is made it is laid out at A4 width with the PDF font size (pdf-mode). */}
      <div
        ref={pageRef}
        className={`reader-page ${exporting ? 'pdf-mode' : ''}`}
        style={exporting ? { width: PDF_WIDTH_PX, zoom: 1 } : { zoom: scale }}
      >
        <ArticleHeader title={data.title} header={data} logoUrl={data.logoUrl} />
        <main className="reader">
          {!exporting && (
            <div className="reader-col reader-top">
              <p className="greeting">Hello [Reader&apos;s name]</p>
            </div>
          )}

          <div className="article-stage">
            <article className="article-body" dangerouslySetInnerHTML={{ __html: html }} />
          </div>

          {showQuiz && (
            <div className="reader-col">
              <section className="quiz" aria-labelledby="quiz-title">
                <QuizForm
                  preview
                  hideSubmit={exporting}
                  quizTitle={data.quizTitle || DEFAULT_QUIZ_TITLE}
                  quizNote={data.quizNote}
                  questions={data.questions}
                  onDone={() => {}}
                />
              </section>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
