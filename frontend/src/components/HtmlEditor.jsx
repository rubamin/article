import { useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';

// HTML code editor with live preview. "Insert image" uploads and adds an <img> at the cursor.
export default function HtmlEditor({ value, onChange, onUploadImage }) {
  const areaRef = useRef(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const preview = useMemo(() => DOMPurify.sanitize(value || ''), [value]);

  async function pickImage(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const url = await onUploadImage(file);
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/"/g, '');
      const tag = `\n<img src="${url}" alt="${alt}" />\n`;
      const el = areaRef.current;
      const start = el ? el.selectionStart : (value || '').length;
      const end = el ? el.selectionEnd : start;
      const next = (value || '').slice(0, start) + tag + (value || '').slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.selectionStart = el.selectionEnd = start + tag.length;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="html-editor">
      <div className="content-grid">
        <div className="field">
          <div className="field-head">
            <span>HTML code</span>
            <button type="button" className="btn ghost small" onClick={() => fileRef.current.click()} disabled={busy}>
              {busy ? 'Uploading…' : 'Insert image'}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={pickImage} />
          </div>
          <textarea
            ref={areaRef}
            className="content-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={20}
            spellCheck={false}
            placeholder={'<h2>Heading</h2>\n<p>Your paragraph…</p>'}
          />
          {error && <span className="error small">{error}</span>}
        </div>
        <div className="field">
          <span>Preview</span>
          <div className="preview article-body" dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      </div>
    </div>
  );
}
