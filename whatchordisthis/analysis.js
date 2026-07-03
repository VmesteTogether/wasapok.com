// whatchordisthis — DSP core: FFT -> pitch salience -> chromagram -> ranked
// chord candidates + guitar voicing suggestions. No dependencies; runs in the
// browser (window.WCIT) and in Node (module.exports) so it can be unit-tested.
(function (global) {
'use strict';

var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ---------------------------------------------------------------- FFT

function fft(re, im) {
  var n = re.length;
  for (var i = 1, j = 0; i < n; i++) {
    var bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      var t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (var len = 2; len <= n; len <<= 1) {
    var ang = -2 * Math.PI / len;
    var wr = Math.cos(ang), wi = Math.sin(ang);
    var half = len >> 1;
    for (var s = 0; s < n; s += len) {
      var cr = 1, ci = 0;
      for (var k = 0; k < half; k++) {
        var a = s + k, b = s + k + half;
        var vr = re[b] * cr - im[b] * ci;
        var vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
        var ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// ------------------------------------------- averaged magnitude spectrum

var FRAME = 16384;   // ~2.7 Hz/bin at 44.1k: resolves semitones down to low E
var HOP = 8192;
var MAX_FRAMES = 120; // cap analysis work on long selections (~22 s)

function averageSpectrum(samples, sampleRate) {
  var hann = new Float64Array(FRAME);
  for (var i = 0; i < FRAME; i++) {
    hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FRAME - 1));
  }
  var mag = new Float64Array(FRAME / 2);
  var re = new Float64Array(FRAME);
  var im = new Float64Array(FRAME);
  var frames = 0;
  var last = samples.length - FRAME;
  for (var pos = 0; (pos <= last || frames === 0) && frames < MAX_FRAMES; pos += HOP) {
    for (var k = 0; k < FRAME; k++) {
      var s = (pos + k < samples.length) ? samples[pos + k] : 0;
      re[k] = s * hann[k];
      im[k] = 0;
    }
    fft(re, im);
    for (var b = 0; b < FRAME / 2; b++) {
      mag[b] += Math.sqrt(re[b] * re[b] + im[b] * im[b]);
    }
    frames++;
  }
  var max = 0;
  for (var b2 = 0; b2 < mag.length; b2++) {
    mag[b2] /= frames;
    if (mag[b2] > max) max = mag[b2];
  }
  // mild compression so loud harmonics don't drown quiet chord tones
  if (max > 0) {
    for (var b3 = 0; b3 < mag.length; b3++) {
      mag[b3] = Math.pow(mag[b3] / max, 0.6);
    }
  }
  return { mag: mag, binHz: sampleRate / FRAME };
}

// ---------------------------------------------------- pitch salience

var MIDI_LO = 28, MIDI_HI = 88; // E1..E6

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function magNear(spec, freq) {
  // strongest bin within a quarter-semitone of freq
  var lo = Math.floor(freq * Math.pow(2, -1 / 48) / spec.binHz);
  var hi = Math.ceil(freq * Math.pow(2, 1 / 48) / spec.binHz);
  if (hi <= lo) hi = lo + 1;
  if (hi >= spec.mag.length) return 0;
  var best = 0;
  for (var b = Math.max(1, lo); b <= hi; b++) {
    if (spec.mag[b] > best) best = spec.mag[b];
  }
  return best;
}

// Harmonic-sum salience: evidence that a fundamental exists at each midi
// pitch. Harmonics reinforce true fundamentals; the 1/h weighting keeps a
// note's own overtones from registering as strong phantom pitches.
function computeSalience(spec, sampleRate) {
  var sal = new Float64Array(MIDI_HI + 1);
  var nyq = sampleRate / 2;
  for (var m = MIDI_LO; m <= MIDI_HI; m++) {
    var f0 = midiToFreq(m);
    var s = 0;
    for (var h = 1; h <= 5; h++) {
      var f = f0 * h;
      if (f > nyq * 0.95) break;
      s += magNear(spec, f) / h;
    }
    sal[m] = s;
  }
  return sal;
}

// ---------------------------------------------------------- chroma + bass

function computeChroma(sal) {
  var chroma = new Float64Array(12);
  for (var m = 33; m <= 84; m++) chroma[m % 12] += sal[m];
  var max = 0;
  for (var i = 0; i < 12; i++) if (chroma[i] > max) max = chroma[i];
  if (max > 0) for (var j = 0; j < 12; j++) chroma[j] /= max;
  return chroma;
}

function detectBass(sal) {
  // pitch-class profile of the low register, weighted toward lower pitches
  var prof = new Float64Array(12);
  for (var m = MIDI_LO; m <= 52; m++) {
    prof[m % 12] += sal[m] * (1 - (m - MIDI_LO) / 40);
  }
  var best = -1, bestV = 0, total = 0;
  for (var i = 0; i < 12; i++) {
    total += prof[i];
    if (prof[i] > bestV) { bestV = prof[i]; best = i; }
  }
  if (total <= 0 || bestV < total * 0.15) return -1;
  return best;
}

// ------------------------------------------------------- chord templates

var CHORD_TYPES = [
  { suffix: '',     name: 'major',          ints: [0, 4, 7],     prior: 1.00 },
  { suffix: 'm',    name: 'minor',          ints: [0, 3, 7],     prior: 1.00 },
  { suffix: '7',    name: 'dominant 7th',   ints: [0, 4, 7, 10], prior: 0.97 },
  { suffix: 'maj7', name: 'major 7th',      ints: [0, 4, 7, 11], prior: 0.97 },
  { suffix: 'm7',   name: 'minor 7th',      ints: [0, 3, 7, 10], prior: 0.97 },
  { suffix: 'sus2', name: 'suspended 2nd',  ints: [0, 2, 7],     prior: 0.95 },
  { suffix: 'sus4', name: 'suspended 4th',  ints: [0, 5, 7],     prior: 0.95 },
  { suffix: '6',    name: 'major 6th',      ints: [0, 4, 7, 9],  prior: 0.94 },
  { suffix: 'dim',  name: 'diminished',     ints: [0, 3, 6],     prior: 0.93 },
  { suffix: 'aug',  name: 'augmented',      ints: [0, 4, 8],     prior: 0.93 },
  { suffix: '5',    name: 'power chord',    ints: [0, 7],        prior: 0.92 }
];

function intervalWeight(iv) {
  if (iv === 0) return 1.0;             // root
  if (iv === 3 || iv === 4) return 0.9; // third: what makes it maj vs min
  if (iv === 6 || iv === 7 || iv === 8) return 0.75;
  return 0.85;
}

function cosine(a, b) {
  var dot = 0, na = 0, nb = 0;
  for (var i = 0; i < 12; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

function scoreChords(chroma) {
  var out = [];
  for (var root = 0; root < 12; root++) {
    for (var t = 0; t < CHORD_TYPES.length; t++) {
      var type = CHORD_TYPES[t];
      var tpl = new Float64Array(12);
      for (var i = 0; i < type.ints.length; i++) {
        var iv = type.ints[i];
        tpl[(root + iv) % 12] = intervalWeight(iv);
      }
      out.push({
        rootPc: root,
        suffix: type.suffix,
        typeName: type.name,
        label: NOTE_NAMES[root] + type.suffix,
        score: cosine(chroma, tpl) * type.prior
      });
    }
  }
  out.sort(function (a, b) { return b.score - a.score; });
  return out;
}

// --------------------------------------------------------- guitar voicings

var TUNING = [40, 45, 50, 55, 59, 64]; // E A D G B E (low to high), midi
var X = -1;

// base: frets low-to-high string, X = muted. rootPc: pitch class of the
// shape's root at fret 0. movable shapes slide up as barre chords.
var SHAPES = {
  '': [
    { base: [0, 2, 2, 1, 0, 0],  rootPc: 4, movable: true,  shape: 'E shape' },
    { base: [X, 0, 2, 2, 2, 0],  rootPc: 9, movable: true,  shape: 'A shape' },
    { base: [X, 3, 2, 0, 1, 0],  rootPc: 0, movable: false, shape: 'open C' },
    { base: [3, 2, 0, 0, 0, 3],  rootPc: 7, movable: false, shape: 'open G' },
    { base: [X, X, 0, 2, 3, 2],  rootPc: 2, movable: false, shape: 'open D' }
  ],
  'm': [
    { base: [0, 2, 2, 0, 0, 0],  rootPc: 4, movable: true,  shape: 'Em shape' },
    { base: [X, 0, 2, 2, 1, 0],  rootPc: 9, movable: true,  shape: 'Am shape' },
    { base: [X, X, 0, 2, 3, 1],  rootPc: 2, movable: false, shape: 'open Dm' }
  ],
  '7': [
    { base: [0, 2, 0, 1, 0, 0],  rootPc: 4, movable: true,  shape: 'E7 shape' },
    { base: [X, 0, 2, 0, 2, 0],  rootPc: 9, movable: true,  shape: 'A7 shape' },
    { base: [X, X, 0, 2, 1, 2],  rootPc: 2, movable: false, shape: 'open D7' },
    { base: [X, 3, 2, 3, 1, 0],  rootPc: 0, movable: false, shape: 'open C7' }
  ],
  'maj7': [
    { base: [X, 0, 2, 1, 2, 0],  rootPc: 9, movable: true,  shape: 'Amaj7 shape' },
    { base: [X, 3, 2, 0, 0, 0],  rootPc: 0, movable: false, shape: 'open Cmaj7' },
    { base: [X, X, 0, 2, 2, 2],  rootPc: 2, movable: false, shape: 'open Dmaj7' },
    { base: [X, X, 3, 2, 1, 0],  rootPc: 5, movable: false, shape: 'open Fmaj7' }
  ],
  'm7': [
    { base: [0, 2, 0, 0, 0, 0],  rootPc: 4, movable: true,  shape: 'Em7 shape' },
    { base: [X, 0, 2, 0, 1, 0],  rootPc: 9, movable: true,  shape: 'Am7 shape' },
    { base: [X, X, 0, 2, 1, 1],  rootPc: 2, movable: false, shape: 'open Dm7' }
  ],
  'sus2': [
    { base: [X, 0, 2, 2, 0, 0],  rootPc: 9, movable: true,  shape: 'Asus2 shape' },
    { base: [X, X, 0, 2, 3, 0],  rootPc: 2, movable: false, shape: 'open Dsus2' }
  ],
  'sus4': [
    { base: [0, 2, 2, 2, 0, 0],  rootPc: 4, movable: true,  shape: 'Esus4 shape' },
    { base: [X, 0, 2, 2, 3, 0],  rootPc: 9, movable: true,  shape: 'Asus4 shape' },
    { base: [X, X, 0, 2, 3, 3],  rootPc: 2, movable: false, shape: 'open Dsus4' }
  ],
  '6': [
    { base: [X, 0, 2, 2, 2, 2],  rootPc: 9, movable: true,  shape: 'A6 shape' }
  ],
  'dim': [
    { base: [X, X, 0, 1, 3, 1],  rootPc: 2, movable: true,  shape: 'Ddim shape' }
  ],
  'aug': [
    { base: [X, 0, 3, 2, 2, 1],  rootPc: 9, movable: true,  shape: 'Aaug shape' }
  ],
  '5': [
    { base: [0, 2, 2, X, X, X],  rootPc: 4, movable: true,  shape: 'E5 shape' },
    { base: [X, 0, 2, 2, X, X],  rootPc: 9, movable: true,  shape: 'A5 shape' }
  ]
};

function getVoicings(rootPc, suffix, sal, salMax, bassPc) {
  var shapes = SHAPES[suffix] || [];
  var out = [];
  for (var i = 0; i < shapes.length; i++) {
    var sh = shapes[i];
    var offset = (rootPc - sh.rootPc + 12) % 12;
    if (offset > 0 && !sh.movable) continue;
    var frets = [];
    var maxFret = 0;
    for (var s = 0; s < 6; s++) {
      var f = sh.base[s] === X ? X : sh.base[s] + offset;
      if (f > maxFret) maxFret = f;
      frets.push(f);
    }
    if (maxFret > 15) continue;

    var pitches = [];
    for (var s2 = 0; s2 < 6; s2++) {
      if (frets[s2] !== X) pitches.push(TUNING[s2] + frets[s2]);
    }
    // how well does the audio's pitch salience support these exact pitches?
    var support = 0;
    for (var p = 0; p < pitches.length; p++) {
      var m = pitches[p];
      if (m >= MIDI_LO && m <= MIDI_HI && salMax > 0) {
        support += sal[m] / salMax;
      }
    }
    var score = pitches.length ? support / pitches.length : 0;
    var lowestPc = pitches.length ? pitches[0] % 12 : -1;
    if (bassPc >= 0 && lowestPc === bassPc) score += 0.12;
    if (offset === 0) score += 0.04;
    out.push({
      frets: frets,
      shape: sh.shape,
      position: offset === 0 ? 'open position' : 'barre at fret ' + offset,
      baseFret: offset,
      score: Math.min(1, score)
    });
  }
  out.sort(function (a, b) { return b.score - a.score; });
  return out.slice(0, 3);
}

// ----------------------------------------------------------------- main

function analyze(samples, sampleRate) {
  var rms = 0;
  for (var i = 0; i < samples.length; i++) rms += samples[i] * samples[i];
  rms = Math.sqrt(rms / Math.max(1, samples.length));
  if (rms < 1e-4) {
    return { ok: false, reason: 'This slice is (almost) silent — select a louder part.' };
  }

  var spec = averageSpectrum(samples, sampleRate);
  var sal = computeSalience(spec, sampleRate);
  var salMax = 0;
  for (var m = MIDI_LO; m <= MIDI_HI; m++) if (sal[m] > salMax) salMax = sal[m];
  if (salMax <= 0) {
    return { ok: false, reason: 'No clear pitch content found in this slice.' };
  }

  var chroma = computeChroma(sal);
  var bassPc = detectBass(sal);
  var ranked = scoreChords(chroma);

  var candidates = [];
  for (var c = 0; c < ranked.length && candidates.length < 5; c++) {
    var cand = ranked[c];
    cand.voicings = getVoicings(cand.rootPc, cand.suffix, sal, salMax, bassPc);
    // slash-chord hint: bass note is a chord tone but not the root
    cand.slash = null;
    if (bassPc >= 0 && bassPc !== cand.rootPc) {
      var type = null;
      for (var t = 0; t < CHORD_TYPES.length; t++) {
        if (CHORD_TYPES[t].suffix === cand.suffix) { type = CHORD_TYPES[t]; break; }
      }
      for (var v = 0; v < type.ints.length; v++) {
        if ((cand.rootPc + type.ints[v]) % 12 === bassPc) {
          cand.slash = cand.label + '/' + NOTE_NAMES[bassPc];
          break;
        }
      }
    }
    candidates.push(cand);
  }

  return {
    ok: true,
    rms: rms,
    chroma: Array.prototype.slice.call(chroma),
    bassPc: bassPc,
    bassName: bassPc >= 0 ? NOTE_NAMES[bassPc] : null,
    candidates: candidates
  };
}

var WCIT = {
  analyze: analyze,
  NOTE_NAMES: NOTE_NAMES,
  TUNING: TUNING,
  midiToFreq: midiToFreq
};

if (typeof module !== 'undefined' && module.exports) module.exports = WCIT;
else global.WCIT = WCIT;

})(typeof window !== 'undefined' ? window : this);
