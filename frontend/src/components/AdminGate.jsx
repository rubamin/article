import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { authApi, session } from '../api';

export default function AdminGate() {
  const [admin, setAdmin] = useState(() => (session.token() ? session.admin() : null));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onLogout = () => setAdmin(null);
    window.addEventListener('admin-logout', onLogout);
    return () => window.removeEventListener('admin-logout', onLogout);
  }, []);

  async function login(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await authApi.login(username.trim(), password);
      session.set(r.token, r.admin);
      setAdmin(r.admin);
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!admin) {
    return (
      <main className="gate">
        <form className="gate-card" onSubmit={login}>
          <h1>Article Tracker</h1>
          <p className="muted">Sign in to create articles, share links and see who read them.</p>
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary block" type="submit" disabled={busy || !username || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="admin">
      <header className="admin-bar">
        <Link to="/admin" className="brand">Article Tracker</Link>
        <div className="admin-user">
          <span>{admin.fullName}</span>
          <button className="btn ghost small" onClick={() => { session.clear(); setAdmin(null); }}>
            Sign out
          </button>
        </div>
      </header>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
