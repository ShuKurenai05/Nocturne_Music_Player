import os
import re
import requests
from flask import Flask, jsonify, request, render_template, Response, stream_with_context
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Piped instances — tried in order, fallback if one is down
# These are public community instances, no API key needed.
# ---------------------------------------------------------------------------
PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://piped-api.garudalinux.org",
    "https://api.piped.yt",
    "https://piped.adminforge.de/api",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# Duration filter: only accept tracks between 1.5 min and 10 min
MIN_DURATION = 90    # seconds
MAX_DURATION = 600   # seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def is_music(item):
    """Heuristic filter — keeps only music-like results."""
    dur = item.get("duration", 0)
    if dur < MIN_DURATION or dur > MAX_DURATION:
        return False
    title = item.get("title", "").lower()
    # reject obvious non-music patterns
    noise = [
        "tutorial", "how to", "review", "unboxing", "podcast",
        "interview", "lecture", "lesson", "explained", "documentary",
        "news", "weather", "recipe", "cooking", "vlog", "reaction",
        "trailer", "teaser", "gameplay", "walkthrough", "speedrun",
    ]
    return not any(n in title for n in noise)


def fmt_duration(seconds):
    m, s = divmod(int(seconds), 60)
    return f"{m}:{s:02d}"


def piped_search(query, limit=20):
    """Search Piped — forces music context, filters results."""
    music_query = f"{query} official audio"
    for base in PIPED_INSTANCES:
        try:
            url = f"{base}/search"
            r = requests.get(
                url,
                params={"q": music_query, "filter": "music_songs"},
                headers=HEADERS,
                timeout=6,
            )
            if r.status_code != 200:
                continue
            data = r.json()
            items = data.get("items", [])
            results = []
            for it in items:
                if it.get("type") != "stream":
                    continue
                dur = it.get("duration", 0)
                if not is_music({"duration": dur, "title": it.get("title", "")}):
                    continue
                vid_id = it.get("url", "").replace("/watch?v=", "").strip()
                results.append({
                    "id": vid_id,
                    "title": it.get("title", "Unknown"),
                    "artist": it.get("uploaderName", ""),
                    "thumbnail": it.get("thumbnail", ""),
                    "duration": dur,
                    "duration_fmt": fmt_duration(dur),
                    "source": "piped",
                    "piped_base": base,
                })
                if len(results) >= limit:
                    break
            if results:
                return results
        except Exception:
            continue
    return []


def piped_stream_url(video_id, piped_base):
    """Get direct audio stream URL from Piped."""
    for base in [piped_base] + [b for b in PIPED_INSTANCES if b != piped_base]:
        try:
            r = requests.get(
                f"{base}/streams/{video_id}",
                headers=HEADERS,
                timeout=8,
            )
            if r.status_code != 200:
                continue
            data = r.json()
            audio_streams = data.get("audioStreams", [])
            if not audio_streams:
                continue
            # pick best quality
            best = sorted(audio_streams, key=lambda x: x.get("bitrate", 0), reverse=True)[0]
            return best.get("url"), base
        except Exception:
            continue
    return None, None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/search")
def search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])
    results = piped_search(query)
    return jsonify(results)


@app.route("/stream/<video_id>")
def stream_audio(video_id):
    """Proxy the audio stream so browser CORS issues are avoided."""
    piped_base = request.args.get("base", PIPED_INSTANCES[0])
    stream_url, used_base = piped_stream_url(video_id, piped_base)

    if not stream_url:
        return jsonify({"error": "Could not resolve stream"}), 502

    try:
        upstream = requests.get(
            stream_url,
            headers={**HEADERS, "Range": request.headers.get("Range", "bytes=0-")},
            stream=True,
            timeout=10,
        )

        def generate():
            for chunk in upstream.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk

        resp_headers = {
            "Content-Type": upstream.headers.get("Content-Type", "audio/webm"),
            "Accept-Ranges": "bytes",
        }
        if "Content-Length" in upstream.headers:
            resp_headers["Content-Length"] = upstream.headers["Content-Length"]
        if "Content-Range" in upstream.headers:
            resp_headers["Content-Range"] = upstream.headers["Content-Range"]

        return Response(
            stream_with_context(generate()),
            status=upstream.status_code,
            headers=resp_headers,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/resolve/<video_id>")
def resolve(video_id):
    """Return the direct stream URL (for download link)."""
    piped_base = request.args.get("base", PIPED_INSTANCES[0])
    stream_url, _ = piped_stream_url(video_id, piped_base)
    if not stream_url:
        return jsonify({"error": "Could not resolve"}), 502
    return jsonify({"url": stream_url})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
