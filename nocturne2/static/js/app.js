"use strict";

// ── State ──────────────────────────────────────────────────────────────────
let tracks = [];
let currentIdx = -1;
let isPlaying = false;
let shuffleOn = false;
let repeatOn = false;
let ytPlayer = null;
let progressInterval = null;
let currentTrackData = null;
let authToken = localStorage.getItem("nocturne_token");
let currentUser = localStorage.getItem("nocturne_user");

// ── DOM ────────────────────────────────────────────────────────────────────
const authScreen    = document.getElementById("authScreen");
const appShell      = document.getElementById("appShell");
const authUsername  = document.getElementById("authUsername");
const authPassword  = document.getElementById("authPassword");
const authSubmit    = document.getElementById("authSubmit");
const authError     = document.getElementById("authError");
const topbarUser    = document.getElementById("topbarUser");
const logoutBtn     = document.getElementById("logoutBtn");
const menuBtn       = document.getElementById("menuBtn");
const sidebar       = document.getElementById("sidebar");
const sidebarOverlay= document.getElementById("sidebarOverlay");
const searchInput   = document.getElementById("searchInput");
const searchBtn     = document.getElementById("searchBtn");
const searchInput2  = document.getElementById("searchInput2");
const searchBtn2    = document.getElementById("searchBtn2");
const statusMsg     = document.getElementById("statusMsg");
const statusMsg2    = document.getElementById("statusMsg2");
const trackList     = document.getElementById("trackList");
const trackList2    = document.getElementById("trackList2");
const trendingList  = document.getElementById("trendingList");
const trendingSection = document.getElementById("trendingSection");
const playerBar     = document.getElementById("playerBar");
const playerThumb   = document.getElementById("playerThumb");
const playerTitle   = document.getElementById("playerTitle");
const playerArtist  = document.getElementById("playerArtist");
const playBtn       = document.getElementById("playBtn");
const playIcon      = document.getElementById("playIcon");
const prevBtn       = document.getElementById("prevBtn");
const nextBtn       = document.getElementById("nextBtn");
const shuffleBtn    = document.getElementById("shuffleBtn");
const repeatBtn     = document.getElementById("repeatBtn");
const curTimeEl     = document.getElementById("curTime");
const durTimeEl     = document.getElementById("durTime");
const progFill      = document.getElementById("progFill");
const progThumb     = document.getElementById("progThumb");
const progTrack     = document.getElementById("progTrack");
const favBtn        = document.getElementById("favBtn");
const addToPlaylistBtn = document.getElementById("addToPlaylistBtn");
const videoBtn      = document.getElementById("videoBtn");
const playlistModal = document.getElementById("playlistModal");
const modalClose    = document.getElementById("modalClose");
const modalPlaylistList = document.getElementById("modalPlaylistList");
const createPlaylistBtn = document.getElementById("createPlaylistBtn");
const playlistNameInput = document.getElementById("playlistNameInput");
const greetingHeader = document.getElementById("greetingHeader");

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
  loadTrending();
}

logoutBtn.addEventListener("click", () => {
  authToken = null; currentUser = null;
  localStorage.removeItem("nocturne_token");
  localStorage.removeItem("nocturne_user");
  appShell.classList.add("hidden");
  authScreen.classList.remove("hidden");
  authUsername.value = ""; authPassword.value = "";
});

// Auto-login if token exists
if (authToken && currentUser) enterApp();

// ── Sidebar toggle ─────────────────────────────────────────────────────────
menuBtn.addEventListener("click", () => {
  const isOpen = sidebar.classList.contains("open");
  if (isOpen) {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.add("hidden");
  } else {
    sidebar.classList.remove("hidden"); // remove display:none first
    sidebar.classList.add("open");
    sidebarOverlay.classList.remove("hidden");
  }
});
sidebarOverlay.addEventListener("click", closeSidebar);
function closeSidebar() {
  sidebar.classList.remove("open");
  sidebar.classList.add("hidden");
  sidebarOverlay.classList.add("hidden");
}

// ── Navigation ─────────────────────────────────────────────────────────────
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`page-${btn.dataset.page}`).classList.add("active");
    closeSidebar();
    if (btn.dataset.page === "favorites") renderFavorites();
    if (btn.dataset.page === "playlists") renderPlaylists();
  });
});

// ── YouTube IFrame API ─────────────────────────────────────────────────────
const ytTag = document.createElement('script');
ytTag.src = "https://www.youtube.com/iframe_api";
document.getElementsByTagName('script')[0].parentNode.insertBefore(ytTag, document.getElementsByTagName('script')[0]);

