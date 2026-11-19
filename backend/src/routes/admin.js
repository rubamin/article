const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const { sql, getPool } = require('../db');
const adminAuth = require('../middleware/adminAuth');
const ah = require('../utils/asyncHandler');
const {
  MAX_QUESTIONS, DEFAULT_QUESTIONS, MAX_OPTIONS, MAX_GRID_ROWS, MAX_GRID_COLS, FILE_KINDS,
  validateArticle, insertQuestions, loadQuestions, correctText,
} = require('../services/questions');
const { LIMITS, DEFAULT_QUIZ_TITLE, validateHeader, headerOut, HEADER_COLUMNS } = require('../services/header');
const {
  MAX_IMAGE_BYTES, GUID_RE, sniffImage, assetUrl, saveAsset, assetBelongsTo,
} = require('../services/assets');

const router = express.Router();
router.use(adminAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const DEFAULT_HEADER = '#1D2B38';

const appUrl = () => (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
const personalLink = (t) => `${appUrl()}/a/${String(t).toLowerCase()}`;
const shareLink = (t) => `${appUrl()}/r/${String(t).toLowerCase()}`;

// Every article query is scoped to the signed-in admin.
async function ownArticle(pool, id, adminId) {
  const r = await pool.request().input('a', sql.Int, id).input('u', sql.Int, adminId).query(`
    SELECT ArticleId, Title, ContentHtml, ContentSource, HeaderColor, LogoAssetId, ${HEADER_COLUMNS},
           ShareToken, IsShareActive, CreatedAt, UpdatedAt
    FROM dbo.Articles WHERE ArticleId = @a AND CreatedBy = @u`);
  return r.recordset[0] || null;
}

const meta = (a) => ({
  articleId: a.ArticleId,
  title: a.Title,
  contentSource: a.ContentSource,
  headerColor: a.HeaderColor,
  logoAssetId: a.LogoAssetId ? String(a.LogoAssetId).toLowerCase() : null,
  logoUrl: assetUrl(a.LogoAssetId),
  ...headerOut(a),
  quizTitle: a.QuizTitle || '',
  quizNote: a.QuizNote || '',
  shareLink: shareLink(a.ShareToken),
  shareActive: !!a.IsShareActive,
});

async function responseCount(pool, articleId) {
  const r = await pool.request().input('a', sql.Int, articleId).query(`
    SELECT COUNT(*) AS N FROM dbo.ArticleResponses s
    JOIN dbo.ArticleRecipients r ON r.RecipientId = s.RecipientId
    WHERE r.ArticleId = @a`);
  return r.recordset[0].N;
}

// Branding + content source checks shared by create and update
async function validateMeta(pool, body, adminId) {
  const contentSource = body.contentSource || 'HTML';
  if (!['HTML', 'WORD'].includes(contentSource)) return { error: 'Content type must be Word or HTML.' };
  const headerColor = body.headerColor || DEFAULT_HEADER;
  if (!HEX_RE.test(headerColor)) return { error: 'Header colour must be a hex value like #1D2B38.' };
  const logoAssetId = body.logoAssetId || null;
  if (logoAssetId && !(await assetBelongsTo(pool, logoAssetId, adminId))) {
    return { error: 'The logo was not found. Upload it again.' };
  }
  const h = validateHeader(body);
  if (h.error) return { error: h.error };
  return { contentSource, headerColor: headerColor.toUpperCase(), logoAssetId, ...h };
}

// Inputs for the new header / quiz columns, shared by INSERT and UPDATE
const headerInputs = (req, m) => req
  .input('hcol', sql.Char(7), m.headingColor)
  .input('hsz', sql.SmallInt, m.headingSize)
  .input('st', sql.NVarChar(300), m.subTitle)
  .input('scol', sql.Char(7), m.subColor)
  .input('sbg', sql.Char(7), m.subBgColor)
  .input('ssz', sql.SmallInt, m.subSize)
  .input('qt', sql.NVarChar(300), m.quizTitle)
  .input('qn', sql.NVarChar(1000), m.quizNote);

router.get('/config', (req, res) => res.json({
  maxQuestions: MAX_QUESTIONS,
  defaultQuestions: DEFAULT_QUESTIONS,
  maxOptions: MAX_OPTIONS,
  maxGridRows: MAX_GRID_ROWS,
  maxGridCols: MAX_GRID_COLS,
  fileKinds: FILE_KINDS,
  headingSize: LIMITS.headingSize,
  subSize: LIMITS.subSize,
  defaultQuizTitle: DEFAULT_QUIZ_TITLE,
}));

// ---------- Images (article images + header logos) ----------
router.post('/assets', upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image to upload.' });
  if (req.file.size > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'Images must be 5 MB or smaller.' });
  const mimeType = sniffImage(req.file.buffer);
  if (!mimeType) return res.status(400).json({ error: 'Use a PNG, JPG, GIF or WebP image.' });
  const pool = await getPool();
  const id = await saveAsset(pool, req.admin.adminId, {
    buffer: req.file.buffer, mimeType, fileName: req.file.originalname,
  });
  res.status(201).json({ assetId: id, url: assetUrl(id) });
}));

