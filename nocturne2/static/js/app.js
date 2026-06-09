"use strict";

// ── State ──────────────────────────────────────────────────────────────────
let tracks = [];
let currentIdx = -1;
let isPlaying = false;
let shuffleOn = false;
let repeatMode = 0; // 0 = off, 1 = repeat all, 2 = repeat one
let ytPlayer = null;
let progressInterval = null;
let currentTrackData = null;
let authToken = localStorage.getItem("nocturne_token");
let currentUser = localStorage.getItem("nocturne_user");

// ── DOM ────────────────────────────────────────────────────────────────────
const authScreen       = document.getElementById("authScreen");
const appShell         = document.getElementById("appShell");
const authUsername     = document.getElementById("authUsername");
const authPassword     = document.getElementById("authPassword");
const authSubmit       = document.getElementById("authSubmit");
const authError        = document.getElementById("authError");
const topbarUser       = document.getElementById("topbarUser");
const logoutBtn        = document.getElementById("logoutBtn");
const menuBtn          = document.getElementById("menuBtn");
const sidebar          = document.getElementById("sidebar");
const sidebarOverlay   = document.getElementById("sidebarOverlay");
const searchInput      = document.getElementById("searchInput");
const searchBtn        = document.getElementById("searchBtn");
const statusMsg        = document.getElementById("statusMsg");
const trackList        = document.getElementById("trackList");
const trendingList     = document.getElementById("trendingList");
const trendingSection  = document.getElementById("trendingSection");
const playerBar        = document.getElementById("playerBar");
const playerThumb      = document.getElementById("playerThumb");
const playerTitle      = document.getElementById("playerTitle");
const playerArtist     = document.getElementById("playerArtist");
const playBtn          = document.getElementById("playBtn");
const playIcon         = document.getElementById("playIcon");
const prevBtn          = document.getElementById("prevBtn");
const nextBtn          = document.getElementById("nextBtn");
const shuffleBtn       = document.getElementById("shuffleBtn");
const repeatBtn        = document.getElementById("repeatBtn");
const curTimeEl        = document.getElementById("curTime");
const durTimeEl        = document.getElementById("durTime");
const progFill         = document.getElementById("progFill");
const progThumb        = document.getElementById("progThumb");
const progTrack        = document.getElementById("progTrack");
const favBtn           = document.getElementById("favBtn");
const addToPlaylistBtn = document.getElementById("addToPlaylistBtn");
const videoBtn         = document.getElementById("videoBtn");
const playlistModal    = document.getElementById("playlistModal");
const modalClose       = document.getElementById("modalClose");
const modalPlaylistList= document.getElementById("modalPlaylistList");
const createPlaylistBtn= document.getElementById("createPlaylistBtn");
const playlistNameInput= document.getElementById("playlistNameInput");
const greetingHeader   = document.getElementById("greetingHeader");

// ── Back button / refresh guards ───────────────────────────────────────────
window.addEventListener("beforeunload", e => {
  e.preventDefault();
  e.returnValue = "";
});

let backPressCount = 0;
window.addEventListener("popstate", () => {
  if (typeof expandedPlayer !== "undefined" && expandedPlayer.classList.contains("open")) {
    closeExpandedPlayer();
    history.pushState(null, "", location.href);
    return;
  }
  const activePage = document.querySelector(".page.active");
  if (activePage && activePage.id !== "page-home") {
    navigateTo("home");
    history.pushState(null, "", location.href);
  } else {
    backPressCount++;
    if (backPressCount === 1) {
      showToast("Press back again to exit");
      setTimeout(() => { backPressCount = 0; }, 2000);
      history.pushState(null, "", location.href);
    }
  }
});
history.pushState(null, "", location.href);

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

// ── Auth ───────────────────────────────────────────────────────────────────
let authMode = "login";

document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    authMode = tab.dataset.tab;
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    authSubmit.textContent = authMode === "login" ? "Login" : "Register";
    authError.classList.add("hidden");
  });
});