window.onYouTubeIframeAPIReady = function () {
  const div = document.createElement('div');
  div.id = 'yt-hidden-player';
  div.style.cssText = 'position:absolute;top:-9999px;left:-9999px;';
  document.body.appendChild(div);
  ytPlayer = new YT.Player('yt-hidden-player', {
    height: '200', width: '200',
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

// ── Trending ───────────────────────────────────────────────────────────────
async function loadTrending() {
  try {
    const res = await fetch("/trending");
    const data = await res.json();
    if (!data.length) { trendingSection.classList.add("hidden"); return; }
    trendingSection.classList.remove("hidden");
    renderTrackListInto(trendingList, data);
  } catch { trendingSection.classList.add("hidden"); }
}

// ── Search ─────────────────────────────────────────────────────────────────
async function doSearch(q, listEl, statusEl, isTrending = false) {
  const query = (q || "").trim();
  if (!query) return;
  setStatus(statusEl, "Searching…", "loading");
  listEl.innerHTML = "";
  if (!isTrending) trendingSection.classList.add("hidden");

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
searchBtn2.addEventListener("click", () => doSearch(searchInput2.value, trackList2, statusMsg2));
searchInput2.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(searchInput2.value, trackList2, statusMsg2); });

document.querySelectorAll(".hint-tag").forEach(tag => {
  tag.addEventListener("click", () => { searchInput.value = tag.dataset.q; doSearch(tag.dataset.q, trackList, statusMsg); });
});

document.querySelectorAll(".genre-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelector('[data-page="home"]').classList.add("active");
    document.getElementById("page-home").classList.add("active");
    closeSidebar();
    searchInput.value = btn.dataset.q;
    doSearch(btn.dataset.q, trackList, statusMsg);
  });
});

// ── Render helpers ─────────────────────────────────────────────────────────
function isFaved(id) { return window._favsCache && window._favsCache.some(t => t.track_id === id); }

function renderTrackListInto(listEl, trackArr) {
  const saved = tracks;
  tracks = trackArr;
  listEl.innerHTML = trackArr.map((t, i) => `
    <div class="track ${i === currentIdx && listEl === trackList ? "active" : ""}" data-idx="${i}">
      <div class="track-num">
        ${i === currentIdx && listEl === trackList
          ? `<div class="bars"><i></i><i></i><i></i><i></i></div>`
          : `<span>${i + 1}</span>`}
      </div>
      <img class="track-thumb" src="${t.thumbnail || t.thumbnail}" alt="" loading="lazy"/>
      <div class="track-info">
        <div class="track-name">${escHtml(t.title)}</div>
        <div class="track-artist">${escHtml(t.artist)}</div>
      </div>
      <span class="track-dur">${t.duration_fmt || ''}</span>
      <button class="track-action ${isFaved(t.id || t.track_id) ? 'faved' : ''}" data-action="fav" data-idx="${i}" title="Favorite">
        <svg viewBox="0 0 24 24" fill="${isFaved(t.id || t.track_id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </button>
    </div>
  `).join("");

  listEl.querySelectorAll(".track").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-action]")) return;
      tracks = trackArr;
      playTrack(+el.dataset.idx);
    });
  });
  listEl.querySelectorAll("[data-action='fav']").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      toggleFav(trackArr[+btn.dataset.idx]);
    });
  });
  tracks = saved;
}

function renderTracks(listEl) {
  listEl = listEl || trackList;
  renderTrackListInto(listEl, tracks);
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

  ytPlayer.loadVideoById(t.id || t.track_id);
  isPlaying = true;
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= tracks.length - 1;

  // update video tab if open
  updateVideoTab(t.id || t.track_id);
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
  if (repeatOn) { ytPlayer.seekTo(0); ytPlayer.playVideo(); return; }
  if (shuffleOn) { playTrack(Math.floor(Math.random() * tracks.length)); return; }
  if (currentIdx < tracks.length - 1) playTrack(currentIdx + 1);
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
    }
  }, 300);
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) { isPlaying = true; setPlayIcon(true); startTrackingProgress(); }
  else if (event.data === YT.PlayerState.PAUSED) { isPlaying = false; setPlayIcon(false); clearInterval(progressInterval); }
  else if (event.data === YT.PlayerState.ENDED) { clearInterval(progressInterval); playNext(); }
}
function onPlayerError(e) { if (currentIdx < tracks.length - 1) playTrack(currentIdx + 1); }

progTrack.addEventListener("click", e => {
  if (!ytPlayer || currentIdx < 0) return;
  const pct = Math.min(Math.max((e.clientX - progTrack.getBoundingClientRect().left) / progTrack.getBoundingClientRect().width, 0), 1);
  const dur = ytPlayer.getDuration();
  if (dur > 0) ytPlayer.seekTo(pct * dur, true);
});

shuffleBtn.addEventListener("click", () => { shuffleOn = !shuffleOn; shuffleBtn.classList.toggle("active", shuffleOn); });
repeatBtn.addEventListener("click", () => { repeatOn = !repeatOn; repeatBtn.classList.toggle("active", repeatOn); });
playBtn.addEventListener("click", togglePlay);
prevBtn.addEventListener("click", () => playTrack(currentIdx - 1));
nextBtn.addEventListener("click", () => playNext());

