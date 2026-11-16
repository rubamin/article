const express = require('express');
const { sql, getPool } = require('../db');
const ah = require('../utils/asyncHandler');
const { GUID_RE } = require('../services/assets');

const router = express.Router();

// Public: images inside articles and header logos must load for readers.
router.get('/:id', ah(async (req, res) => {
  if (!GUID_RE.test(req.params.id)) return res.status(404).end();
  const pool = await getPool();
  const r = await pool.request().input('a', sql.UniqueIdentifier, req.params.id)
    .query('SELECT MimeType, Data FROM dbo.ArticleAssets WHERE AssetId = @a');
  if (!r.recordset.length) return res.status(404).end();
  const f = r.recordset[0];
  res.set({
    'Content-Type': f.MimeType,
    'Cache-Control': 'public, max-age=31536000, immutable', // assets never change once stored
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(f.Data);
}));

module.exports = router;
