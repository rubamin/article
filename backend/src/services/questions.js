const { sql } = require('../db');

/* Question types — everything Google Forms and Microsoft Forms offer.
   MCQ and TEXT keep their old codes, so articles made before v6 still work. */
const TYPES = [
  'SHORT',     // Short answer (Google) / Text (Microsoft)
  'TEXT',      // Paragraph (Google) / Long answer (Microsoft)
  'MCQ',       // Multiple choice — one answer
  'CHECKBOX',  // Checkboxes — several answers
  'DROPDOWN',  // Dropdown
  'SCALE',     // Linear scale
  'RATING',    // Rating (stars, numbers, hearts, thumbs)
  'GRID',      // Multiple choice grid
  'CHECKGRID', // Checkbox grid
  'LIKERT',    // Likert (Microsoft) — a grid with an agree/disagree scale
  'RANKING',   // Ranking (Microsoft)
  'NPS',       // Net Promoter Score (Microsoft), 0-10
  'DATE',      // Date (optionally with time)
  'TIME',      // Time
  'FILE',      // File upload
];
const OPTION_TYPES = ['MCQ', 'CHECKBOX', 'DROPDOWN', 'RANKING'];
const GRID_TYPES = ['GRID', 'CHECKGRID', 'LIKERT'];

const MAX_QUESTIONS = Math.min(50, Number(process.env.MAX_QUESTIONS || 20));
const DEFAULT_QUESTIONS = 5;
const MAX_OPTIONS = 20;
const MAX_GRID_ROWS = 20;
const MAX_GRID_COLS = 10;

/* File upload: file kinds the admin can allow, by extension */
const FILE_KINDS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  pdf: ['pdf'],
  document: ['doc', 'docx', 'odt', 'rtf', 'txt'],
  spreadsheet: ['xls', 'xlsx', 'ods', 'csv'],
  presentation: ['ppt', 'pptx', 'odp'],
};
const FILE_MAX_FILES = [1, 5, 10];
const FILE_MAX_MB = [1, 5, 10];
const RATING_SYMBOLS = ['star', 'number', 'heart', 'thumb'];

// Word editor returns "<p></p>" when empty, so check for real text or an image.
function hasContent(html) {
  if (!html) return false;
  if (/<img\s/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
}

const str = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);
const cleanList = (list, max) => (Array.isArray(list) ? list : []).map((t) => str(t, 300)).filter(Boolean).slice(0, max);
const intIn = (v, allowed, def) => (allowed.includes(Number(v)) ? Number(v) : def);
const clampInt = (v, min, max, def) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
};

/* Settings stored as JSON per type. Unknown keys are dropped. */
function cleanSettings(type, s = {}) {
  switch (type) {
    case 'SHORT': return { answers: cleanList(s.answers, 10) }; // accepted answers (optional) -> graded
    case 'MCQ': case 'CHECKBOX': return { other: !!s.other };
    case 'SCALE': {
      const min = s.min === 0 || s.min === '0' ? 0 : 1;
      return { min, max: clampInt(s.max, 2, 10, 5), minLabel: str(s.minLabel, 60), maxLabel: str(s.maxLabel, 60) };
    }
    case 'RATING':
      return { levels: clampInt(s.levels, 2, 10, 5), symbol: RATING_SYMBOLS.includes(s.symbol) ? s.symbol : 'star' };
    case 'GRID': case 'CHECKGRID': case 'LIKERT':
      return { rows: cleanList(s.rows, MAX_GRID_ROWS), columns: cleanList(s.columns, MAX_GRID_COLS) };
    case 'NPS': return { minLabel: str(s.minLabel, 60), maxLabel: str(s.maxLabel, 60) };
    case 'DATE': return { includeTime: !!s.includeTime };
    case 'FILE': {
      const kinds = (Array.isArray(s.kinds) ? s.kinds : []).filter((k) => FILE_KINDS[k]);
      return { kinds: [...new Set(kinds)], maxFiles: intIn(s.maxFiles, FILE_MAX_FILES, 1), maxSizeMb: intIn(s.maxSizeMb, FILE_MAX_MB, 10) };
    }
    default: return {};
  }
}

