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

// Software tour: which page tours this admin has already seen.
const TOUR_KEYS = ['list', 'editor', 'report'];
const parseTours = (v) => String(v || '').split(',').map((s) => s.trim()).filter((k) => TOUR_KEYS.includes(k));

router.get('/me', adminAuth, ah(async (req, res) => {
  let toursSeen = null; // null = unknown (migration 005 not run): the tour does not open by itself
  try {
    const pool = await getPool();
    const r = await pool.request().input('u', sql.Int, req.admin.adminId)
      .query('SELECT ToursSeen FROM dbo.AdminUsers WHERE AdminId = @u');
    toursSeen = parseTours(r.recordset[0] && r.recordset[0].ToursSeen);
  } catch (e) {
    console.warn('Software tour: could not read ToursSeen (run database/migrations/005_software_tour.sql).', e.message);
  }
  res.json({ admin: req.admin, toursSeen });
}));

// Mark one page tour as seen (finished or skipped)
router.post('/tours/:key', adminAuth, ah(async (req, res) => {
  const key = String(req.params.key);
  if (!TOUR_KEYS.includes(key)) return res.status(400).json({ error: 'Unknown tour.' });
  const pool = await getPool();
  const r = await pool.request().input('u', sql.Int, req.admin.adminId)
    .query('SELECT ToursSeen FROM dbo.AdminUsers WHERE AdminId = @u');
  const seen = new Set(parseTours(r.recordset[0] && r.recordset[0].ToursSeen));
  seen.add(key);
  const list = TOUR_KEYS.filter((k) => seen.has(k));
  await pool.request()
    .input('u', sql.Int, req.admin.adminId)
    .input('t', sql.NVarChar(200), list.join(','))
    .query('UPDATE dbo.AdminUsers SET ToursSeen = @t WHERE AdminId = @u');
  res.json({ toursSeen: list });
}));

// Show all tours again on next visit
router.delete('/tours', adminAuth, ah(async (req, res) => {
  const pool = await getPool();
  await pool.request().input('u', sql.Int, req.admin.adminId)
    .query('UPDATE dbo.AdminUsers SET ToursSeen = NULL WHERE AdminId = @u');
  res.json({ toursSeen: [] });
}));

module.exports = router;
