"use strict";

let tracks = [];
let currentIdx = -1;
let isPlaying = false;
let ytPlayer = null;
let progressInterval = null;

// DOM Elements
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

// Load YouTube Iframe API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// Automatically called by the YouTube API once loaded
window.onYouTubeIframeAPIReady = function() {
  // Create an invisible player container or attach to an existing one
  const playerDiv = document.createElement('div');
  playerDiv.id = 'yt-hidden-player';
  playerDiv.style.position = 'absolute';
  playerDiv.style.top = '-9999px'; // Keep it out of sight
  document.body.appendChild(playerDiv);

  ytPlayer = new YT.Player('yt-hidden-player', {
    height: '200',
    width: '200',
    playerVars: {
      'playsinline': 1,
      'controls': 0,
      'disablekb': 1
    },
    events: {
      'onStateChange': onPlayerStateChange,
      'onError': onPlayerError
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
    setStatus("Search failed. Check server logs.", "error");
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
      <img class="track-thumb" src="${t.thumbnail || ''}" alt="" loading="lazy" />
      <div class="track-info">
        <div class="track-name">${escHtml(t.title)}</div>
        <div class="track-artist">${escHtml(t.artist)}</div>
      </div>
      <span class="track-dur">${t.duration_fmt}</span>
    </div>
  `).join("");

  trackList.querySelectorAll(".track").forEach(el => {
    el.addEventListener("click", () => playTrack(+el.dataset.idx));
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function playTrack(idx) {
  if (idx < 0 || idx >= tracks.length || !ytPlayer) return;
  currentIdx = idx;
  const t = tracks[idx];

  playerThumb.src  = t.thumbnail || "";
  playerTitle.textContent  = t.title;
  playerArtist.textContent = t.artist;
  playerBar.classList.remove("hidden");
  setPlayIcon(false);

  // Instruct YouTube player to load and run the video ID directly
  ytPlayer.loadVideoById(t.id);
  isPlaying = true;
  setPlayIcon(true);

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

function startTrackingProgress() {
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!ytPlayer || !isPlaying) return;
    const currentTime = ytPlayer.getCurrentTime();
    const duration = ytPlayer.getDuration();
    
    if (duration > 0) {
      const pct = (currentTime / duration) * 100;
      progFill.style.width  = pct + "%";
      progThumb.style.left  = pct + "%";
      curTimeEl.textContent = fmt(currentTime);
      durTimeEl.textContent = fmt(duration);
    }
  }, 300);
}

function stopTrackingProgress() {
  clearInterval(progressInterval);
}

function onPlayerStateChange(event) {
  // YT.PlayerState.PLAYING = 1, YT.PlayerState.ENDED = 0
  if (event.data === 1) {
    isPlaying = true;
    setPlayIcon(true);
    startTrackingProgress();
  } else if (event.data === 2) {
    isPlaying = false;
    setPlayIcon(false);
    stopTrackingProgress();
  } else if (event.data === 0) {
    stopTrackingProgress();
    if (currentIdx < tracks.length - 1) {
      playTrack(currentIdx + 1);
    } else {
      isPlaying = false;
      setPlayIcon(false);
    }
  }
}

function onPlayerError(event) {
  console.error("Player Error:", event.data);
  if (currentIdx < tracks.length - 1) {
    playTrack(currentIdx + 1);
  }
}

// Scrub bar seek management
progTrack.addEventListener("click", (e) => {
  if (!ytPlayer || currentIdx < 0) return;
  const rect = progTrack.getBoundingClientRect();
  const pct  = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  const duration = ytPlayer.getDuration();
  if (duration > 0) {
    ytPlayer.seekTo(pct * duration, true);
  }
});

playBtn.addEventListener("click", togglePlay);
prevBtn.addEventListener("click", () => playTrack(currentIdx - 1));
nextBtn.addEventListener("click", () => playTrack(currentIdx + 1));

searchBtn.addEventListener("click", () => doSearch());
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

document.addEventListener("keydown", (e) => {
  if (e.target === searchInput) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight" && !nextBtn.disabled) playTrack(currentIdx + 1);
  if (e.code === "ArrowLeft"  && !prevBtn.disabled) playTrack(currentIdx - 1);
});