function validateQuestions(questions) {
  // An empty list is allowed: the article is shared for reading only, without questions.
  if (!Array.isArray(questions)) return 'Questions must be a list.';
  if (questions.length > MAX_QUESTIONS) return `You can add at most ${MAX_QUESTIONS} questions.`;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const n = i + 1;
    if (!q || !q.text || !q.text.trim()) return `Question ${n} has no text.`;
    if (!TYPES.includes(q.type)) return `Question ${n} has an unknown type.`;
    const s = cleanSettings(q.type, q.settings);

    if (OPTION_TYPES.includes(q.type)) {
      const opts = (q.options || []).filter((o) => o && o.text && o.text.trim());
      const min = q.type === 'RANKING' ? 2 : (q.type === 'MCQ' || q.type === 'CHECKBOX') && s.other ? 1 : 2;
      if (opts.length < min) return `Question ${n} needs at least ${min} options.`;
      if (opts.length > MAX_OPTIONS) return `Question ${n} can have at most ${MAX_OPTIONS} options.`;
      const texts = opts.map((o) => o.text.trim().toLowerCase());
      if (new Set(texts).size !== texts.length) return `Question ${n} has the same option twice.`;
      const correct = opts.filter((o) => o.isCorrect).length;
      if ((q.type === 'MCQ' || q.type === 'DROPDOWN') && correct > 1) return `Question ${n}: mark only one correct option.`;
    }
    if (GRID_TYPES.includes(q.type)) {
      if (!s.rows.length) return `Question ${n} needs at least one row.`;
      if (s.columns.length < 2) return `Question ${n} needs at least 2 columns.`;
    }
    if (q.type === 'SCALE' && s.max <= s.min) return `Question ${n}: the scale end must be above the start.`;
    if (q.type === 'FILE' && !s.kinds.length) return `Question ${n}: choose at least one allowed file type.`;
  }
  return null;
}

function validateArticle({ title, contentHtml, questions }) {
  if (!title || !title.trim()) return 'Title is required.';
  if (!hasContent(contentHtml)) return 'Article content is required.';
  return validateQuestions(questions);
}

async function insertQuestions(tx, articleId, questions) {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const settings = cleanSettings(q.type, q.settings);
    const r = await new sql.Request(tx)
      .input('a', sql.Int, articleId)
      .input('o', sql.Int, i + 1)
      .input('t', sql.NVarChar(1000), str(q.text, 1000))
      .input('ty', sql.VarChar(20), q.type)
      .input('d', sql.NVarChar(1000), str(q.description, 1000) || null)
      .input('rq', sql.Bit, q.required === false ? 0 : 1)
      .input('sh', sql.Bit, q.shuffle && OPTION_TYPES.includes(q.type) && q.type !== 'RANKING' ? 1 : 0)
      .input('s', sql.NVarChar(sql.MAX), Object.keys(settings).length ? JSON.stringify(settings) : null)
      .query(`INSERT INTO dbo.ArticleQuestions (ArticleId, SortOrder, QuestionText, QuestionType, Description, IsRequired, Shuffle, Settings)
              OUTPUT INSERTED.QuestionId VALUES (@a, @o, @t, @ty, @d, @rq, @sh, @s)`);
    const questionId = r.recordset[0].QuestionId;

    if (OPTION_TYPES.includes(q.type)) {
      const opts = q.options.filter((o) => o && o.text && o.text.trim());
      for (let j = 0; j < opts.length; j++) {
        await new sql.Request(tx)
          .input('q', sql.Int, questionId)
          .input('o', sql.Int, j + 1)
          .input('t', sql.NVarChar(500), str(opts[j].text, 500))
          .input('c', sql.Bit, opts[j].isCorrect && q.type !== 'RANKING' ? 1 : 0)
          .query(`INSERT INTO dbo.QuestionOptions (QuestionId, SortOrder, OptionText, IsCorrect)
                  VALUES (@q, @o, @t, @c)`);
      }
    }
  }
}

function parseSettings(type, raw) {
  let s = {};
  if (raw) { try { s = JSON.parse(raw); } catch { s = {}; } }
  return cleanSettings(type, s);
}

/* Questions with nested options.
   includeCorrect: admin view (correct options + accepted short answers). Readers never get them. */
