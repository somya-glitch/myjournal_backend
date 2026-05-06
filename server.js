const express = require('express');
const cron    = require('node-cron');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { Resend } = require('resend');
require('dotenv').config();
const bcrypt = require('bcrypt');

const app    = express();
const PORT   = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.json');
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

function getUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

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

// AUTH LOGIN
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const users = getUsers();
  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(401).json({ error: 'Account not found. Please sign up.' });
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.json({ message: 'Login successful' });
});

// AUTH SIGNUP
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !email.includes('@') || !password || password.length < 6) {
    return res.status(400).json({ error: 'Invalid email or password (min 6 chars)' });
  }
  let users = getUsers();
  if (users.find(u => u.email === email)) {
    return res.status(200).json({ message: 'Account already exists. Please login.' });
  }
  const hash = await bcrypt.hash(password, 10);
  users.push({ email, password: hash });
  saveUsers(users);
  res.json({ message: 'Account created successfully' });
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
    try {
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