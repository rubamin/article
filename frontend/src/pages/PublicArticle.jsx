import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { publicApi, readerStore } from '../api';
import { useReadTracker } from '../hooks/useReadTracker';
import { useReaderScale } from '../hooks/useReaderScale';
import ArticleHeader from '../components/ArticleHeader';
import QuizForm from '../components/QuizForm';

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
  const [done, setDone] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState('');
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

  // Full screen: scale the reading column up to the screen width (text grows with it,
  // so the line length stays the same).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!isFull || !stage) { setNormalZoom(1); return undefined; }
    const fit = () => setNormalZoom(Math.max(1, (stage.clientWidth - 48) / NORMAL_COL_PX));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [isFull]);

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

  if (loadError) return <main className="reader" style={{ zoom: scale }}><p className="error">{loadError}</p></main>;
  if (!data) return <main className="reader" style={{ zoom: scale }}><p className="muted">Loading article…</p></main>;

  const alreadyDone = done || data.submitted;
  const articleOnly = !data.submitted && !(data.questions && data.questions.length);

  async function markRead() {
    setMarkError('');
    setMarking(true);
    try {
      await publicApi.submit(token, []);
      setDone(true);
    } catch (e) {
      if (e.status === 409) setDone(true); // already marked from another tab
      else setMarkError(e.message);
    } finally {
      setMarking(false);
    }
  }

  return (
    // The whole page is scaled to the screen width (see useReaderScale).
    <div className="reader-page" style={{ zoom: scale }}>
      <ArticleHeader title={data.title} header={data} logoUrl={data.logoUrl} />
      <main className="reader">
        <div className="reader-col reader-top">
          <p className="greeting">Hello {data.name}</p>
          <div className="view-tools">
            {canFull && (
              <button type="button" className="btn ghost small" onClick={toggleFull}>Full screen</button>
            )}
          </div>
        </div>

        <div
          ref={stageRef}
          className={`article-stage ${isFull ? 'is-full' : ''}`}
          // Full screen has its own fit-to-screen scaling, so cancel the page scale there.
          style={isFull && scale !== 1 ? { zoom: 1 / scale } : undefined}
        >
          {isFull && (
            <div className="stage-tools">
              <button type="button" className="btn ghost small" onClick={exitFull}>Exit full screen</button>
            </div>
          )}
          <article
            className="article-body"
            style={isFull ? { zoom: normalZoom } : undefined}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {isFull && (
            <div className="stage-end">
              <button type="button" className="btn primary" onClick={alreadyDone ? exitFull : goToQuiz}>
                {alreadyDone ? 'Exit full screen' : articleOnly ? 'Exit full screen' : 'Exit full screen and answer the questions'}
              </button>
            </div>
          )}
        </div>

        <div className="reader-col">
          <section className="quiz" aria-labelledby="quiz-title">
            {alreadyDone ? (
              <div className="thanks">
                <h2 id="quiz-title">{data.hasQuestions === false ? 'Thank you for reading' : 'Your answers are saved'}</h2>
                <p>Thank you for reading. You can come back to this article any time using the same link.</p>
              </div>
            ) : articleOnly ? (
              <div className="thanks">
                <h2 id="quiz-title">Finished reading?</h2>
                <p>Let us know you have read this article.</p>
                {markError && <p className="error">{markError}</p>}
                <p>
                  <button type="button" className="btn primary" onClick={markRead} disabled={marking}>
                    {marking ? 'Saving…' : 'I have read this article'}
                  </button>
                </p>
              </div>
            ) : (
              <QuizForm
                token={token}
                quizTitle={data.quizTitle}
                quizNote={data.quizNote}
                questions={data.questions}
                onDone={() => setDone(true)}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