authSubmit.addEventListener("click", async () => {
  const username = authUsername.value.trim();
  const password = authPassword.value;
  if (!username || !password) { showAuthError("Please fill in both fields."); return; }
  try {
    const res = await fetch(`/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error || "Something went wrong."); return; }
    authToken = data.token;
    currentUser = data.username;
    localStorage.setItem("nocturne_token", authToken);
    localStorage.setItem("nocturne_user", currentUser);
    enterApp();
  } catch { showAuthError("Connection error."); }
});

[authUsername, authPassword].forEach(el => {
  el.addEventListener("keydown", e => { if (e.key === "Enter") authSubmit.click(); });
});

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove("hidden");
}

function enterApp() {
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
  topbarUser.textContent = currentUser;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  greetingHeader.innerHTML = `<h2>${greeting}, ${currentUser} 👋</h2><p>What do you want to listen to today?</p>`;
  loadFavsCache();
  loadTrending();
}

logoutBtn.addEventListener("click", () => {
  if (!confirm("Log out of Nocturne?")) return;
  authToken = null; currentUser = null;
  localStorage.removeItem("nocturne_token");
  localStorage.removeItem("nocturne_user");
  appShell.classList.add("hidden");
  authScreen.classList.remove("hidden");
  authUsername.value = ""; authPassword.value = "";
});

if (authToken && currentUser) enterApp();

// ── Sidebar ────────────────────────────────────────────────────────────────
menuBtn.addEventListener("click", () => {
  const isOpen = sidebar.classList.contains("open");
  if (isOpen) {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.add("hidden");
  } else {
    sidebar.classList.add("open");
    sidebarOverlay.classList.remove("hidden");
  }
});
sidebarOverlay.addEventListener("click", closeSidebar);

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.add("hidden");
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".bnav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add("active");
  document.querySelectorAll(`.bnav-btn[data-page="${page}"]`).forEach(b => b.classList.add("active"));
  document.querySelectorAll(`.nav-btn[data-page="${page}"]`).forEach(b => b.classList.add("active"));
  if (page === "home") {
    searchInput.value = "";
    trackList.innerHTML = "";
    statusMsg.classList.add("hidden");
    trendingSection.classList.remove("hidden");
  }
  if (page === "favorites") renderFavorites();
  if (page === "playlists") renderPlaylists();
  closeSidebar();
}

document.querySelectorAll(".bnav-btn").forEach(btn => {
  btn.addEventListener("click", () => navigateTo(btn.dataset.page));
});
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => navigateTo(btn.dataset.page));
});
document.querySelectorAll(".genre-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    navigateTo("home");
    searchInput.value = btn.dataset.q;
    doSearch(btn.dataset.q, trackList, statusMsg);
  });
});

// ── YouTube IFrame API ─────────────────────────────────────────────────────
const ytTag = document.createElement("script");
ytTag.src = "https://www.youtube.com/iframe_api";
document.getElementsByTagName("script")[0].parentNode.insertBefore(ytTag, document.getElementsByTagName("script")[0]);

window.onYouTubeIframeAPIReady = function () {
  const div = document.createElement("div");
  div.id = "yt-hidden-player";
  div.style.cssText = "position:absolute;top:-9999px;left:-9999px;";
  document.body.appendChild(div);
  ytPlayer = new YT.Player("yt-hidden-player", {
    height: "200", width: "200",
    playerVars: { playsinline: 1, controls: 0, disablekb: 1 },
    events: { onStateChange: onPlayerStateChange, onError: onPlayerError }
  });
};

// ── Utilities ──────────────────────────────────────────────────────────────
function fmt(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function setStatus(el, msg, type = "") {
  el.textContent = msg;
  el.className = "status-msg" + (type ? " " + type : "");
  el.classList.toggle("hidden", !msg);
}
function authHeaders() {
  return { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` };
}
function isFaved(id) {
  return window._favsCache && window._favsCache.some(t => t.track_id === id);
}

// ── Repeat button ──────────────────────────────────────────────────────────
function updateRepeatBtn() {
  [repeatBtn, document.getElementById("expRepeatBtn")].forEach(btn => {
    if (!btn) return;
    btn.classList.toggle("active", repeatMode > 0);
    if (repeatMode === 0) {
      btn.title = "Repeat off";
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
    } else if (repeatMode === 1) {
      btn.title = "Repeat all";
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
    } else {
      btn.title = "Repeat one";
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/><text x="12" y="13.5" text-anchor="middle" font-size="7" font-weight="bold" fill="currentColor" font-family="sans-serif">1</text></svg>`;
    }
  });
}

repeatBtn.addEventListener("click", () => {
  repeatMode = (repeatMode + 1) % 3;
  updateRepeatBtn();
});

// ── Trending ───────────────────────────────────────────────────────────────
async function loadTrending() {
  try {
    const res = await fetch("/trending");
    const data = await res.json();
    if (!data.length) { trendingSection.classList.add("hidden"); return; }
    trendingSection.classList.remove("hidden");
    renderTrendingGrid(data);
  } catch { trendingSection.classList.add("hidden"); }
}

function renderTrendingGrid(trackArr) {
  window._trendingTracks = trackArr;
  trendingList.innerHTML = trackArr.map((t, i) => `
    <div class="trend-card" data-idx="${i}">
      <div class="trend-thumb-wrap">
        <img src="${t.thumbnail}" alt="" loading="lazy"/>
        <div class="trend-play-overlay">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      <div class="trend-title">${escHtml(t.title)}</div>
      <div class="trend-artist">${escHtml(t.artist)}</div>
    </div>
  `).join("");
  trendingList.querySelectorAll(".trend-card").forEach(card => {
    card.addEventListener("click", () => {
      tracks = window._trendingTracks;
      playTrack(+card.dataset.idx);
    });
  });
}

// ── Search ─────────────────────────────────────────────────────────────────
async function doSearch(q, listEl, statusEl) {
  const query = (q || "").trim();
  if (!query) return;
  setStatus(statusEl, "Searching…", "loading");
  listEl.innerHTML = "";
  trendingSection.classList.add("hidden");
  try {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    tracks = data;
    if (!tracks.length) { setStatus(statusEl, "No songs found."); return; }
    setStatus(statusEl, "");
    renderTracks(listEl);
  } catch { setStatus(statusEl, "Search failed.", "error"); }
}

searchBtn.addEventListener("click", () => doSearch(searchInput.value, trackList, statusMsg));
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(searchInput.value, trackList, statusMsg); });

document.querySelectorAll(".hint-tag").forEach(tag => {
  tag.addEventListener("click", () => {
    searchInput.value = tag.dataset.q;
    doSearch(tag.dataset.q, trackList, statusMsg);
  });
});

// ── Render tracks ──────────────────────────────────────────────────────────
function renderTracks(listEl) {
  listEl = listEl || trackList;
  listEl.innerHTML = tracks.map((t, i) => `
    <div class="track ${i === currentIdx ? "active" : ""}" data-idx="${i}">
      <div class="track-num">
        ${i === currentIdx
          ? `<div class="bars"><i></i><i></i><i></i><i></i></div>`
          : `<span>${i + 1}</span>`}
      </div>
      <img class="track-thumb" src="${t.thumbnail}" alt="" loading="lazy"/>
      <div class="track-info">
        <div class="track-name">${escHtml(t.title)}</div>
        <div class="track-artist">${escHtml(t.artist)}</div>
      </div>
      <span class="track-dur">${t.duration_fmt || ""}</span>
      <button class="track-action ${isFaved(t.id) ? "faved" : ""}" data-action="fav" data-idx="${i}" title="Favorite">
        <svg viewBox="0 0 24 24" fill="${isFaved(t.id) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.5">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </button>
      <button class="track-action" data-action="addpl" data-idx="${i}" title="Add to playlist">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  `).join("");

  listEl.querySelectorAll(".track").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-action]")) return;
      playTrack(+el.dataset.idx);
    });
  });
  listEl.querySelectorAll("[data-action='fav']").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      toggleFav(tracks[+btn.dataset.idx]);
    });
  });
  listEl.querySelectorAll("[data-action='addpl']").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      openPlaylistModal(tracks[+btn.dataset.idx]);
    });
  });
}

// ── Playback ───────────────────────────────────────────────────────────────
function playTrack(idx) {
  if (idx < 0 || idx >= tracks.length || !ytPlayer) return;
  currentIdx = idx;
  currentTrackData = tracks[idx];
  const t = currentTrackData;

  playerThumb.src = t.thumbnail || "";
  playerTitle.textContent = t.title;
  playerArtist.textContent = t.artist;
  playerBar.classList.remove("hidden");
  setPlayIcon(true);
  updateFavBtn();
  updateMediaSession();

  // always use loadVideoById — gives us full control over repeat/next
  ytPlayer.loadVideoById(t.id || t.track_id);

  isPlaying = true;
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= tracks.length - 1;
  updateVideoTab(t.id || t.track_id);
  syncExpandedPlayer();
  renderTracks();
}

function setPlayIcon(p) {
  playIcon.innerHTML = p
    ? `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`
    : `<path d="M8 5v14l11-7z"/>`;
}

function togglePlay() {
  if (!ytPlayer) return;
  if (currentIdx < 0 && tracks.length) { playTrack(0); return; }
  if (isPlaying) { ytPlayer.pauseVideo(); isPlaying = false; setPlayIcon(false); }
  else { ytPlayer.playVideo(); isPlaying = true; setPlayIcon(true); }
}

function playNext() {
  if (repeatMode === 2) {
    // repeat one — reload same track completely
    ytPlayer.loadVideoById(currentTrackData.id || currentTrackData.track_id);
    isPlaying = true;
    setPlayIcon(true);
    return;
  }
  if (shuffleOn) {
    playTrack(Math.floor(Math.random() * tracks.length));
    return;
  }
  if (currentIdx < tracks.length - 1) {
    playTrack(currentIdx + 1);
  } else if (repeatMode === 1) {
    // repeat all — go back to first
    playTrack(0);
  }
  // repeatMode 0, last song — stop
}

// ── Progress ───────────────────────────────────────────────────────────────
function startTrackingProgress() {
  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!ytPlayer || !isPlaying) return;
    const cur = ytPlayer.getCurrentTime(), dur = ytPlayer.getDuration();
    if (dur > 0) {
      const pct = (cur / dur) * 100;
      progFill.style.width = pct + "%";
      progThumb.style.left = pct + "%";
      curTimeEl.textContent = fmt(cur);
      durTimeEl.textContent = fmt(dur);
      const ep = document.getElementById("expProgFill");
      const et = document.getElementById("expProgThumb");
      const ec = document.getElementById("expCurTime");
      const ed = document.getElementById("expDurTime");
      if (ep) ep.style.width = pct + "%";
      if (et) et.style.left = pct + "%";
      if (ec) ec.textContent = fmt(cur);
      if (ed) ed.textContent = fmt(dur);
      if ("mediaSession" in navigator && dur > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: dur, playbackRate: 1, position: cur
          });
        } catch(e) {}
      }
    }
  }, 300);
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    setPlayIcon(true);
    const expPI = document.getElementById("expPlayIcon");
    if (expPI) expPI.innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
    startTrackingProgress();

  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
    setPlayIcon(false);
    const expPI = document.getElementById("expPlayIcon");
    if (expPI) expPI.innerHTML = `<path d="M8 5v14l11-7z"/>`;
    clearInterval(progressInterval);

  } else if (event.data === YT.PlayerState.ENDED) {
    clearInterval(progressInterval);
    playNext();
  }
}

function onPlayerError() {
  if (currentIdx < tracks.length - 1) playTrack(currentIdx + 1);
}

progTrack.addEventListener("click", e => {
  if (!ytPlayer || currentIdx < 0) return;
  const rect = progTrack.getBoundingClientRect();
  const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  const dur = ytPlayer.getDuration();
  if (dur > 0) ytPlayer.seekTo(pct * dur, true);
});

shuffleBtn.addEventListener("click", () => {
  shuffleOn = !shuffleOn;
  shuffleBtn.classList.toggle("active", shuffleOn);
  const expShuffle = document.getElementById("expShuffleBtn");
  if (expShuffle) expShuffle.classList.toggle("active", shuffleOn);
});

playBtn.addEventListener("click", togglePlay);
prevBtn.addEventListener("click", () => {
  if (ytPlayer.previousVideo && ytPlayer.getPlaylistIndex && ytPlayer.getPlaylistIndex() > 0) {
    ytPlayer.previousVideo();
  } else {
    playTrack(currentIdx - 1);
  }
});
nextBtn.addEventListener("click", () => playNext());

// ── Video tab ──────────────────────────────────────────────────────────────
function updateVideoTab(videoId) {
  const placeholder = document.getElementById("videoPlaceholder");
  const frame = document.getElementById("videoFrame");
  if (!videoId) return;
  placeholder.classList.add("hidden");
  frame.classList.remove("hidden");
  frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?rel=0" allowfullscreen allow="autoplay"></iframe>`;
}

videoBtn.addEventListener("click", () => navigateTo("video"));

// ── Media Session ──────────────────────────────────────────────────────────
function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  if (!currentTrackData) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: currentTrackData.title,
    artist: currentTrackData.artist,
    album: "Nocturne",
    artwork: [
      { src: currentTrackData.thumbnail, sizes: "300x168", type: "image/jpeg" },
      { src: currentTrackData.thumbnail, sizes: "512x512", type: "image/jpeg" }
    ]
  });

  navigator.mediaSession.setActionHandler("play", () => {
    ytPlayer && ytPlayer.playVideo();
    isPlaying = true; setPlayIcon(true);
    navigator.mediaSession.playbackState = "playing";
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    ytPlayer && ytPlayer.pauseVideo();
    isPlaying = false; setPlayIcon(false);
    navigator.mediaSession.playbackState = "paused";
  });
  navigator.mediaSession.setActionHandler("previoustrack", () => {
    if (ytPlayer.previousVideo && ytPlayer.getPlaylistIndex && ytPlayer.getPlaylistIndex() > 0) {
      ytPlayer.previousVideo();
    } else if (currentIdx > 0) playTrack(currentIdx - 1);
  });
  navigator.mediaSession.setActionHandler("nexttrack", () => playNext());
  navigator.mediaSession.setActionHandler("seekbackward", () => {
    if (ytPlayer.previousVideo && ytPlayer.getPlaylistIndex && ytPlayer.getPlaylistIndex() > 0) {
      ytPlayer.previousVideo();
    } else if (currentIdx > 0) playTrack(currentIdx - 1);
  });
  navigator.mediaSession.setActionHandler("seekforward", () => playNext());
  navigator.mediaSession.setActionHandler("seekto", e => {
    if (ytPlayer && e.seekTime !== undefined) ytPlayer.seekTo(e.seekTime, true);
  });

  navigator.mediaSession.playbackState = "playing";
}

// ── Favorites ──────────────────────────────────────────────────────────────
window._favsCache = [];

async function loadFavsCache() {
  if (!authToken) return;
  try {
    const res = await fetch("/favs", { headers: authHeaders() });
    window._favsCache = await res.json();
  } catch {}
}

async function toggleFav(track) {
  if (!authToken) return;
  const id = track.id || track.track_id;
  if (isFaved(id)) {
    await fetch(`/favs/${id}`, { method: "DELETE", headers: authHeaders() });
    window._favsCache = window._favsCache.filter(t => t.track_id !== id);
  } else {
    await fetch("/favs", { method: "POST", headers: authHeaders(), body: JSON.stringify(track) });
    window._favsCache.push({ track_id: id, ...track });
  }
  updateFavBtn();
  renderTracks();
}

function updateFavBtn() {
  if (!currentTrackData) return;
  const faved = isFaved(currentTrackData.id);
  favBtn.classList.toggle("faved", faved);
  favBtn.querySelector("svg").setAttribute("fill", faved ? "currentColor" : "none");
}

favBtn.addEventListener("click", () => { if (currentTrackData) toggleFav(currentTrackData); });

async function renderFavorites() {
  await loadFavsCache();
  const el = document.getElementById("favoritesList");
  const empty = document.getElementById("favEmpty");
  const favs = window._favsCache;
  if (!favs.length) { el.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  const mapped = favs.map(f => ({
    id: f.track_id, title: f.title, artist: f.artist,
    thumbnail: f.thumbnail, duration_fmt: f.duration_fmt
  }));
  const saved = tracks;
  tracks = mapped;
  el.innerHTML = mapped.map((t, i) => `
    <div class="track" data-idx="${i}">
      <div class="track-num"><span>${i + 1}</span></div>
      <img class="track-thumb" src="${t.thumbnail}" alt="" loading="lazy"/>
      <div class="track-info">
        <div class="track-name">${escHtml(t.title)}</div>
        <div class="track-artist">${escHtml(t.artist)}</div>
      </div>
      <span class="track-dur">${t.duration_fmt || ""}</span>
      <button class="track-action faved" data-action="unfav" data-idx="${i}" title="Remove">
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      </button>
    </div>
  `).join("");

  el.querySelectorAll(".track").forEach(row => {
    row.addEventListener("click", e => {
      if (e.target.closest("[data-action]")) return;
      tracks = mapped;
      playTrack(+row.dataset.idx);
    });
  });
  el.querySelectorAll("[data-action='unfav']").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const t = mapped[+btn.dataset.idx];
      await fetch(`/favs/${t.id}`, { method: "DELETE", headers: authHeaders() });
      window._favsCache = window._favsCache.filter(f => f.track_id !== t.id);
      renderFavorites();
    });
  });
  if (currentIdx < 0) tracks = saved;
}

