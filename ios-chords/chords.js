// Chords — an iOS-flavored front-end over the whatchordisthis DSP engine
// (window.WCIT from analysis.js). Get a sound bite in (record / import / drop /
// paste), trim to one chord on an iOS-style trim card, and read the ranked
// results as a Liquid-Glass, chrome-accented result stack.
(function () {
'use strict';

// ------------------------------------------------------------- state
var audioCtx = null;
var buffer = null;        // decoded AudioBuffer
var mono = null;          // Float32Array mixdown
var duration = 0;
var selStart = 0, selEnd = 0;   // seconds
var playSource = null, playRAF = null;
var recorder = null, recChunks = [], recStream = null, recCancelled = false;
var recTimer = null, recStartMs = 0, meterRAF = null, meterAnalyser = null, meterLevels = null;

var candLimit = 5;
var CAND_MAX = 15;
var MIN_SEL = 0.05;       // seconds — a click, not a drag
var PERM_KEY = "chords-mic-perm";
var dpr = window.devicePixelRatio || 1;

// standard-tuning open-string pitch classes, low E -> high E (left -> right)
var OPEN_PC = [4, 9, 2, 7, 11, 4];
var ROOT_PC = { 'C':0,'C#':1,'DB':1,'D':2,'D#':3,'EB':3,'E':4,'F':5,'F#':6,'GB':6,'G':7,'G#':8,'AB':8,'A':9,'A#':10,'BB':10,'B':11 };

// ------------------------------------------------------------- elements
var $ = function (id) { return document.getElementById(id); };
var emptyScreen = $('emptyScreen'), analysisScreen = $('analysisScreen');
var newBtn = $('newBtn');
var fileInput = $('fileInput'), phone = $('phone');
var waveCanvas = $('wave'), waveWrap = $('waveWrap');
var trimSel = $('trimSel'), trimBody = $('trimBody'), handleLeft = $('handleLeft'), handleRight = $('handleRight');
var dimLeft = $('dimLeft'), dimRight = $('dimRight'), playhead = $('playhead');
var playBtn = $('playBtn'), selTime = $('selTime'), sourceName = $('sourceName');
var statusEl = $('status'), resultEl = $('result');
var dropOverlay = $('dropOverlay');
var recScrim = $('recScrim'), recMeter = $('recMeter'), recTimeEl = $('recTime'), recStop = $('recStop'), recCancel = $('recCancel');
var permScrim = $('permScrim'), permAllow = $('permAllow'), permDeny = $('permDeny');

function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function setStatus(t) { statusEl.textContent = t || ''; }

// ------------------------------------------------------------- screens
function showEmpty() {
  stopPlayback();
  emptyScreen.style.display = 'flex';
  analysisScreen.style.display = 'none';
  newBtn.style.display = 'none';
  try { fileInput.value = ''; } catch (e) {}
}
function showAnalysis() {
  emptyScreen.style.display = 'none';
  analysisScreen.style.display = 'flex';
  newBtn.style.display = 'flex';
}
newBtn.addEventListener('click', showEmpty);

// ------------------------------------------------------------- loading
function loadArrayBuffer(ab, name) {
  showAnalysis();
  setStatus('Decoding ' + name + '…');
  resultEl.innerHTML = '';
  ctx().decodeAudioData(ab).then(function (buf) {
    sourceName.textContent = name;
    setBuffer(buf);
  }).catch(function () {
    setStatus("Couldn't read that audio — try a different file or format.");
  });
}

function setBuffer(buf) {
  buffer = buf;
  duration = buf.duration;
  mono = new Float32Array(buf.length);
  for (var c = 0; c < buf.numberOfChannels; c++) {
    var d = buf.getChannelData(c);
    for (var i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels;
  }
  selStart = 0;
  selEnd = duration;
  sizeWave();
  drawWave();
  layoutTrim();
  scheduleAnalyze();
}

// ------------------------------------------------------------- import
fileInput.addEventListener('change', function (e) {
  var f = e.target.files[0];
  if (!f) return;
  f.arrayBuffer().then(function (ab) { loadArrayBuffer(ab, f.name.replace(/\.[^.]+$/, '') || 'audio'); });
});

// drag & drop anywhere on the phone
var dragDepth = 0;
['dragenter', 'dragover'].forEach(function (ev) {
  phone.addEventListener(ev, function (e) {
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
    e.preventDefault();
    if (ev === 'dragenter') dragDepth++;
    dropOverlay.classList.add('show');
  });
});
phone.addEventListener('dragleave', function () { if (--dragDepth <= 0) { dragDepth = 0; dropOverlay.classList.remove('show'); } });
phone.addEventListener('drop', function (e) {
  e.preventDefault();
  dragDepth = 0; dropOverlay.classList.remove('show');
  var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) f.arrayBuffer().then(function (ab) { loadArrayBuffer(ab, (f.name || 'audio').replace(/\.[^.]+$/, '')); });
});

// paste an audio file / clip
document.addEventListener('paste', function (e) {
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (var i = 0; i < items.length; i++) {
    if (items[i].kind === 'file' && /audio/.test(items[i].type)) {
      var f = items[i].getAsFile();
      if (f) f.arrayBuffer().then(function (ab) { loadArrayBuffer(ab, 'Pasted clip'); });
      return;
    }
  }
});

// ------------------------------------------------------------- record
function onRecordTap() {
  var perm = null; try { perm = localStorage.getItem(PERM_KEY); } catch (e) {}
  if (perm === 'granted') startRec();
  else permScrim.classList.add('show');   // prompt (or re-prompt after a denial, for the sim)
}
Array.prototype.forEach.call(document.querySelectorAll('.js-record'), function (el) { el.addEventListener('click', onRecordTap); });
permAllow.addEventListener('click', function () {
  permScrim.classList.remove('show');
  try { localStorage.setItem(PERM_KEY, 'granted'); } catch (e) {}
  startRec();
});
permDeny.addEventListener('click', function () {
  permScrim.classList.remove('show');
  try { localStorage.setItem(PERM_KEY, 'denied'); } catch (e) {}
});

function startRec() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setStatus('Recording isn’t available in this browser.'); return; }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    recStream = stream; recCancelled = false; recChunks = [];
    // live meter
    var a = ctx().createAnalyser(); a.fftSize = 1024;
    ctx().createMediaStreamSource(stream).connect(a);
    meterAnalyser = a; meterLevels = new Array(56).fill(0);
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = function (e) { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = function () {
      stopMeter();
      stream.getTracks().forEach(function (t) { t.stop(); });
      if (!recCancelled && recChunks.length) new Blob(recChunks).arrayBuffer().then(function (ab) { loadArrayBuffer(ab, 'Recording'); });
    };
    recorder.start();
    recScrim.classList.add('show');
    recStartMs = Date.now();
    recTimeEl.textContent = '0:00';
    recTimer = setInterval(tickTimer, 250);
    sizeMeter(); drawMeter();
  }).catch(function () {
    try { localStorage.setItem(PERM_KEY, 'denied'); } catch (e) {}
    setStatus('Microphone permission denied.');
  });
}
function tickTimer() {
  var s = Math.floor((Date.now() - recStartMs) / 1000);
  recTimeEl.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}
