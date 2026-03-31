const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, queryOne, run, levelTitle, xpForLevel } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mutt-match-secret-change-in-production';

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password, pet_name, pet_breed, avatar } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: 'Username, email, and password are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = queryOne(
      'SELECT id FROM users WHERE username = ? OR email = ?', [username, email]
    );
    if (existing)
      return res.status(409).json({ error: 'Username or email already taken' });

    const password_hash = await bcrypt.hash(password, 10);
    run(
      `INSERT INTO users (username, email, password_hash, avatar, pet_name, pet_breed) VALUES (?, ?, ?, ?, ?, ?)`,
      [username, email, password_hash, avatar || null, pet_name || null, pet_breed || null]
    );

    const user = queryOne('SELECT * FROM users WHERE username = ?', [username]);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const user = queryOne(
      'SELECT * FROM users WHERE username = ? OR email = ?', [username, username]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/auth/demo - instant demo login, no password needed
router.post('/demo', async (req, res) => {
  try {
    const DEMO_USERNAME = 'DemoPlayer';
    const DEMO_EMAIL = 'demo@mutt-match.app';

    let user = queryOne('SELECT * FROM users WHERE username = ?', [DEMO_USERNAME]);

    if (!user) {
      const password_hash = await bcrypt.hash('demo-locked-' + Date.now(), 10);
      run(
        `INSERT INTO users (username, email, password_hash, pet_name, pet_breed, xp, level)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [DEMO_USERNAME, DEMO_EMAIL, password_hash, 'Biscuit', 'Golden Retriever', 450, 5]
      );
      user = queryOne('SELECT * FROM users WHERE username = ?', [DEMO_USERNAME]);

      const demoPairs = [
        ['Alex', null, 'Biscuit', null],
        ['Jordan', null, 'Noodle', null],
        ['Sam', null, 'Pretzel', null],
        ['Riley', null, 'Waffles', null],
        ['Morgan', null, 'Pickles', null],
      ];
      for (const [pn, pp, dn, dp] of demoPairs) {
        run(
          `INSERT INTO photo_pairs (user_id, person_name, person_photo, dog_name, dog_photo) VALUES (?, ?, ?, ?, ?)`,
          [user.id, pn, pp, dn, dp]
        );
      }
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error('Demo login error:', err);
    res.status(500).json({ error: 'Demo login failed' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = queryOne('SELECT * FROM users WHERE id = ?', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: safeUser(user) });
});

function safeUser(user) {
  const level = user.level || 1;
  const xp = user.xp || 0;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    pet_name: user.pet_name,
    pet_breed: user.pet_breed,
    location: user.location,
    xp,
    level,
    level_title: levelTitle(level),
    xp_for_next: xpForLevel(level + 1),
    current_streak: user.current_streak || 0,
    longest_streak: user.longest_streak || 0,
    created_at: user.created_at,
  };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET);
    req.userId = decoded.id;
    req.username = decoded.username;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.safeUser = safeUser;
