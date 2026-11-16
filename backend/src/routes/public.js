const express = require('express');
const { sql, getPool } = require('../db');
const ah = require('../utils/asyncHandler');
const { loadQuestions } = require('../services/questions');
const { GUID_RE, assetUrl } = require('../services/assets');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DELTA = 60; // heartbeat every 15s; anything above 60s per beat is ignored
const MAX_AWAY = 24 * 3600; // away time is also capped to the real gap since the last beat (in SQL)
const MAX_LEAVES = 50; // leaves per beat (a beat is sent on every leave, so this is normally 0 or 1)
const allowedDomains = () => (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);

// sendBeacon posts text/plain, so the body may arrive as a string.
function body(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}

const notFound = (res) => res.status(404).json({ error: 'This link is not valid.' });

// ================= Share link (one per article) =================

async function findShare(pool, shareToken) {
  if (!GUID_RE.test(shareToken || '')) return null;
  const r = await pool.request().input('t', sql.UniqueIdentifier, shareToken).query(`
    SELECT ArticleId, Title, HeaderColor, LogoAssetId, IsShareActive
    FROM dbo.Articles WHERE ShareToken = @t`);
  return r.recordset[0] || null;
}

router.get('/share/:shareToken', ah(async (req, res) => {
  const pool = await getPool();
  const a = await findShare(pool, req.params.shareToken);
  if (!a) return notFound(res);
  res.json({
    title: a.Title,
    headerColor: a.HeaderColor,
    logoUrl: assetUrl(a.LogoAssetId),
    active: !!a.IsShareActive,
    emailDomains: allowedDomains(),
  });
}));

// Reader enters name/email once; same email always gets the same personal token back.
router.post('/share/:shareToken/join', ah(async (req, res) => {
  const pool = await getPool();
  const a = await findShare(pool, req.params.shareToken);
  if (!a) return notFound(res);
  if (!a.IsShareActive) return res.status(410).json({ error: 'This link is closed. Contact the person who shared it.' });

  const name = String(req.body.name || '').trim().slice(0, 200);
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 256);
  const department = String(req.body.department || '').trim().slice(0, 150) || null;
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const domains = allowedDomains();
  if (domains.length && !domains.includes(email.split('@')[1])) {
    return res.status(400).json({ error: `Use your company email (${domains.map((d) => '@' + d).join(', ')}).` });
  }

  const select = () => pool.request().input('a', sql.Int, a.ArticleId).input('e', sql.NVarChar(256), email)
    .query('SELECT Token FROM dbo.ArticleRecipients WHERE ArticleId = @a AND Email = @e');

  let found = await select();
  if (!found.recordset.length) {
    try {
      await pool.request()
        .input('a', sql.Int, a.ArticleId)
        .input('n', sql.NVarChar(200), name)
        .input('e', sql.NVarChar(256), email)
        .input('d', sql.NVarChar(150), department)
        .query(`INSERT INTO dbo.ArticleRecipients (ArticleId, EmployeeName, Email, Department, Source)
                VALUES (@a, @n, @e, @d, 'LINK')`);
    } catch (e) {
      if (e.number !== 2627 && e.number !== 2601) throw e; // same email joined at the same moment
    }
    found = await select();
  }
  res.json({ token: String(found.recordset[0].Token).toLowerCase() });
}));

// ================= Personal token (reading + tracking + answers) =================

async function findRecipient(pool, token) {
  if (!GUID_RE.test(token || '')) return null;
  const r = await pool.request().input('t', sql.UniqueIdentifier, token).query(`
    SELECT r.RecipientId, r.EmployeeName, r.ArticleId, r.Source,
           CASE WHEN s.ResponseId IS NULL THEN 0 ELSE 1 END AS Submitted
    FROM dbo.ArticleRecipients r
    LEFT JOIN dbo.ArticleResponses s ON s.RecipientId = r.RecipientId
    WHERE r.Token = @t`);
  return r.recordset[0] || null;
}

router.get('/:token', ah(async (req, res) => {
  const pool = await getPool();
  const rec = await findRecipient(pool, req.params.token);
  if (!rec) return notFound(res);
  const a = await pool.request().input('a', sql.Int, rec.ArticleId)
    .query('SELECT Title, ContentHtml, HeaderColor, LogoAssetId FROM dbo.Articles WHERE ArticleId = @a');
  const art = a.recordset[0];
  res.json({
    name: rec.EmployeeName,
    title: art.Title,
    contentHtml: art.ContentHtml,
    headerColor: art.HeaderColor,
    logoUrl: assetUrl(art.LogoAssetId),
    submitted: !!rec.Submitted,
    questions: rec.Submitted ? [] : await loadQuestions(pool, rec.ArticleId), // no isCorrect here
  });
}));

