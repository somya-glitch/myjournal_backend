const { webcrypto } = require('crypto');
globalThis.crypto = webcrypto;

const express = require('express');
const cron    = require('node-cron');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { Resend } = require('resend');
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const mongoose = require('mongoose');

const app    = express();
const PORT   = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors({
  origin: ['https://somya-glitch.github.io', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Database connection (MongoDB only)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected!'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Entry model
const entrySchema = new mongoose.Schema({
  userId: String,
  date: String,
  mood: String,
  text: String,
});
const Entry = mongoose.model('Entry', entrySchema);

// User model (replaces the old Postgres "users" table)
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  passwordHash: String,
  email: String,
  googleId: { type: String, unique: true, sparse: true },
});
const User = mongoose.model('User', userSchema);

// Passport setup
app.use(session({ secret: process.env.SESSION_SECRET || 'secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await User.findOne({ username });
      if (!user) return done(null, false, { message: 'User not found' });
      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) return done(null, false, { message: 'Invalid password' });
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'https://myjournal-backend.onrender.com/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ googleId: profile.id });
    if (!user) {
      user = await User.create({
        username: profile.displayName,
        email: profile.emails[0].value,
        googleId: profile.id,
      });
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ROOT
app.get('/', (req, res) => {
  res.json({ message: 'MyLife backend is running! 🚀' });
});

// SUBSCRIBE
app.post('/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (!email.includes('@')) return res.status(400).json({ error: 'Invalid email' });

  const users = getUsers();
  if (!users.includes(email)) {
    users.push(email);
    saveUsers(users);
  }

  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: '🌟 Welcome to MyLife Daily Journal!',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 30px;">
          <h2 style="color: #e07b2a;">Welcome to MyLife! 🎉</h2>
          <p>You're now subscribed to daily journal reminders.</p>
          <p>Every day at <strong>4:00 PM</strong>, you'll get a reminder to write in your journal.</p>
          <p style="color: #888; font-size: 13px;">If you didn't sign up for this, you can ignore this email.</p>
        </div>
      `
    });
    console.log(`Welcome email sent to ${email}`);
  } catch (err) {
    console.log('Welcome email error:', err.message);
  }

  res.status(200).json({ message: 'Subscribed successfully!' });
});

// AUTH SIGNUP
app.post('/auth/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'Username and password required (min 6 chars)' });
  }
  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ username, passwordHash });
    res.json({ message: 'Account created successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// AUTH LOGIN
app.post('/auth/login', passport.authenticate('local'), (req, res) => {
  const token = jwt.sign({ id: req.user.id, username: req.user.username }, process.env.JWT_SECRET);
  res.json({ token, user: { id: req.user.id, username: req.user.username } });
});

// GOOGLE AUTH
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google'), (req, res) => {
  const token = jwt.sign(
    { id: req.user.id, username: req.user.username },
    process.env.JWT_SECRET
  );
  // Redirect to frontend with token
  res.redirect(`https://somya-glitch.github.io/my_journal?token=${token}`);
});

// ENTRIES ROUTES
app.get('/entries', authenticateToken, async (req, res) => {
  try {
    const entries = await Entry.find({ userId: req.user.id }).sort({ date: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/entries', authenticateToken, async (req, res) => {
  const { date, mood, text } = req.body;
  try {
    const entry = new Entry({ userId: req.user.id, date, mood, text });
    await entry.save();
    res.json({ message: 'Entry saved' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/entries/:id', authenticateToken, async (req, res) => {
  try {
    await Entry.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// UNSUBSCRIBE
app.post('/unsubscribe', (req, res) => {
  const { email } = req.body;
  let users = getUsers().filter(u => u !== email);
  saveUsers(users);
  res.json({ message: 'Unsubscribed successfully' });
});

// ALL USERS
app.get('/users', (req, res) => {
  const users = getUsers();
  res.json({ count: users.length, users });
});

// TEST EMAIL
app.get('/test-email', async (req, res) => {
  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: process.env.GMAIL_USER,
      subject: 'Test Email',
      text: 'If you see this, Resend is working!'
    });
    res.send('✅ Email sent successfully!');
  } catch (err) {
    res.send('❌ Error: ' + err.message);
  }
});

// DAILY 4PM REMINDER
cron.schedule('0 16 * * *', async () => {
  console.log('⏰ 4PM — Sending daily reminders...');
  const users = getUsers();
  if (users.length === 0) return console.log('No subscribers yet.');

  for (const email of users) {
    try {git
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: '📓 Time to Journal Today!',
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #fdf6ee; border-radius: 12px;">
            <h2 style="color: #e07b2a;">Hey! 👋</h2>
            <p style="font-size: 16px; color: #333;">It's 4PM — time to take 5 minutes for yourself.</p>
            <a href="https://somya-glitch.github.io/my_journal"
               style="display: inline-block; margin-top: 20px; background: #e07b2a; color: white;
                      padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Open My Journal →
            </a>
          </div>
        `
      });
      console.log(`Reminder sent to ${email}`);
    } catch (err) {
      console.log(`Failed to send to ${email}:`, err.message);
    }
  }
});

app.listen(PORT, () => {
  console.log(`✅ MyLife server running on port ${PORT}`);
});