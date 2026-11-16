// Question types (must match backend/src/services/questions.js).
// "from" says where the type comes from: G = Google Forms, M = Microsoft Forms.
export const TYPE_GROUPS = [
  {
    label: 'Text',
    types: [
      { code: 'SHORT', label: 'Short answer', from: 'G · M' },
      { code: 'TEXT', label: 'Paragraph (long answer)', from: 'G · M' },
    ],
  },
  {
    label: 'Choice',
    types: [
      { code: 'MCQ', label: 'Multiple choice (one answer)', from: 'G · M' },
      { code: 'CHECKBOX', label: 'Checkboxes (many answers)', from: 'G · M' },
      { code: 'DROPDOWN', label: 'Dropdown', from: 'G' },
      { code: 'RANKING', label: 'Ranking', from: 'M' },
    ],
  },
  {
    label: 'Scale and rating',
    types: [
      { code: 'SCALE', label: 'Linear scale', from: 'G' },
      { code: 'RATING', label: 'Rating', from: 'G · M' },
      { code: 'NPS', label: 'Net Promoter Score (0–10)', from: 'M' },
      { code: 'LIKERT', label: 'Likert', from: 'M' },
    ],
  },
  {
    label: 'Grid',
    types: [
      { code: 'GRID', label: 'Multiple choice grid', from: 'G' },
      { code: 'CHECKGRID', label: 'Checkbox grid', from: 'G' },
    ],
  },
  {
    label: 'Date, time and files',
    types: [
      { code: 'DATE', label: 'Date', from: 'G · M' },
      { code: 'TIME', label: 'Time', from: 'G' },
      { code: 'FILE', label: 'File upload', from: 'G · M' },
    ],
  },
];

export const TYPE_LABEL = Object.fromEntries(TYPE_GROUPS.flatMap((g) => g.types.map((t) => [t.code, t.label])));
export const OPTION_TYPES = ['MCQ', 'CHECKBOX', 'DROPDOWN', 'RANKING'];
export const GRID_TYPES = ['GRID', 'CHECKGRID', 'LIKERT'];
export const SHUFFLE_TYPES = ['MCQ', 'CHECKBOX', 'DROPDOWN'];

export const LIKERT_COLUMNS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

export const FILE_KIND_LABELS = {
  pdf: 'PDF',
  image: 'Image',
  document: 'Document (Word, text)',
  spreadsheet: 'Spreadsheet (Excel, CSV)',
  presentation: 'Presentation (PowerPoint)',
};
export const FILE_KIND_EXT = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  pdf: ['pdf'],
  document: ['doc', 'docx', 'odt', 'rtf', 'txt'],
  spreadsheet: ['xls', 'xlsx', 'ods', 'csv'],
  presentation: ['ppt', 'pptx', 'odp'],
};

export function defaultSettings(type) {
  switch (type) {
    case 'SHORT': return { answers: [] };
    case 'MCQ': case 'CHECKBOX': return { other: false };
    case 'SCALE': return { min: 1, max: 5, minLabel: '', maxLabel: '' };
    case 'RATING': return { levels: 5, symbol: 'star' };
    case 'GRID': case 'CHECKGRID': return { rows: ['', ''], columns: ['', ''] };
    case 'LIKERT': return { rows: ['', ''], columns: [...LIKERT_COLUMNS] };
    case 'NPS': return { minLabel: 'Not at all likely', maxLabel: 'Extremely likely' };
    case 'DATE': return { includeTime: false };
    case 'FILE': return { kinds: ['pdf', 'image'], maxFiles: 1, maxSizeMb: 10 };
    default: return {};
  }
}

const blankOption = () => ({ text: '', isCorrect: false });
let keySeq = 0;
export const newKey = () => `q${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export const blankQuestion = (type = 'MCQ') => ({
  key: newKey(),
  type,
  text: '',
  description: '',
  showDescription: false,
  required: true,
  shuffle: false,
  options: OPTION_TYPES.includes(type) ? [blankOption(), blankOption(), blankOption(), blankOption()] : [],
  settings: defaultSettings(type),
});

// Change the type but keep what still fits (question text, options, grid rows)
export function changeType(q, type) {
  const next = { ...q, type, settings: defaultSettings(type) };
  if (OPTION_TYPES.includes(type)) {
    next.options = OPTION_TYPES.includes(q.type) && q.options.length ? q.options : [blankOption(), blankOption(), blankOption(), blankOption()];
    if (type === 'RANKING') next.options = next.options.map((o) => ({ ...o, isCorrect: false }));
    if (type === 'MCQ' || type === 'DROPDOWN') {
      let seen = false;
      next.options = next.options.map((o) => { const c = o.isCorrect && !seen; if (c) seen = true; return { ...o, isCorrect: c }; });
    }
  } else {
    next.options = [];
  }
  if (GRID_TYPES.includes(type) && GRID_TYPES.includes(q.type)) {
    next.settings.rows = q.settings.rows;
    if (type !== 'LIKERT' && q.type !== 'LIKERT') next.settings.columns = q.settings.columns;
  }
  if (!SHUFFLE_TYPES.includes(type)) next.shuffle = false;
  return next;
}

// API question -> editor state
export const fromApi = (q) => ({
  key: newKey(),
  type: q.type,
  text: q.text,
  description: q.description || '',
  showDescription: !!q.description,
  required: q.required !== false,
  shuffle: !!q.shuffle,
  options: (q.options || []).map((o) => ({ text: o.text, isCorrect: !!o.isCorrect })),
  settings: { ...defaultSettings(q.type), ...(q.settings || {}) },
});

// Editor state -> API
export const toApi = (q) => ({
  type: q.type,
  text: q.text,
  description: q.showDescription ? q.description : '',
  required: q.required,
  shuffle: q.shuffle,
  options: OPTION_TYPES.includes(q.type) ? q.options : [],
  settings: q.settings,
});