router.post('/:token/open', ah(async (req, res) => {
  const pool = await getPool();
  const rec = await findRecipient(pool, req.params.token);
  if (!rec) return notFound(res);
  const r = await pool.request()
    .input('r', sql.Int, rec.RecipientId)
    .input('ua', sql.NVarChar(500), (req.get('user-agent') || '').slice(0, 500))
    .input('ip', sql.VarChar(64), (req.ip || '').slice(0, 64))
    .query(`INSERT INTO dbo.ArticleViewSessions (RecipientId, UserAgent, IpAddress)
            OUTPUT INSERTED.SessionId VALUES (@r, @ua, @ip)`);
  res.json({ sessionId: r.recordset[0].SessionId });
}));

async function updateSession(req, res, closing) {
  const pool = await getPool();
  const rec = await findRecipient(pool, req.params.token);
  if (!rec) return notFound(res);
  const b = body(req);
  if (!GUID_RE.test(b.sessionId || '')) return res.status(400).json({ error: 'sessionId is required.' });

  const clamp = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  const delta = clamp(b.activeDelta, MAX_DELTA);
  const away = clamp(b.awayDelta, MAX_AWAY);
  const leaves = clamp(b.awayCount, MAX_LEAVES);
  const scroll = clamp(b.scrollPct, 100);

  // Away seconds can never exceed the real time since the previous beat (+5 s for clock/network slack).
  // In SET, LastSeenAt still refers to the value BEFORE this update.
  await pool.request()
    .input('s', sql.UniqueIdentifier, b.sessionId)
    .input('r', sql.Int, rec.RecipientId)
    .input('d', sql.Int, delta)
    .input('w', sql.Int, away)
    .input('n', sql.Int, leaves)
    .input('p', sql.TinyInt, scroll)
    .input('c', sql.Bit, closing ? 1 : 0)
    .query(`UPDATE dbo.ArticleViewSessions
            SET ActiveSeconds = ActiveSeconds + @d,
                AwaySeconds   = AwaySeconds + CASE
                                  WHEN @w > DATEDIFF(SECOND, LastSeenAt, SYSUTCDATETIME()) + 5
                                  THEN DATEDIFF(SECOND, LastSeenAt, SYSUTCDATETIME()) + 5
                                  ELSE @w END,
                AwayCount     = AwayCount + @n,
                MaxScrollPct  = CASE WHEN @p > MaxScrollPct THEN @p ELSE MaxScrollPct END,
                LastSeenAt    = SYSUTCDATETIME(),
                ClosedAt      = CASE WHEN @c = 1 THEN SYSUTCDATETIME() ELSE ClosedAt END
            WHERE SessionId = @s AND RecipientId = @r`);
  res.status(204).end();
}

router.post('/:token/heartbeat', ah((req, res) => updateSession(req, res, false)));
router.post('/:token/close', ah((req, res) => updateSession(req, res, true)));

// answers: [{ questionId, optionId?, text? }]
router.post('/:token/submit', ah(async (req, res) => {
  const pool = await getPool();
  const rec = await findRecipient(pool, req.params.token);
  if (!rec) return notFound(res);
  if (rec.Submitted) return res.status(409).json({ error: 'You have already submitted your answers.' });

  const questions = await loadQuestions(pool, rec.ArticleId, { includeCorrect: true });
  const given = new Map((Array.isArray(req.body.answers) ? req.body.answers : [])
    .map((a) => [Number(a.questionId), a]));

  const rows = [];
  let correct = 0;
  let mcqTotal = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const a = given.get(q.questionId);
    if (q.type === 'MCQ') {
      mcqTotal++;
      const opt = a && q.options.find((o) => o.optionId === Number(a.optionId));
      if (!opt) return res.status(400).json({ error: `Choose an option for question ${i + 1}.` });
      if (opt.isCorrect) correct++;
      rows.push({ questionId: q.questionId, optionId: opt.optionId, text: null });
    } else {
      const text = a && typeof a.text === 'string' ? a.text.trim() : '';
      if (!text) return res.status(400).json({ error: `Write an answer for question ${i + 1}.` });
      rows.push({ questionId: q.questionId, optionId: null, text: text.slice(0, 4000) });
    }
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await new sql.Request(tx)
      .input('r', sql.Int, rec.RecipientId)
      .input('c', sql.Int, correct)
      .input('t', sql.Int, mcqTotal)
      .query(`INSERT INTO dbo.ArticleResponses (RecipientId, McqCorrect, McqTotal)
              OUTPUT INSERTED.ResponseId VALUES (@r, @c, @t)`);
    const responseId = r.recordset[0].ResponseId;
    for (const row of rows) {
      await new sql.Request(tx)
        .input('s', sql.Int, responseId)
        .input('q', sql.Int, row.questionId)
        .input('o', sql.Int, row.optionId)
        .input('t', sql.NVarChar(sql.MAX), row.text)
        .query(`INSERT INTO dbo.ResponseAnswers (ResponseId, QuestionId, SelectedOptionId, AnswerText)
                VALUES (@s, @q, @o, @t)`);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    if (e.number === 2627 || e.number === 2601) {
      return res.status(409).json({ error: 'You have already submitted your answers.' });
    }
    throw e;
  }
  res.status(201).json({ ok: true });
}));

module.exports = router;
