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

// localStorage keys
const LS_FAVS = "nocturne_favorites";
const LS_PLAYLISTS = "nocturne_playlists";
const LS_OFFLINE = "nocturne_offline";

// ── DOM ────────────────────────────────────────────────────────────────────
const searchInput   = document.getElementById("searchInput");
const searchBtn     = document.getElementById("searchBtn");
const searchInput2  = document.getElementById("searchInput2");
const searchBtn2    = document.getElementById("searchBtn2");
const statusMsg     = document.getElementById("statusMsg");
const statusMsg2    = document.getElementById("statusMsg2");
const trackList     = document.getElementById("trackList");
const trackList2    = document.getElementById("trackList2");
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
const dlBtn         = document.getElementById("dlBtn");
const favBtn        = document.getElementById("favBtn");
const addToPlaylistBtn = document.getElementById("addToPlaylistBtn");
const playlistModal = document.getElementById("playlistModal");
const modalClose    = document.getElementById("modalClose");
const modalPlaylistList = document.getElementById("modalPlaylistList");
const createPlaylistBtn = document.getElementById("createPlaylistBtn");
const playlistNameInput = document.getElementById("playlistNameInput");

// ── YouTube IFrame API ─────────────────────────────────────────────────────
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.getElementsByTagName('script')[0].parentNode.insertBefore(tag, document.getElementsByTagName('script')[0]);

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
function getFavs() { return JSON.parse(localStorage.getItem(LS_FAVS) || "[]"); }
function saveFavs(f) { localStorage.setItem(LS_FAVS, JSON.stringify(f)); }
function getPlaylists() { return JSON.parse(localStorage.getItem(LS_PLAYLISTS) || "{}"); }
function savePlaylists(p) { localStorage.setItem(LS_PLAYLISTS, JSON.stringify(p)); }
function getOffline() { return JSON.parse(localStorage.getItem(LS_OFFLINE) || "[]"); }
function saveOffline(o) { localStorage.setItem(LS_OFFLINE, JSON.stringify(o)); }
function isFaved(id) { return getFavs().some(t => t.id === id); }

// ── Navigation ─────────────────────────────────────────────────────────────
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`page-${btn.dataset.page}`).classList.add("active");
    if (btn.dataset.page === "favorites") renderFavorites();
    if (btn.dataset.page === "playlists") renderPlaylists();
    if (btn.dataset.page === "offline") renderOffline();
  });
});

// ── Search ─────────────────────────────────────────────────────────────────
async function doSearch(q, listEl, statusEl) {
  const query = (q || "").trim();
  if (!query) return;
  setStatus(statusEl, "Searching…", "loading");
  listEl.innerHTML = "";

  try {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    tracks = data;
    if (!tracks.length) { setStatus(statusEl, "No songs found. Try a different search."); return; }
    setStatus(statusEl, "");
    renderTracks(listEl);
  } catch {
    setStatus(statusEl, "Search failed.", "error");
  }
}

// home search
searchBtn.addEventListener("click", () => { doSearch(searchInput.value, trackList, statusMsg); });
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(searchInput.value, trackList, statusMsg); });

// search page
searchBtn2.addEventListener("click", () => { doSearch(searchInput2.value, trackList2, statusMsg2); });
searchInput2.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(searchInput2.value, trackList2, statusMsg2); });

// hint tags
document.querySelectorAll(".hint-tag").forEach(tag => {
  tag.addEventListener("click", () => {
    searchInput.value = tag.dataset.q;
    doSearch(tag.dataset.q, trackList, statusMsg);
  });
});

// genre buttons
document.querySelectorAll(".genre-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    // switch to home page and search
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelector('[data-page="home"]').classList.add("active");
    document.getElementById("page-home").classList.add("active");
    searchInput.value = btn.dataset.q;
    doSearch(btn.dataset.q, trackList, statusMsg);
  });
});