// ---------- Word (.docx) import: converts to HTML, images stored as assets ----------
router.post('/import-docx', upload.single('file'), ah(async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'Choose a Word (.docx) file.' });
  const isZip = f.buffer.length > 4 && f.buffer[0] === 0x50 && f.buffer[1] === 0x4b;
  if (!/\.docx$/i.test(f.originalname || '') || !isZip) {
    return res.status(400).json({ error: 'Only .docx files can be imported. Save older .doc files as .docx first.' });
  }

  const pool = await getPool();
  let skipped = 0;
  const convertImage = mammoth.images.imgElement(async (image) => {
    const buffer = await image.read();
    const mimeType = sniffImage(buffer);
    if (!mimeType || buffer.length > MAX_IMAGE_BYTES) {
      skipped++;
      return { src: '' };
    }
    const id = await saveAsset(pool, req.admin.adminId, { buffer, mimeType, fileName: 'word-image' });
    return { src: assetUrl(id) };
  });

  let result;
  try {
    result = await mammoth.convertToHtml({ buffer: f.buffer }, {
      convertImage,
      // The article title is the page's H1 (in the coloured header), so Word headings move one level down.
      styleMap: [
        "p[style-name='Title'] => h2:fresh",
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h3:fresh",
        "p[style-name='Heading 3'] => h4:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
      ],
    });
  } catch {
    return res.status(400).json({ error: 'This Word file could not be read. Open it in Word, save again, and retry.' });
  }

  const html = result.value.replace(/<img[^>]*src=""[^>]*>/g, '');
  const warnings = [];
  if (skipped) warnings.push(`${skipped} image(s) were skipped (unsupported format such as EMF/WMF, or larger than 5 MB).`);
  res.json({ html, warnings });
}));

// ---------- Articles ----------
router.get('/articles', ah(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('u', sql.Int, req.admin.adminId).query(`
    SELECT a.ArticleId, a.Title, a.CreatedAt, a.ShareToken, a.IsShareActive,
      (SELECT COUNT(*) FROM dbo.ArticleRecipients r WHERE r.ArticleId = a.ArticleId) AS Readers,
      (SELECT COUNT(DISTINCT v.RecipientId) FROM dbo.ArticleViewSessions v
         JOIN dbo.ArticleRecipients r ON r.RecipientId = v.RecipientId
         WHERE r.ArticleId = a.ArticleId) AS Opened,
      (SELECT COUNT(*) FROM dbo.ArticleResponses s
         JOIN dbo.ArticleRecipients r ON r.RecipientId = s.RecipientId
         WHERE r.ArticleId = a.ArticleId) AS Submitted
    FROM dbo.Articles a
    WHERE a.CreatedBy = @u
    ORDER BY a.CreatedAt DESC`);
  res.json(r.recordset.map((x) => ({
    articleId: x.ArticleId, title: x.Title, createdAt: x.CreatedAt,
    shareLink: shareLink(x.ShareToken), shareActive: !!x.IsShareActive,
    readers: x.Readers, opened: x.Opened, submitted: x.Submitted,
  })));
}));

