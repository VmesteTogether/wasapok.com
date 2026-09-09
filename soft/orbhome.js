'use strict';

/* ════════════════════════════════════════════════════════════════
   The way back to the index: the same distorted ASCII sphere the
   index draws, at corner size, in this tool's own hue.

   Markup lives in the page so the link works with this script
   blocked; all this does is animate the canvas inside it.
   ════════════════════════════════════════════════════════════════ */

(function () {
  const link = document.querySelector('.orb-home');
  if (!link) return;

  const canvas = link.querySelector('canvas');
  const ctx = canvas && canvas.getContext('2d');   // transparent: only the glyphs paint
  if (!ctx) return;

  const hue = link.dataset.hue || '#00FF9C';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RAMP = ' .:-=+*#%@';

  // four shades through the sphere, plus the tint it lifts into on hover
  const r0 = parseInt(hue.slice(1, 3), 16),
        g0 = parseInt(hue.slice(3, 5), 16),
        b0 = parseInt(hue.slice(5, 7), 16);
  const lift = c => Math.min(255, Math.round(c + (255 - c) * 0.55));
  const SHADES = [
    'rgba(' + r0 + ',' + g0 + ',' + b0 + ',0.26)',
    'rgba(' + r0 + ',' + g0 + ',' + b0 + ',0.52)',
    'rgba(' + r0 + ',' + g0 + ',' + b0 + ',0.80)',
    hue,
    'rgb(' + lift(r0) + ',' + lift(g0) + ',' + lift(b0) + ')'
  ];

  // `grow` chases `hot` a fraction at a time, so the sphere swells and settles
  // instead of snapping between two sizes
  let hot = false, grow = 0;
  const EASE = 0.085;              // ~350ms to settle at 30fps
  const wake = v => { hot = v; if (still) { grow = v ? 1 : 0; frame(4200); } };
  link.addEventListener('pointerenter', () => wake(true));
  link.addEventListener('pointerleave', () => wake(false));
  link.addEventListener('focus', () => wake(true));
  link.addEventListener('blur', () => wake(false));

  let W, H, dpr, cols, rows, charW, charH, chars, band;
  const rowBuf = [];

  function layout() {
    const box = link.getBoundingClientRect();
    W = Math.round(box.width); H = Math.round(box.height);
    if (W < 2 || H < 2) { requestAnimationFrame(layout); return; }

    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '700 7px "Space Mono", ui-monospace, monospace';
    ctx.textBaseline = 'top';

    charW = ctx.measureText('MMMMMMMMMM').width / 10;   // measured, not assumed
    charH = 7 * 0.98;
    cols = Math.max(8, Math.floor(W / charW));
    rows = Math.max(8, Math.floor(H / charH));
    chars = new Uint8Array(cols * rows);
    band = new Uint8Array(cols * rows);
  }

  function frame(t) {
    chars.fill(0); band.fill(0);

    grow += ((hot ? 1 : 0) - grow) * EASE;
    if (grow < 0.001) grow = 0;

    const aspect = charW / charH;
    const cx = cols / 2, cy = rows / 2;
    // radius, wobble and brightness all ride the same eased value
    const amp = 0.24 + 0.09 * grow;
    const r = Math.min(rows, cols * aspect) * (0.31 + 0.145 * grow);
    const reach = r * 1.42;

    for (let row = 0; row < rows; row++) {
      const dy = row - cy;
      for (let col = 0; col < cols; col++) {
        const dx = (col - cx) * aspect;
        const d = Math.hypot(dx, dy);
        if (d > reach) continue;

        const ang = Math.atan2(dy, dx);
        const rr = r * (1
          + amp * 0.55 * Math.sin(ang * 3 + t * 0.0017)
          + amp * 0.32 * Math.sin(ang * 5 - t * 0.0011)
          + amp * 0.20 * Math.sin(ang * 8 + t * 0.0023));

        const idx = row * cols + col;

        if (d > rr) {
          if (d < rr * 1.10 && !chars[idx]) { chars[idx] = 1; band[idx] = grow > 0.4 ? 1 : 0; }
          continue;
        }

        const nz = Math.sqrt(Math.max(0, 1 - (d / rr) * (d / rr)));
        const churn =
            0.42 * Math.sin(dx * 0.46 + t * 0.0026) * Math.sin(dy * 0.52 - t * 0.0019)
          + 0.30 * Math.sin((dx + dy) * 0.33 - t * 0.0015)
          + 0.22 * Math.sin(d * 1.15 - t * 0.0034);

        // the brightness lifts with `grow` too, so cells cross into the tint
        // band a few at a time rather than the whole sphere flipping at once
        let v = Math.pow(nz, 0.62) * (0.62 + 0.38 * churn) + 0.30 * nz * nz * nz
              + 0.17 * grow;
        v = Math.min(1, Math.max(0, v));
        if (v < 0.10) continue;

        chars[idx] = 1 + Math.min(RAMP.length - 2, (v * (RAMP.length - 1)) | 0);
        band[idx] = v > 0.88 ? 4 : v > 0.70 ? 3 : v > 0.46 ? 2 : v > 0.24 ? 1 : 0;
      }
    }

    ctx.clearRect(0, 0, W, H);
    for (let row = 0; row < rows; row++) {
      const base = row * cols;
      for (let b = 0; b < SHADES.length; b++) {
        rowBuf.length = 0;
        let any = false;
        for (let col = 0; col < cols; col++) {
          const c = chars[base + col];
          if (c && band[base + col] === b) { rowBuf.push(RAMP[c]); any = true; }
          else rowBuf.push(' ');
        }
        if (!any) continue;
        ctx.fillStyle = SHADES[b];
        ctx.fillText(rowBuf.join(''), 0, row * charH);
      }
    }
  }

  layout();
  addEventListener('resize', () => { layout(); if (still) frame(4200); }, { passive: true });

  if (document.fonts) document.fonts.ready.then(() => { layout(); if (still) frame(4200); });

  if (still) {
    frame(4200);
  } else {
    let last = 0;
    (function loop(t) {
      requestAnimationFrame(loop);
      if (t - last < 33) return;      // 30fps, matching the index
      last = t;
      if (chars) frame(t);
    })(0);
  }
})();
