const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../db');

// Expects "Authorization: Bearer <jwt>" issued by POST /api/auth/login.
module.exports = async function adminAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
  }

  try {
    const pool = await getPool();
    const r = await pool.request().input('u', sql.Int, Number(payload.sub))
      .query('SELECT AdminId, Username, FullName FROM dbo.AdminUsers WHERE AdminId = @u AND IsActive = 1');
    if (!r.recordset.length) return res.status(401).json({ error: 'This admin account is no longer active.' });
    const a = r.recordset[0];
    req.admin = { adminId: a.AdminId, username: a.Username, fullName: a.FullName };
    next();
  } catch (e) {
    next(e);
  }
};
