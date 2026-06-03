import os
import requests
import yt_dlp
from flask import Flask, jsonify, request, render_template, Response, stream_with_context
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

MIN_DURATION = 90    # 1.5 minutes
MAX_DURATION = 600   # 10 minutes

NOISE_WORDS = [
    "tutorial", "how to", "howto", "review", "unboxing", "podcast",
    "interview", "lecture", "lesson", "explained", "documentary",
    "news", "weather", "recipe", "cooking", "vlog", "reaction",
    "trailer", "teaser", "gameplay", "walkthrough", "speedrun",
    "shorts", "#shorts"
]

def is_music(title, duration):
    if not duration or duration < MIN_DURATION or duration > MAX_DURATION:
        return False
    return not any(w in title.lower() for w in NOISE_WORDS)

def fmt_duration(s):
    s = int(s or 0)
    return f"{s // 60}:{s % 60:02d}"

def get_ydl_opts():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    cookie_path = os.path.join(base_dir, "cookies.txt")
    
    opts = {
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "http_headers": HEADERS,
        "ignoreerrors": True,
        "extract_flat": False,
    }
    if os.path.exists(cookie_path):
        opts["cookiefile"] = cookie_path
    return opts

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/search")
def search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])

    results = []
    ydl_opts = get_ydl_opts()

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch20:{q} official audio", download=False)
            if not info:
                return jsonify([])

            entries = info.get("entries") or []
            for entry in entries:
                if not entry:
                    continue

                title = entry.get("title", "")
                duration = entry.get("duration", 0)

                if not is_music(title, duration):
                    continue

                vid_id = entry.get("id", "")
                if not vid_id:
                    continue

                results.append({
                    "id": vid_id,
                    "title": title,
                    "artist": entry.get("uploader") or entry.get("channel") or "Unknown Artist",
                    "thumbnail": f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg",
                    "duration": duration,
                    "duration_fmt": fmt_duration(duration)
                })
    except Exception as e:
        print(f"Search Extraction Error: {e}")

    return jsonify(results)

@app.route("/stream/<video_id>")
def stream_audio(video_id):
    ydl_opts = get_ydl_opts()
    ydl_opts["format"] = "bestaudio[ext=webm]/bestaudio/best"
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            stream_url = info.get("url")
            
        if not stream_url:
            return jsonify({"error": "Could not extract stream URL"}), 502

        # Fixed the bad string escape here
        upstream = requests.get(
            stream_url,
            headers={**HEADERS, "Range": request.headers.get("Range", "bytes=0-")},
            stream=True,
            timeout=15
        )

        def generate():
            for chunk in upstream.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk

        resp_headers = {
            "Content-Type": upstream.headers.get("Content-Type", "audio/webm"),
            "Accept-Ranges": "bytes"
        }
        for h in ("Content-Length", "Content-Range"):
            if h in upstream.headers:
                resp_headers[h] = upstream.headers[h]

        return Response(stream_with_context(generate()), status=upstream.status_code, headers=resp_headers)
    except Exception as e:
        return jsonify({"error": str(e)}), 502

@app.route("/resolve/<video_id>")
def resolve(video_id):
    ydl_opts = get_ydl_opts()
    ydl_opts["format"] = "bestaudio[ext=webm]/bestaudio/best"
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            return jsonify({"url": info.get("url")})
    except Exception as e:
        return jsonify({"error": str(e)}), 502

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