// ── Playlists ──────────────────────────────────────────────────────────────
createPlaylistBtn.addEventListener("click", async () => {
  const name = playlistNameInput.value.trim();
  if (!name) return;
  await fetch("/playlists", {
    method: "POST", headers: authHeaders(), body: JSON.stringify({ name })
  });
  playlistNameInput.value = "";
  renderPlaylists();
});

playlistNameInput.addEventListener("keydown", e => e.stopPropagation());

async function renderPlaylists() {
  const res = await fetch("/playlists", { headers: authHeaders() });
  const playlists = await res.json();
  const container = document.getElementById("playlistsContainer");
  const empty = document.getElementById("playlistEmpty");

  if (!playlists.length) { container.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");

  container.innerHTML = `
    <div class="playlist-grid" id="playlistGrid">
      ${playlists.map(pl => `
        <div class="pl-card" data-id="${pl.id}">
          <div class="pl-card-art">
            ${pl.tracks.slice(0, 4).map(t => `<img src="${t.thumbnail}" alt="" loading="lazy"/>`).join("")}
            ${pl.tracks.length === 0 ? `<div class="pl-card-empty-art">🎵</div>` : ""}
          </div>
          <div class="pl-card-info">
            <div class="pl-card-name">${escHtml(pl.name)}</div>
            <div class="pl-card-count">${pl.tracks.length} song${pl.tracks.length !== 1 ? "s" : ""}</div>
          </div>
          <div class="pl-card-btns">
            <button class="pl-play-btn" data-id="${pl.id}" data-shuffle="0" title="Play in order">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play
            </button>
            <button class="pl-play-btn shuffle" data-id="${pl.id}" data-shuffle="1" title="Shuffle play">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg> Shuffle
            </button>
          </div>
        </div>
      `).join("")}
    </div>
    <div class="pl-detail hidden" id="plDetail">
      <div class="pl-detail-header">
        <button class="pl-back-btn" id="plBackBtn">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg> Back
        </button>
        <div class="pl-detail-name" id="plDetailName"></div>
        <button class="pl-delete-btn" id="plDeleteBtn">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      <div id="plDetailList" class="track-list"></div>
    </div>
  `;

  container.querySelectorAll(".pl-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest(".pl-play-btn")) return;
      const pl = playlists.find(p => p.id === card.dataset.id);
      if (pl) openPlaylistDetail(pl);
    });
  });

  container.querySelectorAll(".pl-play-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const pl = playlists.find(p => p.id === btn.dataset.id);
      if (!pl || !pl.tracks.length) { showToast("Playlist is empty."); return; }
      tracks = pl.tracks.map(t => ({
        id: t.track_id, title: t.title, artist: t.artist,
        thumbnail: t.thumbnail, duration_fmt: t.duration_fmt
      }));
      if (btn.dataset.shuffle === "1") {
        shuffleOn = true;
        shuffleBtn.classList.add("active");
        const expS = document.getElementById("expShuffleBtn");
        if (expS) expS.classList.add("active");
        playTrack(Math.floor(Math.random() * tracks.length));
      } else {
        shuffleOn = false;
        shuffleBtn.classList.remove("active");
        const expS = document.getElementById("expShuffleBtn");
        if (expS) expS.classList.remove("active");
        playTrack(0);
      }
    });
  });
}

