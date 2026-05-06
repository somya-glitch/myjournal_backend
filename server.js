// ================================
//  MyLife Backend Server
//  - Collects user emails
//  - Sends daily reminder at 1:24pm
// ================================
 
const express  = require('express');
const { Resend } = require('resend');
const cron     = require('node-cron');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');
require('dotenv').config();
 
const app  = express();
const PORT = process.env.PORT || 3000;

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);
 
// --------------------------------
// MIDDLEWARE
// Allows our website to talk to this server
// and lets us read JSON data sent from the website
// --------------------------------
app.use(cors());
app.use(express.json());
 
// --------------------------------
// USERS FILE
// We store emails in a simple users.json file
// --------------------------------
const USERS_FILE = path.join(__dirname, 'users.json');
 
// If users.json doesn't exist yet, create it with empty array
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}
 
// Helper: read all users from file
function getUsers() {
  const data = fs.readFileSync(USERS_FILE, 'utf8');
  return JSON.parse(data);
}
 
// Helper: save users array back to file
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
 
// --------------------------------
// EMAIL CONFIGURATION
// Uses SendGrid for reliable cloud email delivery
// --------------------------------
 
// --------------------------------
// ROUTES (API endpoints)
// These are the URLs your website will call
// --------------------------------
 
// TEST ROUTE — open this in browser to check server is running
// Visit: http://localhost:3000/
app.get('/', (req, res) => {
  res.json({ message: 'MyLife backend is running! 🚀' });
});
 
// SUBSCRIBE ROUTE
// Website sends email here → we save it
// POST http://localhost:3000/subscribe
app.post('/subscribe', (req, res) => {
  const { email } = req.body;
 
  // Check email was actually sent
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
 
  // Check it looks like a real email
  if (!email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
 
  // Load current users
  const users = getUsers();
 
  // Check if already subscribed
  if (users.includes(email)) {
    return res.status(200).json({ message: 'Already subscribed!' });
  }
 
  // Add new email and save
  users.push(email);
  saveUsers(users);
 
  console.log(`New subscriber: ${email}`);
 
  // Send a welcome email via Resend
  resend.emails.send({
    from: 'MyLife Journal <onboarding@resend.dev>',
    to: email,
    subject: '🌟 Welcome to MyLife Daily Journal!',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 30px;">
        <h2 style="color: #e07b2a;">Welcome to MyLife! 🎉</h2>
        <p>You're now subscribed to daily journal reminders.</p>
        <p>Every day at <strong>1:24 PM</strong>, you'll get a reminder to write in your journal.</p>
        <p style="color: #888; font-size: 13px;">If you didn't sign up for this, you can ignore this email.</p>
      </div>
    `
  }).then(() => {
    console.log(`Welcome email sent to ${email}`);
  }).catch(err => {
    console.error('Welcome email error:', err.message);
  });
 
  res.status(200).json({ message: 'Subscribed successfully! Check your email for a welcome message.' });
});
 
// UNSUBSCRIBE ROUTE
// POST http://localhost:3000/unsubscribe
app.post('/unsubscribe', (req, res) => {
  const { email } = req.body;
  let users = getUsers();
  users = users.filter(u => u !== email);
  saveUsers(users);
  res.json({ message: 'Unsubscribed successfully' });
});
 
// SEE ALL SUBSCRIBERS (for testing only)
// GET http://localhost:3000/users
app.get('/users', (req, res) => {
  const users = getUsers();
  res.json({ count: users.length, users });
});
 
// --------------------------------
// DAILY REMINDER SCHEDULER
// Runs every day at 1:24 PM
// Cron format: 'minute hour * * *'
// '24 13 * * *' = at minute 24, hour 13 (1:24pm), every day
// --------------------------------
cron.schedule('24 13 * * *', () => {
  console.log('⏰ 1:24PM — Sending daily reminders...');
 
  const users = getUsers();
 
  if (users.length === 0) {
    console.log('No subscribers yet.');
    return;
  }
 
  users.forEach(email => {
    resend.emails.send({
      from: 'MyLife Journal <onboarding@resend.dev>',
      to: email,
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
          <p style="margin-top: 24px; font-size: 12px; color: #aaa;">
            Don't want reminders? <a href="https://somya-glitch.github.io/my_journal" style="color: #aaa;">Unsubscribe</a>
          </p>
        </div>
      `
    }).then(() => {
      console.log(`Reminder sent to ${email}`);
    }).catch(err => {
      console.error(`Failed to send to ${email}:`, err.message);
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
 
