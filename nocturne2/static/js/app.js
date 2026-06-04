"use strict";

let tracks = [];
let currentIdx = -1;
let isPlaying = false;
let ytPlayer = null;
let progressInterval = null;

const searchInput = document.getElementById("searchInput");
const searchBtn   = document.getElementById("searchBtn");
const statusMsg   = document.getElementById("statusMsg");
const trackList   = document.getElementById("trackList");
const playerBar   = document.getElementById("playerBar");
const playerThumb = document.getElementById("playerThumb");
const playerTitle = document.getElementById("playerTitle");
const playerArtist= document.getElementById("playerArtist");
const playBtn     = document.getElementById("playBtn");
const playIcon    = document.getElementById("playIcon");
const prevBtn     = document.getElementById("prevBtn");
const nextBtn     = document.getElementById("nextBtn");
const curTimeEl   = document.getElementById("curTime");
const durTimeEl   = document.getElementById("durTime");
const progFill    = document.getElementById("progFill");
const progThumb   = document.getElementById("progThumb");
const progTrack   = document.getElementById("progTrack");

// Load YouTube IFrame API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.getElementsByTagName('script')[0].parentNode.insertBefore(tag, document.getElementsByTagName('script')[0]);

window.onYouTubeIframeAPIReady = function () {
  const playerDiv = document.createElement('div');
  playerDiv.id = 'yt-hidden-player';
  playerDiv.style.cssText = 'position:absolute;top:-9999px;left:-9999px;';
  document.body.appendChild(playerDiv);

  ytPlayer = new YT.Player('yt-hidden-player', {
    height: '200', width: '200',
    playerVars: { playsinline: 1, controls: 0, disablekb: 1 },
    events: {
      onStateChange: onPlayerStateChange,
      onError: onPlayerError
    }
  });
};

function fmt(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function setStatus(msg, type = "") {
  statusMsg.textContent = msg;
  statusMsg.className = "status-msg" + (type ? " " + type : "");
  statusMsg.classList.toggle("hidden", !msg);
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Search ─────────────────────────────────────────────────────────────────

async function doSearch(q) {
  const query = (q || searchInput.value).trim();
  if (!query) return;
  searchInput.value = query;
  tracks = [];
  currentIdx = -1;
  trackList.innerHTML = "";
  setStatus("Searching…", "loading");

  try {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("Server error");
    const data = await res.json();
    tracks = data;
    if (!tracks.length) { setStatus("No songs found. Try a different search."); return; }
    setStatus("");
    renderTracks();
  } catch (e) {
    setStatus("Search failed. Check server logs.", "error");
  }
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderTracks() {
  trackList.innerHTML = tracks.map((t, i) => `
    <div class="track ${i === currentIdx ? "active" : ""}" data-idx="${i}">
      <div class="track-num">
        ${i === currentIdx
          ? `<div class="bars"><i></i><i></i><i></i><i></i></div>`
          : `<span>${i + 1}</span>`}
      </div>
      <img class="track-thumb" src="${t.thumbnail || ''}" alt="" loading="lazy" />
      <div class="track-info">
        <div class="track-name">${escHtml(t.title)}</div>
        <div class="track-artist">${escHtml(t.artist)}</div>
      </div>
      <span class="track-dur">${t.duration_fmt || ''}</span>
      <a class="track-dl" href="https://www.youtube.com/watch?v=${t.id}" target="_blank" title="Open in YouTube" onclick="event.stopPropagation()">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6zm11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
      </a>
    </div>
  `).join("");

  trackList.querySelectorAll(".track").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".track-dl")) return;
      playTrack(+el.dataset.idx);
    });
  });
}

// ── Playback ───────────────────────────────────────────────────────────────

function playTrack(idx) {
  if (idx < 0 || idx >= tracks.length || !ytPlayer) return;
  currentIdx = idx;
  const t = tracks[idx];

  playerThumb.src = t.thumbnail || "";
  playerTitle.textContent  = t.title;
  playerArtist.textContent = t.artist;
  playerBar.classList.remove("hidden");
  setPlayIcon(true);

  ytPlayer.loadVideoById(t.id);
  isPlaying = true;

  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= tracks.length - 1;
  renderTracks();
}

function setPlayIcon(playing) {
  playIcon.innerHTML = playing
    ? `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`
    : `<path d="M8 5v14l11-7z"/>`;
}

function togglePlay() {
  if (!tracks.length || !ytPlayer) return;
  if (currentIdx < 0) { playTrack(0); return; }
  if (isPlaying) {
    ytPlayer.pauseVideo();
    isPlaying = false;
    setPlayIcon(false);
  } else {
    ytPlayer.playVideo();
    isPlaying = true;
    setPlayIcon(true);
  }
}

// ── Progress ───────────────────────────────────────────────────────────────

function startTrackingProgress() {
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!ytPlayer || !isPlaying) return;
    const cur = ytPlayer.getCurrentTime();
    const dur = ytPlayer.getDuration();
    if (dur > 0) {
      const pct = (cur / dur) * 100;
      progFill.style.width = pct + "%";
      progThumb.style.left = pct + "%";
      curTimeEl.textContent = fmt(cur);
      durTimeEl.textContent = fmt(dur);
    }
  }, 300);
}

function stopTrackingProgress() {
  clearInterval(progressInterval);
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    setPlayIcon(true);
    startTrackingProgress();
  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
    setPlayIcon(false);
    stopTrackingProgress();
  } else if (event.data === YT.PlayerState.ENDED) {
    stopTrackingProgress();
    if (currentIdx < tracks.length - 1) playTrack(currentIdx + 1);
    else { isPlaying = false; setPlayIcon(false); }
  }
}

function onPlayerError(event) {
  console.error("Player error:", event.data);
  // skip to next on error
  if (currentIdx < tracks.length - 1) playTrack(currentIdx + 1);
}

// ── Seek ───────────────────────────────────────────────────────────────────

progTrack.addEventListener("click", (e) => {
  if (!ytPlayer || currentIdx < 0) return;
  const rect = progTrack.getBoundingClientRect();
  const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  const dur = ytPlayer.getDuration();
  if (dur > 0) ytPlayer.seekTo(pct * dur, true);
});

// ── Controls ───────────────────────────────────────────────────────────────

playBtn.addEventListener("click", togglePlay);
prevBtn.addEventListener("click", () => playTrack(currentIdx - 1));
nextBtn.addEventListener("click", () => playTrack(currentIdx + 1));
searchBtn.addEventListener("click", () => doSearch());
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

document.querySelectorAll(".hint-tag").forEach(tag => {
  tag.addEventListener("click", () => doSearch(tag.dataset.q));
});

document.addEventListener("keydown", (e) => {
  if (e.target === searchInput) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight" && !nextBtn.disabled) playTrack(currentIdx + 1);
  if (e.code === "ArrowLeft"  && !prevBtn.disabled) playTrack(currentIdx - 1);
});
