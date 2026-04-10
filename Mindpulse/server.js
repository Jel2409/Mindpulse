require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mindpulse_secret_2024';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mindpulse';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB connection ────────────────────────────────────────────────────────
function requireDb(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database unavailable. Please try again shortly.' });
  }
  next();
}

// ── Schemas ───────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  stats: {
    sessions: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastSession: { type: Date, default: null }
  },
  preferences: {
    theme: { type: String, enum: ['sage-cream', 'ocean-blue', 'forest-dark'], default: 'sage-cream' },
    defaultSessionLength: { type: Number, default: 10 },
    notifications: { type: Boolean, default: true },
    sounds: { type: Boolean, default: true },
    streakAlerts: { type: Boolean, default: true },
    reminderTime: { type: String, default: '07:00' }
  },
  // Daily activity log: array of { date: 'YYYY-MM-DD', minutes: N }
  activityLog: [{ date: String, minutes: Number }]
});

const journalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: '' },
  content: { type: String, required: true },
  mood: { type: String, enum: ['Happy', 'Calm', 'Neutral', 'Anxious', 'Sad'], default: 'Neutral' },
  createdAt: { type: Date, default: Date.now }
});

const passwordResetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});

const User = mongoose.model('User', userSchema);
const Journal = mongoose.model('Journal', journalSchema);
const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);

// ── Auth helpers ──────────────────────────────────────────────────────────────
function makeToken(user) {
  return jwt.sign({ id: user._id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Email (forgot password) ───────────────────────────────────────────────────
function getMailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  });
}

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', requireDb, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await User.findOne({ email });
    // Always respond 200 to avoid user enumeration
    if (!user || !user.password) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    await PasswordReset.deleteMany({ userId: user._id });
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
    await PasswordReset.create({ userId: user._id, token: hashed, expiresAt: new Date(Date.now() + 3600_000) });

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password.html?token=${rawToken}`;
    await getMailer().sendMail({
      from: process.env.SMTP_FROM || 'noreply@mindpulse.app',
      to: email,
      subject: 'Mindpulse — Reset your password',
      html: `<p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
    });

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/reset-password
app.post('/api/auth/reset-password', requireDb, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const record = await PasswordReset.findOne({ token: hashed, expiresAt: { $gt: new Date() } });
    if (!record) return res.status(400).json({ error: 'Invalid or expired reset link' });

    const newHash = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(record.userId, { password: newHash });
    await PasswordReset.deleteMany({ userId: record.userId });

    res.json({ message: 'Password updated. You can now log in.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/auth/signup', requireDb, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (await User.findOne({ email })) return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });
    res.json({ token: makeToken(user), user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', requireDb, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'All fields required' });
    const user = await User.findOne({ email });
    if (!user || !user.password || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ error: 'Invalid credentials' });
    res.json({ token: makeToken(user), user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── User routes ───────────────────────────────────────────────────────────────
app.get('/api/user/profile', auth, requireDb, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/user/profile', auth, requireDb, async (req, res) => {
  try {
    const { name, email } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user/session', auth, requireDb, async (req, res) => {
  try {
    const { minutes } = req.body;
    const user = await User.findById(req.user.id);
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const last = user.stats.lastSession ? new Date(user.stats.lastSession).toDateString() : null;
    user.stats.sessions += 1;
    user.stats.totalMinutes += (minutes || 0);
    if (last === yesterday) user.stats.streak += 1;
    else if (last !== today) user.stats.streak = 1;
    user.stats.lastSession = new Date();

    // Log daily activity
    const todayStr = new Date().toISOString().slice(0, 10);
    const existing = user.activityLog.find(e => e.date === todayStr);
    if (existing) existing.minutes += (minutes || 0);
    else user.activityLog.push({ date: todayStr, minutes: minutes || 0 });
    // Keep only last 90 days
    user.activityLog = user.activityLog.slice(-90);

    await user.save();
    res.json({ stats: user.stats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/user/preferences
app.get('/api/user/preferences', auth, requireDb, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('preferences');
    res.json(user.preferences || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/user/preferences
app.put('/api/user/preferences', auth, requireDb, async (req, res) => {
  try {
    const allowed = ['theme', 'defaultSessionLength', 'notifications', 'sounds', 'streakAlerts', 'reminderTime'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[`preferences.${k}`] = req.body[k]; });
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).select('preferences');
    res.json(user.preferences);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Journal routes ────────────────────────────────────────────────────────────
app.get('/api/journal', auth, requireDb, async (req, res) => {
  try {
    const entries = await Journal.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json(entries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/journal', auth, requireDb, async (req, res) => {
  try {
    const { title, content, mood } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required' });
    const entry = await Journal.create({ userId: req.user.id, title: title || '', content, mood });
    res.json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/journal/:id', auth, requireDb, async (req, res) => {
  try {
    await Journal.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Meditations ───────────────────────────────────────────────────────────────
app.get('/api/meditations', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/meditations.json'), 'utf8'));
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

if (require.main === module) {
  mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // fail fast if MongoDB is unreachable
    socketTimeoutMS: 45000
  })
    .then(() => {
      console.log('MongoDB connected:', MONGO_URI);
      app.listen(PORT, () => console.log(`Mindpulse running on http://localhost:${PORT}`));
    })
    .catch(err => {
      console.error('MongoDB connection failed:', err.message);
      process.exit(1); // don't start the server if DB is unavailable
    });
}

module.exports = { app, User, Journal, PasswordReset };
