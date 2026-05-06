// ================================
//  MyLife Backend Server
//  - User authentication via email
//  - Stores user data & journal entries
//  - Sends daily reminders at 1:24pm
// ================================
 
const express  = require('express');
const nodemailer = require('nodemailer');
const cron     = require('node-cron');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
require('dotenv').config();
 
const app  = express();
const PORT = process.env.PORT || 3000;

// --------------------------------
// EMAIL TRANSPORTER (Gmail SMTP)
// --------------------------------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});
 
// --------------------------------
// MIDDLEWARE
// Allows our website to talk to this server
// and lets us read JSON data sent from the website
// --------------------------------
app.use(cors());
app.use(express.json());
 
// --------------------------------
// DATABASE FILES
// Users & their journal data stored locally
// --------------------------------
const USERS_FILE = path.join(__dirname, 'users.json');
const ENTRIES_FILE = path.join(__dirname, 'entries.json');

// Initialize files if they don't exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(ENTRIES_FILE)) {
  fs.writeFileSync(ENTRIES_FILE, JSON.stringify({}));
}

// Helper functions
function getUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getEntries() {
  return JSON.parse(fs.readFileSync(ENTRIES_FILE, 'utf8'));
}

function saveEntries(entries) {
  fs.writeFileSync(ENTRIES_FILE, JSON.stringify(entries, null, 2));
}
 
// --------------------------------
// EMAIL CONFIGURATION
// Uses SendGrid for reliable cloud email delivery
// --------------------------------
 
// --------------------------------
// ROUTES
// --------------------------------

// TEST ROUTE
app.get('/', (req, res) => {
  res.json({ message: 'MyLife backend is running! 🚀' });
});

// LOGIN/SIGNUP ROUTE
// POST http://localhost:3000/auth/login
// Body: { email }
app.post('/auth/login', (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const users = getUsers();
  let user = users.find(u => u.email === email);

  // Create user if doesn't exist
  if (!user) {
    user = {
      email,
      createdAt: new Date().toISOString(),
      subscribed: false,
      lastLogin: new Date().toISOString()
    };
    users.push(user);
    saveUsers(users);

    // Send welcome email
    transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: '🌟 Welcome to MyLife Journal!',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 30px;">
          <h2 style="color: #e07b2a;">Welcome to MyLife! 🎉</h2>
          <p>Your account has been created. Start writing your journal today.</p>
          <p><a href="https://somya-glitch.github.io/my_journal" style="color: #e07b2a;">Open My Journal</a></p>
        </div>
      `
    }).catch(err => console.error('Welcome email error:', err.message));
  } else {
    user.lastLogin = new Date().toISOString();
    saveUsers(users);
  }

  res.json({ 
    message: 'Login successful',
    user: { email: user.email, createdAt: user.createdAt }
  });
});

// SUBSCRIBE TO REMINDERS
// POST http://localhost:3000/subscribe
app.post('/subscribe', (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const users = getUsers();
  const user = users.find(u => u.email === email);

  if (!user) {
    return res.status(404).json({ error: 'User not found. Login first.' });
  }

  if (user.subscribed) {
    return res.json({ message: 'Already subscribed to reminders' });
  }

  user.subscribed = true;
  saveUsers(users);

  // Send confirmation email
  transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: email,
    subject: '📬 Daily Reminders Enabled!',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 30px;">
        <h2 style="color: #e07b2a;">Reminders Enabled ✅</h2>
        <p>You're now subscribed to daily journal reminders.</p>
        <p>Every day at <strong>1:24 PM</strong>, you'll get a reminder to write in your journal.</p>
      </div>
    `
  }).catch(err => console.error('Subscription email error:', err.message));

  res.json({ message: 'Subscribed to reminders successfully!' });
});
 
// --------------------------------
// DAILY REMINDER SCHEDULER
// Runs every day at 1:24 PM
// '24 13 * * *' = at minute 24, hour 13 (1:24pm), every day
// --------------------------------
cron.schedule('24 13 * * *', () => {
  console.log('⏰ 1:24PM — Sending daily reminders...');
 
  const users = getUsers();
  const subscribers = users.filter(u => u.subscribed);
 
  if (subscribers.length === 0) {
    console.log('No subscribers yet.');
    return;
  }
 
  subscribers.forEach(user => {
    transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: user.email,
      subject: '📓 Time to Journal Today!',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #fdf6ee; border-radius: 12px;">
          <h2 style="color: #e07b2a; margin-bottom: 8px;">Hey! 👋</h2>
          <p style="font-size: 16px; color: #333;">It's 1:24 PM — time to take 5 minutes for yourself and write in your journal.</p>
          <p style="font-size: 15px; color: #555;">Even just a few sentences can make a big difference. ✨</p>
          <a href="https://somya-glitch.github.io/my_journal"
             style="display: inline-block; margin-top: 20px; background: #e07b2a; color: white;
                    padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Open My Journal →
          </a>
        </div>
      `
    }).then(() => {
      console.log(`✅ Reminder sent to ${user.email}`);
    }).catch(err => {
      console.error(`❌ Failed to send to ${user.email}:`, err.message);
    });
  });
});
 
// --------------------------------
// START SERVER
// --------------------------------
app.listen(PORT, () => {
  console.log(`✅ MyLife server running on port ${PORT}`);
  console.log(`👉 Test it: http://localhost:${PORT}/`);
});
 
