"use strict";

let tracks = [];
let currentIdx = -1;
let isPlaying = false;
let isSeeking = false;

const audio = new Audio();

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
const dlBtn       = document.getElementById("dlBtn");
const curTimeEl   = document.getElementById("curTime");
const durTimeEl   = document.getElementById("durTime");
const progFill    = document.getElementById("progFill");
const progThumb   = document.getElementById("progThumb");
const progTrack   = document.getElementById("progTrack");

function fmt(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function setStatus(msg, type = "") {
  statusMsg.textContent = msg;
  statusMsg.className = "status-msg" + (type ? " " + type : "");
  statusMsg.classList.toggle("hidden", !msg);
}

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

    if (!tracks.length) {
      setStatus("No songs found. Try a different search.");
      return;
    }
    setStatus("");
    renderTracks();
  } catch (e) {
    setStatus("Search failed. Is the server running?", "error");
  }
}

function renderTracks() {
  trackList.innerHTML = tracks.map((t, i) => `
    <div class="track ${i === currentIdx ? "active" : ""}" data-idx="${i}">
      <div class="track-num">
        ${i === currentIdx
          ? `<div class="bars"><i></i><i></i><i></i><i></i></div>`
          : `<span>${i + 1}</span>`}
      </div>
      <img class="track-thumb" src="${t.thumbnail || ''}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />
      <div class="track-info">
        <div class="track-name">${escHtml(t.title)}</div>
        <div class="track-artist">${escHtml(t.artist)}</div>
      </div>
      <span class="track-dur">${t.duration_fmt}</span>
      <button class="track-dl-btn" data-idx="${i}" title="Download">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>
  `).join("");

  trackList.querySelectorAll(".track").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".track-dl-btn")) return;
      playTrack(+el.dataset.idx);
    });
  });

  trackList.querySelectorAll(".track-dl-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      downloadTrack(+btn.dataset.idx);
    });
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function playTrack(idx) {
  if (idx < 0 || idx >= tracks.length) return;
  currentIdx = idx;
  const t = tracks[idx];

  playerThumb.src  = t.thumbnail || "";
  playerTitle.textContent  = t.title;
  playerArtist.textContent = t.artist;
  playerBar.classList.remove("hidden");
  setPlayIcon(false);

  try {
    // Fetch the raw extracted media link directly
    const res = await fetch(`/resolve/${t.id}`);
    const data = await res.json();
    
    if (!data.url) throw new Error("Resolution failed");

    // Point the audio element directly to the streaming URL endpoint
    audio.src = data.url;
    audio.load();

    await audio.play();
    isPlaying = true;
    setPlayIcon(true);
  } catch(e) {
    setStatus("Playback failed or stream restricted. Trying next track...", "error");
    if (idx < tracks.length - 1) playTrack(idx + 1);
  }

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
  if (!tracks.length) return;
  if (currentIdx < 0) { playTrack(0); return; }
  if (audio.paused) {
    audio.play();
    isPlaying = true;
    setPlayIcon(true);
  } else {
    audio.pause();
    isPlaying = false;
    setPlayIcon(false);
  }
}

async function downloadTrack(idx) {
  const t = tracks[idx];
  try {
    const res = await fetch(`/resolve/${t.id}`);
    const data = await res.json();
    if (!data.url) throw new Error("No URL");
    const a = document.createElement("a");
    a.href = data.url;
    a.download = `${t.title}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    alert("Download failed for this track.");
  }
}

dlBtn.addEventListener("click", () => {
  if (currentIdx >= 0) downloadTrack(currentIdx);
});

audio.addEventListener("timeupdate", () => {
  if (!audio.duration || isSeeking) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progFill.style.width  = pct + "%";
  progThumb.style.left  = pct + "%";
  curTimeEl.textContent = fmt(audio.currentTime);
  durTimeEl.textContent = fmt(audio.duration);
});

audio.addEventListener("ended", () => {
  if (currentIdx < tracks.length - 1) playTrack(currentIdx + 1);
  else { isPlaying = false; setPlayIcon(false); }
});

progTrack.addEventListener("mousedown", (e) => {
  isSeeking = true;
  seekFromEvent(e);
});
document.addEventListener("mousemove", (e) => { if (isSeeking) seekFromEvent(e); });
document.addEventListener("mouseup",   () => { isSeeking = false; });

progTrack.addEventListener("touchstart", (e) => { isSeeking = true; seekFromEvent(e.touches[0]); }, {passive:true});
document.addEventListener("touchmove",  (e) => { if (isSeeking) seekFromEvent(e.touches[0]); }, {passive:true});
document.addEventListener("touchend",   () => { isSeeking = false; });

function seekFromEvent(e) {
  const rect = progTrack.getBoundingClientRect();
  const pct  = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  progFill.style.width = (pct * 100) + "%";
  progThumb.style.left = (pct * 100) + "%";
  if (audio.duration) audio.currentTime = pct * audio.duration;
}

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
