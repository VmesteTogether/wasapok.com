/* ios-tuner — chromatic tuner prototype
   Pick a target note + octave; mic input is autocorrelated and the gauge
   shows deviation in cents (-50..+50) from the target pitch. */

(() => {
  "use strict";

  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const A4 = 440;
  const OCT_MIN = 0, OCT_MAX = 8;
  const IN_TUNE_CENTS = 5;

  const state = {
    noteIndex: 9, // A
    octave: 4,
    instrument: 0, // index into INSTRUMENTS; 0 = chromatic
    listening: false,
    lastCents: null,
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

  // ---------- gauge (SVG) ----------

  const svg = document.getElementById("gaugeSvg");
  const NS = "http://www.w3.org/2000/svg";
  const CX = 170, CY = 178, R = 140;
  const SWEEP = 130; // degrees total (-65..+65 from vertical)

  const centsToAngle = (cents) => (Math.max(-50, Math.min(50, cents)) / 50) * (SWEEP / 2);
  const polar = (angleDeg, radius) => {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
  };

  function el(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  let needle, needleHub, arcActive;

  function buildGauge() {
    // background arc
    const [ax, ay] = polar(-SWEEP / 2, R);
    const [bx, by] = polar(SWEEP / 2, R);
    svg.appendChild(el("path", {
      d: `M ${ax} ${ay} A ${R} ${R} 0 0 1 ${bx} ${by}`,
      fill: "none", stroke: "rgba(60,60,67,0.16)", "stroke-width": 10, "stroke-linecap": "round",
    }));

    // in-tune zone (±5 cents)
    const [gx, gy] = polar(centsToAngle(-IN_TUNE_CENTS), R);
    const [hx, hy] = polar(centsToAngle(IN_TUNE_CENTS), R);
    svg.appendChild(el("path", {
      d: `M ${gx} ${gy} A ${R} ${R} 0 0 1 ${hx} ${hy}`,
      fill: "none", stroke: "rgba(52,199,89,0.45)", "stroke-width": 10, "stroke-linecap": "round",
    }));

    // active arc from center to needle, recolored live
    arcActive = el("path", {
      fill: "none", stroke: "transparent", "stroke-width": 10, "stroke-linecap": "round",
    });
    svg.appendChild(arcActive);

    // ticks every 10 cents, labels at ±50 and 0
    for (let c = -50; c <= 50; c += 10) {
      const a = centsToAngle(c);
      const major = c % 50 === 0;
      const [x1, y1] = polar(a, R - 14);
      const [x2, y2] = polar(a, R - (major ? 30 : 24));
      svg.appendChild(el("line", {
        x1, y1, x2, y2,
        stroke: c === 0 ? "rgba(0,0,0,0.75)" : "rgba(60,60,67,0.32)",
        "stroke-width": c === 0 ? 2.5 : 1.5, "stroke-linecap": "round",
      }));
      if (major && c !== 0) {
        const [tx, ty] = polar(a, R - 44);
        const label = el("text", {
          x: tx, y: ty, "text-anchor": "middle", "dominant-baseline": "middle",
          fill: "rgba(60,60,67,0.5)", "font-size": 12, "font-weight": 600,
          "font-family": "inherit",
        });
        label.textContent = c > 0 ? `+${c}` : `${c}`;
        svg.appendChild(label);
      }
    }

    // ♭ / ♯ hints
    const [fx, fy] = polar(-SWEEP / 2 + 6, R + 0);
    const [sx, sy] = polar(SWEEP / 2 - 6, R + 0);
    for (const [x, y, ch] of [[fx - 18, fy - 12, "♭"], [sx + 18, sy - 12, "♯"]]) {
      const t = el("text", {
        x, y, "text-anchor": "middle", fill: "rgba(60,60,67,0.4)",
        "font-size": 17, "font-weight": 600, "font-family": "inherit",
      });
      t.textContent = ch;
      svg.appendChild(t);
    }

    // needle
    needle = el("line", {
      x1: CX, y1: CY - 36, x2: CX, y2: CY - (R - 34),
      stroke: "rgba(60,60,67,0.45)", "stroke-width": 4, "stroke-linecap": "round",
    });
    needle.style.transformOrigin = `${CX}px ${CY}px`;
    needle.style.transition = "transform 0.12s ease-out, stroke 0.15s";
    svg.appendChild(needle);

    needleHub = el("circle", { cx: CX, cy: CY - 36, r: 5, fill: "rgba(60,60,67,0.45)" });
    needleHub.style.transformOrigin = `${CX}px ${CY}px`;
    needleHub.style.transition = "transform 0.12s ease-out, fill 0.15s";
    svg.appendChild(needleHub);
  }

  function colorFor(cents) {
    const a = Math.abs(cents);
    if (a <= IN_TUNE_CENTS) return "var(--green)";
    if (a <= 20) return "var(--orange)";
    return "var(--red)";
  }

  function setNeedle(cents) {
    if (cents === null) {
      needle.style.transform = "rotate(0deg)";
      needleHub.style.transform = "rotate(0deg)";
      needle.setAttribute("stroke", "rgba(60,60,67,0.45)");
      needleHub.setAttribute("fill", "rgba(60,60,67,0.45)");
      arcActive.setAttribute("stroke", "transparent");
      return;
    }
    const angle = centsToAngle(cents);
    const color = colorFor(cents);
    needle.style.transform = `rotate(${angle}deg)`;
    needleHub.style.transform = `rotate(${angle}deg)`;
    needle.setAttribute("stroke", color);
    needleHub.setAttribute("fill", color);

    const a0 = Math.min(0, angle), a1 = Math.max(0, angle);
    const [px, py] = polar(a0, R);
    const [qx, qy] = polar(a1, R);
    if (Math.abs(angle) < 0.5) {
      arcActive.setAttribute("stroke", "transparent");
    } else {
      arcActive.setAttribute("d", `M ${px} ${py} A ${R} ${R} 0 0 1 ${qx} ${qy}`);
      arcActive.setAttribute("stroke", color);
      arcActive.setAttribute("opacity", 0.85);
    }
  }

  // ---------- UI ----------

  const noteDisplay = document.getElementById("noteDisplay");
  const octDisplay = document.getElementById("octDisplay");
  const metaDisplay = document.getElementById("metaDisplay");
  const centsDisplay = document.getElementById("centsDisplay");
  const tunePill = document.getElementById("tunePill");
  const octValue = document.getElementById("octValue");
  const noteGrid = document.getElementById("noteGrid");
  const stringRow = document.getElementById("stringRow");
  const pickerLabel = document.getElementById("pickerLabel");
  const instRow = document.getElementById("instRow");
  const micBtn = document.getElementById("micBtn");
  const micLabel = document.getElementById("micLabel");
  const toneBtn = document.getElementById("toneBtn");

  const noteButtons = NOTES.map((name, i) => {
    const b = document.createElement("button");
    b.className = "note-btn" + (name.includes("#") ? " sharp" : "");
    b.textContent = name.replace("#", "♯");
    b.addEventListener("click", () => { state.noteIndex = i; syncTarget(); });
    noteGrid.appendChild(b);
    return b;
  });

  // instrument chips
  const instButtons = INSTRUMENTS.map((inst, i) => {
    const b = document.createElement("button");
    b.className = "inst-chip glass";
    b.innerHTML = ICONS[inst.icon] + `<span>${inst.name}</span>` +
      (inst.count !== null ? `<span class="cnt">${inst.count}</span>` : "");
    b.addEventListener("click", () => selectInstrument(i));
    instRow.appendChild(b);
    return b;
  });

  // desktop scrolling for the chip row: mouse wheel + click-drag
  instRow.addEventListener("wheel", (e) => {
    e.preventDefault();
    instRow.scrollLeft += e.deltaY + e.deltaX;
  }, { passive: false });

  let dragging = false, dragMoved = false, dragStartX = 0, dragStartScroll = 0;
  instRow.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return; // touch scrolls natively
    dragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartScroll = instRow.scrollLeft;
  });
  instRow.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = (e.clientX - dragStartX) / phoneScale;
    if (!dragMoved && Math.abs(dx) > 5) {
      dragMoved = true;
      instRow.setPointerCapture(e.pointerId); // keeps the drag, swallows the chip click
    }
    if (dragMoved) instRow.scrollLeft = dragStartScroll - dx;
  });
  for (const ev of ["pointerup", "pointercancel"]) {
    instRow.addEventListener(ev, () => { dragging = false; });
  }

  let stringButtons = [];

  function selectInstrument(i) {
    state.instrument = i;
    const inst = INSTRUMENTS[i];
    instButtons.forEach((b, j) => b.classList.toggle("selected", j === i));
    // center the chip by scrolling the row only — scrollIntoView also scrolls
    // ancestor containers, which shoved the whole app sideways
    const chip = instButtons[i];
    instRow.scrollTo({
      left: chip.offsetLeft - instRow.offsetLeft - (instRow.clientWidth - chip.offsetWidth) / 2,
      behavior: "smooth",
    });
    if (!inst.strings) {
      pickerLabel.textContent = "Target Note";
      noteGrid.style.display = "";
      stringRow.style.display = "none";
      stringButtons = [];
    } else {
      pickerLabel.textContent = `${inst.name} Strings`;
      noteGrid.style.display = "none";
      stringRow.style.display = "";
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
    syncTarget();
  }

  function syncTarget() {
    const f = targetFreq();
    noteButtons.forEach((b, i) => b.classList.toggle("selected", i === state.noteIndex));
    stringButtons.forEach((b) => b.classList.toggle("selected",
      +b.dataset.noteIndex === state.noteIndex && +b.dataset.octave === state.octave));
    noteDisplay.firstChild.textContent = NOTES[state.noteIndex].replace("#", "♯");
    octDisplay.textContent = state.octave;
    octValue.textContent = `${state.octave} · ${f.toFixed(2)} Hz`;
    document.getElementById("octDown").disabled = state.octave <= OCT_MIN;
    document.getElementById("octUp").disabled = state.octave >= OCT_MAX;
    if (!state.listening) {
      metaDisplay.textContent = `target ${f.toFixed(2)} Hz`;
      centsDisplay.innerHTML = "&nbsp;";
      tunePill.classList.remove("show");
      setNeedle(null);
    }
    if (toneOsc) toneOsc.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.02);
  }

  document.getElementById("octDown").addEventListener("click", () => {
    if (state.octave > OCT_MIN) { state.octave--; syncTarget(); }
  });
  document.getElementById("octUp").addEventListener("click", () => {
    if (state.octave < OCT_MAX) { state.octave++; syncTarget(); }
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
    const f = targetFreq();

    if (freq > 0 && freq > f / 4 && freq < f * 4) {
      const cents = 1200 * Math.log2(freq / f);
      // light smoothing so the needle doesn't jitter
      state.lastCents = state.lastCents === null
        ? cents
        : state.lastCents * 0.6 + cents * 0.4;
      const shown = state.lastCents;
      setNeedle(shown);
      metaDisplay.textContent = `${freq.toFixed(1)} Hz · hearing ${describeFreq(freq)} · target ${f.toFixed(2)} Hz`;
      const rounded = Math.round(shown);
      centsDisplay.textContent = rounded === 0 ? "0 cents" : `${rounded > 0 ? "+" : ""}${rounded} cents`;
      centsDisplay.style.color = colorFor(shown);
      tunePill.classList.toggle("show", Math.abs(shown) <= IN_TUNE_CENTS);
    } else {
      state.lastCents = null;
      metaDisplay.textContent = `listening… · target ${f.toFixed(2)} Hz`;
      centsDisplay.innerHTML = "&nbsp;";
      tunePill.classList.remove("show");
      setNeedle(null);
    }
    rafId = requestAnimationFrame(tick);
  }

  async function startMic() {
    ensureCtx();
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      micLabel.textContent = "Microphone blocked";
      setTimeout(() => { if (!state.listening) micLabel.textContent = "Start Tuning"; }, 2200);
      return;
    }
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = BUF_LEN;
    src.connect(analyser);
    state.listening = true;
    micBtn.classList.add("live");
    micLabel.textContent = "Listening — Tap to Stop";
    tick();
  }

  function stopMic() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
    analyser = null;
    state.listening = false;
    state.lastCents = null;
    micBtn.classList.remove("live");
    micLabel.textContent = "Start Tuning";
    syncTarget();
  }

  micBtn.addEventListener("click", () => (state.listening ? stopMic() : startMic()));

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

  buildGauge();
  selectInstrument(0);
})();