function openPlaylistDetail(pl) {
  const grid = document.getElementById("playlistGrid");
  const detail = document.getElementById("plDetail");
  const detailName = document.getElementById("plDetailName");
  const detailList = document.getElementById("plDetailList");
  const backBtn = document.getElementById("plBackBtn");
  const deleteBtn = document.getElementById("plDeleteBtn");

  grid.classList.add("hidden");
  detail.classList.remove("hidden");
  detailName.textContent = pl.name;

  let searchBar = document.getElementById("plDetailSearch");
  if (!searchBar) {
    searchBar = document.createElement("div");
    searchBar.id = "plDetailSearch";
    searchBar.className = "pl-detail-search";
    searchBar.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input type="text" id="plDetailSearchInput" placeholder="Search in playlist…" autocomplete="off" spellcheck="false"/>
    `;
    detail.insertBefore(searchBar, detailList);
  } else {
    document.getElementById("plDetailSearchInput").value = "";
  }

  const mapped = pl.tracks.map(t => ({
    id: t.track_id, title: t.title, artist: t.artist,
    thumbnail: t.thumbnail, duration_fmt: t.duration_fmt
  }));

  function renderDetailTracks(filterQuery) {
    const q = (filterQuery || "").toLowerCase().trim();
    const filtered = q
      ? mapped.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
      : mapped;

    if (!filtered.length) {
      detailList.innerHTML = `<div class="empty-msg">${q ? "No matching songs." : "No songs in this playlist yet."}</div>`;
      return;
    }

    detailList.innerHTML = filtered.map((t, i) => `
      <div class="track" data-idx="${i}" data-realidx="${mapped.indexOf(t)}">
        <div class="track-num"><span>${i + 1}</span></div>
        <img class="track-thumb" src="${t.thumbnail}" alt="" loading="lazy"/>
        <div class="track-info">
          <div class="track-name">${escHtml(t.title)}</div>
          <div class="track-artist">${escHtml(t.artist)}</div>
        </div>
        <span class="track-dur">${t.duration_fmt || ""}</span>
        <button class="track-action" data-action="rm" data-tid="${pl.tracks[mapped.indexOf(t)].track_id}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `).join("");

    detailList.querySelectorAll(".track").forEach(row => {
      row.addEventListener("click", e => {
        if (e.target.closest("[data-action]")) return;
        tracks = mapped;
        playTrack(+row.dataset.realidx);
      });
    });

    detailList.querySelectorAll("[data-action='rm']").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        await fetch(`/playlists/${pl.id}/tracks/${btn.dataset.tid}`, {
          method: "DELETE", headers: authHeaders()
        });
        showToast("Removed from playlist.");
        renderPlaylists();
      });
    });
  }

  renderDetailTracks();

  document.getElementById("plDetailSearchInput").addEventListener("input", e => {
    renderDetailTracks(e.target.value);
  });
  document.getElementById("plDetailSearchInput").addEventListener("keydown", e => e.stopPropagation());

  backBtn.onclick = () => {
    detail.classList.add("hidden");
    grid.classList.remove("hidden");
    document.getElementById("plDetailSearchInput").value = "";
  };

  deleteBtn.onclick = async () => {
    if (!confirm(`Delete playlist "${pl.name}"? This cannot be undone.`)) return;
    await fetch(`/playlists/${pl.id}`, { method: "DELETE", headers: authHeaders() });
    showToast("Playlist deleted.");
    renderPlaylists();
  };
}

