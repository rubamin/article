// Pick dark or white text so the header title stays readable on any colour.
export function readableText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.45 ? '#1d2b38' : '#ffffff';
}

export const HEADER_PRESETS = ['#1D2B38', '#0B6E5F', '#1F4E79', '#7A1F2B', '#4B3F72', '#C2410C', '#FFFFFF'];

// Header defaults (must match backend/src/services/header.js)
export const HEADING_SIZE = { min: 18, max: 72, def: 40 };
export const SUB_SIZE = { min: 12, max: 40, def: 20 };

export const defaultHeader = (headerColor = '#1D2B38') => ({
  headerColor,
  headingColor: null, // null = automatic
  headingSize: HEADING_SIZE.def,
  subTitle: '',
  subColor: null,     // null = automatic
  subBgColor: null,   // null = same as the header colour
  subSize: SUB_SIZE.def,
});

// Picks the header fields out of an API object
export const pickHeader = (o) => ({
  headerColor: o.headerColor || '#1D2B38',
  headingColor: o.headingColor || null,
  headingSize: o.headingSize || HEADING_SIZE.def,
  subTitle: o.subTitle || '',
  subColor: o.subColor || null,
  subBgColor: o.subBgColor || null,
  subSize: o.subSize || SUB_SIZE.def,
});

const same = (a, b) => (a || '').toLowerCase() === (b || '').toLowerCase();

// The colours actually used, after "automatic" is resolved
export function resolveHeader(h) {
  const bg = h.headerColor || '#1D2B38';
  const subBg = h.subBgColor || bg;
  return {
    bg,
    headingColor: h.headingColor || readableText(bg),
    subBg,
    subColor: h.subColor || readableText(subBg),
    subSameBand: same(subBg, bg),
  };
}