// ── Render tracks ──────────────────────────────────────────────────────────
function renderTracks(listEl) {
  listEl = listEl || trackList;
  listEl.innerHTML = tracks.map((t, i) => `
    <div class="track ${i === currentIdx ? "active" : ""}" data-idx="${i}">
      <div class="track-num">
        ${i === currentIdx ? `<div class="bars"><i></i><i></i><i></i><i></i></div>` : `<span>${i + 1}</span>`}
      </div>
      <img class="track-thumb" src="${t.thumbnail}" alt="" loading="lazy"/>
      <div class="track-info">
        <div class="track-name">${escHtml(t.title)}</div>
        <div class="track-artist">${escHtml(t.artist)}</div>
      </div>
      <span class="track-dur">${t.duration_fmt || ''}</span>
      <button class="track-action ${isFaved(t.id) ? 'faved' : ''}" data-action="fav" data-idx="${i}" title="Favorite">
        <svg viewBox="0 0 24 24" fill="${isFaved(t.id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </button>
      <button class="track-action" data-action="dl" data-idx="${i}" title="Download">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
    btn.addEventListener("click", e => { e.stopPropagation(); toggleFav(tracks[+btn.dataset.idx]); renderTracks(listEl); });
  });
  listEl.querySelectorAll("[data-action='dl']").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); downloadTrack(tracks[+btn.dataset.idx]); });
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
  if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true; setPlayIcon(true); startTrackingProgress();
  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false; setPlayIcon(false); clearInterval(progressInterval);
  } else if (event.data === YT.PlayerState.ENDED) {
    clearInterval(progressInterval); playNext();
  }
}

function onPlayerError(event) {
  console.error("YT error:", event.data);
  if (currentIdx < tracks.length - 1) playTrack(currentIdx + 1);
}

// ── Seek ───────────────────────────────────────────────────────────────────
progTrack.addEventListener("click", e => {
  if (!ytPlayer || currentIdx < 0) return;
  const pct = Math.min(Math.max((e.clientX - progTrack.getBoundingClientRect().left) / progTrack.getBoundingClientRect().width, 0), 1);
  const dur = ytPlayer.getDuration();
  if (dur > 0) ytPlayer.seekTo(pct * dur, true);
});

// ── Shuffle / Repeat ───────────────────────────────────────────────────────
shuffleBtn.addEventListener("click", () => {
  shuffleOn = !shuffleOn;
  shuffleBtn.classList.toggle("active", shuffleOn);
});
repeatBtn.addEventListener("click", () => {
  repeatOn = !repeatOn;
  repeatBtn.classList.toggle("active", repeatOn);
});

// ── Favorites ──────────────────────────────────────────────────────────────
function toggleFav(track) {
  let favs = getFavs();
  if (isFaved(track.id)) favs = favs.filter(t => t.id !== track.id);
  else favs.push(track);
  saveFavs(favs);
  updateFavBtn();
}

function updateFavBtn() {
  if (!currentTrackData) return;
  const faved = isFaved(currentTrackData.id);
  favBtn.classList.toggle("faved", faved);
  favBtn.querySelector("svg").setAttribute("fill", faved ? "currentColor" : "none");
}

favBtn.addEventListener("click", () => {
  if (!currentTrackData) return;
  toggleFav(currentTrackData);
  renderTracks();
});

function renderFavorites() {
  const favs = getFavs();
  const el = document.getElementById("favoritesList");
  const empty = document.getElementById("favEmpty");
  if (!favs.length) { el.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  // temporarily set tracks to favs for rendering
  const saved = tracks;
  tracks = favs;
  currentIdx = -1;
  el.innerHTML = tracks.map((t, i) => `
    <div class="track" data-idx="${i}">
      <div class="track-num"><span>${i + 1}</span></div>
      <img class="track-thumb" src="${t.thumbnail}" alt="" loading="lazy"/>
      <div class="track-info">
        <div class="track-name">${escHtml(t.title)}</div>
        <div class="track-artist">${escHtml(t.artist)}</div>
      </div>
      <span class="track-dur">${t.duration_fmt || ''}</span>
      <button class="track-action faved" data-action="unfav" data-idx="${i}" title="Remove">
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </button>
    </div>
  `).join("");
  el.querySelectorAll(".track").forEach(row => {
    row.addEventListener("click", e => {
      if (e.target.closest("[data-action]")) return;
      playTrack(+row.dataset.idx);
    });
  });
  el.querySelectorAll("[data-action='unfav']").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const t = tracks[+btn.dataset.idx];
      toggleFav(t);
      renderFavorites();
    });
  });
  tracks = saved;
}

// ── Playlists ──────────────────────────────────────────────────────────────
createPlaylistBtn.addEventListener("click", () => {
  const name = playlistNameInput.value.trim();
  if (!name) return;
  const playlists = getPlaylists();
  if (!playlists[name]) playlists[name] = [];
  savePlaylists(playlists);
  playlistNameInput.value = "";
  renderPlaylists();
});

function renderPlaylists() {
  const playlists = getPlaylists();
  const container = document.getElementById("playlistsContainer");
  const empty = document.getElementById("playlistEmpty");
  const names = Object.keys(playlists);
  if (!names.length) { container.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  container.innerHTML = names.map(name => `
    <div class="playlist-group">
      <div class="playlist-group-header">
        <span class="playlist-group-name">🎵 ${escHtml(name)} (${playlists[name].length})</span>
        <button class="playlist-delete-btn" data-name="${escHtml(name)}">Delete</button>
      </div>
      <div class="track-list">
        ${playlists[name].map((t, i) => `
          <div class="track" data-id="${t.id}" data-pl="${escHtml(name)}" data-pidx="${i}">
            <div class="track-num"><span>${i + 1}</span></div>
            <img class="track-thumb" src="${t.thumbnail}" alt="" loading="lazy"/>
            <div class="track-info">
              <div class="track-name">${escHtml(t.title)}</div>
              <div class="track-artist">${escHtml(t.artist)}</div>
            </div>
            <span class="track-dur">${t.duration_fmt || ''}</span>
            <button class="track-action" data-action="remove-pl" data-pl="${escHtml(name)}" data-pidx="${i}" title="Remove">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".playlist-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const pl = getPlaylists(); delete pl[btn.dataset.name]; savePlaylists(pl); renderPlaylists();
    });
  });
  container.querySelectorAll(".track").forEach(row => {
    row.addEventListener("click", e => {
      if (e.target.closest("[data-action]")) return;
      const plName = row.dataset.pl;
      const pl = getPlaylists();
      tracks = pl[plName] || [];
      currentIdx = -1;
      playTrack(+row.dataset.pidx);
    });
  });
  container.querySelectorAll("[data-action='remove-pl']").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const pl = getPlaylists();
      pl[btn.dataset.pl].splice(+btn.dataset.pidx, 1);
      savePlaylists(pl); renderPlaylists();
    });
  });
}

// Add to playlist modal
addToPlaylistBtn.addEventListener("click", () => {
  if (!currentTrackData) return;
  const playlists = getPlaylists();
  const names = Object.keys(playlists);
  if (!names.length) { alert("Create a playlist first from the Playlists tab."); return; }
  modalPlaylistList.innerHTML = names.map(name => `
    <div class="modal-pl-item" data-name="${escHtml(name)}">${escHtml(name)}</div>
  `).join("");
  modalPlaylistList.querySelectorAll(".modal-pl-item").forEach(item => {
    item.addEventListener("click", () => {
      const pl = getPlaylists();
      if (!pl[item.dataset.name].some(t => t.id === currentTrackData.id)) {
        pl[item.dataset.name].push(currentTrackData);
        savePlaylists(pl);
      }
      playlistModal.classList.add("hidden");
    });
  });
  playlistModal.classList.remove("hidden");
});
modalClose.addEventListener("click", () => playlistModal.classList.add("hidden"));

// ── Download ───────────────────────────────────────────────────────────────
async function downloadTrack(track) {
  const t = track || currentTrackData;
  if (!t) return;
  // Save to offline list
  const offline = getOffline();
  if (!offline.some(o => o.id === t.id)) { offline.push(t); saveOffline(offline); }
  // Trigger server download
  const a = document.createElement("a");
  a.href = `/download/${t.id}`;
  a.download = `${t.title}.mp3`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

dlBtn.addEventListener("click", () => downloadTrack());

function renderOffline() {
  const offline = getOffline();
  const el = document.getElementById("offlineList");
  const empty = document.getElementById("offlineEmpty");
  if (!offline.length) { el.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  const saved = tracks;
  tracks = offline;
  el.innerHTML = offline.map((t, i) => `
    <div class="track" data-idx="${i}">
      <div class="track-num"><span>${i + 1}</span></div>
      <img class="track-thumb" src="${t.thumbnail}" alt="" loading="lazy"/>
      <div class="track-info">
        <div class="track-name">${escHtml(t.title)}</div>
        <div class="track-artist">${escHtml(t.artist)}</div>
      </div>
      <span class="track-dur">${t.duration_fmt || ''}</span>
      <button class="track-action" data-action="dl" data-idx="${i}" title="Download again">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
    </div>
  `).join("");
  el.querySelectorAll(".track").forEach(row => {
    row.addEventListener("click", e => {
      if (e.target.closest("[data-action]")) return;
      playTrack(+row.dataset.idx);
    });
  });
  el.querySelectorAll("[data-action='dl']").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); downloadTrack(offline[+btn.dataset.idx]); });
  });
  tracks = saved;
}

// ── Controls ───────────────────────────────────────────────────────────────
playBtn.addEventListener("click", togglePlay);
prevBtn.addEventListener("click", () => playTrack(currentIdx - 1));
nextBtn.addEventListener("click", () => playNext());

document.addEventListener("keydown", e => {
  if (e.target === searchInput || e.target === searchInput2) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight" && !nextBtn.disabled) playNext();
  if (e.code === "ArrowLeft" && !prevBtn.disabled) playTrack(currentIdx - 1);
});