async function loadQuestions(pool, articleId, { includeCorrect = false } = {}) {
  const r = await pool.request().input('a', sql.Int, articleId).query(`
    SELECT q.QuestionId, q.SortOrder, q.QuestionText, q.QuestionType, q.Description, q.IsRequired, q.Shuffle, q.Settings,
           o.OptionId, o.OptionText, o.IsCorrect
    FROM dbo.ArticleQuestions q
    LEFT JOIN dbo.QuestionOptions o ON o.QuestionId = q.QuestionId
    WHERE q.ArticleId = @a
    ORDER BY q.SortOrder, o.SortOrder`);

  const map = new Map();
  for (const row of r.recordset) {
    if (!map.has(row.QuestionId)) {
      const settings = parseSettings(row.QuestionType, row.Settings);
      if (!includeCorrect && row.QuestionType === 'SHORT') delete settings.answers;
      map.set(row.QuestionId, {
        questionId: row.QuestionId,
        text: row.QuestionText,
        type: row.QuestionType,
        description: row.Description || '',
        required: row.IsRequired !== false,
        shuffle: !!row.Shuffle,
        settings,
        options: [],
      });
    }
    if (row.OptionId) {
      const opt = { optionId: row.OptionId, text: row.OptionText };
      if (includeCorrect) opt.isCorrect = !!row.IsCorrect;
      map.get(row.QuestionId).options.push(opt);
    }
  }
  return [...map.values()];
}

/* ---------- Answers ----------
   evaluate(q, a, files) checks one answer. Returns
   { empty }                                   nothing given
   { error }                                   given but not valid
   { optionId, text, json, isCorrect }         valid; text is a readable copy for the report
   isCorrect is null when the question is not graded. */
