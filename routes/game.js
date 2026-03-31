const express = require('express');
const { query, queryOne, run, levelFromXp, levelTitle, xpForLevel } = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();

const BADGE_DEFS = {
  first_match:    { label: 'First Match',       emoji: '🐾', desc: 'Completed your first round' },
  perfect_round:  { label: 'Perfect Round',     emoji: '🏆', desc: 'Scored 5/5 in a round' },
  speed_demon:    { label: 'Speed Demon',        emoji: '⚡', desc: 'Finished a round in under 30 seconds' },
  speed_legend:   { label: 'Speed Legend',       emoji: '🚀', desc: 'Finished a round in under 15 seconds' },
  streak_3:       { label: 'On Fire',            emoji: '🔥', desc: 'Played 3 days in a row' },
  streak_7:       { label: 'Streak Star',        emoji: '🌟', desc: 'Played 7 days in a row' },
  streak_30:      { label: 'Dedicated Pup',      emoji: '💎', desc: 'Played 30 days in a row' },
  first_upload:   { label: 'Photo Debut',        emoji: '📸', desc: 'Uploaded your first pair' },
  photo_pro:      { label: 'Photo Pro',          emoji: '🎬', desc: 'Uploaded 5 photo pairs' },
  super_uploader: { label: 'Super Uploader',     emoji: '🏅', desc: 'Uploaded 10 photo pairs' },
  century_club:   { label: 'Century Club',       emoji: '💯', desc: 'Played 100 rounds' },
  mutt_collector: { label: 'Mutt Collector',     emoji: '🐕', desc: 'Collected 10 Pets of the Day' },
  level_5:        { label: 'Dog Whisperer',      emoji: '🐾', desc: 'Reached Level 5' },
  level_10:       { label: 'Canine Commander',   emoji: '👑', desc: 'Reached Level 10' },
  flawless_five:  { label: 'Flawless Five',      emoji: '⭐', desc: 'Got 5 perfect rounds in a row' },
};

// GET /api/game/pairs — random 5 pairs for a round
router.get('/pairs', requireAuth, (req, res) => {
  const allPairs = query('SELECT * FROM photo_pairs WHERE user_id = ?', [req.userId]);

  if (allPairs.length < 3) {
    return res.status(400).json({
      error: 'not_enough_pairs',
      message: `You need at least 3 photo pairs to play. You have ${allPairs.length}.`
    });
  }

  const count = Math.min(5, allPairs.length);
  const selected = allPairs.sort(() => Math.random() - 0.5).slice(0, count);

  const persons = selected.map(p => ({ id: p.id, name: p.person_name, photo: p.person_photo }));
  const dogs = [...selected].sort(() => Math.random() - 0.5)
    .map(p => ({ id: p.id, name: p.dog_name, photo: p.dog_photo }));

  res.json({ persons, dogs, count });
});

