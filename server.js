require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check (used by Railway)
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// Init DB synchronously then mount routes
try {
  getDb();
  console.log('✅ Database initialized');
} catch (err) {
  console.error('Failed to init DB:', err);
  process.exit(1);
}

app.use('/api/auth',   require('./routes/auth'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/game',   require('./routes/game'));
app.use('/api/pets',   require('./routes/pets'));

// Catch-all → SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🐾 Mutt Match running at http://localhost:${PORT}`);
});
