import os, bcrypt, yt_dlp
from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from supabase import create_client

app = Flask(__name__)
CORS(app)
app.config["JWT_SECRET_KEY"] = os.environ.get("SECRET_KEY", "nocturne_dev_secret")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = False
jwt = JWTManager(app)

try:
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
except Exception as e:
    print(f"Supabase init error: {e}")
    sb = None

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
MIN_DURATION = 90
MAX_DURATION = 600
NOISE_WORDS = [
    "tutorial","how to","howto","review","unboxing","podcast","interview",
    "lecture","lesson","explained","documentary","news","weather","recipe",
    "cooking","vlog","reaction","trailer","teaser","gameplay","walkthrough",
    "speedrun","shorts","#shorts","full movie","movie scene","episode",
    "stand up","comedy","speech","ted talk","conference"
]

def is_music(title, duration):
    if duration and (duration < MIN_DURATION or duration > MAX_DURATION):
        return False
    return not any(w in title.lower() for w in NOISE_WORDS)

def fmt_duration(s):
    s = int(s or 0)
    return f"{s // 60}:{s % 60:02d}"

def get_ydl_opts(extra={}):
    opts = {
        "quiet": True, "no_warnings": True, "nocheckcertificate": True,
        "http_headers": HEADERS, "ignoreerrors": True, "extract_flat": True,
    }
    cookie_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cookies.txt")
    if os.path.exists(cookie_path):
        opts["cookiefile"] = cookie_path
    opts.update(extra)
    return opts

@app.route("/")
def index():
    return render_template("index.html")

# ── Auth ──────────────────────────────────────────────────────────────────
@app.route("/auth/register", methods=["POST"])
def register():
    data = request.json
    username = data.get("username", "").strip().lower()
    password = data.get("password", "")
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    if len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters"}), 400
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    try:
        sb.table("users").insert({"username": username, "password_hash": hashed}).execute()
        token = create_access_token(identity=username)
        return jsonify({"token": token, "username": username})
    except:
        return jsonify({"error": "Username already taken"}), 409

@app.route("/auth/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username", "").strip().lower()
    password = data.get("password", "")
    res = sb.table("users").select("*").eq("username", username).execute()
    if not res.data:
        return jsonify({"error": "Invalid username or password"}), 401
    user = res.data[0]
    if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify({"error": "Invalid username or password"}), 401
    token = create_access_token(identity=username)
    return jsonify({"token": token, "username": username})

# ── Search ────────────────────────────────────────────────────────────────
@app.route("/search")
def search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    results = []
    try:
        with yt_dlp.YoutubeDL(get_ydl_opts()) as ydl:
            info = ydl.extract_info(f"ytsearch20:{q} official audio", download=False)
            if not info:
                return jsonify([])
            for entry in (info.get("entries") or []):
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
                    "id": vid_id, "title": title,
                    "artist": entry.get("uploader") or entry.get("channel") or "Unknown",
                    "thumbnail": f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg",
                    "duration": duration, "duration_fmt": fmt_duration(duration)
                })
    except Exception as e:
        print(f"Search error: {e}")
    return jsonify(results)

@app.route("/trending")
def trending():
    queries = [
        "Bollywood hits 2024 official audio",
        "English pop 2024 official audio", 
        "The Weeknd official audio",
        "Arijit Singh official audio",
    ]
    results = []
    seen = set()
    try:
        with yt_dlp.YoutubeDL(get_ydl_opts()) as ydl:
            for q in queries:
                if len(results) >= 12:
                    break
                info = ydl.extract_info(f"ytsearch5:{q}", download=False)
                if not info:
                    continue
                for entry in (info.get("entries") or []):
                    if not entry:
                        continue
                    title = entry.get("title", "")
                    duration = entry.get("duration", 0)
                    vid_id = entry.get("id", "")
                    if not vid_id or vid_id in seen:
                        continue
                    if not is_music(title, duration):
                        continue
                    seen.add(vid_id)
                    results.append({
                        "id": vid_id, "title": title,
                        "artist": entry.get("uploader") or entry.get("channel") or "Unknown",
                        "thumbnail": f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg",
                        "duration": duration, "duration_fmt": fmt_duration(duration)
                    })
    except Exception as e:
        print(f"Trending error: {e}")
    return jsonify(results)

