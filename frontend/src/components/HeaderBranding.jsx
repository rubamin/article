import { useRef, useState } from 'react';
import { adminApi } from '../api';
import { HEADER_PRESETS } from '../utils/color';
import ArticleHeader from './ArticleHeader';

export default function HeaderBranding({ title, headerColor, logo, onColorChange, onLogoChange }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hexDraft, setHexDraft] = useState(null);

  async function pickLogo(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const r = await adminApi.uploadImage(file);
      onLogoChange({ assetId: r.assetId, url: r.url });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const hexValue = hexDraft ?? headerColor;

  return (
    <div className="branding">
      <div className="branding-controls">
        <div className="field">
          <span>Header colour</span>
          <div className="swatches">
            {HEADER_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${headerColor.toUpperCase() === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => { setHexDraft(null); onColorChange(c); }}
                aria-label={`Use colour ${c}`}
                title={c}
              />
            ))}
            <label className="swatch custom" title="Pick any colour">
              <input
                type="color"
                value={headerColor.toLowerCase()}
                onChange={(e) => { setHexDraft(null); onColorChange(e.target.value.toUpperCase()); }}
              />
              <span className="sr-only">Pick any colour</span>
            </label>
            <input
              className="hex-input"
              value={hexValue}
              maxLength={7}
              aria-label="Header colour hex code"
              onChange={(e) => {
                const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                setHexDraft(v);
                if (/^#[0-9a-f]{6}$/i.test(v)) onColorChange(v.toUpperCase());
              }}
              onBlur={() => setHexDraft(null)}
            />
          </div>
        </div>

        <div className="field">
          <span>Logo (shown on the right of the header)</span>
          <div className="logo-row">
            {logo && logo.url ? (
              <>
                <img src={logo.url} alt="Current logo" className="logo-thumb" />
                <button type="button" className="btn ghost small" onClick={() => fileRef.current.click()} disabled={busy}>
                  Replace logo
                </button>
                <button type="button" className="btn ghost small" onClick={() => onLogoChange(null)}>
                  Remove logo
                </button>
              </>
            ) : (
              <button type="button" className="btn ghost small" onClick={() => fileRef.current.click()} disabled={busy}>
                {busy ? 'Uploading…' : 'Upload logo'}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={pickLogo} />
          </div>
          <span className="muted small">PNG with a transparent background works best. Max 5 MB.</span>
          {error && <span className="error small">{error}</span>}
        </div>
      </div>

      <div className="field">
        <span>Header preview</span>
        <div className="header-preview">
          <ArticleHeader title={title} headerColor={headerColor} logoUrl={logo && logo.url} preview />
        </div>
      </div>
    </div>
  );
}
