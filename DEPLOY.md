# Mutt Match — Deploy to Railway (Live Public URL in ~5 minutes)

Railway gives you a free public URL like `mutt-match.up.railway.app` that anyone can visit.

---

## Step 1 — Push to GitHub

1. Go to **github.com** and create a new repository called `mutt-match`
2. Keep it Public or Private (either works)
3. Do NOT initialize it with a README
4. Copy the commands GitHub shows you — they'll look like:

```bash
git remote add origin https://github.com/YOUR_USERNAME/mutt-match.git
git push -u origin main
```

Run those in a terminal inside this project folder.

---

## Step 2 — Create a Railway Account

1. Go to **railway.app**
2. Sign up with your GitHub account (recommended — makes connecting repos instant)

---

## Step 3 — Create a New Project on Railway

1. Click **New Project**
2. Choose **Deploy from GitHub repo**
3. Select your `mutt-match` repository
4. Railway will auto-detect it's a Node.js app and start building

---

## Step 4 — Add Environment Variables

In your Railway project, go to **Variables** and add these two:

| Variable | Value |
|----------|-------|
| `JWT_SECRET` | any long random string, e.g. `mutt-match-super-secret-2026-abc123xyz` |
| `DATABASE_PATH` | `/data/mutt-match.db` |

---

## Step 5 — Add a Persistent Volume (keeps data between restarts)

1. In your Railway project, click **+ New** → **Volume**
2. Set the mount path to `/data`
3. Attach it to your Mutt Match service

Without this step, user accounts reset whenever the server restarts. With it, all data persists permanently.

---

## Step 6 — Get Your Public URL

1. Click on your service → **Settings** → **Networking**
2. Click **Generate Domain**
3. Railway gives you a URL like `mutt-match-production.up.railway.app`

Share that link — anyone in the world can sign up and play!

---

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env if you want to change the JWT_SECRET
node server.js
# Open http://localhost:3000
```

---

## Updating the App

After making changes:
```bash
git add .
git commit -m "your message"
git push
```

Railway automatically detects the push and redeploys within ~60 seconds.
