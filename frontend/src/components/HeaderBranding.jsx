import { useRef, useState } from 'react';
import { adminApi } from '../api';
import { HEADER_PRESETS, HEADING_SIZE, SUB_SIZE, resolveHeader } from '../utils/color';
import ArticleHeader from './ArticleHeader';

const HEX = /^#[0-9a-f]{6}$/i;
const TEXT_PRESETS = ['#FFFFFF', '#1D2B38', '#0F2748', '#1A8A7A', '#A9DCEB', '#F5C542'];

/**
 * One colour setting: preset swatches, any colour, hex code.
 * autoLabel: shows an "Auto" choice; value null means automatic.
 */
function ColorField({ label, value, effective, onChange, presets, autoLabel }) {
  const [draft, setDraft] = useState(null);
  const shown = (value || effective || '#000000').toUpperCase();
  return (
    <div className="field color-field">
      <span>{label}</span>
      <div className="swatches">
        {autoLabel && (
          <button
            type="button"
            className={`auto-chip ${value ? '' : 'on'}`}
            onClick={() => { setDraft(null); onChange(null); }}
            title={autoLabel}
          >
            Auto
          </button>
        )}
        {presets.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch ${value && value.toUpperCase() === c ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => { setDraft(null); onChange(c); }}
            aria-label={`${label}: ${c}`}
            title={c}
          />
        ))}
        <label className="swatch custom" title="Pick any colour">
          <input
            type="color"
            value={shown.toLowerCase()}
            onChange={(e) => { setDraft(null); onChange(e.target.value.toUpperCase()); }}
          />
          <span className="sr-only">{label}: pick any colour</span>
        </label>
        <input
          className="hex-input"
          value={draft ?? shown}
          maxLength={7}
          aria-label={`${label} hex code`}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setDraft(v);
            if (HEX.test(v)) onChange(v.toUpperCase());
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
      {autoLabel && !value && <span className="muted small">{autoLabel}</span>}
    </div>
  );
}

function SizeField({ label, value, limits, onChange }) {
  const set = (v) => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n)) onChange(Math.min(limits.max, Math.max(limits.min, n)));
  };
  return (
    <div className="field size-field">
      <span>{label}</span>
      <div className="size-row">
        <input type="range" min={limits.min} max={limits.max} value={value} onChange={(e) => set(e.target.value)} aria-label={label} />
        <input type="number" min={limits.min} max={limits.max} value={value} onChange={(e) => set(e.target.value)} aria-label={`${label} in px`} />
        <span className="muted small">px</span>
      </div>
    </div>
  );
}

/**
 * header: { headerColor, headingColor, headingSize, subTitle, subColor, subBgColor, subSize }
 * onChange(patch) merges into it.
 */
export default function HeaderBranding({ title, header, onChange, logo, onLogoChange }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const c = resolveHeader(header);

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

  return (
    <div className="branding">
      <div className="branding-controls">
        <fieldset className="brand-group">
          <legend>Heading</legend>
          <ColorField
            label="Background colour"
            value={header.headerColor}
            onChange={(v) => onChange({ headerColor: v || '#1D2B38' })}
            presets={HEADER_PRESETS}
          />
          <ColorField
            label="Font colour"
            value={header.headingColor}
            effective={c.headingColor}
            onChange={(v) => onChange({ headingColor: v })}
            presets={TEXT_PRESETS}
            autoLabel="Auto picks white or dark text, whichever is readable on the background."
          />
          <SizeField
            label="Font size"
            value={header.headingSize}
            limits={HEADING_SIZE}
            onChange={(v) => onChange({ headingSize: v })}
          />
        </fieldset>

        <fieldset className="brand-group">
          <legend>Subheading <span className="muted small">(optional)</span></legend>
          <label className="field">
            <span>Text</span>
            <input
              value={header.subTitle}
              maxLength={300}
              placeholder="e.g. Edition #4: Personal Data in Our Daily Tools"
              onChange={(e) => onChange({ subTitle: e.target.value })}
            />
          </label>
          <ColorField
            label="Background colour"
            value={header.subBgColor}
            effective={c.subBg}
            onChange={(v) => onChange({ subBgColor: v })}
            presets={HEADER_PRESETS}
            autoLabel="Auto uses the heading background, so heading and subheading form one band."
          />
          <ColorField
            label="Font colour"
            value={header.subColor}
            effective={c.subColor}
            onChange={(v) => onChange({ subColor: v })}
            presets={TEXT_PRESETS}
            autoLabel="Auto picks white or dark text, whichever is readable on the background."
          />
          <SizeField
            label="Font size"
            value={header.subSize}
            limits={SUB_SIZE}
            onChange={(v) => onChange({ subSize: v })}
          />
        </fieldset>

        <fieldset className="brand-group">
          <legend>Logo <span className="muted small">(right side of the heading)</span></legend>
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
        </fieldset>
      </div>

      <div className="field preview-col">
        <span>Header preview</span>
        <div className="header-preview">
          <ArticleHeader title={title} header={header} logoUrl={logo && logo.url} preview />
        </div>
        <span className="muted small">On phones the font sizes shrink so long titles still fit.</span>
      </div>
    </div>
  );
}