// ── Video tab ──────────────────────────────────────────────────────────────
function updateVideoTab(videoId) {
  const placeholder = document.getElementById("videoPlaceholder");
  const frame = document.getElementById("videoFrame");
  if (!videoId) return;
  placeholder.classList.add("hidden");
  frame.classList.remove("hidden");
  frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0" allowfullscreen allow="autoplay"></iframe>`;
}

videoBtn.addEventListener("click", () => {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelector('[data-page="video"]').classList.add("active");
  document.getElementById("page-video").classList.add("active");
});

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
  const mapped = favs.map(f => ({ id: f.track_id, title: f.title, artist: f.artist, thumbnail: f.thumbnail, duration_fmt: f.duration_fmt }));
  const saved = tracks; tracks = mapped; currentIdx = -1;
  renderTrackListInto(el, mapped);
  tracks = saved;
}

// ── Playlists ──────────────────────────────────────────────────────────────
createPlaylistBtn.addEventListener("click", async () => {
  const name = playlistNameInput.value.trim();
  if (!name) return;
  await fetch("/playlists", { method: "POST", headers: authHeaders(), body: JSON.stringify({ name }) });
  playlistNameInput.value = "";
  renderPlaylists();
});

// Fix: space in playlist input shouldn't trigger spacebar shortcut
playlistNameInput.addEventListener("keydown", e => e.stopPropagation());

async function renderPlaylists() {
  const res = await fetch("/playlists", { headers: authHeaders() });
  const playlists = await res.json();
  const container = document.getElementById("playlistsContainer");
  const empty = document.getElementById("playlistEmpty");
  if (!playlists.length) { container.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  container.innerHTML = playlists.map(pl => `
    <div class="playlist-group">
      <div class="playlist-group-header">
        <span class="playlist-group-name">🎵 ${escHtml(pl.name)} (${pl.tracks.length})</span>
        <button class="playlist-delete-btn" data-id="${pl.id}">Delete</button>
      </div>
      <div class="track-list">
        ${pl.tracks.map((t, i) => `
          <div class="track" data-plid="${pl.id}" data-pidx="${i}" data-tid="${t.track_id}">
            <div class="track-num"><span>${i + 1}</span></div>
            <img class="track-thumb" src="${t.thumbnail}" alt="" loading="lazy"/>
            <div class="track-info">
              <div class="track-name">${escHtml(t.title)}</div>
              <div class="track-artist">${escHtml(t.artist)}</div>
            </div>
            <span class="track-dur">${t.duration_fmt || ''}</span>
            <button class="track-action" data-action="rm" data-plid="${pl.id}" data-tid="${t.track_id}" title="Remove">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".playlist-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetch(`/playlists/${btn.dataset.id}`, { method: "DELETE", headers: authHeaders() });
      renderPlaylists();
    });
  });
  container.querySelectorAll(".track").forEach(row => {
    row.addEventListener("click", e => {
      if (e.target.closest("[data-action]")) return;
      const pl = playlists.find(p => p.id === row.dataset.plid);
      if (!pl) return;
      tracks = pl.tracks.map(t => ({ id: t.track_id, title: t.title, artist: t.artist, thumbnail: t.thumbnail, duration_fmt: t.duration_fmt }));
      playTrack(+row.dataset.pidx);
    });
  });
  container.querySelectorAll("[data-action='rm']").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      await fetch(`/playlists/${btn.dataset.plid}/tracks/${btn.dataset.tid}`, { method: "DELETE", headers: authHeaders() });
      renderPlaylists();
    });
  });
}

addToPlaylistBtn.addEventListener("click", async () => {
  if (!currentTrackData) return;
  const res = await fetch("/playlists", { headers: authHeaders() });
  const playlists = await res.json();
  if (!playlists.length) { alert("Create a playlist first."); return; }
  modalPlaylistList.innerHTML = playlists.map(pl =>
    `<div class="modal-pl-item" data-id="${pl.id}">${escHtml(pl.name)}</div>`
  ).join("");
  modalPlaylistList.querySelectorAll(".modal-pl-item").forEach(item => {
    item.addEventListener("click", async () => {
      await fetch(`/playlists/${item.dataset.id}/tracks`, { method: "POST", headers: authHeaders(), body: JSON.stringify(currentTrackData) });
      playlistModal.classList.add("hidden");
    });
  });
  playlistModal.classList.remove("hidden");
});
modalClose.addEventListener("click", () => playlistModal.classList.add("hidden"));

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight" && !nextBtn.disabled) playNext();
  if (e.code === "ArrowLeft" && !prevBtn.disabled) playTrack(currentIdx - 1);
});

// Load favs cache on start
if (authToken) loadFavsCache();
