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
    // custom-tuning slot — the "+" on the wheel. Defaults to a guitar shape/tuning;
    // later the shape (and string count) becomes swipeable and each note in the
    // string wheel long-press-editable. Appended so existing indices don't shift.
    { name: "Custom", count: 6, strings: ["E2", "A2", "D3", "G3", "B3", "E4"], icon: "guitar", custom: true },
  ];

  // ---------- instrument families (carousel groups) ----------
  // The carousel shows ONE entry per family; string-count / tuning variants live
  // behind it (surfaced later via a hold-menu). Selecting a family uses its
  // default (first) variant. Chromatic is the only variant-less family.
  const FAMILIES = [];
  {
    const byName = new Map();
    INSTRUMENTS.forEach((inst, i) => {
      let fam = byName.get(inst.name);
      if (!fam) {
        fam = { name: inst.name, icon: inst.icon, variants: [], hasOptions: inst.name !== "Chromatic" };
        byName.set(inst.name, fam);
        FAMILIES.push(fam);
      }
      fam.variants.push(i);
    });
  }
  // seat the Custom family (the "+" entry) between Chromatic and Guitar — a light
  // glyph on the left instead of the long "CHROMATIC" word, and a natural home
  // next to Chromatic for the freeform/utility modes. No variant chevron.
  {
    const ci = FAMILIES.findIndex((f) => f.name === "Custom");
    if (ci > 1) {
      const [cf] = FAMILIES.splice(ci, 1);
      cf.hasOptions = false;
      cf.custom = true;
      FAMILIES.splice(1, 0, cf);
    }
  }
  // fold every non-headstock string family (uke/violin/viola/cello/mandolin/banjo)
  // into ONE "Other" slot — its underbelly lists the members and the slot
  // self-labels to the last one picked. Only Chromatic / + / Guitar / Bass stay
  // as their own slots.
  {
    const KEEP = new Set(["Chromatic", "Custom", "Guitar", "Bass"]);
    const others = FAMILIES.filter((f) => !KEEP.has(f.name));
    if (others.length) {
      const other = { name: "Other", other: true, icon: others[0].icon,
        variants: others.flatMap((f) => f.variants) };
      for (let k = FAMILIES.length - 1; k >= 0; k--) if (!KEEP.has(FAMILIES[k].name)) FAMILIES.splice(k, 1);
      FAMILIES.push(other);
    }
  }
  // only families with more than one variant get the "^" underbelly menu; .cur is
  // the family's current/default variant (what re-selecting it returns to)
  FAMILIES.forEach((f) => { f.hasOptions = f.variants.length > 1; f.cur = f.variants[0]; });
  const familyOf = (instIdx) => FAMILIES.findIndex((f) => f.variants.includes(instIdx));

  const INST_KEY = "tuner-instrument"; // last instrument, to reload back into it
  let emptyOther = false;              // "Other" family selected, no member chosen yet

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
    closeVariantMenu(); // don't leave the variant menu open across a mode switch
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

  const carItems = FAMILIES.map((fam) => {
    const el = document.createElement("span");
    el.className = "ci";
    if (fam.custom) { el.classList.add("ci-add"); el.setAttribute("aria-label", "Custom instrument"); } // "+" drawn geometrically in CSS
    else el.textContent = fam.name.toUpperCase();
    instCarousel.appendChild(el);
    return el;
  });

  // the "Other" slot self-labels: "OTHER" until a member is picked, then that
  // member's name (persisted, so it survives reloads)
  const otherFam = FAMILIES.findIndex((f) => f.other);
  function updateOtherLabel() {
    if (otherFam < 0) return;
    // the active Other member's name, or "OTHER" when empty / not on an Other member
    const active = !emptyOther && FAMILIES[otherFam].variants.includes(state.instrument);
    carItems[otherFam].textContent = active ? INSTRUMENTS[state.instrument].name.toUpperCase() : "OTHER";
  }
  updateOtherLabel();

  // capsule width + item pitch derive from the longest label. Measured up front,
  // then re-measured once the web font loads: the fallback font's metrics differ,
  // so the first pass can be too narrow — which clipped MANDOLIN and crowded
  // CHROMATIC against the capsule edges.
  const carSlotL = document.getElementById("carSlotL");
  const carSlotR = document.getElementById("carSlotR");
  let FIXED_CAP_W, CAR_PITCH;
  function measureCarousel() {
    const longest = Math.max(...carItems.map((el) => el.offsetWidth));
    FIXED_CAP_W = Math.round(longest + 30);   // longest word + ~15px breathing room each side
    CAR_PITCH = Math.round(longest + 24);      // pitch that clears the capsule
    carCenters = carItems.map((el, i) => i * CAR_PITCH);
    if (carSlotL) {                            // 1f: recessed neighbour wells (JS drives left/opacity)
      const w = FIXED_CAP_W - 16;
      carSlotL.style.width = w + "px"; carSlotR.style.width = w + "px";
    }
  }
  measureCarousel();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      measureCarousel();
      carSel = -1; // force the capsule to resize to the corrected width
      layoutCarousel(carCenters[familyOf(state.instrument)]);
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

  // grey far from center, warming to systemBlue as a label slides into the
  // capsule window — interpolated by distance so only the most-centered label
  // reaches full blue (no ambiguity when two straddle a wide fixed capsule)
  const CAR_GREY = [99, 99, 106], CAR_BLUE = [0, 122, 255], CAR_BLUE_RANGE = 68;
  function carColor(a) {
    const t = Math.max(0, 1 - a / CAR_BLUE_RANGE);
    const c = CAR_GREY.map((v, k) => Math.round(v + (CAR_BLUE[k] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  // selection capsule (fixed glass window) + variant indicator at its right
  const carCapsule = document.getElementById("carCapsule");
  const carInd = document.getElementById("carInd");
  let carSel = -1;
  let carMode = "off";     // carousel option: "off" | "flat" (pre-drum compress) | "drum" (3D)
  const CAR_COMP_R = 170;       // compression radius — smaller = tighter bunching
  const CAR_COMP_MIN_SCALE = 0.7; // gentle foreshorten floor (1 = no shrink); lower to clear overlaps
  const CAR_ARC = 20;           // px the outer labels dip below center — the visible curve
  const CAR_ROT_GAIN = 0.9;     // how hard edge labels turn away in 3D (0 = flat, 1 = full drum angle)
  const CAR_DEPTH = 80;         // px the outer labels recede into the screen (perspective bite)

  function updateCarCapsule(sel) {
    const fam = FAMILIES[sel];
    if (!fam) return;
    carInd.classList.toggle("no-options", !fam.hasOptions);
    carCapsule.style.width = FIXED_CAP_W + "px";
    carInd.style.left = `calc(50% + ${(FIXED_CAP_W / 2 - 11).toFixed(1)}px)`;
  }
  function layoutCarousel(x) {
    carX = x;
    const sel = carNearest(x);
    // 1f wells: each END well FOLLOWS its end word into the centre — it tracks the
    // word (so its outer edge holds a constant gap) and fades over the last half-
    // pitch as it merges under the centre capsule, so it's never left orphaned as
    // an empty capsule at the edge. Interior wells stay fixed ±1 slots (dl/dr ≥ P).
    if (carSlotL) {
      const P = CAR_PITCH || (carCenters[1] - carCenters[0]) || 100;
      const dl = Math.max(0, x);                              // Chromatic's px distance from centre
      const dr = Math.max(0, (FAMILIES.length - 1) * P - x);  // Other's px distance from centre
      carSlotL.style.left = `calc(50% - ${Math.min(dl, P).toFixed(1)}px)`;
      carSlotR.style.left = `calc(50% + ${Math.min(dr, P).toFixed(1)}px)`;
      carSlotL.style.opacity = Math.min(1, 2 * dl / P).toFixed(3);
      carSlotR.style.opacity = Math.min(1, 2 * dr / P).toFixed(3);
    }
    carItems.forEach((el, i) => {
      const dx = carCenters[i] - x;
      const a = Math.abs(dx);
      // both compressing options bunch the outer labels toward center (sin,
      // clamped so they never fold back) + gently foreshorten. "drum" (1c)
      // additionally curves them DOWN at the edges (1-cos arc), recedes them
      // (translateZ), and turns them away in real 3D (rotateY under the
      // container's perspective). "flat" (1ca) is the pre-drum compress —
      // bunch + foreshorten only, no 3D.
      let px = dx, py = 0, pz = 0, rotY = 0, scale = 1;
      let op = i === sel ? 1 : Math.max(0.28, 0.82 - a / 300);
      if (carMode === "caps") {
        // 1e: option-1 uniform layout (px=dx) + a per-label liquid-glass capsule
        // whose opacity reflects centredness — bright centre, muted ±1, gone by ±2
        const pitch = (carCenters[1] - carCenters[0]) || 100;
        el.style.setProperty("--cap-op", Math.max(0, 1 - (a / pitch) * 0.5).toFixed(3));
      } else if (carMode !== "off") {
        const round = carMode === "round";
        // 1d ("round"): built on option 1 (uniform) — near-centre spacing stays
        // roughly uniform, but the OUTER labels bunch closer (gentle sin, larger
        // radius) with a soft 2D dip + slight shrink so the wheel reads rounded,
        // and an opacity floor so the ±2/±3 neighbours show through the fade fog.
        // 2D only — no 3D drum.
        const R = round ? 180 : CAR_COMP_R;
        const th = Math.min(Math.PI / 2, a / R);
        const sgn = Math.sign(dx);
        px = sgn * R * Math.sin(th);
        const minScale = round ? 0.82 : CAR_COMP_MIN_SCALE;
        scale = minScale + (1 - minScale) * Math.cos(th);
        if (i !== sel) op = Math.max(round ? 0.45 : 0, Math.cos(th));
        if (round) {
          py = 10 * (1 - Math.cos(th));                      // gentle 2D dip = rounded wheel, no 3D
        } else if (carMode === "drum") {
          py = CAR_ARC * (1 - Math.cos(th));                 // dip below the centre line
          pz = -CAR_DEPTH * (1 - Math.cos(th));              // recede into the screen at the rim
          rotY = sgn * (th * 180 / Math.PI) * CAR_ROT_GAIN;  // convex: each label's outer edge recedes
        }
      }
      // -50%,-50% centres the label; the drum offset/depth/rotation/scale then
      // act about that centre (translateZ + rotateY need the container's
      // perspective to render as real 3D)
      el.style.transform =
        `translate(-50%, -50%) translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, ${pz.toFixed(1)}px) rotateY(${rotY.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      el.style.opacity = op.toFixed(3);
      el.style.color = carColor(a);
      el.classList.toggle("sel", i === sel);
    });
    if (sel !== carSel) { carSel = sel; updateCarCapsule(sel); } // resize only on change
  }
  function carouselTo(i) { layoutCarousel(carCenters[i]); }
  // dev toggle: switch the carousel layout ("off" | "flat" | "drum") and re-lay-out
  window.__carSetComp = (mode) => {
    carMode = mode || "off";
    carSel = -1;
    layoutCarousel(carCenters[familyOf(state.instrument)]);
  };

  // i is a FAMILY index. Re-picking the current family just recenters; a new
  // family switches to its default variant (the hold-menu refines this later).
  // "Other" opens EMPTY (blank hero + readout, slot reads "OTHER") — a member only
  // loads once picked from the underbelly. state.instrument is parked on a member
  // so familyOf() resolves to Other and the "^" opens its members.
  function enterOtherEmpty() {
    if (otherFam < 0) return;
    emptyOther = true;
    state.instrument = FAMILIES[otherFam].cur;
    document.body.classList.add("other-empty");
    carouselTo(otherFam);
    updateOtherLabel();
    try { localStorage.setItem(INST_KEY, String(FAMILIES[otherFam].cur)); } catch {}
  }

  function carouselPick(i) {
    closeVariantMenu(); // switching family dismisses any open variant menu
    if (familyOf(state.instrument) === i && !emptyOther) carouselTo(i);
    else if (FAMILIES[i].other) enterOtherEmpty();
    else selectInstrument(FAMILIES[i].cur, true);
  }

  // ---------- variant "underbelly" menu ----------
  // The "^" (up at rest) flips DOWN and a shadowed second-tier carousel opens
  // below the bar with the current family's variants (guitar 6/7, bass 4/5/6).
  // Tap / scrub to pick; picking, re-triggering, a family switch or a mode switch
  // all close it. Same engine will later drive the "Other" category + "+".
  const underbelly = document.getElementById("underbelly");
  const ubTitle = document.getElementById("ubTitle");
  const ubCarousel = document.getElementById("ubCarousel");
  const UB_PITCH = 104;
  let ubFamily = -1;   // family index currently shown, or -1 when closed
  let ubItems = [];    // { el, instIdx }
  let ubCenters = [];
  let ubX = 0;

  const ubNearest = (x) => {
    let s = 0, best = Infinity;
    ubCenters.forEach((c, i) => { const d = Math.abs(c - x); if (d < best) { best = d; s = i; } });
    return s;
  };
  function layoutUb(x) {
    ubX = x;
    const sel = ubNearest(x);
    ubItems.forEach((it, i) => {
      const dx = ubCenters[i] - x, a = Math.abs(dx);
      const scale = Math.max(0.72, 1 - a / 300);
      const op = i === sel ? 1 : Math.max(0.22, 0.72 - a / 240);
      it.el.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), -50%) scale(${scale.toFixed(3)})`;
      it.el.style.opacity = op.toFixed(3);
      it.el.classList.toggle("sel", i === sel);
    });
  }
  function buildUb(fam) {
    ubCarousel.innerHTML = "";
    ubItems = fam.variants.map((instIdx) => {
      const el = document.createElement("span");
      el.className = "mi";
      const inst = INSTRUMENTS[instIdx];
      el.textContent = (fam.custom || fam.other) ? inst.name.toUpperCase() : `${inst.count}-STRING`;
      ubCarousel.appendChild(el);
      return { el, instIdx };
    });
    ubCenters = ubItems.map((_, i) => i * UB_PITCH);
    ubTitle.textContent = fam.name.toUpperCase();
    const cur = fam.variants.indexOf(state.instrument);
    ubCarousel.classList.add("dragging"); // seat instantly (no fly-in) on build
    layoutUb(ubCenters[cur >= 0 ? cur : 0]);
    requestAnimationFrame(() => requestAnimationFrame(() => ubCarousel.classList.remove("dragging")));
  }
  function openVariantMenu(fi) {
    const fam = FAMILIES[fi];
    if (!fam || !fam.hasOptions) return;
    if (ubFamily === fi) { closeVariantMenu(); return; } // re-trigger toggles closed
    ubFamily = fi;
    buildUb(fam);
    document.body.classList.add("ub-open");
  }
  function closeVariantMenu() {
    if (ubFamily === -1) return;
    ubFamily = -1;
    document.body.classList.remove("ub-open");
  }
  function ubPick(i) {
    const it = ubItems[i];
    if (it) selectInstrument(it.instIdx, true); // linger: the menu stays open until tapped off
  }

  let ubDrag = false, ubMoved = false, ubStartX = 0, ubStart = 0;
  ubCarousel.addEventListener("pointerdown", (e) => {
    ubDrag = true; ubMoved = false; ubStartX = e.clientX; ubStart = ubX;
    ubCarousel.setPointerCapture(e.pointerId);
  });
  ubCarousel.addEventListener("pointermove", (e) => {
    if (!ubDrag) return;
    const dx = (e.clientX - ubStartX) / phoneScale;
    if (!ubMoved && Math.abs(dx) > 5) { ubMoved = true; ubCarousel.classList.add("dragging"); }
    if (ubMoved) {
      const min = ubCenters[0], max = ubCenters[ubCenters.length - 1];
      layoutUb(Math.max(min, Math.min(max, ubStart - dx)));
    }
  });
  ubCarousel.addEventListener("pointerup", (e) => {
    if (!ubDrag) return;
    ubDrag = false; ubCarousel.classList.remove("dragging");
    let idx;
    if (ubMoved) idx = ubNearest(ubX);
    else { const rect = ubCarousel.getBoundingClientRect(); idx = ubNearest(ubX + (e.clientX - rect.left - rect.width / 2) / phoneScale); }
    layoutUb(ubCenters[idx]); // snap the chosen label under the fixed capsule
    ubPick(idx);
  });
  ubCarousel.addEventListener("pointercancel", () => { ubDrag = false; ubCarousel.classList.remove("dragging"); });
  // tap anywhere outside the menu (and outside the instrument bar) dismisses it
  document.addEventListener("pointerdown", (e) => {
    if (ubFamily === -1) return;
    if (underbelly.contains(e.target) || instCarousel.contains(e.target)) return;
    e.stopPropagation();
    closeVariantMenu();
  }, true);

  let carDragging = false, carMoved = false, carStartX = 0, carStart = 0, carHoldTimer = null, carHeldOpened = false;
  instCarousel.addEventListener("pointerdown", (e) => {
    carDragging = true;
    carMoved = false;
    carStartX = e.clientX;
    carStart = carX;
    instCarousel.setPointerCapture(e.pointerId);
    // hold (no scrub) opens the current family's tuning menu
    carHeldOpened = false;
    clearTimeout(carHoldTimer);
    carHoldTimer = setTimeout(() => {
      if (!carMoved) { carHeldOpened = true; openVariantMenu(familyOf(state.instrument)); }
    }, 480);
  });
  instCarousel.addEventListener("pointermove", (e) => {
    if (!carDragging) return;
    const dx = (e.clientX - carStartX) / phoneScale;
    if (!carMoved && Math.abs(dx) > 5) {
      carMoved = true;
      instCarousel.classList.add("dragging");
      clearTimeout(carHoldTimer);
    }
    if (carMoved) {
      const min = carCenters[0], max = carCenters[carCenters.length - 1];
      layoutCarousel(Math.max(min, Math.min(max, carStart - dx)));
    }
  });
  instCarousel.addEventListener("pointerup", (e) => {
    if (!carDragging) return;
    carDragging = false;
    clearTimeout(carHoldTimer);
    instCarousel.classList.remove("dragging");
    if (carHeldOpened) return; // the hold already opened the menu
    if (carMoved) {
      carouselPick(carNearest(carX)); // snap to nearest label
    } else {
      // tap: a neighbour selects it; tapping the already-selected family opens
      // its tuning menu
      const rect = instCarousel.getBoundingClientRect();
      const fi = carNearest(carX + (e.clientX - rect.left - rect.width / 2) / phoneScale);
      if (fi === familyOf(state.instrument) && FAMILIES[fi].hasOptions) openVariantMenu(fi);
      else carouselPick(fi);
    }
  });
  instCarousel.addEventListener("pointercancel", () => {
    if (!carDragging) return;
    carDragging = false;
    clearTimeout(carHoldTimer);
    instCarousel.classList.remove("dragging");
    if (carMoved) carouselPick(carNearest(carX));
  });
  instCarousel.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dir = Math.sign(e.deltaY + e.deltaX);
    if (dir) carouselPick(Math.max(0, Math.min(FAMILIES.length - 1, familyOf(state.instrument) + dir)));
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
      const center = carCenters[familyOf(state.instrument)];
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
  const genericHero = document.getElementById("genericHero");
  let pegEls = []; // { g, line, noteIndex, octave }
  let genericStrings = []; // { el, noteIndex, octave } — generic-hero string DOM

  // guitar + bass make the headstock the Manual-mode hero (the pegs ARE the
  // string picker). Every OTHER string instrument now gets the generic
  // multi-string hero instead of the old inline pills, so all string
  // instruments share the same hero + wheel console.
  const usesHeadstock = (inst) =>
    !!inst.strings && (inst.icon === "guitar" || inst.icon === "bass");
  const usesHero = (inst) => !!inst.strings; // any string instrument → a hero (headstock or generic strings)

  function buildHeadstock(inst) {
    const cx = 110;
    const n = inst.strings.length;
    const bass = inst.icon === "bass";

    // ---- peg positions + plate silhouette. Guitar is a Gibson open-book
    // (split 3/3); bass is a Fender-style in-line — all tuners down the left,
    // posts staggered from the tip (lowest string, farthest) to the nut, drawn
    // from the reference mockup. Each peg carries its own plate-edge anchor
    // (edgeX) and note-label placement so the render tail below is shared. ----
    let pegs, plate;

    if (bass) {
      const nutHalf = 18; // narrower string spread — a bass shows fewer strings on a thinner neck
      const slotX = (i) => +(cx + nutHalf - nutHalf * 2 * (i / (n - 1))).toFixed(1);
      // posts sit on ONE straight diagonal (Fender in-line). The tuner-side plate
      // edge runs PARALLEL to this line 16px out; each key is laid out
      // horizontally then rotated to the line's normal (rot) so the whole
      // assembly rests on a parallel diagonal, tilted toward the headstock.
      const postX = (i) => +(cx + 10 - (36 / (n - 1)) * i).toFixed(1);
      const postY = (i) => +(88 + (142 / (n - 1)) * i).toFixed(1);
      const rot = +(Math.atan2(postX(0) - postX(n - 1), postY(n - 1) - postY(0)) * 180 / Math.PI).toFixed(2);
      // right-handed stringing (like the guitar): the path index runs tip→nut
      // (i=0 farthest post, right side; i=n-1 nearest the nut, left side), so
      // assign notes in REVERSE — the LOW string (thick E) lands on the near-nut
      // LEFT path and they thicken leftward. The thickness reversal lives in the
      // string-width formula below.
      pegs = inst.strings.map((_str, i) => {
        const { noteIndex, octave } = parseNote(inst.strings[n - 1 - i]);
        const px = postX(i), y = postY(i);
        return {
          noteIndex, octave, side: -1, rot,
          nutX: slotX(i), postX: px, btnX: +(px - 42).toFixed(1), y, edgeX: +(px - 16).toFixed(1),
          name: NOTES[noteIndex].replace("#", "♯"),
          labelX: +(px + 13).toFixed(1), labelY: +(y + 3.8).toFixed(1), labelAnchor: "start",
        };
      });

      // elongated Fender paddle: the tuner-side (left) edge is a STRAIGHT
      // diagonal running parallel to the post line; the bass-side (right) edge
      // is the signature profile — a mild upper bout easing into a concave
      // "wave" waist, then a FULLER lower bout, then a scoop into the neck —
      // under a soft-rounded asymmetric crown
      plate = `M ${cx - 23} 264
        C ${cx - 34} 258 ${cx - 45} 248 ${cx - 45} 234
        L ${cx - 4} 72
        C ${cx} 55 ${cx + 10} 41 ${cx + 24} 37
        C ${cx + 39} 33 ${cx + 51} 44 ${cx + 56} 62
        C ${cx + 60} 78 ${cx + 58} 97 ${cx + 54} 116
        C ${cx + 50} 134 ${cx + 41} 145 ${cx + 41} 158
        C ${cx + 41} 176 ${cx + 61} 191 ${cx + 66} 209
        C ${cx + 69} 227 ${cx + 56} 250 ${cx + 39} 258
        C ${cx + 33} 261 ${cx + 28} 263 ${cx + 23} 264 Z`;
    } else {
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
      // plate half-width at a given y — lands the tuner stems on the edge
      // (biased slightly narrow so stems tuck under the plate, never float)
      const halfW = (y) => 66 - Math.max(0, y - 60) * 0.115;

      // Gibson convention: bass strings climb the left side (lowest string on the
      // tuner nearest the nut), trebles mirror on the right — D/G at the horns
      pegs = inst.strings.map((str, i) => {
        const { noteIndex, octave } = parseNote(str);
        const left = i < leftCount;
        const side = left ? -1 : 1;
        const postX = left ? cx - 29 : cx + 29;
        const y = left ? leftRows[leftCount - 1 - i] : rightRows[i - leftCount];
        return {
          noteIndex, octave, side,
          nutX: slotX(i), postX, btnX: left ? cx - 88 : cx + 88, y,
          edgeX: +(cx + side * halfW(y)).toFixed(1),
          name: NOTES[noteIndex].replace("#", "♯"),
          labelX: postX, labelY: +(y - 12).toFixed(1), labelAnchor: "middle",
        };
      });

      // open-book silhouette: sharp twin peaks, crisp V-dip, hard outer corners;
      // each side tapers and flows tangent-smooth into a concave scoop that
      // flares to an outward-pointing wing tip (slightly rounded), then a second
      // concave scoop curls back into the narrow neck — per the reference mockup
      plate = `M ${cx - 33} 264
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
    }

    // finish palette — "glass" renders the plate in the app's own Liquid
    // Glass material (color reserved for interactive state); "wood" is the
    // warm representational 3A variant, kept one switch away (HS_STYLE)
    const glass = HS_STYLE === "glass";
    headstock.classList.toggle("wood", !glass);
    headstock.classList.toggle("bass", bass); // bass renders a touch larger (see CSS) — its headstock IS bigger
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

    // ornament: guitar wears the split-diamond inlay + bell truss-rod cover;
    // bass stays clean like the reference — a round string retainer over the top
    // strings and a truss-rod nut at the neck joint (no logo invented)
    const inlay = bass ? `
      <circle cx="${cx}" cy="251" r="4.8" fill="none" stroke="${P.inlayStroke}" stroke-width="1.1"/>
      <circle cx="${cx}" cy="251" r="1.8" fill="${P.inlayMid}"/>` : `
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

    // bass crown sits lower in the artwork (y~33) than the guitar's (y~10); shift
    // the bass viewBox down 23 so its crown top-aligns in the capsule like the
    // guitar's (no dead space up top) and the freed room lets it render larger
    let s = `<svg viewBox="0 ${bass ? 23 : 0} ${cx * 2} 420" xmlns="http://www.w3.org/2000/svg">
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
    // over a few frets, so any visible taper reads as an error. The bass neck is
    // narrower than the guitar's (fewer strings) — the app's relative-size cue.
    const neckHalf = bass ? 22 : 32;
    s += `<rect x="${cx - neckHalf}" y="268" width="${neckHalf * 2}" height="150" fill="${P.board}"/>`;
    // frets compress as they descend; extras past the short view are clipped in
    // the base layout and revealed by the extended (Option 4) neck
    const frets = [];
    for (let fy = 292, gap = 20; fy < 416; fy += gap, gap = Math.max(11, gap - 1.6)) frets.push(fy);
    for (const fy of frets) {
      s += `<line x1="${cx - neckHalf}" y1="${fy}" x2="${cx + neckHalf}" y2="${fy}" stroke="${P.fretShadow}" stroke-width="2"/>`;
      s += `<line x1="${cx - neckHalf}" y1="${fy - 0.7}" x2="${cx + neckHalf}" y2="${fy - 0.7}" stroke="url(#pegMetal)" stroke-width="1.1"/>`;
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
      // bass thickens toward the near-nut path (i=n-1 = low E); guitar toward i=0
      const w = (bass ? 1.4 + 1.7 * (i / (n - 1)) : 1.9 - 1.0 * (i / (n - 1))).toFixed(2);
      s += `<line class="string str-${i}" x1="${p.nutX}" y1="262" x2="${p.postX}" y2="${p.y}" stroke-width="${w}"/>`;
      s += `<line class="string str-${i}" x1="${p.nutX}" y1="271" x2="${p.nutX}" y2="418" stroke-width="${w}"/>`;
    });

    // nut with string slots
    s += `<rect x="${cx - neckHalf}" y="264" width="${neckHalf * 2}" height="7" rx="1.5" fill="${P.nutFill}" stroke="${P.nutStroke}" stroke-width="0.7"/>`;
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

    // bass tuner — classic Fender "paddle": a beefy rounded lobe drawn with its
    // LONG axis VERTICAL (bulb up, tapering to a rounded point down). The peg's
    // rot then tilts this whole key so its long axis runs PARALLEL to the
    // diagonal edge — the lobes read like beads strung along the headstock's
    // side, each with its stem leaving the inner side toward the post.
    const bassKey = (bx, y) => `M ${bx} ${y - 19}
      C ${bx + 13.5} ${y - 19} ${bx + 14.5} ${y - 6} ${bx + 12.5} ${y + 2}
      C ${bx + 10.5} ${y + 11} ${bx + 6} ${y + 17} ${bx} ${y + 18}
      C ${bx - 6} ${y + 17} ${bx - 10.5} ${y + 11} ${bx - 12.5} ${y + 2}
      C ${bx - 14.5} ${y - 6} ${bx - 13.5} ${y - 19} ${bx} ${y - 19} Z`;

    // machine heads: stem from the plate edge, key button, washer + post. The
    // stem+key are drawn horizontally/upright then (bass) rotated about the post
    // by rot so the paddle's long axis runs PARALLEL to the diagonal edge; the
    // post washers + labels stay upright. Guitar has no rot → drawn flat.
    // beefier hardware on bass: bigger washer/post + thicker stem, and the
    // Fender paddle key instead of the guitar's Kluson keystone.
    const pwr = bass ? 9.6 : 6.8, ppr = bass ? 5.2 : 3.6, phr = bass ? 2.3 : 1.5;
    const shaftW = bass ? 3.6 : 2.6, shadowW = bass ? 5 : 4;
    pegs.forEach((p, i) => {
      const stemX = (p.btnX - p.side * 9).toFixed(1);
      const ro = p.rot ? `<g transform="rotate(${p.rot} ${p.postX} ${p.y})">` : "";
      const rc = p.rot ? `</g>` : "";
      const btn = bass ? bassKey(p.btnX, p.y) : keystone(p.btnX, p.y, p.side);
      // seam ridge: vertical down the bass paddle's long axis; horizontal on the guitar key
      const seam = bass
        ? { x1: p.btnX, y1: p.y - 14, x2: p.btnX, y2: p.y + 13 }
        : { x1: p.btnX - p.side * 8, y1: p.y, x2: p.btnX + p.side * 12, y2: p.y };
      s += `<g class="peg" data-i="${i}">
        <rect class="hit" x="${p.side < 0 ? 4 : cx * 2 - 90}" y="${p.y - 16}" width="86" height="32"/>
        ${ro}<line x1="${p.edgeX}" y1="${p.y}" x2="${stemX}" y2="${p.y}" stroke="${P.stemShadow}" stroke-width="${shadowW}"/>
        <line class="shaft" x1="${p.edgeX}" y1="${p.y}" x2="${stemX}" y2="${p.y}" stroke="url(#pegMetal)" stroke-width="${shaftW}"/>
        <path class="btn" d="${btn}" fill="url(#pegMetal)"/>
        <line x1="${(+seam.x1).toFixed(1)}" y1="${seam.y1}" x2="${(+seam.x2).toFixed(1)}" y2="${seam.y2}" stroke="rgba(60,66,76,0.3)" stroke-width="0.8"/>${rc}
        <circle cx="${p.postX}" cy="${p.y}" r="${pwr}" fill="none" stroke="url(#pegMetal)" stroke-width="2.4"/>
        <circle class="post" cx="${p.postX}" cy="${p.y}" r="${ppr}" fill="url(#pegMetal)"/>
        <circle cx="${p.postX}" cy="${p.y}" r="${phr}" fill="rgba(55,60,70,0.9)"/>
        <text x="${p.labelX}" y="${p.labelY}" text-anchor="${p.labelAnchor}">${p.name}<tspan dy="${bass ? 1.7 : 2}" font-size="${bass ? 7.5 : 9}">${p.octave}</tspan></text>
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
    genericStrings.forEach((gsn) =>
      gsn.el.classList.toggle("intune", on && gsn.el.classList.contains("sel")));
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
    // generic-hero strings share the wheel's scroll position, so each string
    // sits directly above its note and slides/fades in lockstep with it
    genericStrings.forEach((gsn, i) => {
      const { x, s, o } = wheelParams(i - pos);
      gsn.el.style.transform =
        `translate(calc(-50% + ${x.toFixed(1)}px), -50%) scale(${s.toFixed(3)})`;
      gsn.el.style.opacity = o.toFixed(3);
      gsn.el.style.zIndex = String(100 - Math.round(Math.abs(i - pos) * 10));
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
    // seat the drum instantly (no fly-in), then re-enable transitions —
    // suppress the generic-hero strings' transition through the same seat so
    // they don't animate in from the stack when a new instrument is picked
    stringWheel.classList.add("dragging");
    genericHero.classList.add("seating");
    layoutWheel(0);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      stringWheel.classList.remove("dragging");
      genericHero.classList.remove("seating");
    }));
  }

  // ---------- generic multi-string hero (universal fallback) ----------
  // One vertical string per note for instruments without bespoke headstock art.
  // Positioning is driven by layoutWheel (shared carousel); here we just build
  // the DOM and set each string's thickness from its RELATIVE pitch in the set
  // (lowest = thickest, like real strings) with a floor for same-pitch sets.
  function buildGenericHero(inst) {
    genericHero.innerHTML = "";
    const parsed = inst.strings.map(parseNote);
    const midis = parsed.map((p) => midiOf(p.noteIndex, p.octave));
    const lo = Math.min(...midis), hi = Math.max(...midis);
    const THICK = 10, THIN = 5.5; // px filament width: low → thick, high → thin (kept substantial so the chrome mirror reads even on the thinnest string)
    const WOUND_BELOW_MIDI = 56; // G3 and lower render wound (wrapped core); higher = plain steel — roughly IRL (uke stays all-plain, cello all-wound). Tunable.
    genericStrings = parsed.map((p, i) => {
      const t = hi > lo ? (midis[i] - lo) / (hi - lo) : 0.5; // 0 lowest → 1 highest
      const w = +(THICK + (THIN - THICK) * t).toFixed(2);
      const wound = midis[i] < WOUND_BELOW_MIDI;
      const wind = (1.5 + w * 0.22).toFixed(2); // winding pitch: coarser wrap on thicker strings
      const el = document.createElement("span");
      el.className = "gstr";
      // liquid-chrome filament that bleeds off the top & bottom of the capsule
      // (fade via the .genhero mask); wound (low) strings get a wrapped-ridge
      // overlay whose spacing rides the --wind var
      el.innerHTML =
        `<span class="gstr-line${wound ? " wound" : ""}" style="width:${w}px;--wind:${wind}px"></span>`;
      genericHero.appendChild(el);
      return { el, noteIndex: p.noteIndex, octave: p.octave };
    });
  }

  function wheelSelect(i) {
    const it = wheelItems[i];
    if (!it) return;
    state.noteIndex = it.noteIndex;
    state.octave = it.octave;
    syncTarget();
  }

  const WHEEL_STEP = 58; // px of finger travel per index step (center spacing)
  let whDragging = false, whMoved = false, whStartX = 0, whStartPos = 0, whHoldT = null, whLP = false;

  // item whose drum position is nearest a screen x (tap + long-press target)
  function wheelNearest(clientX) {
    const rect = stringWheel.getBoundingClientRect();
    const tx = (clientX - rect.left - rect.width / 2) / phoneScale;
    let best = 0, bestDist = Infinity;
    wheelItems.forEach((it, i) => {
      const d = Math.abs(wheelParams(i - wheelPos).x - tx);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  stringWheel.addEventListener("pointerdown", (e) => {
    whDragging = true;
    whMoved = false;
    whStartX = e.clientX;
    whStartPos = wheelPos;
    stringWheel.setPointerCapture(e.pointerId);
    // custom slot: press-and-hold a note opens its pitch editor
    whLP = false;
    clearTimeout(whHoldT);
    if (INSTRUMENTS[state.instrument].custom) {
      const pi = wheelNearest(e.clientX);
      whHoldT = setTimeout(() => { if (!whMoved) { whLP = true; openNoteEditor(pi); } }, 450);
    }
  });
  stringWheel.addEventListener("pointermove", (e) => {
    if (!whDragging) return;
    const dx = (e.clientX - whStartX) / phoneScale;
    if (!whMoved && Math.abs(dx) > 5) {
      whMoved = true;
      stringWheel.classList.add("dragging");
      clearTimeout(whHoldT);
    }
    if (whMoved) {
      layoutWheel(Math.max(0, Math.min(wheelItems.length - 1, whStartPos - dx / WHEEL_STEP)));
    }
  });
  stringWheel.addEventListener("pointerup", (e) => {
    if (!whDragging) return;
    whDragging = false;
    stringWheel.classList.remove("dragging");
    clearTimeout(whHoldT);
    if (whLP) { whLP = false; return; }  // long-press opened the editor — no select
    if (whMoved) wheelSelect(Math.round(wheelPos));
    else wheelSelect(wheelNearest(e.clientX));
  });
  stringWheel.addEventListener("pointercancel", () => {
    if (!whDragging) return;
    whDragging = false;
    stringWheel.classList.remove("dragging");
    clearTimeout(whHoldT);
    if (whMoved) wheelSelect(Math.round(wheelPos));
  });

  // ---------- note editor (custom slot): long-press a wheel note to retune it ----------
  const neScrim = document.getElementById("neScrim");
  const neGrid = document.getElementById("neGrid");
  const neOctVal = document.getElementById("neOctVal");
  let neIndex = -1, neNote = 0, neOct = 4;
  NOTES.forEach((nm, k) => {
    const b = document.createElement("button");
    b.className = "note-btn" + (nm.includes("#") ? " sharp" : "");
    b.textContent = nm.replace("#", "♯");
    b.addEventListener("click", () => { neNote = k; applyNoteEdit(); });
    neGrid.appendChild(b);
  });
  function neSync() {
    neOctVal.textContent = neOct;
    [...neGrid.children].forEach((b, k) => b.classList.toggle("selected", k === neNote));
  }
  function applyNoteEdit() {
    const inst = INSTRUMENTS[state.instrument];
    inst.strings[neIndex] = NOTES[neNote] + neOct;   // e.g. "E2" / "C#3"
    buildHeadstock(inst); buildWheel(inst);
    state.noteIndex = neNote; state.octave = neOct;  // select the string you just set
    syncTarget();
    neSync();
  }
  function openNoteEditor(i) {
    const p = parseNote(INSTRUMENTS[state.instrument].strings[i]);
    neIndex = i; neNote = p.noteIndex; neOct = p.octave;
    neSync();
    neScrim.classList.add("show");
  }
  document.getElementById("neOctDown").addEventListener("click", () => { if (neOct > OCT_MIN) { neOct--; applyNoteEdit(); } });
  document.getElementById("neOctUp").addEventListener("click", () => { if (neOct < OCT_MAX) { neOct++; applyNoteEdit(); } });
  document.getElementById("neDone").addEventListener("click", () => neScrim.classList.remove("show"));
  neScrim.addEventListener("click", (e) => { if (e.target === neScrim) neScrim.classList.remove("show"); });
  stringWheel.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dir = Math.sign(e.deltaY + e.deltaX);
    if (dir && wheelItems.length) {
      wheelSelect(Math.max(0, Math.min(wheelItems.length - 1, Math.round(wheelPos) + dir)));
    }
  }, { passive: false });

  function selectInstrument(i, byUser) {
    emptyOther = false;
    document.body.classList.remove("other-empty");
    if (byUser) state.instrumentPicked = true;
    state.instrument = i;
    const selFam = FAMILIES[familyOf(i)];
    if (selFam) selFam.cur = i;
    try { localStorage.setItem(INST_KEY, String(i)); } catch {}
    updateOtherLabel(); // Other slot shows this member's name when it's an Other member
    const inst = INSTRUMENTS[i];
    carouselTo(familyOf(i));
    const hs = usesHeadstock(inst);
    noteGrid.style.display = inst.strings ? "none" : "";
    stringRow.style.display = "none";               // string pills retired — every string instrument is now a hero
    pickerLabel.style.display = inst.strings ? "none" : ""; // only Chromatic keeps the inline label
    stringButtons = [];
    if (!hs) pegEls = [];
    if (!inst.strings) {                            // Chromatic — no hero
      genericStrings = []; genericHero.innerHTML = "";
      pickerLabelText.textContent = "Target Note";
    } else {                                        // any string instrument → hero + wheel
      if (hs) { genericStrings = []; genericHero.innerHTML = ""; buildHeadstock(inst); }
      else buildGenericHero(inst);
      buildWheel(inst);
      const low = parseNote(inst.strings[0]);
      state.noteIndex = low.noteIndex;
      state.octave = low.octave;
    }
    updateHeroView();
    updateInlinePicker();
    syncTarget();
  }

  // ---------- custom "+" slot: swipe the headstock to switch shape + count ----------
  // Each committed horizontal swipe flips to the next CUSTOM_SHAPES entry
  // (guitar-6 ↔ bass-4), reseeding the wheel with that shape's default tuning.
  // Only the custom slot swipes; a committed drag suppresses the peg tap.
  const CUSTOM_SHAPES = [
    { icon: "guitar", strings: ["E2", "A2", "D3", "G3", "B3", "E4"] },
    { icon: "bass",   strings: ["E1", "A1", "D2", "G2"] },
  ];
  function cycleCustomShape(dir) {
    const ci = INSTRUMENTS.findIndex((x) => x.custom);
    const inst = INSTRUMENTS[ci];
    inst.shape = ((inst.shape || 0) + dir + CUSTOM_SHAPES.length) % CUSTOM_SHAPES.length;
    const sh = CUSTOM_SHAPES[inst.shape];
    inst.icon = sh.icon; inst.strings = sh.strings.slice();
    selectInstrument(ci, false);              // rebuild headstock + wheel for the new shape
    for (const el of [hsHero, tunerStrip]) {  // quick fade-in so the swap reads as a flip
      el.style.transition = "none"; el.style.opacity = "0.25";
      void el.offsetWidth;
      el.style.transition = "opacity 0.22s"; el.style.opacity = "1";
    }
  }
  function customSwipeHint() {  // one-time nudge that the custom headstock is swipeable
    try {
      if (localStorage.getItem("tuner-customhint")) return;
      localStorage.setItem("tuner-customhint", "1");
    } catch {}
    headstock.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-9px)" },
       { transform: "translateX(5px)" }, { transform: "translateX(0)" }],
      { duration: 640, easing: "ease-in-out", delay: 280 });
  }
  let hsDownX = 0, hsTracking = false, hsSwiped = false;
  hsHero.addEventListener("pointerdown", (e) => {
    if (!INSTRUMENTS[state.instrument].custom) return;
    hsTracking = true; hsSwiped = false; hsDownX = e.clientX;
  });
  hsHero.addEventListener("pointermove", (e) => {
    if (!hsTracking) return;
    if (Math.abs((e.clientX - hsDownX) / phoneScale) > 40) {
      hsTracking = false; hsSwiped = true;
      cycleCustomShape(e.clientX < hsDownX ? 1 : -1);
    }
  });
  hsHero.addEventListener("pointerup", () => { hsTracking = false; });
  hsHero.addEventListener("click", (e) => {  // a swipe must not also fire the peg's tap
    if (hsSwiped) { e.stopPropagation(); e.preventDefault(); hsSwiped = false; }
  }, true);

  // Manual surfaces: chromatic shows the note grid inline, violin-class shows
  // its string pills inline (guitar picks on the headstock). The footer console
  // (carousel + wings) shows in Manual; Auto hides it by visibility so the mic
  // never shifts. Right wing swaps contextually: octave (chromatic) ↔ tone
  // (instruments) — the flip-camera position.
  function updateInlinePicker() {
    const inst = INSTRUMENTS[state.instrument];
    const manual = state.mode === "manual";
    const hero = usesHero(inst);
    inlinePicker.style.display = manual && !hero ? "block" : "none"; // only Chromatic is inline now
    micArea.classList.toggle("auto", !manual);
    miniOct.style.display = !inst.strings ? "" : "none";
    // reference-tone speaker: instruments keep it in the right wing; chromatic's
    // wing holds the octave stepper, so its speaker trails the Target Note label
    (inst.strings ? rightWing : pickerLabel).appendChild(toneBtn);
    toneBtn.style.display = "";
    if (inst.strings) miniOct.classList.remove("open");
  }

  // guitar + bass in Manual mode make the headstock the hero (replaces the dial)
  function updateHeroView() {
    const inst = INSTRUMENTS[state.instrument];
    const hero = state.mode === "manual" && usesHero(inst);
    const hs = usesHeadstock(inst);
    hsHero.style.display = hero ? "" : "none";
    tunerStrip.style.display = hero ? "" : "none";
    gaugeCard.classList.toggle("hero-hs", hero); // hides .readout, full-bleeds the hero
    headstock.style.display = hero && hs ? "" : "none";
    genericHero.style.display = hero && !hs ? "" : "none";
    if (hero && inst.custom) customSwipeHint();
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

    // chrome dot reflects the lit VU bar (which sits between the dot and centre):
    // drift sharp -> colour reflects on the LEFT, drift flat -> RIGHT; the glow
    // spills that way too, so the bubble looks like it's picking up the bar beside it
    const reflX = (50 - (clamped / 50) * 30).toFixed(1);
    for (const dot of hbarDots) {
      dot.style.left = left.toFixed(1) + "%";
      dot.style.setProperty("--dot-color", bg);
      dot.style.setProperty("--refl-x", reflX + "%");
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
    genericStrings.forEach((gsn) => gsn.el.classList.toggle("sel",
      gsn.noteIndex === state.noteIndex && gsn.octave === state.octave));
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

  function setA4(v) {
    A4 = Math.max(A4_MIN, Math.min(A4_MAX, Math.round(v)));
    try { localStorage.setItem(A4_KEY, A4); } catch {}
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
  // reload into the last instrument — EXCEPT "Other" members, which return to the
  // empty "Other" slot (pick a member to load one). Default Guitar 6 on first run.
  {
    let start = 1;
    try { const s = parseInt(localStorage.getItem(INST_KEY), 10); if (Number.isInteger(s) && INSTRUMENTS[s]) start = s; } catch {}
    const sf = FAMILIES[familyOf(start)];
    if (sf && sf.other) { sf.cur = start; enterOtherEmpty(); }
    else selectInstrument(start);
  }
  setMode("manual");   // launch straight onto the 6-string headstock, not auto
  bootMic();           // simulate iOS launch: prompt / auto-listen / denied
})();
