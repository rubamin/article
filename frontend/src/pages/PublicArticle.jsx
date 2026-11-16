import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { publicApi, readerStore } from '../api';
import { useReadTracker } from '../hooks/useReadTracker';
import { useReaderScale } from '../hooks/useReaderScale';
import ArticleHeader from '../components/ArticleHeader';
import A4Pages from '../components/A4Pages';

const VIEW_KEY = 'atReaderView';
const savedView = () => { try { return localStorage.getItem(VIEW_KEY) === 'a4' ? 'a4' : 'normal'; } catch { return 'normal'; } };

// Full screen shows only the article body (the "stage"); header, greeting and quiz stay on the page.
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const NORMAL_COL_PX = 760; // reading column width in full screen, before scaling
const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export default function PublicArticle() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  const [view, setView] = useState(savedView);
  const stageRef = useRef(null);
  const quizAfterExit = useRef(false);
  const [normalZoom, setNormalZoom] = useState(1);
  const [isFull, setIsFull] = useState(false);
  const canFull = useMemo(fsSupported, []);
  const scale = useReaderScale(); // same look on 14" / 15" laptops and desktops

  useEffect(() => {
    const onChange = () => {
      const full = !!stageRef.current && fsElement() === stageRef.current;
      setIsFull(full);
      // Scroll only after the browser has left full screen and restored the page,
      // otherwise its own scroll restore overrides ours.
      if (!full && quizAfterExit.current) {
        quizAfterExit.current = false;
        setTimeout(() => document.getElementById('quiz-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  function exitFull() {
    if (!fsElement()) return Promise.resolve();
    try {
      const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return p && p.then ? p.catch(() => {}) : Promise.resolve();
    } catch { return Promise.resolve(); }
  }

  // End of the article in full screen: leave full screen and go to the questions
  function goToQuiz() {
    quizAfterExit.current = true;
    exitFull();
  }

  // Full screen, Normal view: scale the reading column up to the screen width (text grows with it,
  // so the line length stays the same). The A4 view does the same inside A4Pages.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!isFull || !stage) { setNormalZoom(1); return undefined; }
    const fit = () => setNormalZoom(Math.max(1, (stage.clientWidth - 48) / NORMAL_COL_PX));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [isFull]);

  function chooseView(v) {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
  }

  function toggleFull() {
    const el = stageRef.current;
    if (!el) return;
    try {
      const p = fsElement()
        ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
        : (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      if (p && p.catch) p.catch(() => {});
    } catch { /* browser refused */ }
  }

  useEffect(() => {
    publicApi.get(token)
      .then(setData)
      .catch((e) => {
        // A remembered reader token that no longer exists: forget it and ask for details again
        const fromShare = location.state && location.state.shareToken;
        if (e.status === 404 && fromShare) {
          readerStore.clear(fromShare);
          navigate(`/r/${fromShare}`, { replace: true });
          return;
        }
        setLoadError(e.status === 404 ? 'This link is not valid. Ask the person who sent it for a new link.' : e.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useReadTracker(token, !!data);

  const html = useMemo(() => (data ? DOMPurify.sanitize(data.contentHtml) : ''), [data]);

  const setAnswer = (qid, value) => setAnswers((a) => ({ ...a, [qid]: value }));

  async function submit(e) {
    e.preventDefault();
    setSubmitError('');
    const missing = data.questions.findIndex((q) => {
      const a = answers[q.questionId];
      return q.type === 'MCQ' ? !a?.optionId : !a?.text?.trim();
    });
    if (missing !== -1) {
      setSubmitError(`Answer question ${missing + 1} before submitting.`);
      document.getElementById(`q-${data.questions[missing].questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    try {
      await publicApi.submit(token, data.questions.map((q) => ({ questionId: q.questionId, ...answers[q.questionId] })));
      setDone(true);
    } catch (err) {
      if (err.status === 409) setDone(true);
      else setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <main className="reader" style={{ zoom: scale }}><p className="error">{loadError}</p></main>;
  if (!data) return <main className="reader" style={{ zoom: scale }}><p className="muted">Loading article…</p></main>;

  const alreadyDone = done || data.submitted;
  const a4 = view === 'a4';

  const viewToggle = (
    <div className="seg" role="group" aria-label="Reading view">
      <button type="button" aria-pressed={!a4} onClick={() => chooseView('normal')}>Normal</button>
      <button type="button" aria-pressed={a4} onClick={() => chooseView('a4')}>A4 page</button>
    </div>
  );

  return (
    // The whole page is scaled to the screen width (see useReaderScale).
    <div className="reader-page" style={{ zoom: scale }}>
      <ArticleHeader title={data.title} headerColor={data.headerColor} logoUrl={data.logoUrl} />
      <main className={`reader ${a4 ? 'reader-a4' : ''}`}>
        <div className="reader-col reader-top">
          <p className="greeting">Hello {data.name}</p>
          <div className="view-tools">
            {viewToggle}
            {canFull && (
              <button type="button" className="btn ghost small" onClick={toggleFull}>Full screen</button>
            )}
          </div>
        </div>

        <div
          ref={stageRef}
          className={`article-stage ${isFull ? 'is-full' : ''} ${a4 ? 'is-a4' : ''}`}
          // Full screen has its own fit-to-screen scaling, so cancel the page scale there.
          style={isFull && scale !== 1 ? { zoom: 1 / scale } : undefined}
        >
          {isFull && (
            <div className="stage-tools">
              {viewToggle}
              <button type="button" className="btn ghost small" onClick={exitFull}>Exit full screen</button>
            </div>
          )}
          {a4
            ? <A4Pages html={html} fill={isFull} />
            : (
              <article
                className="article-body"
                style={isFull ? { zoom: normalZoom } : undefined}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
          {isFull && (
            <div className="stage-end">
              <button type="button" className="btn primary" onClick={alreadyDone ? exitFull : goToQuiz}>
                {alreadyDone ? 'Exit full screen' : 'Exit full screen and answer the questions'}
              </button>
            </div>
          )}
        </div>

        <div className="reader-col">
          <section className="quiz" aria-labelledby="quiz-title">
            {alreadyDone ? (
              <div className="thanks">
                <h2 id="quiz-title">Your answers are saved</h2>
                <p>Thank you for reading. You can come back to this article any time using the same link.</p>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <h2 id="quiz-title">Check your understanding</h2>
                <p className="muted">Answer all {data.questions.length} questions. You can submit only once.</p>

                {data.questions.map((q, i) => (
                  <fieldset key={q.questionId} id={`q-${q.questionId}`} className="quiz-q">
                    <legend><span className="q-num">{i + 1}.</span> {q.text}</legend>
                    {q.type === 'MCQ' ? (
                      <div className="choices">
                        {q.options.map((o) => (
                          <label key={o.optionId} className={`choice ${answers[q.questionId]?.optionId === o.optionId ? 'picked' : ''}`}>
                            <input
                              type="radio"
                              name={`q${q.questionId}`}
                              checked={answers[q.questionId]?.optionId === o.optionId}
                              onChange={() => setAnswer(q.questionId, { optionId: o.optionId })}
                            />
                            <span>{o.text}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        rows={4}
                        maxLength={4000}
                        placeholder="Write your answer"
                        value={answers[q.questionId]?.text || ''}
                        onChange={(e) => setAnswer(q.questionId, { text: e.target.value })}
                      />
                    )}
                  </fieldset>
                ))}

                {submitError && <p className="error">{submitError}</p>}
                <button className="btn primary large" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit answers'}
                </button>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
