require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const fileRoutes = require('./routes/files');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET is missing or too short (min 16 characters). Set it in backend/.env.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', true);

const origins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: 'text/plain', limit: '64kb' })); // navigator.sendBeacon

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/files', fileRoutes);

app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'The file is too large.' });
  }
  console.error(err);
  res.status(500).json({ error: 'The server hit an error. Check the API log for details.' });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`Article Tracker API on :${port}`));