// Header look, logo and quiz heading from this admin's latest article, to prefill a new one.
// The subheading text is not copied: it usually changes per article (e.g. the edition).
router.get('/articles/defaults', ah(async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().input('u', sql.Int, req.admin.adminId).query(`
    SELECT TOP 1 HeaderColor, LogoAssetId, ${HEADER_COLUMNS} FROM dbo.Articles
    WHERE CreatedBy = @u ORDER BY CreatedAt DESC`);
  const a = r.recordset[0];
  const h = a ? headerOut(a) : headerOut({});
  res.json({
    headerColor: a ? a.HeaderColor : DEFAULT_HEADER,
    logoAssetId: a && a.LogoAssetId ? String(a.LogoAssetId).toLowerCase() : null,
    logoUrl: a ? assetUrl(a.LogoAssetId) : null,
    ...h,
    subTitle: '',
    quizTitle: a ? a.QuizTitle || '' : '',
    quizNote: a ? a.QuizNote || '' : '',
  });
}));

router.get('/articles/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const pool = await getPool();
  const a = await ownArticle(pool, id, req.admin.adminId);
  if (!a) return res.status(404).json({ error: 'Article not found.' });
  res.json({
    ...meta(a),
    contentHtml: a.ContentHtml,
    createdAt: a.CreatedAt,
    updatedAt: a.UpdatedAt,
    questions: await loadQuestions(pool, id, { includeCorrect: true }),
    responseCount: await responseCount(pool, id),
  });
}));

router.post('/articles', ah(async (req, res) => {
  const err = validateArticle(req.body);
  if (err) return res.status(400).json({ error: err });
  const pool = await getPool();
  const m = await validateMeta(pool, req.body, req.admin.adminId);
  if (m.error) return res.status(400).json({ error: m.error });
  const { title, contentHtml, questions } = req.body;

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await headerInputs(new sql.Request(tx), m)
      .input('t', sql.NVarChar(300), title.trim())
      .input('c', sql.NVarChar(sql.MAX), contentHtml)
      .input('cs', sql.VarChar(10), m.contentSource)
      .input('hc', sql.Char(7), m.headerColor)
      .input('lg', sql.UniqueIdentifier, m.logoAssetId)
      .input('u', sql.Int, req.admin.adminId)
      .query(`INSERT INTO dbo.Articles (Title, ContentHtml, ContentSource, HeaderColor, LogoAssetId, CreatedBy,
                HeadingColor, HeadingSize, SubTitle, SubColor, SubBgColor, SubSize, QuizTitle, QuizNote)
              OUTPUT INSERTED.ArticleId VALUES (@t, @c, @cs, @hc, @lg, @u, @hcol, @hsz, @st, @scol, @sbg, @ssz, @qt, @qn)`);
    const articleId = r.recordset[0].ArticleId;
    await insertQuestions(tx, articleId, questions);
    await tx.commit();
    res.status(201).json({ articleId });
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}));

