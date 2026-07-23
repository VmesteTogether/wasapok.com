/* ios-tuner — chromatic tuner prototype
   Pick a target note + octave; mic input is autocorrelated and the gauge
   shows deviation in cents (-50..+50) from the target pitch. */

(() => {
  "use strict";

  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  let A4 = 440; // reference pitch, user-calibratable (see setA4)
  const A4_MIN = 430, A4_MAX = 450;
  const OCT_MIN = 0, OCT_MAX = 8;
  const IN_TUNE_CENTS = 5;
  // headstock finish: "glass" (Liquid Glass, matches the app material) or
  // "wood" (the warm representational 3A variant) — one-word switch
  const HS_STYLE = "glass";

  const state = {
    mode: "auto", // "auto" = detect nearest note; "manual" = tune to a chosen target
    noteIndex: 9, // A
    octave: 4,
    instrument: 0, // index into INSTRUMENTS; 0 = chromatic
    instrumentPicked: false, // true once the user taps a chip themselves
    listening: false,
    lastCents: null,
    btn: "requesting", // 4-state mic button: requesting | listening | paused | denied
  };

  // ---------- instruments ----------
  // Simple line glyphs, 22x22, stroke = currentColor.
  const ICONS = {
    fork: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M8 3v5a3 3 0 0 0 6 0V3M11 11v8M9 19h4"/></svg>`,
    guitar: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M13.5 8.5 19 3M18 1.8l2.2 2.2"/><circle cx="10" cy="12" r="3"/><circle cx="8" cy="15.2" r="4"/><circle cx="9.2" cy="13.4" r="0.6" fill="currentColor"/></svg>`,
    bass: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M11.5 10.5 20 2M18.6 1.4l2 2"/><circle cx="9.4" cy="12.8" r="2.6"/><circle cx="7.4" cy="15.8" r="3.6"/></svg>`,
    uke: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12.5 10.5 18 5M17 3.8l1.8 1.8"/><circle cx="10.6" cy="12.6" r="2.2"/><circle cx="8.6" cy="15.4" r="3.1"/></svg>`,
    violin: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M11 4v5"/><circle cx="11" cy="3" r="1.1"/><path d="M11 9c2.8 0 4.3 1.9 3.6 4-.4 1.3-1.6 1.6-1.6 3a2 2 0 0 1-4 0c0-1.4-1.2-1.7-1.6-3-.7-2.1.8-4 3.6-4z"/></svg>`,
    cello: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M11 2v4"/><circle cx="11" cy="1.6" r="0.9"/><path d="M11 6c3 0 4.6 2 3.9 4.3-.5 1.4-1.7 1.7-1.7 3.2a2.2 2.2 0 0 1-4.4 0c0-1.5-1.2-1.8-1.7-3.2C6.4 8 8 6 11 6zM11 17.6V21"/></svg>`,
    mandolin: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M11 8V3M9.5 2.5h3"/><path d="M11 8c3 0 5 2.4 5 5a5 5 0 0 1-10 0c0-2.6 2-5 5-5z"/></svg>`,
    banjo: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M11 9V3M9.5 2.5h3"/><circle cx="11" cy="14" r="5"/><path d="M9 14h4"/></svg>`,
  };

  const INSTRUMENTS = [
    { name: "Chromatic", count: null, strings: null, icon: "fork" },
    { name: "Guitar", count: 6, strings: ["E2", "A2", "D3", "G3", "B3", "E4"], icon: "guitar" },
    { name: "Guitar", count: 7, strings: ["B1", "E2", "A2", "D3", "G3", "B3", "E4"], icon: "guitar" },
    { name: "Bass", count: 4, strings: ["E1", "A1", "D2", "G2"], icon: "bass" },
    { name: "Bass", count: 5, strings: ["B0", "E1", "A1", "D2", "G2"], icon: "bass" },
    { name: "Bass", count: 6, strings: ["B0", "E1", "A1", "D2", "G2", "C3"], icon: "bass" },
    { name: "Ukulele", count: 4, strings: ["G4", "C4", "E4", "A4"], icon: "uke" },
    { name: "Violin", count: 4, strings: ["G3", "D4", "A4", "E5"], icon: "violin" },
    { name: "Viola", count: 4, strings: ["C3", "G3", "D4", "A4"], icon: "violin" },
    { name: "Cello", count: 4, strings: ["C2", "G2", "D3", "A3"], icon: "cello" },
    { name: "Mandolin", count: 4, strings: ["G3", "D4", "A4", "E5"], icon: "mandolin" },
    { name: "Banjo", count: 5, strings: ["G4", "D3", "G3", "B3", "D4"], icon: "banjo" },
  ];

  function parseNote(s) {
    const m = s.match(/^([A-G]#?)(\d)$/);
    return { noteIndex: NOTES.indexOf(m[1]), octave: +m[2] };
  }

  // ---------- pitch math ----------

  const midiOf = (noteIndex, octave) => (octave + 1) * 12 + noteIndex;
  const freqOfMidi = (midi) => A4 * Math.pow(2, (midi - 69) / 12);
  const targetFreq = () => freqOfMidi(midiOf(state.noteIndex, state.octave));

  function describeFreq(freq) {
    const midi = Math.round(69 + 12 * Math.log2(freq / A4));
    const name = NOTES[((midi % 12) + 12) % 12];
    const oct = Math.floor(midi / 12) - 1;
    return `${name}${oct}`;
  }

  // ---------- deviation indicator ----------
  // The app's single deviation component is the horizontal bar (setHBar) —
  // the dial retired in v0.11. setNeedle keeps its name at every call site.

  function colorFor(cents) {
    const a = Math.abs(cents);
    if (a <= IN_TUNE_CENTS) return "var(--green)";
    if (a <= 20) return "var(--orange)";
    return "var(--red)";
  }

  function setNeedle(cents) { setHBar(cents); }

  // ---------- UI ----------

  const noteDisplay = document.getElementById("noteDisplay");
  const octDisplay = document.getElementById("octDisplay");
  const metaDisplay = document.getElementById("metaDisplay");
  const centsDisplay = document.getElementById("centsDisplay");
  const tunePill = document.getElementById("tunePill");
  const noteGrid = document.getElementById("noteGrid");
  const stringRow = document.getElementById("stringRow");
  const pickerLabel = document.getElementById("pickerLabel");
  const pickerLabelText = document.getElementById("pickerLabelText");
  const micBtn = document.getElementById("micBtn");
  const micLabel = document.getElementById("micLabel");
  const toneBtn = document.getElementById("toneBtn");
  const gaugeCard = document.getElementById("gaugeCard");
  const autoHint = document.getElementById("autoHint");
  const modeSeg = document.getElementById("modeSeg");
  const inlinePicker = document.getElementById("inlinePicker");
  const micArea = document.querySelector(".mic-area");
  const rightWing = document.querySelector(".wing.right");
  const hsHero = document.getElementById("hsHero");
  const tunerStrip = document.getElementById("tunerStrip");
  const stringWheel = document.getElementById("stringWheel");
  const stripCents = document.getElementById("stripCents");
  const hbarDots = document.querySelectorAll(".hbar-dot"); // one bar per view, driven together
  const hbarEls = document.querySelectorAll(".hbar");
  const hbarRings = document.querySelectorAll(".hbar-ring");
  const hbarFills = document.querySelectorAll(".hbar-fill"); // center-out VU fill

  // ---------- mode (auto detect / manual target) ----------

  function setMode(mode) {
    state.mode = mode;
    modeSeg.dataset.mode = mode;
    modeSeg.querySelectorAll(".seg-btn").forEach((b) =>
      b.classList.toggle("selected", b.dataset.mode === mode));
    const auto = mode === "auto";
    autoHint.style.display = auto ? "" : "none";
    updateHeroView();
    updateInlinePicker();
    if (toneOsc) stopTone(); // reference tone is a manual-mode affordance
    state.lastCents = null;
    if (auto) {
      // let the arc/readout reset to the "waiting" look
      setNeedle(null);
      gaugeCard.classList.remove("intune");
      tunerStrip.classList.remove("intune");
      tunePill.classList.remove("show");
      noteDisplay.firstChild.textContent = "–";
      octDisplay.textContent = "";
      metaDisplay.textContent = state.listening ? "Play a note" : "Play a note";
      centsDisplay.innerHTML = "&nbsp;";
    } else {
      // Manual's job is instrument tuning — land on Guitar 6 unless the user
      // has explicitly chosen an instrument (chip order stays untouched)
      if (!state.instrumentPicked && state.instrument === 0) selectInstrument(1);
      syncTarget();
      peekCarousel(); // one-time swipe hint, first Manual entry only
    }
  }
  modeSeg.querySelectorAll(".seg-btn").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode)));

  const noteButtons = NOTES.map((name, i) => {
    const b = document.createElement("button");
    b.className = "note-btn" + (name.includes("#") ? " sharp" : "");
    b.textContent = name.replace("#", "♯");
    b.addEventListener("click", () => { state.noteIndex = i; syncTarget(); });
    noteGrid.appendChild(b);
    return b;
  });

  // ---------- instrument carousel (Camera-style mode picker) ----------
  // Uppercase labels scrub horizontally above the mic; the centered one is
  // live (blue). Tap a label, drag across, or mouse-wheel — same gesture
  // grammar as the string wheel.

  const instCarousel = document.getElementById("instCarousel");
  let carCenters = [];
  let carX = 0; // item-space coordinate currently sitting at the container center

  const carItems = INSTRUMENTS.map((inst) => {
    const el = document.createElement("span");
    el.className = "ci";
    el.textContent = (inst.count ? `${inst.name} · ${inst.count}` : inst.name).toUpperCase();
    instCarousel.appendChild(el);
    return el;
  });

  // item centers from measured label widths — variable spacing like Camera
  {
    const GAP = 24;
    let acc = 0;
    carCenters = carItems.map((el) => {
      const c = acc + el.offsetWidth / 2;
      acc += el.offsetWidth + GAP;
      return c;
    });
  }

  const carNearest = (x) => {
    let sel = 0, best = Infinity;
    carCenters.forEach((c, i) => {
      const d = Math.abs(c - x);
      if (d < best) { best = d; sel = i; }
    });
    return sel;
  };

  function layoutCarousel(x) {
    carX = x;
    const sel = carNearest(x);
    carItems.forEach((el, i) => {
      const dx = carCenters[i] - x;
      el.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), -50%)`;
      const a = Math.abs(dx);
      // keep neighbours clearly legible (the container edge-mask fades the
      // outer labels), so the row reads as a swipeable list of instruments
      // rather than a lone centered label
      el.style.opacity = (i === sel ? 1 : Math.max(0.28, 0.82 - a / 300)).toFixed(3);
      el.classList.toggle("sel", i === sel);
    });
  }
  function carouselTo(i) { layoutCarousel(carCenters[i]); }

  // re-center without the full instrument rebuild when nothing changed
  function carouselPick(i) {
    if (i === state.instrument) carouselTo(i);
    else selectInstrument(i, true);
  }

  let carDragging = false, carMoved = false, carStartX = 0, carStart = 0;
  instCarousel.addEventListener("pointerdown", (e) => {
    carDragging = true;
    carMoved = false;
    carStartX = e.clientX;
    carStart = carX;
    instCarousel.setPointerCapture(e.pointerId);
  });
  instCarousel.addEventListener("pointermove", (e) => {
    if (!carDragging) return;
    const dx = (e.clientX - carStartX) / phoneScale;
    if (!carMoved && Math.abs(dx) > 5) {
      carMoved = true;
      instCarousel.classList.add("dragging");
    }
    if (carMoved) {
      const min = carCenters[0], max = carCenters[carCenters.length - 1];
      layoutCarousel(Math.max(min, Math.min(max, carStart - dx)));
    }
  });
  instCarousel.addEventListener("pointerup", (e) => {
    if (!carDragging) return;
    carDragging = false;
    instCarousel.classList.remove("dragging");
    if (carMoved) {
      carouselPick(carNearest(carX)); // snap to nearest label
    } else {
      // tap: pick the label nearest the tap point
      const rect = instCarousel.getBoundingClientRect();
      carouselPick(carNearest(carX + (e.clientX - rect.left - rect.width / 2) / phoneScale));
    }
  });
  instCarousel.addEventListener("pointercancel", () => {
    if (!carDragging) return;
    carDragging = false;
    instCarousel.classList.remove("dragging");
    if (carMoved) carouselPick(carNearest(carX));
  });
  instCarousel.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dir = Math.sign(e.deltaY + e.deltaX);
    if (dir) carouselPick(Math.max(0, Math.min(INSTRUMENTS.length - 1, state.instrument + dir)));
  }, { passive: false });

  // one-time "swipe me" hint: the first time the console appears (entering
  // Manual), nudge the scroll position sideways and let it ease back through
  // the .ci transition, so the row of instruments visibly slides under the
  // edge-mask like a real swipe. Fires once, ever (localStorage-gated).
  const PEEK_KEY = "tuner-carousel-peeked";
  let peekDone = (() => { try { return localStorage.getItem(PEEK_KEY) === "1"; } catch { return false; } })();

  function peekCarousel() {
    if (peekDone) return;
    const run = () => {
      if (peekDone) return;
      // don't burn the once-ever hint behind the launch permission dialog —
      // wait it out so a first-time user actually sees the row move (checked at
      // fire time, since boot calls setMode before bootMic raises the sheet)
      if (permScrim.classList.contains("show")) { setTimeout(run, 500); return; }
      peekDone = true;
      try { localStorage.setItem(PEEK_KEY, "1"); } catch {}
      const center = carCenters[state.instrument];
      // 26px < half the tightest label spacing, so the selection never re-snaps
      const target = Math.min(carCenters[carCenters.length - 1], center + 26);
      if (target === center) return; // selected sits at the far end — no room
      layoutCarousel(target);                        // ease out to the peek
      setTimeout(() => layoutCarousel(center), 380); // settle back to center
    };
    setTimeout(run, 440);
  }

  let stringButtons = [];

  // ---------- guitar headstock ----------

  const headstock = document.getElementById("headstock");
  let pegEls = []; // { g, line, noteIndex, octave }

  function buildHeadstock(inst) {
    const cx = 110;
    const n = inst.strings.length;
    const leftCount = Math.ceil(n / 2);
    const rightCount = n - leftCount;

    // evenly spaced string slots across the nut (low → high, left → right)
    const nutHalf = 26;
    const slotX = (i) => +(cx - nutHalf + nutHalf * 2 * (i / (n - 1))).toFixed(1);

    // tuner rows per side (top → bottom), centered on the plate midline
    const rows = (count) => Array.from({ length: count },
      (_, k) => +(129.5 + (k - (count - 1) / 2) * (count === 3 ? 52.5 : 41)).toFixed(1));
    const leftRows = rows(leftCount);
    const rightRows = rows(rightCount);

    // Gibson convention: bass strings climb the left side (lowest string on the
    // tuner nearest the nut), trebles mirror on the right — D/G at the horns
    const pegs = inst.strings.map((s, i) => {
      const { noteIndex, octave } = parseNote(s);
      const left = i < leftCount;
      return {
        noteIndex, octave,
        side: left ? -1 : 1,
        nutX: slotX(i),
        postX: left ? cx - 29 : cx + 29,
        btnX: left ? cx - 88 : cx + 88,
        y: left ? leftRows[leftCount - 1 - i] : rightRows[i - leftCount],
        name: NOTES[noteIndex].replace("#", "♯"),
      };
    });

    // plate half-width at a given y — lands the tuner stems on the edge
    // (biased slightly narrow so stems tuck under the plate, never float)
    const halfW = (y) => 66 - Math.max(0, y - 60) * 0.115;

    // open-book silhouette: sharp twin peaks, crisp V-dip, hard outer corners;
    // each side tapers and flows tangent-smooth into a concave scoop that
    // flares to an outward-pointing wing tip (slightly rounded), then a second
    // concave scoop curls back into the narrow neck — per the reference mockup
    const plate = `M ${cx - 33} 264
      C ${cx - 35} 255 ${cx - 41} 247 ${cx - 57} 243.5
      C ${cx - 59} 243 ${cx - 59} 241 ${cx - 57.5} 239.5
      C ${cx - 52} 234 ${cx - 48.2} 227 ${cx - 49} 218
      C ${cx - 51} 195 ${cx - 62} 115 ${cx - 66} 60
      C ${cx - 67} 46 ${cx - 67} 34 ${cx - 64} 24
      C ${cx - 58} 19 ${cx - 44} 14 ${cx - 36} 10
      C ${cx - 28} 14 ${cx - 13} 20 ${cx} 26
      C ${cx + 13} 20 ${cx + 28} 14 ${cx + 36} 10
      C ${cx + 44} 14 ${cx + 58} 19 ${cx + 64} 24
      C ${cx + 67} 34 ${cx + 67} 46 ${cx + 66} 60
      C ${cx + 62} 115 ${cx + 51} 195 ${cx + 49} 218
      C ${cx + 48.2} 227 ${cx + 52} 234 ${cx + 57.5} 239.5
      C ${cx + 59} 241 ${cx + 59} 243 ${cx + 57} 243.5
      C ${cx + 41} 247 ${cx + 35} 255 ${cx + 33} 264 Z`;

    // finish palette — "glass" renders the plate in the app's own Liquid
    // Glass material (color reserved for interactive state); "wood" is the
    // warm representational 3A variant, kept one switch away (HS_STYLE)
    const glass = HS_STYLE === "glass";
    headstock.classList.toggle("wood", !glass);
    const P = glass ? {
      plate: "url(#glassPlate)",
      edge: "rgba(60,60,67,0.42)",
      shadow: "0 6px 16px rgba(50,55,75,0.2)",
      inlayFill: "rgba(255,255,255,0.62)",
      inlayStroke: "rgba(60,60,67,0.38)",
      inlayMid: "rgba(60,60,67,0.16)",
      bellFill: "rgba(255,255,255,0.34)",
      bellStroke: "rgba(60,60,67,0.4)",
      bellInner: "rgba(60,60,67,0.25)",
      screw: "rgba(60,60,67,0.4)",
      board: "rgba(78,84,100,0.5)",
      fretShadow: "rgba(60,60,67,0.45)",
      nutFill: "rgba(255,255,255,0.92)",
      nutStroke: "rgba(60,60,67,0.4)",
      slot: "rgba(60,60,67,0.32)",
      stemShadow: "rgba(60,66,76,0.24)",
    } : {
      plate: "url(#wood)",
      edge: "rgba(34,16,4,0.55)",
      shadow: "0 4px 7px rgba(50,55,75,0.3)",
      inlayFill: "#efe6d0",
      inlayStroke: "rgba(96,66,26,0.55)",
      inlayMid: "rgba(70,40,14,0.55)",
      bellFill: "#241610",
      bellStroke: "rgba(226,196,140,0.6)",
      bellInner: "rgba(226,196,140,0.4)",
      screw: "rgba(200,170,120,0.8)",
      board: "url(#rosewood)",
      fretShadow: "rgba(18,9,4,0.55)",
      nutFill: "url(#bone)",
      nutStroke: "#c9bb98",
      slot: "rgba(96,74,40,0.5)",
      stemShadow: "rgba(40,25,10,0.32)",
    };

    // split-diamond inlay (outlined, layered) + bell truss-rod cover, per wireframe
    const inlay = `
      <path d="M ${cx} 78 L ${cx + 13} 113 L ${cx} 148 L ${cx - 13} 113 Z"
        fill="${P.inlayFill}" stroke="${P.inlayStroke}" stroke-width="0.8"/>
      <path d="M ${cx} 90 L ${cx + 8} 113 L ${cx} 136 L ${cx - 8} 113 Z"
        fill="${P.inlayMid}"/>
      <path d="M ${cx} 104 L ${cx + 3.5} 113 L ${cx} 122 L ${cx - 3.5} 113 Z"
        fill="${P.inlayFill}"/>
      <path d="M ${cx} 191
        C ${cx + 7} 193 ${cx + 9} 209 ${cx + 12} 238
        C ${cx + 13} 248 ${cx + 14} 255 ${cx + 15} 260
        L ${cx - 15} 260
        C ${cx - 14} 255 ${cx - 13} 248 ${cx - 12} 238
        C ${cx - 9} 209 ${cx - 7} 193 ${cx} 191 Z"
        fill="${P.bellFill}" stroke="${P.bellStroke}" stroke-width="0.9"/>
      <path d="M ${cx} 197
        C ${cx + 5} 199 ${cx + 6.5} 213 ${cx + 9} 239
        C ${cx + 10} 247 ${cx + 11} 252 ${cx + 11.5} 255.5
        L ${cx - 11.5} 255.5
        C ${cx - 11} 252 ${cx - 10} 247 ${cx - 9} 239
        C ${cx - 6.5} 213 ${cx - 5} 199 ${cx} 197 Z"
        fill="none" stroke="${P.bellInner}" stroke-width="0.7"/>
      <circle cx="${cx}" cy="202" r="1.2" fill="${P.screw}"/>
      <circle cx="${cx}" cy="257" r="1.2" fill="${P.screw}"/>`;

    let s = `<svg viewBox="0 0 ${cx * 2} 350" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="glassPlate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgba(255,255,255,0.8)"/>
          <stop offset="0.5" stop-color="rgba(255,255,255,0.55)"/>
          <stop offset="1" stop-color="rgba(255,255,255,0.65)"/>
        </linearGradient>
        <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#b8834a"/>
          <stop offset="0.5" stop-color="#9c6630"/>
          <stop offset="1" stop-color="#7a4a1f"/>
        </linearGradient>
        <linearGradient id="rosewood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#46281a"/>
          <stop offset="1" stop-color="#2c1810"/>
        </linearGradient>
        <linearGradient id="bone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#faf5e8"/>
          <stop offset="0.5" stop-color="#ece0c4"/>
          <stop offset="1" stop-color="#d9cba9"/>
        </linearGradient>
        <linearGradient id="pegMetal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f2f4f7"/>
          <stop offset="0.5" stop-color="#c6ccd5"/>
          <stop offset="1" stop-color="#98a0ac"/>
        </linearGradient>
        <clipPath id="plateClip"><path d="${plate}"/></clipPath>
      </defs>`;

    // fretboard: straight-sided — a real neck's widening is imperceptible
    // over a few frets, so any visible taper reads as an error
    s += `<rect x="${cx - 32}" y="268" width="64" height="82" fill="${P.board}"/>`;
    for (const fy of [292, 312]) {
      s += `<line x1="${cx - 32}" y1="${fy}" x2="${cx + 32}" y2="${fy}" stroke="${P.fretShadow}" stroke-width="2"/>`;
      s += `<line x1="${cx - 32}" y1="${fy - 0.7}" x2="${cx + 32}" y2="${fy - 0.7}" stroke="url(#pegMetal)" stroke-width="1.1"/>`;
    }

    // plate: soft shadow, finish fill, inner frost rim (glass) or straight
    // grain (wood), crisp outline
    s += `<g style="filter: drop-shadow(${P.shadow})"><path d="${plate}" fill="${P.plate}"/></g>`;
    if (glass) {
      s += `<g clip-path="url(#plateClip)"><path d="${plate}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="3"/></g>`;
    } else {
      s += `<g clip-path="url(#plateClip)" fill="none" stroke-linecap="round">
        <g stroke="rgba(74,40,12,0.18)" stroke-width="1">
          <path d="M ${cx - 44} 6 L ${cx - 47} 268"/>
          <path d="M ${cx - 22} 4 L ${cx - 24} 268"/>
          <path d="M ${cx + 1} 4 L ${cx - 1} 268"/>
          <path d="M ${cx + 23} 4 L ${cx + 25} 268"/>
          <path d="M ${cx + 45} 6 L ${cx + 48} 268"/>
        </g>
        <g stroke="rgba(74,40,12,0.07)" stroke-width="6">
          <path d="M ${cx - 33} 4 L ${cx - 35} 268"/>
          <path d="M ${cx + 34} 4 L ${cx + 36} 268"/>
        </g>
      </g>`;
    }
    s += `<path d="${plate}" fill="none" stroke="${P.edge}" stroke-width="${glass ? 1.3 : 1.6}"/>
      ${inlay}`;

    // strings: nut slot → post over the plate, then straight down the board
    pegs.forEach((p, i) => {
      const w = (1.9 - (1.9 - 0.9) * (i / (n - 1))).toFixed(2);
      s += `<line class="string str-${i}" x1="${p.nutX}" y1="262" x2="${p.postX}" y2="${p.y}" stroke-width="${w}"/>`;
      s += `<line class="string str-${i}" x1="${p.nutX}" y1="271" x2="${p.nutX}" y2="350" stroke-width="${w}"/>`;
    });

    // nut with string slots
    s += `<rect x="${cx - 32}" y="264" width="64" height="7" rx="1.5" fill="${P.nutFill}" stroke="${P.nutStroke}" stroke-width="0.7"/>`;
    pegs.forEach((p) => {
      s += `<line x1="${p.nutX}" y1="264.6" x2="${p.nutX}" y2="269.4" stroke="${P.slot}" stroke-width="1" stroke-linecap="round"/>`;
    });

    // vintage keystone tuner button — straight-edged rounded trapezoid, narrow
    // at the stem and flaring outward, like the wireframe's Kluson-style keys
    const keystone = (bx, y, side) => {
      const o = (d) => (bx + side * d).toFixed(1); // d: negative → toward plate
      return `M ${o(-10)} ${y - 5}
        Q ${o(-10.5)} ${y - 9} ${o(-7)} ${y - 9.8}
        L ${o(8)} ${y - 13}
        Q ${o(13)} ${y - 13.8} ${o(13)} ${y - 9}
        L ${o(13)} ${y + 9}
        Q ${o(13)} ${y + 13.8} ${o(8)} ${y + 13}
        L ${o(-7)} ${y + 9.8}
        Q ${o(-10.5)} ${y + 9} ${o(-10)} ${y + 5} Z`;
    };

    // machine heads: stem from the plate edge, keystone button, washer + post
    pegs.forEach((p, i) => {
      const edgeX = (cx + p.side * halfW(p.y)).toFixed(1);
      const stemX = (p.btnX - p.side * 9).toFixed(1);
      s += `<g class="peg" data-i="${i}">
        <rect class="hit" x="${p.side < 0 ? 4 : cx * 2 - 90}" y="${p.y - 16}" width="86" height="32"/>
        <line x1="${edgeX}" y1="${p.y}" x2="${stemX}" y2="${p.y}" stroke="${P.stemShadow}" stroke-width="4"/>
        <line class="shaft" x1="${edgeX}" y1="${p.y}" x2="${stemX}" y2="${p.y}" stroke="url(#pegMetal)" stroke-width="2.6"/>
        <path class="btn" d="${keystone(p.btnX, p.y, p.side)}" fill="url(#pegMetal)"/>
        <line x1="${(p.btnX - p.side * 8).toFixed(1)}" y1="${p.y}" x2="${(p.btnX + p.side * 12).toFixed(1)}" y2="${p.y}" stroke="rgba(60,66,76,0.3)" stroke-width="0.8"/>
        <circle cx="${p.postX}" cy="${p.y}" r="6.8" fill="none" stroke="url(#pegMetal)" stroke-width="2.4"/>
        <circle class="post" cx="${p.postX}" cy="${p.y}" r="3.6" fill="url(#pegMetal)"/>
        <circle cx="${p.postX}" cy="${p.y}" r="1.5" fill="rgba(55,60,70,0.9)"/>
        <text x="${p.postX}" y="${p.y - 12}" text-anchor="middle">${p.name}<tspan dy="2" font-size="9">${p.octave}</tspan></text>
      </g>`;
    });

    s += `</svg>`;
    headstock.innerHTML = s;

    pegEls = pegs.map((p, i) => {
      const g = headstock.querySelector(`.peg[data-i="${i}"]`);
      const lines = headstock.querySelectorAll(`.str-${i}`);
      g.addEventListener("click", () => {
        state.noteIndex = p.noteIndex;
        state.octave = p.octave;
        syncTarget();
      });
      return { g, lines, noteIndex: p.noteIndex, octave: p.octave };
    });
  }

  function setPegTune(on) {
    pegEls.forEach((p) => {
      const active = on && p.g.classList.contains("sel");
      p.g.classList.toggle("intune", active);
      p.lines.forEach((l) => l.classList.toggle("intune", active));
    });
  }

  // ---------- string wheel (guitar hero) ----------
  // Horizontal picker drum under the headstock: strings low→high left→right,
  // center item is the live target. Pegs animate it; dragging/tapping it is
  // the discoverable alternative to tapping pegs.

  let wheelItems = []; // { el, sup, noteIndex, octave }
  let wheelPos = 0;    // scroll position in index units (float mid-drag)

  // radial drum falloff: keyframes of [|d|, x, scale, opacity], lerped —
  // spacing compresses and items fade out just past the second neighbor
  const WHEEL_KEYS = [
    [0, 0, 1, 1],
    [1, 58, 0.46, 0.55],
    [2, 98, 0.36, 0.25],
    [2.8, 118, 0.32, 0],
  ];

  function wheelParams(d) {
    const a = Math.min(Math.abs(d), 2.8);
    let i = 0;
    while (i < WHEEL_KEYS.length - 2 && a > WHEEL_KEYS[i + 1][0]) i++;
    const [d0, x0, s0, o0] = WHEEL_KEYS[i];
    const [d1, x1, s1, o1] = WHEEL_KEYS[i + 1];
    const t = (a - d0) / (d1 - d0);
    return {
      x: (d < 0 ? -1 : 1) * (x0 + (x1 - x0) * t),
      s: s0 + (s1 - s0) * t,
      o: o0 + (o1 - o0) * t,
    };
  }

  function layoutWheel(pos) {
    wheelPos = pos;
    wheelItems.forEach((it, i) => {
      const d = i - pos;
      const { x, s, o } = wheelParams(d);
      it.el.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), -50%) scale(${s.toFixed(3)})`;
      it.el.style.opacity = o.toFixed(3);
      it.el.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
      it.el.classList.toggle("center", Math.abs(d) < 0.5);
      // octave rides only the centered item (fades out as it leaves)
      it.sup.style.opacity = Math.max(0, 1 - Math.abs(d) * 2).toFixed(2);
    });
  }

  function buildWheel(inst) {
    stringWheel.innerHTML = "";
    wheelItems = inst.strings.map((sname) => {
      const { noteIndex, octave } = parseNote(sname);
      const el = document.createElement("span");
      el.className = "wh-item";
      el.innerHTML = `${NOTES[noteIndex].replace("#", "♯")}<sup>${octave}</sup>`;
      stringWheel.appendChild(el);
      return { el, sup: el.querySelector("sup"), noteIndex, octave };
    });
    // seat the drum instantly (no fly-in), then re-enable transitions
    stringWheel.classList.add("dragging");
    layoutWheel(0);
    requestAnimationFrame(() => requestAnimationFrame(() =>
      stringWheel.classList.remove("dragging")));
  }

  function wheelSelect(i) {
    const it = wheelItems[i];
    if (!it) return;
    state.noteIndex = it.noteIndex;
    state.octave = it.octave;
    syncTarget();
  }

  const WHEEL_STEP = 58; // px of finger travel per index step (center spacing)
  let whDragging = false, whMoved = false, whStartX = 0, whStartPos = 0;

  stringWheel.addEventListener("pointerdown", (e) => {
    whDragging = true;
    whMoved = false;
    whStartX = e.clientX;
    whStartPos = wheelPos;
    stringWheel.setPointerCapture(e.pointerId);
  });
  stringWheel.addEventListener("pointermove", (e) => {
    if (!whDragging) return;
    const dx = (e.clientX - whStartX) / phoneScale;
    if (!whMoved && Math.abs(dx) > 5) {
      whMoved = true;
      stringWheel.classList.add("dragging");
    }
    if (whMoved) {
      layoutWheel(Math.max(0, Math.min(wheelItems.length - 1, whStartPos - dx / WHEEL_STEP)));
    }
  });
  stringWheel.addEventListener("pointerup", (e) => {
    if (!whDragging) return;
    whDragging = false;
    stringWheel.classList.remove("dragging");
    if (whMoved) {
      wheelSelect(Math.round(wheelPos)); // snap to nearest
    } else {
      // tap: select the item whose drum position is nearest the tap
      const rect = stringWheel.getBoundingClientRect();
      const tx = (e.clientX - rect.left - rect.width / 2) / phoneScale;
      let best = 0, bestDist = Infinity;
      wheelItems.forEach((it, i) => {
        const dist = Math.abs(wheelParams(i - wheelPos).x - tx);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      wheelSelect(best);
    }
  });
  stringWheel.addEventListener("pointercancel", () => {
    if (!whDragging) return;
    whDragging = false;
    stringWheel.classList.remove("dragging");
    if (whMoved) wheelSelect(Math.round(wheelPos));
  });
  stringWheel.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dir = Math.sign(e.deltaY + e.deltaX);
    if (dir && wheelItems.length) {
      wheelSelect(Math.max(0, Math.min(wheelItems.length - 1, Math.round(wheelPos) + dir)));
    }
  }, { passive: false });

  function selectInstrument(i, byUser) {
    if (byUser) state.instrumentPicked = true;
    state.instrument = i;
    const inst = INSTRUMENTS[i];
    carouselTo(i);
    const isGuitar = !!inst.strings && inst.icon === "guitar";
    noteGrid.style.display = inst.strings ? "none" : "";
    stringRow.style.display = inst.strings && !isGuitar ? "" : "none";
    pickerLabel.style.display = isGuitar ? "none" : ""; // guitar picks pegs on the hero, not in the sheet
    if (!isGuitar) pegEls = [];
    if (!inst.strings) {
      pickerLabelText.textContent = "Target Note";
      stringButtons = [];
    } else if (isGuitar) {
      stringButtons = [];
      buildHeadstock(inst);
      buildWheel(inst);
      const low = parseNote(inst.strings[0]);
      state.noteIndex = low.noteIndex;
      state.octave = low.octave;
    } else {
      pickerLabelText.textContent = `${inst.name} Strings`;
      stringRow.innerHTML = "";
      stringButtons = inst.strings.map((s) => {
        const { noteIndex, octave } = parseNote(s);
        const b = document.createElement("button");
        b.className = "string-btn";
        b.innerHTML = `${NOTES[noteIndex].replace("#", "♯")}<small>${octave}</small>`;
        b.dataset.noteIndex = noteIndex;
        b.dataset.octave = octave;
        b.addEventListener("click", () => {
          state.noteIndex = noteIndex;
          state.octave = octave;
          syncTarget();
        });
        stringRow.appendChild(b);
        return b;
      });
      // default to the lowest string
      const low = parseNote(inst.strings[0]);
      state.noteIndex = low.noteIndex;
      state.octave = low.octave;
    }
    updateHeroView();
    updateInlinePicker();
    syncTarget();
  }

  // Manual surfaces: chromatic shows the note grid inline, violin-class shows
  // its string pills inline (guitar picks on the headstock). The footer console
  // (carousel + wings) shows in Manual; Auto hides it by visibility so the mic
  // never shifts. Right wing swaps contextually: octave (chromatic) ↔ tone
  // (instruments) — the flip-camera position.
  function updateInlinePicker() {
    const inst = INSTRUMENTS[state.instrument];
    const manual = state.mode === "manual";
    const isGuitar = !!inst.strings && inst.icon === "guitar";
    inlinePicker.style.display = manual && !isGuitar ? "block" : "none";
    micArea.classList.toggle("auto", !manual);
    miniOct.style.display = !inst.strings ? "" : "none";
    // reference-tone speaker: instruments keep it in the right wing; chromatic's
    // wing holds the octave stepper, so its speaker trails the Target Note label
    (inst.strings ? rightWing : pickerLabel).appendChild(toneBtn);
    toneBtn.style.display = "";
    if (inst.strings) miniOct.classList.remove("open");
  }

  // guitar in Manual mode makes the headstock the hero (replaces the gauge dial)
  function updateHeroView() {
    const inst = INSTRUMENTS[state.instrument];
    const hero = state.mode === "manual" && !!inst.strings && inst.icon === "guitar";
    hsHero.style.display = hero ? "" : "none";
    tunerStrip.style.display = hero ? "" : "none";
    gaugeCard.classList.toggle("hero-hs", hero); // hides .readout, full-bleeds the headstock
  }

  // bubble-level tuner — a liquid-glass bubble slides flat(−50) ↔ sharp(+50);
  // inside the in-tune band a magnetic detent pulls it home, it squash-stretches
  // with its own speed, and locking in pings a ring + green bloom
  let hbarPrevLeft = 50; // last bubble position (% units) for velocity → squash
  let hbarLocked = false; // hysteretic lock state, so the ping fires once

  function firePing() {
    for (const r of hbarRings) {
      r.classList.remove("ping");
      void r.offsetWidth; // reflow so the keyframe restarts from 0
      r.classList.add("ping");
    }
  }

  function setHBar(cents) {
    const idle = cents === null;
    // hysteresis: latch in at ±IN_TUNE, release a few cents wider — no flicker
    const locked = !idle &&
      Math.abs(cents) <= IN_TUNE_CENTS + (hbarLocked ? 3 : 0);
    if (locked && !hbarLocked) firePing();
    hbarLocked = locked;

    const clamped = idle ? 0 : Math.max(-50, Math.min(50, cents));
    // magnetic detent: collapse the bubble toward exact center once locked
    const c = locked ? clamped * 0.14 : clamped;
    const left = idle ? 50 : 50 + (c / 50) * 44;
    const bg = idle ? "rgba(60,60,67,0.42)" : colorFor(cents);

    // squash-stretch from frame-to-frame speed, area-preserving for a liquid feel
    const vel = Math.abs(left - hbarPrevLeft);
    hbarPrevLeft = left;
    const sx = idle ? 1 : Math.min(1.5, 1 + vel * 0.05);
    const sy = 1 / Math.sqrt(sx);

    for (const dot of hbarDots) {
      dot.style.left = left.toFixed(1) + "%";
      dot.style.setProperty("--dot-color", bg);
      dot.style.transform =
        `translate(-50%,-50%) scaleX(${sx.toFixed(3)}) scaleY(${sy.toFixed(3)})`;
    }
    // heat spectrum: reveal the fixed green->yellow->red gradient from the green
    // center out to the bubble via clip-path, so it recesses to green as the
    // note tunes in. Locked reveals the full green plateau (a satisfying nub).
    for (const f of hbarFills) {
      let clip;
      if (idle) clip = "inset(0 50% 0 50% round 5px)";                       // hidden
      else if (locked) clip = "inset(0 45.6% 0 45.6% round 5px)";            // green band lit
      else if (left >= 50) clip = `inset(0 ${(100 - left).toFixed(1)}% 0 50% round 5px)`; // sharp
      else clip = `inset(0 50% 0 ${left.toFixed(1)}% round 5px)`;            // flat
      f.style.clipPath = clip;
      f.style.webkitClipPath = clip;
    }
    for (const h of hbarEls) h.classList.toggle("locked", locked);
  }

  function syncTarget() {
    const f = targetFreq();
    noteButtons.forEach((b, i) => b.classList.toggle("selected", i === state.noteIndex));
    stringButtons.forEach((b) => b.classList.toggle("selected",
      +b.dataset.noteIndex === state.noteIndex && +b.dataset.octave === state.octave));
    pegEls.forEach((p) => {
      const sel = p.noteIndex === state.noteIndex && p.octave === state.octave;
      p.g.classList.toggle("sel", sel);
      p.lines.forEach((l) => l.classList.toggle("sel", sel));
    });
    noteDisplay.firstChild.textContent = NOTES[state.noteIndex].replace("#", "♯");
    octDisplay.textContent = state.octave;
    const wi = wheelItems.findIndex((w) =>
      w.noteIndex === state.noteIndex && w.octave === state.octave);
    if (wi >= 0) layoutWheel(wi); // scroll the drum to the target (animated)
    miniOctVal.textContent = state.octave;
    document.getElementById("miniOctDown").disabled = state.octave <= OCT_MIN;
    document.getElementById("miniOctUp").disabled = state.octave >= OCT_MAX;
    if (!state.listening) {
      metaDisplay.textContent = `target ${f.toFixed(2)} Hz`;
      centsDisplay.innerHTML = "&nbsp;";
      stripCents.innerHTML = "&nbsp;";
      tunePill.classList.remove("show");
      setPegTune(false);
      setNeedle(null);
    }
    if (toneOsc) toneOsc.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.02);
  }

  // ---------- A4 reference calibration ----------

  const A4_KEY = "tuner-a4";
  const a4Pill = document.getElementById("a4Pill");

  function setA4(v) {
    A4 = Math.max(A4_MIN, Math.min(A4_MAX, Math.round(v)));
    try { localStorage.setItem(A4_KEY, A4); } catch {}
    a4Pill.textContent = `A4 = ${A4} Hz`;
    miniRefVal.textContent = `${A4} Hz`;
    document.getElementById("miniRefDown").disabled = A4 <= A4_MIN;
    document.getElementById("miniRefUp").disabled = A4 >= A4_MAX;
    syncTarget(); // every target + cents reading is derived from A4 — recompute live
  }

  // ---------- wing capsules (A4 left, octave right) ----------
  // Compact accordions flanking the mic; tap toggles the − / + steppers out.

  const miniOct = document.getElementById("miniOct");
  const miniRef = document.getElementById("miniRef");
  const miniOctVal = document.getElementById("miniOctVal");
  const miniRefVal = document.getElementById("miniRefVal");

  miniOct.addEventListener("click", () => miniOct.classList.toggle("open"));
  miniRef.addEventListener("click", () => miniRef.classList.toggle("open"));

  // steppers act without collapsing the capsule (stop the toggle click)
  document.getElementById("miniOctDown").addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.octave > OCT_MIN) { state.octave--; syncTarget(); }
  });
  document.getElementById("miniOctUp").addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.octave < OCT_MAX) { state.octave++; syncTarget(); }
  });
  document.getElementById("miniRefDown").addEventListener("click", (e) => {
    e.stopPropagation();
    setA4(A4 - 1);
  });
  document.getElementById("miniRefUp").addEventListener("click", (e) => {
    e.stopPropagation();
    setA4(A4 + 1);
  });

  // ---------- reference tone ----------

  let audioCtx = null;
  let toneOsc = null, toneGain = null;

  function ensureCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function stopTone() {
    if (!toneOsc) return;
    const t = audioCtx.currentTime;
    toneGain.gain.setTargetAtTime(0, t, 0.05);
    toneOsc.stop(t + 0.4);
    toneOsc = null;
    toneGain = null;
    toneBtn.classList.remove("playing");
  }

  toneBtn.addEventListener("click", () => {
    ensureCtx();
    if (toneOsc) { stopTone(); return; }
    toneOsc = audioCtx.createOscillator();
    toneGain = audioCtx.createGain();
    toneOsc.type = "triangle";
    toneOsc.frequency.value = targetFreq();
    toneGain.gain.value = 0;
    toneGain.gain.setTargetAtTime(0.22, audioCtx.currentTime, 0.03);
    toneOsc.connect(toneGain).connect(audioCtx.destination);
    toneOsc.start();
    toneBtn.classList.add("playing");
  });

  // ---------- mic + pitch detection (autocorrelation) ----------

  let micStream = null, analyser = null, rafId = null;
  // 4096 samples ≈ 85 ms @ 48 kHz — long enough to resolve B0 (~31 Hz) on 5/6-string bass
  const BUF_LEN = 4096;
  const CORR_WIN = 2048; // fixed correlation window keeps per-frame cost flat
  const buf = new Float32Array(BUF_LEN);

  function autoCorrelate(buffer, sampleRate) {
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.008) return -1; // too quiet

    // correlate a fixed window against lags down to 25 Hz
    const maxLag = Math.min(Math.floor(sampleRate / 25), buffer.length - CORR_WIN);
    const c = new Float32Array(maxLag);
    for (let lag = 0; lag < maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < CORR_WIN; i++) sum += buffer[i] * buffer[i + lag];
      c[lag] = sum;
    }

    let d = 0;
    while (d < maxLag - 1 && c[d] > c[d + 1]) d++;
    let maxVal = -1, maxPos = -1;
    for (let i = d; i < maxLag; i++)
      if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
    if (maxPos <= 0) return -1;

    // parabolic interpolation around the peak
    let T0 = maxPos;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = T0 + 1 < maxLag ? c[T0 + 1] : 0;
    const a = (x1 + x3 - 2 * x2) / 2;
    const bb = (x3 - x1) / 2;
    if (a) T0 = T0 - bb / (2 * a);

    return sampleRate / T0;
  }

  function tick() {
    analyser.getFloatTimeDomainData(buf);
    const freq = autoCorrelate(buf, audioCtx.sampleRate);

    let cents = null, refFreq = null, autoName = null, autoOct = null;

    if (state.mode === "auto") {
      // detect the nearest note automatically — no target required
      if (freq > 0 && freq >= 20 && freq <= 2000) {
        const midi = Math.round(69 + 12 * Math.log2(freq / A4));
        refFreq = freqOfMidi(midi);
        cents = 1200 * Math.log2(freq / refFreq);
        autoName = NOTES[((midi % 12) + 12) % 12];
        autoOct = Math.floor(midi / 12) - 1;
      }
    } else {
      const f = targetFreq();
      if (freq > 0 && freq > f / 4 && freq < f * 4) {
        cents = 1200 * Math.log2(freq / f);
        refFreq = f;
      }
    }

    if (cents !== null) {
      // light smoothing so the needle doesn't jitter
      state.lastCents = state.lastCents === null
        ? cents
        : state.lastCents * 0.6 + cents * 0.4;
      const shown = state.lastCents;
      setNeedle(shown);
      if (state.mode === "auto") {
        noteDisplay.firstChild.textContent = autoName.replace("#", "♯");
        octDisplay.textContent = autoOct;
        metaDisplay.textContent = `${freq.toFixed(1)} Hz`;
      } else {
        metaDisplay.textContent = `${freq.toFixed(1)} Hz · hearing ${describeFreq(freq)} · target ${refFreq.toFixed(2)} Hz`;
      }
      const rounded = Math.round(shown);
      centsDisplay.textContent = rounded === 0 ? "0 cents" : `${rounded > 0 ? "+" : ""}${rounded} cents`;
      centsDisplay.style.color = colorFor(shown);
      stripCents.textContent = centsDisplay.textContent.replace(" cents", "¢");
      stripCents.style.color = centsDisplay.style.color;
      const inTune = Math.abs(shown) <= IN_TUNE_CENTS;
      tunePill.classList.toggle("show", inTune);
      gaugeCard.classList.toggle("intune", inTune);
      tunerStrip.classList.toggle("intune", inTune);
      setPegTune(inTune);
    } else {
      state.lastCents = null;
      // in auto mode, hold the last detected note between plucks (don't flicker to "–")
      metaDisplay.textContent = state.mode === "auto"
        ? "Play a note"
        : `listening… · target ${targetFreq().toFixed(2)} Hz`;
      centsDisplay.innerHTML = "&nbsp;";
      stripCents.innerHTML = "&nbsp;";
      tunePill.classList.remove("show");
      gaugeCard.classList.remove("intune");
      tunerStrip.classList.remove("intune");
      setPegTune(false);
      setNeedle(null);
    }
    rafId = requestAnimationFrame(tick);
  }

  // ---------- mic permission (simulated iOS) ----------
  // Persisted so relaunch mimics native: granted → zero-tap listen, denied → Settings route.
  const PERM_KEY = "tuner-mic-perm";
  const getPerm = () => { try { return localStorage.getItem(PERM_KEY) || "prompt"; } catch { return "prompt"; } };
  const setPerm = (v) => { try { localStorage.setItem(PERM_KEY, v); } catch {} };

  const permScrim = document.getElementById("permScrim");

  function showPermissionSheet() {
    setButtonState("requesting");
    permScrim.classList.add("show");
  }
  function hidePermissionSheet() { permScrim.classList.remove("show"); }

  document.getElementById("permAllow").addEventListener("click", () => {
    hidePermissionSheet();
    setPerm("granted");
    startMic(); // this tap is the user gesture that unlocks audio
  });
  document.getElementById("permDeny").addEventListener("click", () => {
    hidePermissionSheet();
    setPerm("denied");
    setButtonState("denied");
  });

  // dev reset: wipe the stored permission and reload to the first-launch state
  document.getElementById("devReset").addEventListener("click", () => {
    try { localStorage.removeItem(PERM_KEY); localStorage.removeItem(A4_KEY); localStorage.removeItem(PEEK_KEY); } catch {}
    location.reload();
  });

  // ---------- 4-state button ----------

  function setButtonState(s) {
    state.btn = s;
    micBtn.classList.remove("live", "requesting", "denied");
    micBtn.disabled = false;
    // on/off is icon-only (orange mic ↔ slashed blue mic); only denied keeps text
    if (s === "listening") {
      micBtn.classList.add("live");
      micLabel.textContent = "";
      micBtn.setAttribute("aria-label", "Stop listening");
    } else if (s === "paused") {
      micLabel.textContent = "";
      micBtn.setAttribute("aria-label", "Start listening");
    } else if (s === "requesting") {
      micBtn.classList.add("requesting");
      micBtn.disabled = true;
      micLabel.textContent = "";
      micBtn.setAttribute("aria-label", "Starting");
    } else if (s === "denied") {
      micBtn.classList.add("denied");
      micLabel.textContent = "Microphone Access Needed";
      micBtn.setAttribute("aria-label", "Microphone access needed");
    }
  }

  function resetReadout() {
    setNeedle(null);
    gaugeCard.classList.remove("intune");
    tunerStrip.classList.remove("intune");
    tunePill.classList.remove("show");
    if (state.mode === "manual") {
      syncTarget();
    } else {
      centsDisplay.innerHTML = "&nbsp;";
      metaDisplay.textContent = "Play a note";
    }
  }

  async function startMic() {
    ensureCtx();
    setButtonState("requesting");
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      setPerm("denied");
      setButtonState("denied");
      return;
    }
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = BUF_LEN;
    src.connect(analyser);
    state.listening = true;
    setButtonState("listening");
    tick();
  }

  function pauseMic() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
    analyser = null;
    state.listening = false;
    state.lastCents = null;
    setButtonState("paused");
    resetReadout();
  }

  micBtn.addEventListener("click", () => {
    switch (state.btn) {
      case "listening": pauseMic(); break;       // pause / mute
      case "paused":    startMic(); break;        // resume — permission already granted
      case "denied":    showPermissionSheet(); break; // simulate Settings → re-prompt
      // "requesting": disabled, no-op
    }
  });

  function bootMic() {
    const perm = getPerm();
    if (perm === "granted") startMic();          // relaunch: zero-tap listen
    else if (perm === "denied") setButtonState("denied");
    else showPermissionSheet();                   // first launch
  }

  // ---------- phone frame scaling + clock ----------

  let phoneScale = 1; // mouse-drag deltas need un-scaling to match scrollLeft units

  function fitPhone() {
    const wrap = document.getElementById("phoneWrap");
    phoneScale = Math.min(1, (innerHeight - 24) / 866, (innerWidth - 24) / 414);
    wrap.style.transform = `scale(${phoneScale})`;
  }
  addEventListener("resize", fitPhone);
  fitPhone();

  function tickClock() {
    const d = new Date();
    const h = d.getHours() % 12 || 12;
    document.getElementById("clock").textContent = `${h}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  tickClock();
  setInterval(tickClock, 15000);

  // ---------- init ----------

  const savedA4 = parseInt((() => { try { return localStorage.getItem(A4_KEY); } catch { return null; } })(), 10);
  setA4(Number.isFinite(savedA4) ? savedA4 : 440); // load calibration before mode reset
  selectInstrument(1); // Guitar 6 — the default tuner (App Store tuners skew guitar)
  setMode("manual");   // launch straight onto the 6-string headstock, not auto
  bootMic();           // simulate iOS launch: prompt / auto-listen / denied
})();