// ── Playlist modal ─────────────────────────────────────────────────────────
async function openPlaylistModal(track) {
  if (!track) return;
  const res = await fetch("/playlists", { headers: authHeaders() });
  const playlists = await res.json();
  if (!playlists.length) { showToast("Create a playlist first."); return; }
  modalPlaylistList.innerHTML = playlists.map(pl =>
    `<div class="modal-pl-item" data-id="${pl.id}">${escHtml(pl.name)}</div>`
  ).join("");
  modalPlaylistList.querySelectorAll(".modal-pl-item").forEach(item => {
    item.addEventListener("click", async () => {
      await fetch(`/playlists/${item.dataset.id}/tracks`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(track)
      });
      playlistModal.classList.add("hidden");
      showToast("Added to playlist!");
    });
  });
  playlistModal.classList.remove("hidden");
}

addToPlaylistBtn.addEventListener("click", () => openPlaylistModal(currentTrackData));
modalClose.addEventListener("click", () => playlistModal.classList.add("hidden"));

// ── Expanded Player ────────────────────────────────────────────────────────
const expandedPlayer = document.getElementById("expandedPlayer");
const collapseBtn    = document.getElementById("collapseBtn");
const expArt         = document.getElementById("expArt");
const expTitle       = document.getElementById("expTitle");
const expArtist      = document.getElementById("expArtist");
const expFavBtn      = document.getElementById("expFavBtn");
const expAddPlBtn    = document.getElementById("expAddPlBtn");
const expProgTrack   = document.getElementById("expProgTrack");
const expProgFill    = document.getElementById("expProgFill");
const expProgThumb   = document.getElementById("expProgThumb");
const expCurTime     = document.getElementById("expCurTime");
const expDurTime     = document.getElementById("expDurTime");
const expPlayBtn     = document.getElementById("expPlayBtn");
const expPlayIcon    = document.getElementById("expPlayIcon");
const expPrevBtn     = document.getElementById("expPrevBtn");
const expNextBtn     = document.getElementById("expNextBtn");
const expShuffleBtn  = document.getElementById("expShuffleBtn");
const expRepeatBtn   = document.getElementById("expRepeatBtn");

