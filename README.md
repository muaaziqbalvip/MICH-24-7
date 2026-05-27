# 📡 MiTV Live Stream Panel

Complete 24/7 broadcast control room — M3U8 / MP4 / YouTube sources, logo + text overlays, scheduling, Firebase sync, and auto-restart.

---

## 📁 Project Structure

```
mitv-livestream/
├── frontend/           ← Open index.html in browser or host on GitHub Pages
│   ├── index.html
│   ├── style.css
│   └── dashboard.js
├── backend/            ← Node.js + FFmpeg server
│   ├── server.js
│   ├── streamController.js
│   ├── ffmpegBuilder.js
│   ├── package.json
│   └── .env.example
├── .github/workflows/
│   ├── deploy.yml      ← Auto deploy on push
│   └── keepalive.yml   ← Health check every 10 min
├── Dockerfile          ← For Railway / Render
└── firebase.rules      ← Realtime DB rules
```

---

## 🚀 STEP 1 — Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/) → Project `ramadan-2385b`
2. **Realtime Database** → Rules → Paste content of `firebase.rules` → Publish
3. **Service Account** (for backend):
   - Project Settings → Service Accounts → **Generate new private key**
   - Download the JSON file
   - Copy values into `.env` (see Step 3)

---

## 🖥️ STEP 2 — Frontend (GitHub Pages)

1. Push the `frontend/` folder to your GitHub repo
2. GitHub repo → Settings → Pages → Source: `main` branch → `/frontend` folder
3. Your dashboard URL: `https://YOUR-USERNAME.github.io/REPO-NAME/`

**Or just open `frontend/index.html` directly in any browser.**

---

## ⚙️ STEP 3 — Backend on Railway (Recommended)

Railway has FFmpeg built-in and supports long-running processes for free.

### Option A: Railway (easiest)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project and deploy
cd mitv-livestream
railway init
railway up
```

Then set environment variables in Railway dashboard:
```
PORT=3000
FB_PRIVATE_KEY_ID=...
FB_PRIVATE_KEY=...
FB_CLIENT_EMAIL=...
FB_CLIENT_ID=...
```

Get your deployment URL (e.g., `https://mitv-backend.railway.app`)

### Option B: Render
1. Create account at [render.com](https://render.com)
2. New → Web Service → Connect GitHub repo
3. Build Command: `cd backend && npm install`
4. Start Command: `node backend/server.js`
5. Add Environment Variables (same as above)
6. Or use the **Dockerfile** for automatic FFmpeg installation

---

## 🔗 STEP 4 — Connect Frontend to Backend

1. Open the dashboard → **Output tab**
2. Paste your Railway/Render URL (e.g., `https://mitv-backend.railway.app`)
3. Click **Save**

---

## ▶️ STEP 5 — Start Your First Stream

1. **Sources tab** → Add an M3U8 or MP4 URL → Click `+ ADD`
2. **Overlays tab** → Upload logo, add channel name, enable ticker
3. Click **▶ START** in the header
4. **Output tab** → Copy the M3U8 URL
5. **Preview tab** → Paste M3U8 URL → Click `▶ Load`

---

## 🔁 STEP 6 — GitHub Actions (Auto 24/7)

Add these **GitHub Secrets** (repo → Settings → Secrets):

| Secret | Value |
|--------|-------|
| `BACKEND_URL` | `https://your-app.railway.app` |
| `RENDER_DEPLOY_HOOK` | (optional) Render deploy hook URL |

The `keepalive.yml` workflow will:
- Ping your backend every 10 minutes
- Auto-restart stream if it crashes
- Validate M3U8 output

---

## 📺 Features

| Feature | Status |
|---------|--------|
| M3U8 / MP4 / MP3 sources | ✅ |
| Logo overlay (upload via ImgBB) | ✅ |
| Logo position / scale / animation | ✅ |
| Channel name watermark | ✅ |
| Breaking news ticker (scrolling) | ✅ |
| Live clock & date overlay | ✅ |
| Color strip / patti | ✅ |
| Volume control / mute original | ✅ |
| Background music (MP3) | ✅ |
| Firebase realtime sync | ✅ |
| Stream scheduler | ✅ |
| HLS live preview (hls.js) | ✅ |
| Auto-restart on crash | ✅ |
| GitHub Actions keepalive | ✅ |
| M3U8 output URL + embed code | ✅ |
| 24/7 operation | ✅ |

---

## 🌐 M3U8 Sharing

After starting the stream, your live URL is:
```
https://YOUR-BACKEND.railway.app/live/stream.m3u8
```

This URL can be:
- Played in VLC, MX Player, IPTV apps
- Shared as a channel link
- Embedded with `<video>` tag
- Added to any M3U playlist

---

## ❓ Troubleshooting

**Stream won't start?**
- Check backend logs in the dashboard Logs tab
- Ensure FFmpeg is installed: `ffmpeg -version`
- Check the source URL is publicly accessible

**Overlays not showing?**
- Overlays apply on stream restart (3 second debounce)
- Check Firebase DB at `stream/overlays` path

**Backend URL not saving?**
- Use full URL with https://
- No trailing slash

---

## 🆘 Support

Built for MiTV Network — Muslim Islam Network, Kasur, Punjab, Pakistan.
