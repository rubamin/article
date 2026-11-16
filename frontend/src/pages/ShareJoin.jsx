import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { publicApi, readerStore } from '../api';
import ArticleHeader from '../components/ArticleHeader';
import { useReaderScale } from '../hooks/useReaderScale';

// Landing page of the share link: reader gives name + email once, then reads.
export default function ShareJoin() {
  const { shareToken } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const scale = useReaderScale();
  const [form, setForm] = useState({ name: '', email: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = readerStore.get(shareToken);
    if (saved) {
      navigate(`/a/${saved}`, { replace: true, state: { shareToken } });
      return;
    }
    publicApi.share(shareToken)
      .then(setInfo)
      .catch((e) => setLoadError(e.status === 404 ? 'This link is not valid. Ask the person who shared it for the correct link.' : e.message));
  }, [shareToken, navigate]);

  async function join(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await publicApi.join(shareToken, form);
      readerStore.set(shareToken, r.token);
      navigate(`/a/${r.token}`, { replace: true, state: { shareToken } });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (loadError) return <main className="reader" style={{ zoom: scale }}><p className="error">{loadError}</p></main>;
  if (!info) return <main className="reader" style={{ zoom: scale }}><p className="muted">Loading…</p></main>;

  return (
    <div className="reader-page" style={{ zoom: scale }}>
      <ArticleHeader title={info.title} headerColor={info.headerColor} logoUrl={info.logoUrl} />
      <main className="reader">
        {!info.active ? (
          <p className="notice">This link is closed. Contact the person who shared it.</p>
        ) : (
          <form className="join-card" onSubmit={join}>
            <h2>Tell us who you are</h2>
            <p className="muted">Enter your details once to open the article. You won’t be asked again on this device.</p>
            <label className="field">
              <span>Full name</span>
              <input value={form.name} onChange={set('name')} autoComplete="name" required autoFocus />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
                required
                placeholder={info.emailDomains.length ? `name@${info.emailDomains[0]}` : ''}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn primary large block" disabled={busy || !form.name.trim() || !form.email.trim()}>
              {busy ? 'Opening…' : 'Open article'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