function openExpandedPlayer() {
  expandedPlayer.classList.remove("hidden");
  requestAnimationFrame(() => expandedPlayer.classList.add("open"));
  syncExpandedPlayer();
}

function closeExpandedPlayer() {
  expandedPlayer.classList.remove("open");
  setTimeout(() => expandedPlayer.classList.add("hidden"), 350);
}

function syncExpandedPlayer() {
  if (!currentTrackData) return;
  expArt.src = currentTrackData.thumbnail || "";
  expTitle.textContent = currentTrackData.title;
  expArtist.textContent = currentTrackData.artist;
  expPrevBtn.disabled = currentIdx <= 0;
  expNextBtn.disabled = currentIdx >= tracks.length - 1;
  const faved = isFaved(currentTrackData.id);
  expFavBtn.classList.toggle("faved", faved);
  expFavBtn.querySelector("svg").setAttribute("fill", faved ? "currentColor" : "none");
  expShuffleBtn.classList.toggle("active", shuffleOn);
  expRepeatBtn.classList.toggle("active", repeatMode > 0);
  expPlayIcon.innerHTML = isPlaying
    ? `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`
    : `<path d="M8 5v14l11-7z"/>`;
  updateRepeatBtn();
}

playerBar.addEventListener("click", e => {
  if (e.target.closest(".ctrl") || e.target.closest(".ctrl-sm") || e.target.closest(".prog-track")) return;
  if (currentTrackData) openExpandedPlayer();
});