recStop.addEventListener('click', function () { endRec(false); });
recCancel.addEventListener('click', function () { endRec(true); });
function endRec(cancel) {
  recCancelled = cancel;
  recScrim.classList.remove('show');
  if (recTimer) { clearInterval(recTimer); recTimer = null; }
  if (recorder && recorder.state === 'recording') recorder.stop();
}
function stopMeter() { if (meterRAF) cancelAnimationFrame(meterRAF); meterRAF = null; meterAnalyser = null; }
function sizeMeter() {
  var w = recMeter.clientWidth, h = recMeter.clientHeight;
  recMeter.width = Math.floor(w * dpr); recMeter.height = Math.floor(h * dpr);
}
function drawMeter() {
  if (!meterAnalyser) return;
  var buf = new Uint8Array(meterAnalyser.fftSize);
  meterAnalyser.getByteTimeDomainData(buf);
  var sum = 0;
  for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
  var rms = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
  meterLevels.push(rms); meterLevels.shift();

  var g = recMeter.getContext('2d');
  var W = recMeter.width, H = recMeter.height;
  g.clearRect(0, 0, W, H);
  var n = meterLevels.length, bw = W / n;
  var grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#f7fafd'); grad.addColorStop(0.5, '#aab2be'); grad.addColorStop(1, '#7c8490');
  g.fillStyle = grad;
  for (var k = 0; k < n; k++) {
    var bh = Math.max(2 * dpr, meterLevels[k] * H * 0.9);
    var x = k * bw, y = (H - bh) / 2;
    g.beginPath();
    if (g.roundRect) g.roundRect(x + bw * 0.18, y, bw * 0.64, bh, bw * 0.3); else g.rect(x + bw * 0.18, y, bw * 0.64, bh);
    g.fill();
  }
  meterRAF = requestAnimationFrame(drawMeter);
}

