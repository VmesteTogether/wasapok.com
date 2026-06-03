// Shared castle ambiance player. The peg's interact button starts this playlist.
// Playback PERSISTS across page navigations: each new page load SKIPS to the next
// song in the array (with one track, it restarts that track).
//
// ROOM-ENTRY OFFSET: when a room loads and music is playing, the song starts from
// a RANDOM one of ENTRY_OFFSETS (seconds) so it feels like it was already playing.
// The initial peg press and natural back-to-back advances start at 0:00.
//
// SILENT_PAGES: filenames of rooms where music should NOT play. On those pages we
// stay quiet but keep the saved state, so the next non-silent room picks up.
//
// Pressing #nav-interact while it's .armed (standing at the peg) toggles play/stop.
(function () {
  const PLAYLIST = [
    '/castle/outside/audio/Something-Like-Glass-06.mp3',
    '/castle/outside/audio/Lichen_meadow.3.mp3',
  ];
  const ENTRY_OFFSETS = [0, 12, 37, 43, 63]; // 0:00, 0:12, 0:37, 0:43, 1:03
  const SILENT_PAGES = [
    'hallway-2-room.html',
  ];
  const KEY = 'castleAmbiance';
  if (!PLAYLIST.length) return;

  const isSilent = SILENT_PAGES.some(p => location.pathname.endsWith(p));
  let audio = null, idx = 0, playing = false;

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
  const save = () => sessionStorage.setItem(KEY, JSON.stringify({ idx, playing }));

  function tryPlay() {
    const p = audio.play();
    if (p) p.catch(() => {
      // Autoplay blocked on this fresh page — resume on first interaction
      // (e.g. the first d-pad press as the player starts moving).
      const resume = () => { audio.play().catch(() => {}); document.removeEventListener('pointerdown', resume); };
      document.addEventListener('pointerdown', resume);
    });
  }

  // The local dev server ignores HTTP Range, so a streamed <audio> can't seek
  // (currentTime snaps back to 0). Fetching the file into a blob URL makes it
  // fully buffered + seekable. Cache per track.
  const blobUrls = new Map();
  function blobFor(src) {
    if (!blobUrls.has(src)) blobUrls.set(src, fetch(src).then(r => r.blob()).then(b => URL.createObjectURL(b)));
    return blobUrls.get(src);
  }

  // Start the current track at `offset` seconds. offset 0 plays immediately from
  // the streamed URL (preserves the user gesture). A seek uses the seekable blob,
  // sets the time once metadata is ready, then plays — no 0:00 blip first.
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

  // On load: if music was playing, skip to the next track and play it from a random
  // entry offset — unless this room is silent (stay quiet, keep state intact).
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const st = JSON.parse(raw);
      if (st && st.playing) {
        playing = true;
        idx = st.idx || 0;
        if (!isSilent) {
          idx = (idx + 1) % PLAYLIST.length;
          save();
          playFrom(ENTRY_OFFSETS[Math.floor(Math.random() * ENTRY_OFFSETS.length)]);
        }
      }
    }
  } catch (e) {}

  window.addEventListener('pagehide', () => { if (playing && audio) audio.pause(); });

  document.addEventListener('pointerdown', (e) => {
    const ib = e.target.closest && e.target.closest('#nav-interact');
    if (!ib || !ib.classList.contains('armed')) return;
    if (playing) stop(); else start();
  });

  window.castleAmbiance = { start, stop, get playing() { return playing; } };
})();