// Questions are locked once anyone has submitted answers; title/content/header stay editable.
router.put('/articles/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const err = validateArticle(req.body);
  if (err) return res.status(400).json({ error: err });
  const pool = await getPool();
  if (!(await ownArticle(pool, id, req.admin.adminId))) return res.status(404).json({ error: 'Article not found.' });
  const m = await validateMeta(pool, req.body, req.admin.adminId);
  if (m.error) return res.status(400).json({ error: m.error });
  const { title, contentHtml, questions } = req.body;

  const locked = (await responseCount(pool, id)) > 0;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await headerInputs(new sql.Request(tx), m)
      .input('a', sql.Int, id)
      .input('t', sql.NVarChar(300), title.trim())
      .input('c', sql.NVarChar(sql.MAX), contentHtml)
      .input('cs', sql.VarChar(10), m.contentSource)
      .input('hc', sql.Char(7), m.headerColor)
      .input('lg', sql.UniqueIdentifier, m.logoAssetId)
      .query(`UPDATE dbo.Articles
              SET Title = @t, ContentHtml = @c, ContentSource = @cs, HeaderColor = @hc,
                  LogoAssetId = @lg, HeadingColor = @hcol, HeadingSize = @hsz, SubTitle = @st,
                  SubColor = @scol, SubBgColor = @sbg, SubSize = @ssz, QuizTitle = @qt, QuizNote = @qn,
                  UpdatedAt = SYSUTCDATETIME()
              WHERE ArticleId = @a`);
    if (!locked) {
      await new sql.Request(tx).input('a', sql.Int, id)
        .query('DELETE FROM dbo.ArticleQuestions WHERE ArticleId = @a'); // options cascade
      await insertQuestions(tx, id, questions);
    }
    await tx.commit();
    res.json({ articleId: id, questionsLocked: locked });
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}));

// Open / close the share link for new readers (existing readers keep access)
router.patch('/articles/:id/share', ah(async (req, res) => {
  const id = Number(req.params.id);
  const pool = await getPool();
  if (!(await ownArticle(pool, id, req.admin.adminId))) return res.status(404).json({ error: 'Article not found.' });
  const active = !!(req.body && req.body.active);
  await pool.request().input('a', sql.Int, id).input('s', sql.Bit, active ? 1 : 0)
    .query('UPDATE dbo.Articles SET IsShareActive = @s WHERE ArticleId = @a');
  res.json({ shareActive: active });
}));

// Invite specific people (personal links). Existing emails for this article are skipped.
router.post('/articles/:id/recipients', ah(async (req, res) => {
  const id = Number(req.params.id);
  const pool = await getPool();
  if (!(await ownArticle(pool, id, req.admin.adminId))) return res.status(404).json({ error: 'Article not found.' });

  const list = Array.isArray(req.body.recipients) ? req.body.recipients : [];
  if (!list.length) return res.status(400).json({ error: 'Add at least one person.' });

  const clean = [];
  for (let i = 0; i < list.length; i++) {
    const name = (list[i].name || '').trim();
    const email = (list[i].email || '').trim().toLowerCase();
    const department = (list[i].department || '').trim() || null;
    if (!name || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: `Line ${i + 1}: needs a name and a valid email.` });
    }
    clean.push({ name, email, department });
  }

  let added = 0;
  for (const p of clean) {
    const r = await pool.request()
      .input('a', sql.Int, id)
      .input('n', sql.NVarChar(200), p.name)
      .input('e', sql.NVarChar(256), p.email)
      .input('d', sql.NVarChar(150), p.department)
      .query(`IF NOT EXISTS (SELECT 1 FROM dbo.ArticleRecipients WHERE ArticleId = @a AND Email = @e)
              BEGIN
                INSERT INTO dbo.ArticleRecipients (ArticleId, EmployeeName, Email, Department, Source)
                VALUES (@a, @n, @e, @d, 'INVITE');
                SELECT 1 AS Added;
              END`);
    if (r.recordset && r.recordset.length) added++;
  }
  res.json({ added, skipped: clean.length - added });
}));

