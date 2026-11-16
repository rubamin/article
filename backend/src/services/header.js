// Heading / subheading styling and the quiz heading, shared by admin and public routes.
const HEX_RE = /^#[0-9a-f]{6}$/i;

const LIMITS = {
  headingSize: { min: 18, max: 72, def: 40 },
  subSize: { min: 12, max: 40, def: 20 },
};
const DEFAULT_QUIZ_TITLE = 'Check your understanding';

const hexOrNull = (v) => (v ? String(v).toUpperCase() : null);
const lower = (v) => (v ? String(v).toLowerCase() : null);

// Returns { error } or the cleaned values. Empty colour = automatic.
function validateHeader(body) {
  const out = {};
  for (const [key, label] of [['headingColor', 'Heading font colour'], ['subColor', 'Subheading font colour'], ['subBgColor', 'Subheading background colour']]) {
    const v = body[key];
    if (v && !HEX_RE.test(v)) return { error: `${label} must be a hex value like #1D2B38.` };
    out[key] = hexOrNull(v);
  }
  for (const key of ['headingSize', 'subSize']) {
    const { min, max, def } = LIMITS[key];
    const n = body[key] === undefined || body[key] === null || body[key] === '' ? def : Number(body[key]);
    if (!Number.isInteger(n) || n < min || n > max) {
      return { error: `${key === 'headingSize' ? 'Heading' : 'Subheading'} font size must be ${min} to ${max} px.` };
    }
    out[key] = n;
  }
  out.subTitle = String(body.subTitle || '').trim().slice(0, 300) || null;
  out.quizTitle = String(body.quizTitle || '').trim().slice(0, 300) || null;
  out.quizNote = String(body.quizNote || '').trim().slice(0, 1000) || null;
  return out;
}

// DB row -> API (same shape for admin and readers)
function headerOut(a) {
  return {
    headingColor: lower(a.HeadingColor),
    headingSize: a.HeadingSize || LIMITS.headingSize.def,
    subTitle: a.SubTitle || '',
    subColor: lower(a.SubColor),
    subBgColor: lower(a.SubBgColor),
    subSize: a.SubSize || LIMITS.subSize.def,
  };
}

const HEADER_COLUMNS = 'HeadingColor, HeadingSize, SubTitle, SubColor, SubBgColor, SubSize, QuizTitle, QuizNote';

module.exports = { LIMITS, DEFAULT_QUIZ_TITLE, validateHeader, headerOut, HEADER_COLUMNS };