collapseBtn.addEventListener("click", closeExpandedPlayer);

expPlayBtn.addEventListener("click", () => {
  togglePlay();
  expPlayIcon.innerHTML = isPlaying
    ? `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`
    : `<path d="M8 5v14l11-7z"/>`;
});

expPrevBtn.addEventListener("click", () => {
  if (ytPlayer.previousVideo && ytPlayer.getPlaylistIndex && ytPlayer.getPlaylistIndex() > 0) {
    ytPlayer.previousVideo();
  } else {
    playTrack(currentIdx - 1);
  }
});
expNextBtn.addEventListener("click", () => playNext());

expShuffleBtn.addEventListener("click", () => {
  shuffleOn = !shuffleOn;
  shuffleBtn.classList.toggle("active", shuffleOn);
  expShuffleBtn.classList.toggle("active", shuffleOn);
});

expRepeatBtn.addEventListener("click", () => {
  repeatMode = (repeatMode + 1) % 3;
  updateRepeatBtn();
});

expFavBtn.addEventListener("click", () => {
  if (currentTrackData) { toggleFav(currentTrackData); syncExpandedPlayer(); }
});
expAddPlBtn.addEventListener("click", () => openPlaylistModal(currentTrackData));

expProgTrack.addEventListener("click", e => {
  if (!ytPlayer || currentIdx < 0) return;
  const rect = expProgTrack.getBoundingClientRect();
  const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
  const dur = ytPlayer.getDuration();
  if (dur > 0) ytPlayer.seekTo(pct * dur, true);
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight" && !nextBtn.disabled) playNext();
  if (e.code === "ArrowLeft" && !prevBtn.disabled) playTrack(currentIdx - 1);
});
