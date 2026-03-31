const path = require('path');
const fs = require('fs');

// Use DATABASE_PATH env var for Railway volume persistence, fallback to local file
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'mutt-match.db');

let db;

function getDb() {
  if (db) return db;

  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initSchema();
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      pet_name TEXT,
      pet_breed TEXT,
      location TEXT,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_played_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS photo_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      person_name TEXT NOT NULL,
      person_photo TEXT NOT NULL,
      dog_name TEXT NOT NULL,
      dog_photo TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS game_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      time_seconds INTEGER,
      xp_earned INTEGER DEFAULT 0,
      played_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      badge_type TEXT NOT NULL,
      earned_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, badge_type),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS daily_pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      pet_name TEXT NOT NULL,
      pet_emoji TEXT NOT NULL,
      breed TEXT,
      caption TEXT,
      sponsor TEXT DEFAULT 'NutriPaws Pet Food'
    );

    CREATE TABLE IF NOT EXISTS pet_collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      daily_pet_id INTEGER NOT NULL,
      claimed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, daily_pet_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(daily_pet_id) REFERENCES daily_pets(id)
    );
  `);

  // Seed daily pets if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM daily_pets').get();
  if (count.c === 0) seedDailyPets();
}

function seedDailyPets() {
  const pets = [
    { pet_name: 'Biscuit',  pet_emoji: '🐕',  breed: 'Golden Retriever',       caption: "Loves belly rubs, stealing socks, and convincing strangers he's never been fed." },
    { pet_name: 'Coco',     pet_emoji: '🐩',  breed: 'Toy Poodle',             caption: 'Refuses to walk on wet grass. Has opinions about everything.' },
    { pet_name: 'Rufus',    pet_emoji: '🦮',  breed: 'Labrador Mix',           caption: 'Best boy. Knows it. Acts accordingly.' },
    { pet_name: 'Luna',     pet_emoji: '🐺',  breed: 'Husky',                  caption: 'Escaped the backyard 7 times. Each time more dramatic than the last.' },
    { pet_name: 'Max',      pet_emoji: '🐶',  breed: 'Beagle',                 caption: 'Food-motivated beyond all reason. Truly inspiring.' },
    { pet_name: 'Bella',    pet_emoji: '🐕‍🦺', breed: 'Border Collie',          caption: 'Herds children at family gatherings. No one asked her to.' },
    { pet_name: 'Milo',     pet_emoji: '🦴',  breed: 'Dachshund',              caption: 'Short legs, long dreams. Big opinions about squirrels.' },
    { pet_name: 'Daisy',    pet_emoji: '🐾',  breed: 'Corgi',                  caption: 'Butt wiggles are her primary form of communication.' },
    { pet_name: 'Charlie',  pet_emoji: '🐩',  breed: 'Shih Tzu',              caption: 'Requires grooming appointments more frequently than most humans.' },
    { pet_name: 'Zoe',      pet_emoji: '🐕',  breed: 'Australian Shepherd',    caption: 'Has a zoomies schedule. 6am and 11pm, like clockwork.' },
    { pet_name: 'Bear',     pet_emoji: '🐻',  breed: 'Newfoundland',           caption: 'Is very large. Does not know he is large. Lap dog mentality.' },
    { pet_name: 'Penny',    pet_emoji: '🐶',  breed: 'Cavalier King Charles',  caption: 'Professionally adorable. Has a publicist (her owner).' },
    { pet_name: 'Oscar',    pet_emoji: '🦮',  breed: 'French Bulldog',         caption: 'Snores. Loudly. Not sorry.' },
    { pet_name: 'Rosie',    pet_emoji: '🌸',  breed: 'Maltese',                caption: 'Tiny. Fierce. Commands a room.' },
    { pet_name: 'Duke',     pet_emoji: '👑',  breed: 'German Shepherd',        caption: 'Takes his role as home security very, very seriously.' },
    { pet_name: 'Gracie',   pet_emoji: '🐕',  breed: 'Boxer',                  caption: 'Leaps before she looks. Always has. Always will.' },
    { pet_name: 'Murphy',   pet_emoji: '🍀',  breed: 'Irish Setter',           caption: 'Runs like the wind. Returns like a mudslide.' },
    { pet_name: 'Lola',     pet_emoji: '💃',  breed: 'Chihuahua',              caption: 'Five pounds of pure confidence and mild aggression.' },
    { pet_name: 'Rocky',    pet_emoji: '🥊',  breed: 'Pitbull Mix',            caption: 'Afraid of butterflies. Loves everyone. Ambassador of good vibes.' },
    { pet_name: 'Molly',    pet_emoji: '🐕',  breed: 'Cocker Spaniel',         caption: 'Ears like silk. Heart like gold. Attention span like a goldfish.' },
    { pet_name: 'Finn',     pet_emoji: '🐟',  breed: 'Whippet',               caption: 'Fastest dog on the block. Laziest couch potato at home.' },
    { pet_name: 'Sadie',    pet_emoji: '🐾',  breed: 'Bernese Mountain Dog',   caption: 'Fluffiest thing in three counties. Knows it.' },
    { pet_name: 'Archie',   pet_emoji: '🎩',  breed: 'Jack Russell Terrier',   caption: 'Chaos in a small package. Delightful.' },
    { pet_name: 'Stella',   pet_emoji: '⭐',  breed: 'Dalmatian',              caption: 'Spotted. Photogenic. Absolutely unhinged in the best way.' },
    { pet_name: 'Cooper',   pet_emoji: '🐕',  breed: 'Goldendoodle',           caption: 'The class president of dogs. Everyone loves him.' },
    { pet_name: 'Nala',     pet_emoji: '🦁',  breed: 'Rhodesian Ridgeback',    caption: 'Lion heart. Dog body. Sleeps 18 hours a day.' },
    { pet_name: 'Bruno',    pet_emoji: '🐾',  breed: 'Basset Hound',           caption: 'Those ears. Those eyes. That face. Incapable of doing wrong.' },
    { pet_name: 'Ivy',      pet_emoji: '🌿',  breed: 'Vizsla',                 caption: 'Velcro dog. You are never alone. Never.' },
    { pet_name: 'Atlas',    pet_emoji: '🗺️',  breed: 'Great Dane',             caption: 'Biggest dog in the park. Most afraid of the vacuum.' },
    { pet_name: 'Hazel',    pet_emoji: '🌰',  breed: 'Pomeranian',             caption: 'Fluffball of judgment. Judges you. Silently. Always.' },
  ];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO daily_pets (date, pet_name, pet_emoji, breed, caption) VALUES (?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((entries) => {
    for (const { date, pet } of entries) {
      insert.run(date, pet.pet_name, pet.pet_emoji, pet.breed, pet.caption);
    }
  });

  const today = new Date();
  const entries = [];

  // Past 30 days + next 30 days
  for (let i = -29; i <= 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const pet = pets[((i + 29) % pets.length + pets.length) % pets.length];
    entries.push({ date: dateStr, pet });
  }

  insertMany(entries);
}

// ── Helper wrappers ──────────────────────────────────────────────
function query(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

// ── XP / Level ───────────────────────────────────────────────────
function xpForLevel(level) {
  return Math.floor(200 * Math.pow(level, 1.4));
}

function levelFromXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

function levelTitle(level) {
  if (level <= 2)  return 'Puppy Spotter';
  if (level <= 5)  return 'Bark Detective';
  if (level <= 10) return 'Dog Whisperer';
  if (level <= 20) return 'Canine Commander';
  return 'Mutt Master';
}

module.exports = { getDb, query, queryOne, run, xpForLevel, levelFromXp, levelTitle };