// ------------------------------------------------------------- demo
var DEMOS = [
  { label: 'Am', notes: [45, 52, 57, 60, 64] }, { label: 'C', notes: [48, 52, 55, 60, 64] },
  { label: 'G', notes: [43, 47, 50, 55, 59, 67] }, { label: 'E', notes: [40, 47, 52, 56, 59, 64] },
  { label: 'Dm', notes: [50, 57, 62, 65] }, { label: 'G7', notes: [43, 47, 50, 53, 55, 59] },
  { label: 'Fmaj7', notes: [53, 57, 60, 64] }, { label: 'Asus4', notes: [45, 52, 57, 62, 64] },
  { label: 'Bm', notes: [47, 54, 59, 62, 66] }
];
var lastDemo = -1;
function onDemo() {
  var i; do { i = Math.floor(Math.random() * DEMOS.length); } while (i === lastDemo);
  lastDemo = i;
  var demo = DEMOS[i], sr = ctx().sampleRate, secs = 2.5, n = Math.floor(sr * secs);
  var buf = ctx().createBuffer(1, n, sr), out = buf.getChannelData(0);
  demo.notes.forEach(function (m) {
    var f0 = 440 * Math.pow(2, (m - 69) / 12), phase = Math.random() * Math.PI * 2;
    for (var h = 1; h <= 6; h++) {
      var f = f0 * h; if (f > sr / 2 * 0.9) break;
      var amp = 0.25 / (h * demo.notes.length);
      for (var k = 0; k < n; k++) { var t = k / sr; out[k] += amp * Math.exp(-t * (1.2 + h * 0.6)) * Math.sin(2 * Math.PI * f * t + phase * h); }
    }
  });
  showAnalysis();
  sourceName.textContent = 'Demo chord';
  setBuffer(buf);
  playSelection();
}
Array.prototype.forEach.call(document.querySelectorAll('.js-demo'), function (el) { el.addEventListener('click', onDemo); });