// Per-reader report: opens, durations, submission, score
router.get('/articles/:id/report', ah(async (req, res) => {
  const id = Number(req.params.id);
  const pool = await getPool();
  const a = await ownArticle(pool, id, req.admin.adminId);
  if (!a) return res.status(404).json({ error: 'Article not found.' });

  const r = await pool.request().input('a', sql.Int, id).query(`
    SELECT r.RecipientId, r.EmployeeName, r.Email, r.Department, r.Token, r.Source, r.CreatedAt,
           s.OpenCount, s.FirstOpenedAt, s.LastOpenedAt, s.TotalOpenSeconds, s.TotalActiveSeconds, s.TotalAwaySeconds, s.TotalAwayCount, s.MaxScrollPct,
           resp.SubmittedAt, resp.McqCorrect, resp.McqTotal
    FROM dbo.ArticleRecipients r
    OUTER APPLY (
      SELECT COUNT(*) AS OpenCount,
             MIN(v.OpenedAt) AS FirstOpenedAt,
             MAX(v.OpenedAt) AS LastOpenedAt,
             SUM(DATEDIFF(SECOND, v.OpenedAt, COALESCE(v.ClosedAt, v.LastSeenAt))) AS TotalOpenSeconds,
             SUM(v.ActiveSeconds) AS TotalActiveSeconds,
             SUM(v.AwaySeconds) AS TotalAwaySeconds,
             SUM(v.AwayCount) AS TotalAwayCount,
             MAX(v.MaxScrollPct) AS MaxScrollPct
      FROM dbo.ArticleViewSessions v WHERE v.RecipientId = r.RecipientId
    ) s
    LEFT JOIN dbo.ArticleResponses resp ON resp.RecipientId = r.RecipientId
    WHERE r.ArticleId = @a
    ORDER BY COALESCE(s.LastOpenedAt, r.CreatedAt) DESC`);

  res.json({
    article: meta(a),
    recipients: r.recordset.map((x) => ({
      recipientId: x.RecipientId,
      name: x.EmployeeName,
      email: x.Email,
      department: x.Department,
      source: x.Source,
      link: personalLink(x.Token),
      openCount: x.OpenCount || 0,
      firstOpenedAt: x.FirstOpenedAt,
      lastOpenedAt: x.LastOpenedAt,
      totalOpenSeconds: x.TotalOpenSeconds || 0,
      totalActiveSeconds: x.TotalActiveSeconds || 0,
      totalAwaySeconds: x.TotalAwaySeconds || 0,
      totalAwayCount: x.TotalAwayCount || 0,
      maxScrollPct: x.MaxScrollPct || 0,
      submittedAt: x.SubmittedAt,
      mcqCorrect: x.McqCorrect,
      mcqTotal: x.McqTotal,
    })),
  });
}));

// Every reader's answers for an article, for the Excel export (questions as columns)
router.get('/articles/:id/answers', ah(async (req, res) => {
  const id = Number(req.params.id);
  const pool = await getPool();
  const a = await ownArticle(pool, id, req.admin.adminId);
  if (!a) return res.status(404).json({ error: 'Article not found.' });

  const questions = await loadQuestions(pool, id, { includeCorrect: true });
  const r = await pool.request().input('a', sql.Int, id).query(`
    SELECT r.RecipientId, ans.QuestionId, ans.AnswerText,
           COALESCE(ans.IsCorrect, sel.IsCorrect) AS IsCorrect, sel.OptionText AS SelectedOption
    FROM dbo.ArticleRecipients r
    JOIN dbo.ArticleResponses s ON s.RecipientId = r.RecipientId
    JOIN dbo.ResponseAnswers ans ON ans.ResponseId = s.ResponseId
    LEFT JOIN dbo.QuestionOptions sel ON sel.OptionId = ans.SelectedOptionId
    WHERE r.ArticleId = @a`);

  // { recipientId: { questionId: { text, isCorrect } } }
  const answers = {};
  for (const x of r.recordset) {
    (answers[x.RecipientId] ||= {})[x.QuestionId] = {
      text: x.AnswerText || x.SelectedOption || '',
      isCorrect: x.IsCorrect === null || x.IsCorrect === undefined ? null : !!x.IsCorrect,
    };
  }

  res.json({
    questions: questions.map((q, i) => ({
      questionId: q.questionId,
      order: i + 1,
      text: q.text,
      type: q.type,
      correctOption: correctText(q),
    })),
    answers,
  });
}));

