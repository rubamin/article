const { sql } = require('../db');

const QUESTION_COUNT = Number(process.env.QUESTION_COUNT || 5);
const MAX_OPTIONS = 6;

// Word editor returns "<p></p>" when empty, so check for real text or an image.
function hasContent(html) {
  if (!html) return false;
  if (/<img\s/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
}

function validateArticle({ title, contentHtml, questions }) {
  if (!title || !title.trim()) return 'Title is required.';
  if (!hasContent(contentHtml)) return 'Article content is required.';
  if (!Array.isArray(questions) || questions.length !== QUESTION_COUNT) {
    return `Add exactly ${QUESTION_COUNT} questions.`;
  }
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const n = i + 1;
    if (!q || !q.text || !q.text.trim()) return `Question ${n} has no text.`;
    if (!['MCQ', 'TEXT'].includes(q.type)) return `Question ${n} must be MCQ or TEXT.`;
    if (q.type === 'MCQ') {
      const opts = (q.options || []).filter((o) => o && o.text && o.text.trim());
      if (opts.length < 2) return `Question ${n} needs at least 2 options.`;
      if (opts.length > MAX_OPTIONS) return `Question ${n} can have at most ${MAX_OPTIONS} options.`;
      if (opts.filter((o) => o.isCorrect).length !== 1) {
        return `Mark exactly one correct option in question ${n}.`;
      }
    }
  }
  return null;
}

async function insertQuestions(tx, articleId, questions) {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const r = await new sql.Request(tx)
      .input('a', sql.Int, articleId)
      .input('o', sql.Int, i + 1)
      .input('t', sql.NVarChar(1000), q.text.trim())
      .input('ty', sql.VarChar(10), q.type)
      .query(`INSERT INTO dbo.ArticleQuestions (ArticleId, SortOrder, QuestionText, QuestionType)
              OUTPUT INSERTED.QuestionId VALUES (@a, @o, @t, @ty)`);
    const questionId = r.recordset[0].QuestionId;

    if (q.type === 'MCQ') {
      const opts = q.options.filter((o) => o && o.text && o.text.trim());
      for (let j = 0; j < opts.length; j++) {
        await new sql.Request(tx)
          .input('q', sql.Int, questionId)
          .input('o', sql.Int, j + 1)
          .input('t', sql.NVarChar(500), opts[j].text.trim())
          .input('c', sql.Bit, opts[j].isCorrect ? 1 : 0)
          .query(`INSERT INTO dbo.QuestionOptions (QuestionId, SortOrder, OptionText, IsCorrect)
                  VALUES (@q, @o, @t, @c)`);
      }
    }
  }
}

// Returns questions with nested options. isCorrect is only included for admin use.
async function loadQuestions(pool, articleId, { includeCorrect = false } = {}) {
  const r = await pool.request().input('a', sql.Int, articleId).query(`
    SELECT q.QuestionId, q.SortOrder, q.QuestionText, q.QuestionType,
           o.OptionId, o.OptionText, o.IsCorrect
    FROM dbo.ArticleQuestions q
    LEFT JOIN dbo.QuestionOptions o ON o.QuestionId = q.QuestionId
    WHERE q.ArticleId = @a
    ORDER BY q.SortOrder, o.SortOrder`);

  const map = new Map();
  for (const row of r.recordset) {
    if (!map.has(row.QuestionId)) {
      map.set(row.QuestionId, {
        questionId: row.QuestionId,
        text: row.QuestionText,
        type: row.QuestionType,
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

module.exports = { QUESTION_COUNT, hasContent, validateArticle, insertQuestions, loadQuestions };
