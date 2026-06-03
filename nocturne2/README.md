# Nocturne v2 🎵

Stream any song in the world. Powered by Piped (YouTube proxy) — no API keys, no yt-dlp to maintain.

## How it works

- User searches → Flask calls Piped API (open YouTube frontend, community maintained)
- Piped returns music-only results (duration filter + keyword filter strips tutorials/vlogs)
- Audio is proxied through our server → no CORS issues in browser
- Download resolves the direct stream URL and triggers a save

## Run Locally

```bash
pip install -r requirements.txt
python app.py
# open http://localhost:5000
```

## Deploy to Render

1. Push this folder to a GitHub repo
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 60`
   - **Plan**: Free
5. Click **Create Web Service**

Live in ~2 minutes at `https://nocturne-xxxx.onrender.com`

## Features

- 🔍 Search any song, artist, album
- 🎵 Music-only results (no tutorials, vlogs, podcasts)
- ▶️ Full stream with seek bar
- ⏮⏭ Prev / Next
- ⬇️ Download track
- ⌨️ Keyboard: Space = play/pause, ← → = prev/next
- 📱 Mobile responsive

## Notes on Piped

Piped is a community-maintained open YouTube frontend. Multiple public instances are used with automatic fallback. If one is down, the app tries the next. The community keeps these updated — you don't have to touch anything.

If all instances are slow, the best long-term fix is to self-host a Piped instance on a free Oracle Cloud server (takes ~20 min, completely free forever).
