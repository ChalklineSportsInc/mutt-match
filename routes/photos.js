const express = require('express');
const multer = require('multer');
const { query, queryOne, run } = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// GET /api/photos
router.get('/', requireAuth, (req, res) => {
  const pairs = query('SELECT * FROM photo_pairs WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
  res.json({ pairs });
});

// POST /api/photos
router.post('/', requireAuth, upload.fields([
  { name: 'person_photo', maxCount: 1 },
  { name: 'dog_photo', maxCount: 1 }
]), (req, res) => {
  try {
    const { person_name, dog_name } = req.body;
    if (!person_name || !dog_name)
      return res.status(400).json({ error: 'person_name and dog_name required' });

    let person_photo, dog_photo;

    if (req.files?.person_photo?.[0]) {
      const f = req.files.person_photo[0];
      person_photo = `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;
    } else if (req.body.person_photo_b64) {
      person_photo = req.body.person_photo_b64;
    } else {
      return res.status(400).json({ error: 'person_photo required' });
    }

    if (req.files?.dog_photo?.[0]) {
      const f = req.files.dog_photo[0];
      dog_photo = `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;
    } else if (req.body.dog_photo_b64) {
      dog_photo = req.body.dog_photo_b64;
    } else {
      return res.status(400).json({ error: 'dog_photo required' });
    }

    run(
      `INSERT INTO photo_pairs (user_id, person_name, person_photo, dog_name, dog_photo) VALUES (?, ?, ?, ?, ?)`,
      [req.userId, person_name, person_photo, dog_name, dog_photo]
    );

    const pairCount = queryOne('SELECT COUNT(*) as c FROM photo_pairs WHERE user_id = ?', [req.userId]).c;
    const newBadges = [];
    if (pairCount >= 1) tryAwardBadge(req.userId, 'first_upload', newBadges);
    if (pairCount >= 5) tryAwardBadge(req.userId, 'photo_pro', newBadges);
    if (pairCount >= 10) tryAwardBadge(req.userId, 'super_uploader', newBadges);

    const pairs = query('SELECT * FROM photo_pairs WHERE user_id = ? ORDER BY created_at DESC', [req.userId]);
    res.json({ pairs, new_badges: newBadges });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// DELETE /api/photos/:id
router.delete('/:id', requireAuth, (req, res) => {
  const pair = queryOne('SELECT * FROM photo_pairs WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  if (!pair) return res.status(404).json({ error: 'Not found' });
  run('DELETE FROM photo_pairs WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

function tryAwardBadge(userId, badgeType, newBadges) {
  try {
    const existing = queryOne('SELECT id FROM badges WHERE user_id = ? AND badge_type = ?', [userId, badgeType]);
    if (!existing) {
      run('INSERT OR IGNORE INTO badges (user_id, badge_type) VALUES (?, ?)', [userId, badgeType]);
      newBadges.push(badgeType);
    }
  } catch (e) {}
}

module.exports = router;
