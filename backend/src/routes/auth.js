const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../db');
const ah = require('../utils/asyncHandler');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// Simple in-memory lock: 8 failed tries per username+IP blocks for 15 minutes.
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const keyOf = (req, u) => `${req.ip}|${String(u).toLowerCase()}`;
function isLocked(key) {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) { failures.delete(key); return false; }
  return f.count >= MAX_FAILS;
}
function recordFail(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(key, { first: Date.now(), count: 1 });
  else f.count++;
}

router.post('/login', ah(async (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  if (!username || !password) return res.status(400).json({ error: 'Enter your username and password.' });

  const key = keyOf(req, username);
  if (isLocked(key)) {
    return res.status(429).json({ error: 'Too many wrong attempts. Try again in 15 minutes.' });
  }

  const pool = await getPool();
  const r = await pool.request().input('u', sql.NVarChar(100), username)
    .query('SELECT AdminId, Username, FullName, PasswordHash FROM dbo.AdminUsers WHERE Username = @u AND IsActive = 1');
  const user = r.recordset[0];
  const ok = user ? await bcrypt.compare(password, user.PasswordHash) : false;
  if (!ok) {
    recordFail(key);
    return res.status(401).json({ error: 'Username or password is wrong.' });
  }
  failures.delete(key);

  await pool.request().input('u', sql.Int, user.AdminId)
    .query('UPDATE dbo.AdminUsers SET LastLoginAt = SYSUTCDATETIME() WHERE AdminId = @u');

  const token = jwt.sign({ sub: String(user.AdminId) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
  res.json({ token, admin: { adminId: user.AdminId, username: user.Username, fullName: user.FullName } });
}));

router.get('/me', adminAuth, (req, res) => res.json({ admin: req.admin }));

module.exports = router;
