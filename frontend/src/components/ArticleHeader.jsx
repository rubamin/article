import { readableText } from '../utils/color';

// Coloured band: title on the left, logo on the right. Used by the reader page and the editor preview.
export default function ArticleHeader({ title, headerColor, logoUrl, children, preview = false }) {
  const color = readableText(headerColor);
  return (
    <header
      className={`brand-header ${preview ? 'is-preview' : ''} ${color !== '#ffffff' ? 'on-light' : ''}`}
      style={{ background: headerColor, color }}
    >
      <div className="brand-inner">
        <div className="brand-text">
          {children}
          <h1>{title || 'Article title'}</h1>
        </div>
        {logoUrl && <img className="brand-logo" src={logoUrl} alt="Logo" />}
      </div>
    </header>
  );
}