// POST /api/game/submit
router.post('/submit', requireAuth, (req, res) => {
  try {
    const { matches, time_seconds } = req.body;
    if (!matches || !Array.isArray(matches))
      return res.status(400).json({ error: 'matches array required' });

    let score = 0;
    const results = matches.map(m => {
      const correct = m.person_id === m.dog_id;
      if (correct) score++;
      return { person_id: m.person_id, dog_id: m.dog_id, correct };
    });
    const total = matches.length;

    // XP calculation
    let xpEarned = score * 20;
    if (score === total) xpEarned += 50;
    if (time_seconds && time_seconds < 30) xpEarned += 10;
    if (time_seconds && time_seconds < 15) xpEarned += 15;

    const user = queryOne('SELECT * FROM users WHERE id = ?', [req.userId]);
    const newXp = (user.xp || 0) + xpEarned;
    const newLevel = levelFromXp(newXp);
    const oldLevel = user.level || 1;

    // Streak logic
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let currentStreak = user.current_streak || 0;
    let longestStreak = user.longest_streak || 0;

    if (user.last_played_date === today) {
      // already played today — no change
    } else if (user.last_played_date === yesterday) {
      currentStreak++;
    } else {
      currentStreak = 1;
    }
    longestStreak = Math.max(longestStreak, currentStreak);

    run(
      `UPDATE users SET xp=?, level=?, current_streak=?, longest_streak=?, last_played_date=? WHERE id=?`,
      [newXp, newLevel, currentStreak, longestStreak, today, req.userId]
    );

    run(
      `INSERT INTO game_rounds (user_id, score, total, time_seconds, xp_earned) VALUES (?,?,?,?,?)`,
      [req.userId, score, total, time_seconds || null, xpEarned]
    );

    // Badges
    const newBadges = [];
    const totalRounds = queryOne('SELECT COUNT(*) as c FROM game_rounds WHERE user_id=?', [req.userId]).c;

    if (totalRounds >= 1)   tryAwardBadge(req.userId, 'first_match', newBadges);
    if (score === total)    tryAwardBadge(req.userId, 'perfect_round', newBadges);
    if (time_seconds < 30)  tryAwardBadge(req.userId, 'speed_demon', newBadges);
    if (time_seconds < 15)  tryAwardBadge(req.userId, 'speed_legend', newBadges);
    if (currentStreak >= 3) tryAwardBadge(req.userId, 'streak_3', newBadges);
    if (currentStreak >= 7) tryAwardBadge(req.userId, 'streak_7', newBadges);
    if (currentStreak >= 30) tryAwardBadge(req.userId, 'streak_30', newBadges);
    if (totalRounds >= 100) tryAwardBadge(req.userId, 'century_club', newBadges);
    if (newLevel >= 5)      tryAwardBadge(req.userId, 'level_5', newBadges);
    if (newLevel >= 10)     tryAwardBadge(req.userId, 'level_10', newBadges);

    // Flawless five
    const last5 = query(
      'SELECT score, total FROM game_rounds WHERE user_id=? ORDER BY played_at DESC LIMIT 5',
      [req.userId]
    );
    if (last5.length === 5 && last5.every(r => r.score === r.total))
      tryAwardBadge(req.userId, 'flawless_five', newBadges);

    res.json({
      score, total, xp_earned: xpEarned, results,
      new_xp: newXp, new_level: newLevel,
      new_level_title: levelTitle(newLevel),
      xp_for_next: xpForLevel(newLevel + 1),
      leveled_up: newLevel > oldLevel,
      current_streak: currentStreak,
      new_badges: newBadges.map(b => ({ type: b, ...BADGE_DEFS[b] })),
    });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Submit failed' });
  }
});

// GET /api/game/badges
router.get('/badges', requireAuth, (req, res) => {
  const earned = query('SELECT badge_type, earned_at FROM badges WHERE user_id=?', [req.userId]);
  const earnedMap = Object.fromEntries(earned.map(b => [b.badge_type, b.earned_at]));
  const badges = Object.entries(BADGE_DEFS).map(([type, def]) => ({
    type, ...def,
    earned: !!earnedMap[type],
    earned_at: earnedMap[type] || null,
  }));
  res.json({ badges });
});

// GET /api/game/stats
router.get('/stats', requireAuth, (req, res) => {
  const rounds = query('SELECT * FROM game_rounds WHERE user_id=? ORDER BY played_at DESC', [req.userId]);
  const totalRounds = rounds.length;
  const totalCorrect = rounds.reduce((s, r) => s + r.score, 0);
  const totalPossible = rounds.reduce((s, r) => s + r.total, 0);
  const accuracy = totalPossible > 0 ? Math.round((totalCorrect / totalPossible) * 100) : 0;
  const perfectRounds = rounds.filter(r => r.score === r.total).length;
  const times = rounds.filter(r => r.time_seconds).map(r => r.time_seconds);
  const bestTime = times.length ? Math.min(...times) : null;

  res.json({ total_rounds: totalRounds, accuracy, perfect_rounds: perfectRounds, best_time: bestTime, recent: rounds.slice(0, 10) });
});

function tryAwardBadge(userId, badgeType, newBadges) {
  try {
    const existing = queryOne('SELECT id FROM badges WHERE user_id=? AND badge_type=?', [userId, badgeType]);
    if (!existing) {
      run('INSERT OR IGNORE INTO badges (user_id, badge_type) VALUES (?,?)', [userId, badgeType]);
      newBadges.push(badgeType);
    }
  } catch (e) {}
}

module.exports = router;
