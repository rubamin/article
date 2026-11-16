import { readableText, resolveHeader, HEADING_SIZE, SUB_SIZE } from '../utils/color';

/**
 * Coloured header: heading (title) on the left, logo on the right, optional subheading below.
 * Each has its own font colour, background colour and font size. On narrow screens the font
 * sizes shrink with the screen (clamp) so long titles still fit.
 * Used by the reader page, the share-link page and the editor preview.
 */
export default function ArticleHeader({ title, header = {}, logoUrl, preview = false }) {
  const c = resolveHeader(header);
  const headingSize = header.headingSize || HEADING_SIZE.def;
  const subSize = header.subSize || SUB_SIZE.def;
  const hasSub = !!(header.subTitle && header.subTitle.trim());
  const lightBand = (bg) => readableText(bg) !== '#ffffff';
  const fit = (size, min, vw) => (preview ? `${size}px` : `clamp(${Math.min(size, min)}px, ${vw}vw, ${size}px)`);

  return (
    <div className={`brand ${preview ? 'is-preview' : ''}`}>
      <header
        className={`brand-header ${hasSub && c.subSameBand ? 'joined' : ''} ${lightBand(c.bg) && !(hasSub && c.subSameBand) ? 'on-light' : ''}`}
        style={{ background: c.bg, color: c.headingColor }}
      >
        <div className="brand-inner">
          <div className="brand-text">
            <h1 style={{ fontSize: fit(headingSize, 26, 6), color: c.headingColor }}>{title || 'Article title'}</h1>
          </div>
          {logoUrl && <img className="brand-logo" src={logoUrl} alt="Logo" />}
        </div>
      </header>
      {hasSub && (
        <div
          className={`brand-sub ${c.subSameBand ? 'joined' : ''} ${lightBand(c.subBg) ? 'on-light' : ''}`}
          style={{ background: c.subBg, color: c.subColor }}
        >
          <p className="brand-sub-inner" style={{ fontSize: fit(subSize, 15, 4), color: c.subColor }}>{header.subTitle}</p>
        </div>
      )}
    </div>
  );
}