# ── Favorites ─────────────────────────────────────────────────────────────
@app.route("/favs", methods=["GET"])
@jwt_required()
def get_favs():
    user = get_jwt_identity()
    u = sb.table("users").select("id").eq("username", user).execute()
    if not u.data: return jsonify([])
    uid = u.data[0]["id"]
    res = sb.table("favorites").select("*").eq("user_id", uid).order("created_at", desc=True).execute()
    return jsonify(res.data or [])

@app.route("/favs", methods=["POST"])
@jwt_required()
def add_fav():
    user = get_jwt_identity()
    t = request.json
    u = sb.table("users").select("id").eq("username", user).execute()
    if not u.data: return jsonify({"error": "User not found"}), 404
    uid = u.data[0]["id"]
    try:
        sb.table("favorites").insert({
            "user_id": uid, "track_id": t["id"], "title": t["title"],
            "artist": t["artist"], "thumbnail": t["thumbnail"], "duration_fmt": t.get("duration_fmt","")
        }).execute()
    except: pass
    return jsonify({"ok": True})

@app.route("/favs/<track_id>", methods=["DELETE"])
@jwt_required()
def remove_fav(track_id):
    user = get_jwt_identity()
    u = sb.table("users").select("id").eq("username", user).execute()
    if not u.data: return jsonify({"error": "User not found"}), 404
    uid = u.data[0]["id"]
    sb.table("favorites").delete().eq("user_id", uid).eq("track_id", track_id).execute()
    return jsonify({"ok": True})

# ── Playlists ─────────────────────────────────────────────────────────────
@app.route("/playlists", methods=["GET"])
@jwt_required()
def get_playlists():
    user = get_jwt_identity()
    u = sb.table("users").select("id").eq("username", user).execute()
    if not u.data: return jsonify([])
    uid = u.data[0]["id"]
    pls = sb.table("playlists").select("*").eq("user_id", uid).execute()
    result = []
    for pl in (pls.data or []):
        tracks = sb.table("playlist_tracks").select("*").eq("playlist_id", pl["id"]).order("position").execute()
        result.append({**pl, "tracks": tracks.data or []})
    return jsonify(result)

@app.route("/playlists", methods=["POST"])
@jwt_required()
def create_playlist():
    user = get_jwt_identity()
    name = request.json.get("name", "").strip()
    if not name: return jsonify({"error": "Name required"}), 400
    u = sb.table("users").select("id").eq("username", user).execute()
    if not u.data: return jsonify({"error": "User not found"}), 404
    uid = u.data[0]["id"]
    res = sb.table("playlists").insert({"user_id": uid, "name": name}).execute()
    return jsonify(res.data[0])

@app.route("/playlists/<pl_id>", methods=["DELETE"])
@jwt_required()
def delete_playlist(pl_id):
    sb.table("playlists").delete().eq("id", pl_id).execute()
    return jsonify({"ok": True})

@app.route("/playlists/<pl_id>/tracks", methods=["POST"])
@jwt_required()
def add_to_playlist(pl_id):
    t = request.json
    existing = sb.table("playlist_tracks").select("id").eq("playlist_id", pl_id).eq("track_id", t["id"]).execute()
    if existing.data: return jsonify({"ok": True})
    count = sb.table("playlist_tracks").select("id", count="exact").eq("playlist_id", pl_id).execute()
    pos = count.count or 0
    sb.table("playlist_tracks").insert({
        "playlist_id": pl_id, "track_id": t["id"], "title": t["title"],
        "artist": t["artist"], "thumbnail": t["thumbnail"],
        "duration_fmt": t.get("duration_fmt", ""), "position": pos
    }).execute()
    return jsonify({"ok": True})

@app.route("/playlists/<pl_id>/tracks/<track_id>", methods=["DELETE"])
@jwt_required()
def remove_from_playlist(pl_id, track_id):
    sb.table("playlist_tracks").delete().eq("playlist_id", pl_id).eq("track_id", track_id).execute()
    return jsonify({"ok": True})

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
