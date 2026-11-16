import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminGate from './components/AdminGate';
import ArticleList from './pages/ArticleList';
import ArticleReport from './pages/ArticleReport';
import PublicArticle from './pages/PublicArticle';
import ShareJoin from './pages/ShareJoin';

// The editor (Word editor library) loads only for admins, so readers get a small page.
const ArticleEditor = lazy(() => import('./pages/ArticleEditor'));
const editor = (
  <Suspense fallback={<p className="muted">Loading editor…</p>}>
    <ArticleEditor />
  </Suspense>
);

export default function App() {
  return (
    <Routes>
      <Route path="/r/:shareToken" element={<ShareJoin />} />
      <Route path="/a/:token" element={<PublicArticle />} />
      <Route path="/admin" element={<AdminGate />}>
        <Route index element={<ArticleList />} />
        <Route path="articles/new" element={editor} />
        <Route path="articles/:id/edit" element={editor} />
        <Route path="articles/:id" element={<ArticleReport />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
