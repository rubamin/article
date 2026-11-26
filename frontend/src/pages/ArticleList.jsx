import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api';
import SharePanel from '../components/SharePanel';
import { formatDateTime } from '../utils/format';
import { usePageTour } from '../tour/TourProvider';

export default function ArticleList() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.list().then(setRows).catch((e) => setError(e.message));
  }, []);

  usePageTour('list', rows !== null || !!error);

  return (
    <>
      <div className="page-head">
        <h1>My articles</h1>
        <Link className="btn primary" to="/admin/articles/new" data-tour="new-article">New article</Link>
      </div>

      {error && <p className="error">{error}</p>}
      {rows && rows.length === 0 && (
        <div className="empty" data-tour="empty-articles">
          <p>No articles yet. Create one (with or without questions), then copy its link and share it.</p>
          <Link className="btn primary" to="/admin/articles/new">Create the first article</Link>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="table-wrap" data-tour="articles-table">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Created</th>
                <th>Link</th>
                <th className="num">Readers</th>
                <th className="num">Opened</th>
                <th className="num">Answered</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.articleId}>
                  <td><Link to={`/admin/articles/${r.articleId}`} className="strong-link" data-tour="article-title">{r.title}</Link></td>
                  <td>{formatDateTime(r.createdAt)}</td>
                  <td data-tour="copy-link">
                    <SharePanel compact title={r.title} link={r.shareLink} active={r.shareActive} />
                    {!r.shareActive && <span className="pill">Closed</span>}
                  </td>
                  <td className="num">{r.readers}</td>
                  <td className="num">{r.opened}</td>
                  <td className="num">{r.submitted}</td>
                  <td className="actions" data-tour="row-actions">
                    <Link to={`/admin/articles/${r.articleId}/view`}>View</Link>
                    <Link to={`/admin/articles/${r.articleId}`}>Report</Link>
                    <Link to={`/admin/articles/${r.articleId}/edit`}>Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
