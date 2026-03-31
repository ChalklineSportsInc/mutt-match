const express = require('express');
const { query, queryOne, run } = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();

// GET /api/pets/today
router.get('/today', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  let pet = queryOne('SELECT * FROM daily_pets WHERE date=?', [today]);

  // Fallback to random if today's isn't seeded
  if (!pet) pet = queryOne('SELECT * FROM daily_pets ORDER BY RANDOM() LIMIT 1');
  if (!pet) return res.status(404).json({ error: 'No pets found' });

  const claimed = queryOne(
    'SELECT id FROM pet_collection WHERE user_id=? AND daily_pet_id=?',
    [req.userId, pet.id]
  );
  res.json({ pet, claimed: !!claimed });
});

// POST /api/pets/claim
router.post('/claim', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const pet = queryOne('SELECT * FROM daily_pets WHERE date=?', [today]);
  if (!pet) return res.status(404).json({ error: 'No pet for today' });

  const existing = queryOne(
    'SELECT id FROM pet_collection WHERE user_id=? AND daily_pet_id=?',
    [req.userId, pet.id]
  );
  if (existing) return res.json({ already_claimed: true, pet });

  run('INSERT INTO pet_collection (user_id, daily_pet_id) VALUES (?,?)', [req.userId, pet.id]);

  const collectionCount = queryOne(
    'SELECT COUNT(*) as c FROM pet_collection WHERE user_id=?', [req.userId]
  ).c;

  let new_badge = null;
  if (collectionCount >= 10) {
    const existingBadge = queryOne(
      'SELECT id FROM badges WHERE user_id=? AND badge_type=?',
      [req.userId, 'mutt_collector']
    );
    if (!existingBadge) {
      run('INSERT OR IGNORE INTO badges (user_id, badge_type) VALUES (?,?)', [req.userId, 'mutt_collector']);
      new_badge = { type: 'mutt_collector', label: 'Mutt Collector', emoji: '🐕', desc: 'Collected 10 Pets of the Day' };
    }
  }

  res.json({ claimed: true, pet, collection_count: collectionCount, new_badge });
});

// GET /api/pets/collection
router.get('/collection', requireAuth, (req, res) => {
  const collection = query(`
    SELECT dp.*, pc.claimed_at
    FROM pet_collection pc
    JOIN daily_pets dp ON dp.id = pc.daily_pet_id
    WHERE pc.user_id = ?
    ORDER BY pc.claimed_at DESC
  `, [req.userId]);
  res.json({ collection, count: collection.length });
});

// POST /api/pets/profile — update profile fields
router.post('/profile', requireAuth, (req, res) => {
  const { pet_name, pet_breed, location, avatar } = req.body;
  run(
    `UPDATE users SET
      pet_name  = COALESCE(?, pet_name),
      pet_breed = COALESCE(?, pet_breed),
      location  = COALESCE(?, location),
      avatar    = COALESCE(?, avatar)
    WHERE id = ?`,
    [pet_name || null, pet_breed || null, location || null, avatar || null, req.userId]
  );
  res.json({ success: true });
});

module.exports = router;