const isGraded = (q) => {
  if (q.type === 'SHORT') return (q.settings.answers || []).length > 0;
  if (['MCQ', 'CHECKBOX', 'DROPDOWN'].includes(q.type)) return q.options.some((o) => o.isCorrect);
  return false;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function evaluate(q, a, files = []) {
  a = a || {};
  const graded = isGraded(q);
  const optById = (id) => q.options.find((o) => o.optionId === Number(id));

  switch (q.type) {
    case 'SHORT': case 'TEXT': {
      const text = typeof a.text === 'string' ? a.text.trim().slice(0, q.type === 'SHORT' ? 500 : 4000) : '';
      if (!text) return { empty: true };
      const isCorrect = graded
        ? q.settings.answers.some((x) => x.trim().toLowerCase() === text.toLowerCase())
        : null;
      return { text, json: null, isCorrect };
    }
    case 'MCQ': case 'DROPDOWN': {
      if (q.type === 'MCQ' && q.settings.other && a.other) {
        const other = str(a.otherText, 500);
        if (!other) return { error: 'Write your answer next to “Other”.' };
        return { text: `Other: ${other}`, json: { other }, isCorrect: graded ? false : null };
      }
      if (a.optionId === undefined || a.optionId === null || a.optionId === '') return { empty: true };
      const opt = optById(a.optionId);
      if (!opt) return { error: 'Choose one of the options.' };
      return { optionId: opt.optionId, text: opt.text, json: null, isCorrect: graded ? !!opt.isCorrect : null };
    }
    case 'CHECKBOX': {
      const ids = [...new Set((Array.isArray(a.optionIds) ? a.optionIds : []).map(Number))];
      const picked = ids.map(optById);
      if (picked.some((o) => !o)) return { error: 'Choose from the options shown.' };
      let other = null;
      if (q.settings.other && a.other) {
        other = str(a.otherText, 500);
        if (!other) return { error: 'Write your answer next to “Other”.' };
      }
      if (!picked.length && !other) return { empty: true };
      const texts = picked.map((o) => o.text);
      if (other) texts.push(`Other: ${other}`);
      let isCorrect = null;
      if (graded) {
        const correct = q.options.filter((o) => o.isCorrect).map((o) => o.optionId).sort().join(',');
        isCorrect = !other && picked.map((o) => o.optionId).sort().join(',') === correct;
      }
      return { text: texts.join('; '), json: { optionIds: picked.map((o) => o.optionId), other }, isCorrect };
    }
    case 'SCALE': case 'RATING': case 'NPS': {
      if (a.value === undefined || a.value === null || a.value === '') return { empty: true };
      const v = Number(a.value);
      const [min, max] = q.type === 'SCALE' ? [q.settings.min, q.settings.max]
        : q.type === 'RATING' ? [1, q.settings.levels] : [0, 10];
      if (!Number.isInteger(v) || v < min || v > max) return { error: `Choose a value from ${min} to ${max}.` };
      return { text: q.type === 'RATING' ? `${v} / ${max}` : String(v), json: { value: v }, isCorrect: null };
    }
    case 'GRID': case 'LIKERT': case 'CHECKGRID': {
      const { rows, columns } = q.settings;
      const given = a.rows && typeof a.rows === 'object' ? a.rows : {};
      const out = {};
      const lines = [];
      for (let r = 0; r < rows.length; r++) {
        const raw = given[r];
        let cols;
        if (q.type === 'CHECKGRID') cols = [...new Set((Array.isArray(raw) ? raw : []).map(Number))];
        else cols = raw === undefined || raw === null || raw === '' ? [] : [Number(raw)];
        if (cols.some((c) => !Number.isInteger(c) || c < 0 || c >= columns.length)) return { error: 'Choose from the columns shown.' };
        if (cols.length) {
          out[r] = q.type === 'CHECKGRID' ? cols : cols[0];
          lines.push(`${rows[r]}: ${cols.map((c) => columns[c]).join(', ')}`);
        }
      }
      if (!lines.length) return { empty: true };
      if (q.required && lines.length < rows.length) return { error: 'Answer every row.' };
      return { text: lines.join('\n'), json: { rows: out }, isCorrect: null };
    }
    case 'RANKING': {
      const order = (Array.isArray(a.order) ? a.order : []).map(Number);
      if (!order.length) return { empty: true };
      const all = q.options.map((o) => o.optionId).sort().join(',');
      if ([...order].sort().join(',') !== all) return { error: 'Rank every option.' };
      return { text: order.map((id, i) => `${i + 1}. ${optById(id).text}`).join('\n'), json: { order }, isCorrect: null };
    }
    case 'DATE': case 'TIME': {
      const v = str(a.value, 20);
      if (!v) return { empty: true };
      const ok = q.type === 'TIME' ? TIME_RE.test(v)
        : (q.settings.includeTime ? DATETIME_RE.test(v) : DATE_RE.test(v)) && !Number.isNaN(Date.parse(v.slice(0, 10)));
      if (!ok) return { error: q.type === 'TIME' ? 'Enter a valid time.' : 'Enter a valid date.' };
      return { text: v.replace('T', ' '), json: { value: v }, isCorrect: null };
    }
    case 'FILE': {
      const ids = [...new Set((Array.isArray(a.fileIds) ? a.fileIds : []).map((x) => String(x).toLowerCase()))];
      if (!ids.length) return { empty: true };
      if (ids.length > q.settings.maxFiles) return { error: `Upload at most ${q.settings.maxFiles} file(s).` };
      const picked = ids.map((id) => files.find((f) => f.fileId === id));
      if (picked.some((f) => !f)) return { error: 'An uploaded file was not found. Upload it again.' };
      return {
        text: picked.map((f) => f.fileName).join('; '),
        json: { files: picked.map((f) => ({ fileId: f.fileId, name: f.fileName, size: f.sizeBytes })) },
        isCorrect: null,
      };
    }
    default: return { error: 'Unknown question type.' };
  }
}

// What the report shows as "correct answer" for graded questions
function correctText(q) {
  if (!isGraded(q)) return null;
  if (q.type === 'SHORT') return q.settings.answers.join(' / ');
  return q.options.filter((o) => o.isCorrect).map((o) => o.text).join('; ');
}

module.exports = {
  TYPES, MAX_QUESTIONS, DEFAULT_QUESTIONS, MAX_OPTIONS, MAX_GRID_ROWS, MAX_GRID_COLS, FILE_KINDS,
  hasContent, validateArticle, insertQuestions, loadQuestions, evaluate, isGraded, correctText,
};