// ------------------------------------------------------------- waveform
function sizeWave() {
  var w = waveWrap.clientWidth, h = waveWrap.clientHeight;
  waveCanvas.width = Math.floor(w * dpr);
  waveCanvas.height = Math.floor(h * dpr);
}
function drawWave(playSec) {
  if (!mono) return;
  var g = waveCanvas.getContext('2d');
  var W = waveCanvas.width, H = waveCanvas.height;
  g.clearRect(0, 0, W, H);
  var grad = g.createLinearGradient(0, 0, 0, H);   // vertical chrome sheen
  grad.addColorStop(0, '#dfe6ee'); grad.addColorStop(0.46, '#9aa3af');
  grad.addColorStop(0.5, '#6c7480'); grad.addColorStop(0.54, '#9aa3af'); grad.addColorStop(1, '#dfe6ee');
  g.strokeStyle = grad; g.lineWidth = 1 * dpr;
  g.beginPath();
  var spp = mono.length / W;
  for (var x = 0; x < W; x++) {
    var a = Math.floor(x * spp), b = Math.min(mono.length, Math.floor((x + 1) * spp) + 1);
    var mn = 1, mx = -1, step = Math.max(1, Math.floor((b - a) / 40));
    for (var i = a; i < b; i += step) { var v = mono[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    g.moveTo(x + 0.5, H / 2 - mx * H * 0.46);
    g.lineTo(x + 0.5, H / 2 - mn * H * 0.46 + 1);
  }
  g.stroke();
  if (playSec !== undefined && duration) playhead.style.left = (100 * playSec / duration) + '%';
}
function layoutTrim() {
  if (!duration) return;
  var s = 100 * selStart / duration, e = 100 * selEnd / duration;
  trimSel.style.left = s + '%';
  trimSel.style.width = (e - s) + '%';
  dimLeft.style.width = s + '%';
  dimRight.style.left = e + '%';
  dimRight.style.width = (100 - e) + '%';
  selTime.textContent = fmtTime(selStart) + '–' + fmtTime(selEnd);
}
function fmtTime(s) { var m = Math.floor(s / 60); return m + ':' + ('0' + (s - m * 60).toFixed(1)).slice(-4); }

// trim handle + window drags
function fracOf(clientX) { var r = waveWrap.getBoundingClientRect(); return Math.min(1, Math.max(0, (clientX - r.left) / r.width)); }
function bindDrag(el, onMove) {
  var dragging = false;
  el.addEventListener('pointerdown', function (e) {
    if (!buffer) return;
    e.preventDefault();
    dragging = true; el.setPointerCapture(e.pointerId);
    onMove(e, true);
  });
  el.addEventListener('pointermove', function (e) { if (dragging) onMove(e, false); });
  el.addEventListener('pointerup', function (e) {
    if (!dragging) return; dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch (x) {}
    scheduleAnalyze();
  });
}
bindDrag(handleLeft, function (e) {
  var t = fracOf(e.clientX) * duration;
  selStart = Math.max(0, Math.min(t, selEnd - MIN_SEL));
  layoutTrim(); drawWave();
});
bindDrag(handleRight, function (e) {
  var t = fracOf(e.clientX) * duration;
  selEnd = Math.min(duration, Math.max(t, selStart + MIN_SEL));
  layoutTrim(); drawWave();
});
var winAnchor = 0, winS0 = 0, winE0 = 0;
bindDrag(trimBody, function (e, isDown) {
  if (isDown) { winAnchor = fracOf(e.clientX) * duration; winS0 = selStart; winE0 = selEnd; return; }
  var delta = fracOf(e.clientX) * duration - winAnchor;
  var w = winE0 - winS0;
  var ns = winS0 + delta;
  ns = Math.max(0, Math.min(ns, duration - w));
  selStart = ns; selEnd = ns + w;
  layoutTrim(); drawWave();
});

window.addEventListener('resize', function () { if (buffer) { sizeWave(); drawWave(); } });

// ------------------------------------------------------------- playback
function stopPlayback() {
  if (playSource) { try { playSource.stop(); } catch (e) {} playSource = null; }
  if (playRAF) cancelAnimationFrame(playRAF);
  playBtn.classList.remove('playing');
  playhead.classList.remove('on');
}
function playSelection() {
  if (!buffer) return;
  stopPlayback();
  var src = ctx().createBufferSource();
  src.buffer = buffer; src.connect(audioCtx.destination);
  var dur = selEnd - selStart, startedAt = audioCtx.currentTime, startSec = selStart;
  src.onended = function () { if (playSource === src) stopPlayback(); };
  src.start(0, selStart, dur);
  playSource = src;
  playBtn.classList.add('playing');
  playhead.classList.add('on');
  (function tick() {
    if (playSource !== src) return;
    drawWave(startSec + (audioCtx.currentTime - startedAt));
    playRAF = requestAnimationFrame(tick);
  })();
}
playBtn.addEventListener('click', function () { if (playSource) stopPlayback(); else playSelection(); });

// ------------------------------------------------------------- analysis
var analyzeTimer = null;
function scheduleAnalyze() {
  if (analyzeTimer) clearTimeout(analyzeTimer);
  candLimit = 5;
  setStatus('Analyzing…');
  analyzeTimer = setTimeout(runAnalyze, 60);
}
function runAnalyze() {
  analyzeTimer = null;
  if (!mono) return;
  var sr = buffer.sampleRate;
  var a = Math.floor(selStart * sr), b = Math.min(mono.length, Math.ceil(selEnd * sr));
  render(WCIT.analyze(mono.subarray(a, b), sr, candLimit));
}

function fmtChord(label) { return String(label).replace(/^([A-G])#/, '$1<span class="acc">♯</span>'); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function rootPcOf(label) { var m = String(label).match(/^[A-G][#b]?/); return m ? (ROOT_PC[m[0].toUpperCase()] != null ? ROOT_PC[m[0].toUpperCase()] : -1) : -1; }

function render(res) {
  resultEl.innerHTML = '';
  if (!res.ok) { setStatus(res.reason || 'No clear pitch in that slice.'); return; }
  setStatus('');
  var cands = res.candidates;

  // ---- hero (best guess) ----
  var top = cands[0];
  var hero = document.createElement('div');
  hero.className = 'hero-card glass';
  var pct = Math.round(top.score * 100);
  var slash = top.slash ? ('<div class="hero-slash">with <b>' + esc(WCIT.NOTE_NAMES[res.bassPc]) + '</b> in the bass → could be voiced as <b>' + esc(top.slash) + '</b></div>') : '';
  hero.innerHTML =
    '<div class="hero-badge">Best guess</div>' +
    '<div class="hero-chord">' + fmtChord(top.label) + '</div>' +
    '<div class="hero-type">' + esc(top.typeName) + '</div>' +
    '<div class="hero-conf"><div class="conf-bar"><div class="conf-fill" style="width:' + pct + '%"></div></div><div class="conf-pct">' + pct + '% match</div></div>' +
    slash +
    '<div class="voicings"></div>';
  var vw = hero.querySelector('.voicings');
  fillVoicings(vw, top);
  if (!vw.children.length) vw.remove();
  resultEl.appendChild(hero);

  // ---- alternates ----
  if (cands.length > 1) {
    var lab = document.createElement('div');
    lab.className = 'section-label';
    lab.textContent = 'Other possibilities';
    resultEl.appendChild(lab);
    for (var i = 1; i < cands.length; i++) resultEl.appendChild(altCard(cands[i], res));
  }

  // ---- deepen / exhausted ----
  if (candLimit < CAND_MAX && cands.length >= candLimit) {
    var none = document.createElement('button');
    none.className = 'none-btn';
    none.textContent = 'None of these';
    none.addEventListener('click', function () {
      if (none.classList.contains('confirmed')) return;
      none.classList.add('confirmed');
      none.textContent = 'Digging deeper…';
      setTimeout(function () { candLimit = Math.min(CAND_MAX, candLimit + 5); runAnalyze(); }, 350);
    });
    resultEl.appendChild(none);
  } else if (candLimit >= CAND_MAX) {
    var ex = document.createElement('div');
    ex.className = 'exhausted';
    ex.textContent = "That's everything it can hear in this slice — try dragging a tighter selection around just the chord.";
    resultEl.appendChild(ex);
  }

  // ---- evidence (chroma) ----
  resultEl.appendChild(evidence(res));
}

function altCard(c, res) {
  var card = document.createElement('div');
  card.className = 'alt-card glass';
  var pct = Math.round(c.score * 100);
  var head = document.createElement('div');
  head.className = 'alt-head';
  head.innerHTML =
    '<span class="alt-name">' + fmtChord(c.label) + '</span>' +
    '<span class="alt-type">' + esc(c.typeName) + '</span>' +
    '<span class="alt-conf">' + pct + '%</span>' +
    '<svg class="alt-chev" width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 1.5 L6.5 6.5 L1.5 11.5"/></svg>';
  var body = document.createElement('div');
  body.className = 'alt-body';
  if (c.slash) body.innerHTML = '<div class="alt-slash">with ' + esc(WCIT.NOTE_NAMES[res.bassPc]) + ' in the bass → ' + esc(c.slash) + '</div>';
  var bvw = document.createElement('div');
  bvw.className = 'voicings';
  fillVoicings(bvw, c);
  body.appendChild(bvw);
  card.appendChild(head); card.appendChild(body);
  head.addEventListener('click', function () { card.classList.toggle('open'); });
  return card;
}

function fillVoicings(container, c) {
  (c.voicings || []).forEach(function (v) {
    var vd = document.createElement('div');
    vd.className = 'voicing';
    vd.appendChild(drawDiagram(v, rootPcOf(c.label)));
    var lab = document.createElement('div');
    lab.className = 'vlabel';
    lab.textContent = v.shape + ' · ' + v.position + ' · ' + Math.round(v.score * 100) + '%';
    vd.appendChild(lab);
    container.appendChild(vd);
  });
}

function evidence(res) {
  var wrap = document.createElement('div');
  wrap.className = 'evidence';
  var bars = '';
  for (var i = 0; i < 12; i++) {
    var on = res.chroma[i] > 0.55;
    bars += '<div class="bar' + (on ? ' on' : '') + '" style="height:' + Math.max(3, res.chroma[i] * 100) + '%"><span>' + WCIT.NOTE_NAMES[i] + '</span></div>';
  }
  wrap.innerHTML =
    '<button class="evidence-toggle" type="button"><span>What it heard</span>' +
    '<svg class="ev-chev" width="13" height="8" viewBox="0 0 13 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 1.5 L6.5 6.5 L11.5 1.5"/></svg></button>' +
    '<div class="evidence-body"><div class="chroma">' + bars + '</div>' +
    '<div class="evidence-cap">Note energy across the 12 pitch classes — the evidence behind the guesses above.</div></div>';
  wrap.querySelector('.evidence-toggle').addEventListener('click', function () { wrap.classList.toggle('open'); });
  return wrap;
}

// ------------------------------------------------------ chrome fret diagrams
function chromeDot(g, x, y, r, root) {
  var grd = g.createRadialGradient(x - r * 0.32, y - r * 0.42, r * 0.12, x, y, r);
  if (root) { grd.addColorStop(0, '#7fbcff'); grd.addColorStop(0.5, '#0a76f2'); grd.addColorStop(1, '#0053c2'); }
  else { grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.34, '#e6ebf1'); grd.addColorStop(0.66, '#aab2be'); grd.addColorStop(1, '#79818d'); }
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.8; g.stroke();
}
function drawDiagram(v, rootPc) {
  var W = 100, H = 122;
  var cv = document.createElement('canvas');
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  var g = cv.getContext('2d'); g.scale(dpr, dpr);

  var fretted = v.frets.filter(function (f) { return f > 0; });
  var minF = fretted.length ? Math.min.apply(null, fretted) : 1;
  var maxF = fretted.length ? Math.max.apply(null, fretted) : 1;
  var startFret = maxF <= 4 ? 1 : minF, nFrets = 4;

  var left = 16, right = W - 10, top = 24, bottom = H - 12;
  var sw = (right - left) / 5, fh = (bottom - top) / nFrets;
  var ink = 'rgba(60,60,67,0.42)', ink2 = 'rgba(60,60,67,0.6)';

  g.strokeStyle = ink; g.lineWidth = 1;
  if (startFret === 1) { g.fillStyle = 'rgba(60,60,67,0.75)'; g.fillRect(left - 1, top - 3.5, right - left + 2, 3.5); }
  else { g.fillStyle = ink2; g.font = '600 10px -apple-system, Inter, sans-serif'; g.textAlign = 'right'; g.fillText(startFret + 'fr', left - 4, top + fh * 0.66); }

  g.beginPath();
  for (var s = 0; s < 6; s++) { g.moveTo(left + s * sw, top); g.lineTo(left + s * sw, bottom); }
  for (var f = 0; f <= nFrets; f++) { g.moveTo(left, top + f * fh); g.lineTo(right, top + f * fh); }
  g.stroke();

  g.font = '600 10px -apple-system, Inter, sans-serif'; g.textAlign = 'center'; g.fillStyle = ink2;
  for (var i = 0; i < 6; i++) {
    var x = left + i * sw, fr = v.frets[i];
    if (fr < 0) { g.fillStyle = ink2; g.fillText('×', x, top - 8); }
    else if (fr === 0) {
      var isR = rootPc >= 0 && OPEN_PC[i] % 12 === rootPc;
      g.strokeStyle = isR ? '#0a76f2' : ink2; g.lineWidth = 1.3;
      g.beginPath(); g.arc(x, top - 10.5, 3.2, 0, Math.PI * 2); g.stroke();
    } else {
      var row = fr - startFret; if (row < 0 || row >= nFrets) continue;
      var pc = (OPEN_PC[i] + fr) % 12;
      chromeDot(g, x, top + (row + 0.5) * fh, 5, rootPc >= 0 && pc === rootPc);
    }
  }
  return cv;
}

// ------------------------------------------------------------- init
// dev-only: import-symbol A/B ("a" glyph on faint circle / "b" bare glyph), persisted
(function initImpOpt() {
  var KEY = 'chords-imp-opt';
  var btns = Array.prototype.slice.call(document.querySelectorAll('#importOpt button'));
  function apply(v) {
    document.body.setAttribute('data-imp', v);
    btns.forEach(function (b) { b.classList.toggle('active', b.dataset.imp === v); });
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { apply(b.dataset.imp); }); });
  var saved = 'b'; try { saved = localStorage.getItem(KEY) || 'b'; } catch (e) {}
  if (saved !== 'a' && saved !== 'b') saved = 'b';
  apply(saved);
})();

showEmpty();

})();
