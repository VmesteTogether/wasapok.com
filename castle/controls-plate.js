// Wireframe control plate (VISUAL ONLY). A tilted, transparent wireframe console
// holding the d-pad with the two diagonal look-up buttons ATOP it; the RUN button
// stays off the plate, in its original right-side spot. Grey at rest, amber when
// lit. Pure CSS + a backdrop element — no DOM is moved/removed, so each room's
// input + show/hide logic keeps working.
(function () {
  if (!document.getElementById('dpad-up')) return;
  const css = `
    #cp-plate {
      position: fixed; bottom: 10px; left: 50%;
      width: 226px; height: 252px; z-index: 13; pointer-events: none;
      transform: translateX(-50%) perspective(600px) rotateX(35deg);
      background:
        repeating-linear-gradient(0deg,  rgba(185,193,203,0.10) 0 1px, transparent 1px 26px),
        repeating-linear-gradient(90deg, rgba(185,193,203,0.10) 0 1px, transparent 1px 26px),
        rgba(8,10,14,0.18);
      border: 1.5px solid rgba(185,193,203,0.6);
      box-shadow: 0 0 9px rgba(170,180,195,0.30), inset 0 0 12px rgba(170,180,195,0.10);
    }
    /* inner wireframe frame line */
    #cp-plate::before { content:''; position:absolute; inset:6px;
      border: 1px solid rgba(185,193,203,0.25); pointer-events:none; }

    /* layout: d-pad centered, look buttons atop it (RUN untouched); tilted away from FOV */
    #nav-wrapper { bottom: 16px !important; }
    #nav-cross   { transform: rotateX(35deg) !important; gap: 4px !important; }
    #nav-glow    { display: none !important; }
    #look-pad    { bottom: 210px !important; left: 50% !important; transform: translateX(-50%) perspective(450px) rotateX(35deg) !important; gap: 112px !important; }

    /* directional sockets — orange at rest, flaring hologram-blue on hover/press */
    .nav-arrow {
      border-radius: 0 !important; filter: none !important;
      background: rgba(255,150,40,0.05) !important;
      border: 1.5px solid rgba(255,160,55,0.6) !important;
      box-shadow: 0 0 6px rgba(255,140,30,0.20), inset 0 0 6px rgba(255,140,30,0.08) !important;
    }
    .nav-arrow svg { fill: rgba(255,185,90,0.9) !important; }
    .nav-arrow:hover, .nav-arrow:active, .nav-arrow.active {
      transform: none !important; background: rgba(255,170,60,0.16) !important;
      border-color: #ffd27a !important;
      box-shadow: 0 0 15px rgba(255,170,50,0.7), inset 0 0 10px rgba(255,170,50,0.3) !important;
    }
    .nav-arrow:hover svg, .nav-arrow:active svg, .nav-arrow.active svg { fill: #ffe6b0 !important; }

    .look-arrow {
      width: 40px !important; height: 40px !important; border-radius: 0 !important;
      filter: none !important; position: relative;
      background: rgba(185,193,203,0.05) !important;
      border: 1.5px solid rgba(185,193,203,0.55) !important;
      box-shadow: 0 0 6px rgba(170,180,195,0.20), inset 0 0 6px rgba(170,180,195,0.08) !important;
    }
    .look-arrow::before { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: rgba(200,208,218,0.85); font-size: 17px; }
    #dpad-upright::before { content: '\\25E4'; } /* left in DOM -> up-left glyph */
    #dpad-upleft::before  { content: '\\25E5'; } /* right in DOM -> up-right glyph */
    .look-arrow:hover, .look-arrow:active, .look-arrow.active {
      transform: none !important; background: rgba(80,190,255,0.16) !important;
      border-color: #7fdcff !important;
      box-shadow: 0 0 16px rgba(80,190,255,0.75), inset 0 0 10px rgba(80,190,255,0.3) !important;
    }
    .look-arrow:hover::before, .look-arrow:active::before, .look-arrow.active::before { color: #bfeaff; }

    /* center interact button — grey at rest, glows orange on hover/press */
    #nav-center { display: flex !important; align-items: center; justify-content: center; }
    #nav-interact {
      width: 50px; height: 50px; padding: 0; border-radius: 50%; position: relative;
      border: 1.5px solid rgba(185,193,203,0.6);
      background: rgba(185,193,203,0.06);
      box-shadow: 0 0 6px rgba(170,180,195,0.20), inset 0 0 7px rgba(170,180,195,0.08);
      cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent; touch-action: none;
      transition: box-shadow 80ms, border-color 80ms, background 80ms;
    }
    #nav-interact::before { content:''; position:absolute; inset:0; margin:auto; width:12px; height:12px;
      border-radius:50%; background: rgba(200,208,218,0.85); transition: background 80ms; }
    /* armed: something nearby is interactable — faint orange glow */
    #nav-interact.armed {
      border-color: rgba(255,170,60,0.55);
      background: rgba(255,150,40,0.08);
      box-shadow: 0 0 9px rgba(255,150,40,0.32), inset 0 0 7px rgba(255,150,40,0.13);
    }
    #nav-interact.armed::before { background: rgba(255,200,120,0.85); }
    #nav-interact:hover, #nav-interact:active, #nav-interact.active {
      background: rgba(255,150,40,0.16); border-color: #ffb43a;
      box-shadow: 0 0 15px rgba(255,150,40,0.75), inset 0 0 10px rgba(255,150,40,0.3);
    }
    #nav-interact:hover::before, #nav-interact:active::before, #nav-interact.active::before { background: #ffd27a; }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const plate = document.createElement('div'); plate.id = 'cp-plate'; document.body.appendChild(plate);

  const center = document.getElementById('nav-center');
  if (center && !document.getElementById('nav-interact')) {
    const b = document.createElement('button');
    b.id = 'nav-interact'; b.type = 'button'; b.setAttribute('aria-label', 'Interact');
    center.appendChild(b);
  }
})();
