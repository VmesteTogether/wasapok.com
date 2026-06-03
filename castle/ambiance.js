// Shared castle ambiance player. Two playlists: one for OUTSIDE the castle (the
// grounds) and one for INSIDE (the rooms). The page picks its playlist by location.
// Add more songs to either array; functionality stays the same.
//
// Persists across page loads: each entry SKIPS to the next song in THAT context's
// playlist and plays it from a RANDOM ENTRY_OFFSET (so it feels already playing).
// The peg-press start and natural back-to-back advances start at 0:00. Each
// playlist keeps its own rotation index, so they advance independently.
//
// SILENT_PAGES: rooms where music should NOT play (state kept for the next room).
// Pressing #nav-interact while .armed (at the peg) toggles play/stop.
(function () {
  const OUTSIDE_PLAYLIST = [
    '/castle/outside/audio/Something-Like-Glass-06.mp3',
  ];
  const INSIDE_PLAYLIST = [
    '/castle/outside/audio/Lichen_meadow.3.mp3',
  ];
  const ENTRY_OFFSETS = [0, 12, 37, 43, 63]; // 0:00, 0:12, 0:37, 0:43, 1:03
  const SILENT_PAGES = [
    'hallway-2-room.html',
  ];
  const KEY = 'castleAmbiance';

  const path = location.pathname;
  const isOutside = /\/castle\/(index\.html)?$/.test(path);   // grounds = outside; rooms = inside
  const PLAYLIST = isOutside ? OUTSIDE_PLAYLIST : INSIDE_PLAYLIST;
  const IDX_KEY = isOutside ? 'oi' : 'ii';                    // separate rotation index per playlist
  const isSilent = SILENT_PAGES.some(p => path.endsWith(p));
  if (!PLAYLIST.length) return;

  let audio = null, idx = 0, playing = false;
  let state = { playing: false, oi: 0, ii: 0 };
  try { const raw = sessionStorage.getItem(KEY); if (raw) state = Object.assign(state, JSON.parse(raw)); } catch (e) {}

  function save() { state.playing = playing; state[IDX_KEY] = idx; sessionStorage.setItem(KEY, JSON.stringify(state)); }

  function ensureAudio() {
    if (audio) return;
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0.15;
    audio.addEventListener('ended', () => {           // natural back-to-back → next from 0:00
      idx = (idx + 1) % PLAYLIST.length;
      save();
      playFrom(0);
    });
  }

  function tryPlay() {
    const p = audio.play();
    if (p) p.catch(() => {
      // Autoplay blocked on this fresh page — resume on first interaction.
      const resume = () => { audio.play().catch(() => {}); document.removeEventListener('pointerdown', resume); };
      document.addEventListener('pointerdown', resume);
    });
  }

  // Dev server ignores HTTP Range, so stream a blob URL to make seeking work.
  const blobUrls = new Map();
  function blobFor(src) {
    if (!blobUrls.has(src)) blobUrls.set(src, fetch(src).then(r => r.blob()).then(b => URL.createObjectURL(b)));
    return blobUrls.get(src);
  }

  function playFrom(offset) {
    ensureAudio();
    const src = PLAYLIST[idx];
    if (offset > 0) {
      blobFor(src).then((url) => {
        audio.src = url;
        audio.addEventListener('loadedmetadata', function onMeta() {
          audio.removeEventListener('loadedmetadata', onMeta);
          try { audio.currentTime = offset; } catch (e) {}
          tryPlay();
        });
        audio.load();
      });
    } else {
      audio.src = src;
      tryPlay();
    }
  }

  function start() { idx = 0; playing = true; save(); playFrom(0); }
  function stop() { if (audio) { audio.pause(); audio.currentTime = 0; } playing = false; sessionStorage.removeItem(KEY); }

  // On load: if music was playing, advance THIS context's playlist and play from a
  // random entry offset — unless this room is silent (stay quiet, keep state).
  if (state.playing) {
    playing = true;
    idx = state[IDX_KEY] || 0;
    if (!isSilent) {
      idx = (idx + 1) % PLAYLIST.length;
      save();
      playFrom(ENTRY_OFFSETS[Math.floor(Math.random() * ENTRY_OFFSETS.length)]);
    }
  }

  window.addEventListener('pagehide', () => { if (playing && audio) audio.pause(); });

  document.addEventListener('pointerdown', (e) => {
    const ib = e.target.closest && e.target.closest('#nav-interact');
    if (!ib || !ib.classList.contains('armed')) return;
    if (playing) stop(); else start();
  });

  window.castleAmbiance = { start, stop, get playing() { return playing; } };
})();