// One reader: every open session + every answer
router.get('/recipients/:rid', ah(async (req, res) => {
  const rid = Number(req.params.rid);
  const pool = await getPool();
  const own = await pool.request().input('r', sql.Int, rid).input('u', sql.Int, req.admin.adminId).query(`
    SELECT 1 AS X FROM dbo.ArticleRecipients r JOIN dbo.Articles a ON a.ArticleId = r.ArticleId
    WHERE r.RecipientId = @r AND a.CreatedBy = @u`);
  if (!own.recordset.length) return res.status(404).json({ error: 'Reader not found.' });

  const sessions = await pool.request().input('r', sql.Int, rid).query(`
    SELECT OpenedAt, LastSeenAt, ClosedAt, ActiveSeconds, AwaySeconds, AwayCount, MaxScrollPct, UserAgent,
           DATEDIFF(SECOND, OpenedAt, COALESCE(ClosedAt, LastSeenAt)) AS OpenSeconds
    FROM dbo.ArticleViewSessions WHERE RecipientId = @r ORDER BY OpenedAt`);

  const resp = await pool.request().input('r', sql.Int, rid).query(`
    SELECT s.ResponseId, r.ArticleId FROM dbo.ArticleRecipients r
    LEFT JOIN dbo.ArticleResponses s ON s.RecipientId = r.RecipientId
    WHERE r.RecipientId = @r`);
  const { ResponseId: responseId, ArticleId: articleId } = resp.recordset[0];

  let answers = [];
  if (responseId) {
    const rows = await pool.request().input('s', sql.Int, responseId).query(`
      SELECT ans.QuestionId, ans.AnswerText, ans.AnswerJson,
             COALESCE(ans.IsCorrect, sel.IsCorrect) AS IsCorrect, sel.OptionText AS SelectedOption
      FROM dbo.ResponseAnswers ans
      LEFT JOIN dbo.QuestionOptions sel ON sel.OptionId = ans.SelectedOptionId
      WHERE ans.ResponseId = @s`);
    const byQ = new Map(rows.recordset.map((x) => [x.QuestionId, x]));
    const questions = await loadQuestions(pool, articleId, { includeCorrect: true });
    answers = questions.map((q, i) => {
      const x = byQ.get(q.questionId);
      let json = null;
      if (x && x.AnswerJson) { try { json = JSON.parse(x.AnswerJson); } catch { json = null; } }
      // Answers saved before v6 have the choice only in SelectedOptionId
      const text = x ? (x.AnswerText || x.SelectedOption || '') : '';
      const graded = x && x.IsCorrect !== null && x.IsCorrect !== undefined;
      return {
        order: i + 1,
        question: q.text,
        type: q.type,
        answered: !!x,
        answerText: text,
        files: json && Array.isArray(json.files) ? json.files : [],
        isCorrect: graded ? !!x.IsCorrect : null,
        correctOption: correctText(q),
      };
    });
  }

  res.json({
    sessions: sessions.recordset.map((s) => ({
      openedAt: s.OpenedAt, lastSeenAt: s.LastSeenAt, closedAt: s.ClosedAt,
      openSeconds: s.OpenSeconds, activeSeconds: s.ActiveSeconds,
      awaySeconds: s.AwaySeconds, awayCount: s.AwayCount,
      maxScrollPct: s.MaxScrollPct, userAgent: s.UserAgent,
    })),
    answers,
  });
}));

// A file a reader uploaded for a File upload question (always downloaded, never shown inline)
router.get('/response-files/:fileId', ah(async (req, res) => {
  if (!GUID_RE.test(req.params.fileId)) return res.status(404).json({ error: 'File not found.' });
  const pool = await getPool();
  const r = await pool.request()
    .input('f', sql.UniqueIdentifier, req.params.fileId)
    .input('u', sql.Int, req.admin.adminId)
    .query(`SELECT f.FileName, f.Data FROM dbo.ResponseFiles f
            JOIN dbo.ArticleRecipients r ON r.RecipientId = f.RecipientId
            JOIN dbo.Articles a ON a.ArticleId = r.ArticleId
            WHERE f.FileId = @f AND a.CreatedBy = @u`);
  if (!r.recordset.length) return res.status(404).json({ error: 'File not found.' });
  const f = r.recordset[0];
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.FileName)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.send(f.Data);
}));

module.exports = router;
