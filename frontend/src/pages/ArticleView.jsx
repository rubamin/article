import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { adminApi } from '../api';
import { useReaderScale } from '../hooks/useReaderScale';
import ArticleHeader from '../components/ArticleHeader';
import QuizForm from '../components/QuizForm';
import { PDF_WIDTH_PX, downloadArticlePdf, pdfFileName } from '../utils/articlePdf';

const DEFAULT_QUIZ_TITLE = 'Check your understanding'; // same default the server gives readers

/**
 * Admin preview: the article exactly as readers see it on their link (same header, article and
 * questions, same styles), plus "Generate PDF" with or without the questions.
 */
export default function ArticleView() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [withQuestions, setWithQuestions] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const pageRef = useRef(null);
  const scale = useReaderScale();

  useEffect(() => {
    adminApi.get(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  const html = useMemo(() => (data ? DOMPurify.sanitize(data.contentHtml) : ''), [data]);
  const hasQuestions = !!(data && data.questions && data.questions.length);

  // Once the page has re-rendered at PDF width (no zoom, no screen-only parts), capture it.
  useEffect(() => {
    if (!exporting) return undefined;
    let cancelled = false;
    const frame = requestAnimationFrame(() => requestAnimationFrame(async () => {
      try {
        await downloadArticlePdf(pageRef.current, pdfFileName(data.title));
      } catch (e) {
        if (!cancelled) setPdfError(`Could not create the PDF: ${e.message || e}`);
      } finally {
        if (!cancelled) setExporting(false);
      }
    }));
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [exporting, data]);

  function generatePdf() {
    setPdfError('');
    setExporting(true);
  }

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
            {hasQuestions && (
              <label className="view-check">
                <input type="checkbox" checked={withQuestions} onChange={(e) => setWithQuestions(e.target.checked)} disabled={exporting} />
                <span>Include questions in PDF</span>
              </label>
            )}
            <button type="button" className="btn primary small" onClick={generatePdf} disabled={exporting}>
              {exporting ? 'Generating PDF…' : 'Generate PDF'}
            </button>
          </div>
        </div>
        {pdfError && <p className="error small view-bar-inner">{pdfError}</p>}
      </div>

      {exporting && <div className="pdf-busy" role="status">Generating PDF…</div>}

      {/* Same markup and classes as the reader page (PublicArticle), so the look is identical. */}
      <div
        ref={pageRef}
        className="reader-page"
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
