const { sql } = require('../db');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Detect the real type from the file bytes instead of trusting the browser.
// SVG is deliberately not allowed: it can carry scripts.
function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

const assetUrl = (id) => (id ? `/api/files/${String(id).toLowerCase()}` : null);

async function saveAsset(poolOrTx, adminId, { buffer, mimeType, fileName }) {
  const req = poolOrTx.request ? poolOrTx.request() : new sql.Request(poolOrTx);
  const r = await req
    .input('u', sql.Int, adminId)
    .input('f', sql.NVarChar(260), (fileName || '').slice(0, 260) || null)
    .input('m', sql.VarChar(100), mimeType)
    .input('s', sql.Int, buffer.length)
    .input('d', sql.VarBinary(sql.MAX), buffer)
    .query(`INSERT INTO dbo.ArticleAssets (AdminId, FileName, MimeType, SizeBytes, Data)
            OUTPUT INSERTED.AssetId VALUES (@u, @f, @m, @s, @d)`);
  return String(r.recordset[0].AssetId).toLowerCase();
}

async function assetBelongsTo(pool, assetId, adminId) {
  if (!GUID_RE.test(assetId || '')) return false;
  const r = await pool.request()
    .input('a', sql.UniqueIdentifier, assetId)
    .input('u', sql.Int, adminId)
    .query('SELECT 1 AS X FROM dbo.ArticleAssets WHERE AssetId = @a AND AdminId = @u');
  return r.recordset.length > 0;
}

module.exports = { MAX_IMAGE_BYTES, GUID_RE, sniffImage, assetUrl, saveAsset, assetBelongsTo };
