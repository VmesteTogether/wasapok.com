import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// 6×4 maple-frame bookshelf cubby grid, head-on static view. Same pixelated
// wood-tile + recessed-cubby-box construction as castle/hallway2/scene.js
// shelfWalls (Wasapok room). Each cubby is its own Group, addressable two
// ways via window.cubbies:
//   - window.cubbies[row][col]      // row 0 = top, col 0 = left
//   - window.cubbies.A1 .. .D6      // letters A–D row from BOTTOM up,
//                                   //   numbers 1–6 col from LEFT to right
// e.g. A1 = bottom-left, D6 = top-right. Child meshes added to a cubby sit
// inside its local frame (origin at front-center of opening, +x right,
// +y up, -z into the wall).

const PIXELATION = 3;
const COLS = 6, ROWS = 4;
const TILE_W = 2, TILE_H = 2;
const GRID_W = COLS * TILE_W;
const GRID_H = ROWS * TILE_H;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.setClearColor(0x1a1410, 1);
renderer.localClippingEnabled = true;     // each merged-cubby material gets world-space clip planes to its own footprint so the hallway's sky/ground can't bleed into adjacent cubby openings

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1410);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 0, 20);
camera.lookAt(0, 0, 0);

// Painting focus state: clicking a wall painting zooms the camera in to view
// it head-on; clicking anywhere returns. updatePan() lerps the camera toward
// the focus target (and eases the fisheye to 0) when focusPainting is set.
let focusPainting = null;        // the painting pic mesh currently zoomed, or null
let camRestZ = 20;               // resting camera z (set by onResize); focus overrides it
let camLookX = 0, camLookY = 0;  // lerped lookAt point so the turn-to-art is smooth

// Lighting for future user-added shaded meshes (MeshStandardMaterial,
// MeshToonMaterial, etc.). Cubby walls themselves use MeshBasicMaterial
// with vertex colors and aren't affected. Three lights mimic the
// pixel-art shading convention: soft ambient base, key from front-upper-left,
// faint warm bottom-fill to echo the lit bottom plank of each cubby.
// Trophy Gallery lighting — warmer amber ambient, soft directional key,
// gentle bottom fill from the carpet, plus an off-screen-right lamp glow
// pooling onto the metallic objects (diamond / manifold / turntable).
// Only standard-material objects pick up the lamp; the bookshelf wall is
// MeshBasic so its tone is baked in.
scene.add(new THREE.AmbientLight(0xffd6a0, 0.95));
const key = new THREE.DirectionalLight(0xfff0c8, 0.85);
key.position.set(-6, 8, 10);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffc488, 0.20);
fill.position.set(0, -6, 6);
scene.add(fill);
const lamp = new THREE.PointLight(0xffb060, 1.8, 22, 1.5);
lamp.position.set(10, 2, 3);
scene.add(lamp);

// Enclosing room: floor / ceiling / side walls extend toward the camera so the
// cubby case reads as the back wall of a room.
const roomMat = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
const RD = 16, RW = GRID_W * 1.9;          // RW: widened room so the side walls stay in frame when zoomed in
const mkRoom = (w, h, rx, ry, px, py, pz) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), roomMat);
  m.rotation.set(rx, ry, 0); m.position.set(px, py, pz); scene.add(m);
};
mkRoom(RW, RD, -Math.PI / 2, 0, 0, -GRID_H / 2, RD / 2);   // floor
mkRoom(RW, RD,  Math.PI / 2, 0, 0,  GRID_H / 2, RD / 2);   // ceiling
mkRoom(RD, GRID_H, 0,  Math.PI / 2, -RW / 2, 0, RD / 2);   // left wall
mkRoom(RD, GRID_H, 0, -Math.PI / 2,  RW / 2, 0, RD / 2);   // right wall

// === Fisheye post-processing. The scene renders into a target, then a
// barrel/lens-distortion shader on a fullscreen quad warps it so the room
// bulges. The target is tagged sRGB and the background is fed as raw display
// values, so the warp is a pure passthrough — colors/lighting are unchanged,
// only the geometry bulges. Revert: set FISHEYE_STRENGTH = 0, or delete this
// block + the two-pass render and restore a plain pointerNDC + render.
const FISHEYE_STRENGTH = 0.26;             // 0 = off; higher = more bulge (lowered so the warp's background frame is thin and the room reaches the screen edges)
const COLOR_SAT = .92;                     // global saturation multiplier (1 = unchanged)
const COLOR_VAL = 1.00;                     // global value/brightness multiplier (1 = unchanged)
const COVER_SAT = 0.65;                     // album-cover ART ONLY: extra saturation multiplier baked into the cover material (1 = unchanged, 0 = greyscale); applied before the global grade
const PAINTING_HAZE = 0.32;                 // wall-painting ART ONLY: atmospheric veil toward the room's dark air (0 = none); pushes the paintings "further back" than the cubbies
const fisheyeRT = new THREE.WebGLRenderTarget(2, 2, {
  magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter,
});
fisheyeRT.texture.colorSpace = THREE.SRGBColorSpace;   // store display-ready pixels → no color shift on passthrough
const fisheyeScene = new THREE.Scene();
const fisheyeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fisheyeMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse:  { value: fisheyeRT.texture },
    uStrength: { value: FISHEYE_STRENGTH },
    uAspect:   { value: 1 },
    uBg:       { value: new THREE.Vector3(0x1a / 255, 0x14 / 255, 0x10 / 255) },  // raw sRGB of the clear color
    uSat:      { value: COLOR_SAT },
    uVal:      { value: COLOR_VAL },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uAspect;
    uniform float uSat;
    uniform float uVal;
    uniform vec3  uBg;
    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    void main() {
      vec2 c  = vUv - 0.5;
      vec2 ca = vec2(c.x * uAspect, c.y);     // aspect-correct so the bulge stays round
      float warp = 1.0 + uStrength * dot(ca, ca);
      vec2 src = 0.5 + c * warp;
      vec3 col = (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0)
        ? uBg                                 // outside the source → background
        : texture2D(tDiffuse, src).rgb;
      vec3 hsv = rgb2hsv(col);                // turn up saturation + value across the whole scene
      hsv.y = clamp(hsv.y * uSat, 0.0, 1.0);
      hsv.z = clamp(hsv.z * uVal, 0.0, 1.0);
      vec3 outc = hsv2rgb(hsv);
      // natural daylight: brighter + warm from the upper-left "window", cooler low
      float key = 0.9 + 0.22 * clamp((1.0 - vUv.x) * 0.5 + vUv.y * 0.7, 0.0, 1.0);
      outc *= key * mix(vec3(0.95, 0.98, 1.05), vec3(1.06, 1.02, 0.9), vUv.y);
      float vig = smoothstep(0.98, 0.62, length(vUv - 0.5));   // room fills to the screen edges; only the far corners fall off
      outc = mix(uBg, outc, vig);
      gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
    }
  `,
  depthTest: false, depthWrite: false,
});
fisheyeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fisheyeMat));

// Map a pointer (clientX/Y) to the NDC of the scene content actually shown
// under it — apply the SAME lens warp the shader uses, so clicks, drags, hover
// and the doorway hit-test line up with the warped image. Strength 0 → plain.
const _pndc = new THREE.Vector2();
function pointerNDC(clientX, clientY, out = _pndc) {
  const cx = clientX / window.innerWidth  - 0.5;
  const cy = (1 - clientY / window.innerHeight) - 0.5;     // y-up, matches the shader's vUv
  const ax = cx * fisheyeMat.uniforms.uAspect.value;
  const warp = 1 + fisheyeMat.uniforms.uStrength.value * (ax * ax + cy * cy);
  out.x = (0.5 + cx * warp) * 2 - 1;
  out.y = (0.5 + cy * warp) * 2 - 1;
  return out;
}

// --- Procedural maple bookshelf wall: wood frame only (top/bottom planks +
// side dividers), cubby interiors alpha=0 so the recessed-box geometry
// behind shows through. Drawn at full grid resolution into one canvas (not
// a repeated tile) so the divider between A5 and B5 can be selectively
// omitted — those two cells merge into one tall doorway opening onto the
// outside scene.
const TPX = 256, PLANK = 22, SIDE = 8;
const top = PLANK, bottom = TPX - PLANK;
const left = SIDE, right = TPX - SIDE;

// Merged-cubby spec — each entry defines a rectangular block of grid cells
// that share one combined opening (inner plank/side dividers removed). The
// top-left cell of each block is the "anchor": all cells in the block alias
// the same THREE.Group, so cubbies.A5 === cubbies.B5, etc. Row indexing has
// row 0 = top, ROWS-1 = bottom; col 0 = left.
// omitBack=true leaves the back panel off (used by the A5+B5 doorway so
// the outside scene shows through).
const MERGES = [
  { rowMin: 2, rowMax: 3, colMin: 4, colMax: 4, omitBack: true  },  // A5+B5 doorway
  { rowMin: 0, rowMax: 1, colMin: 3, colMax: 4, omitBack: false },  // C4+C5+D4+D5 square
  { rowMin: 2, rowMax: 3, colMin: 0, colMax: 0, omitBack: false },  // A1+B1 merged
];
function mergeAt(r, c) {
  for (const m of MERGES) {
    if (r >= m.rowMin && r <= m.rowMax && c >= m.colMin && c <= m.colMax) return m;
  }
  return null;
}
const isMergeAnchor    = (r, c) => { const m = mergeAt(r, c); return !!m && r === m.rowMin && c === m.colMin; };
const isMergeNonAnchor = (r, c) => { const m = mergeAt(r, c); return !!m && !(r === m.rowMin && c === m.colMin); };

const WALL_PX_W = COLS * TPX;
const WALL_PX_H = ROWS * TPX;
const tc = document.createElement('canvas');
tc.width = WALL_PX_W; tc.height = WALL_PX_H;
const tx = tc.getContext('2d');
tx.imageSmoothingEnabled = false;

// Cut openings via an evenodd clip, then fill the remaining wood frame.
// Each MERGES entry contributes one rectangle spanning all its rows × cols
// (inner dividers consumed); non-anchor merge cells are skipped so the
// dividers between them aren't recut as separate holes.
tx.save();
tx.beginPath();
tx.rect(0, 0, WALL_PX_W, WALL_PX_H);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (isMergeNonAnchor(r, c)) continue;
    const m = mergeAt(r, c);
    const rMin = m ? m.rowMin : r, rMax = m ? m.rowMax : r;
    const cMin = m ? m.colMin : c, cMax = m ? m.colMax : c;
    const x0 = cMin * TPX + SIDE;
    const y0 = rMin * TPX + PLANK;
    const x1 = (cMax + 1) * TPX - SIDE;
    const y1 = (rMax + 1) * TPX - PLANK;
    tx.rect(x0, y0, x1 - x0, y1 - y0);
  }
}
tx.clip('evenodd');
tx.fillStyle = '#d2a574';
tx.fillRect(0, 0, WALL_PX_W, WALL_PX_H);
// Wood grain — scaled to the full canvas area so density matches the
// original per-tile look.
for (let i = 0; i < 28 * ROWS * COLS; i++) {
  const gy = Math.random() * WALL_PX_H;
  const rr = 125 + (Math.random() * 35 | 0);
  const gg =  82 + (Math.random() * 22 | 0);
  const bb =  42 + (Math.random() * 22 | 0);
  tx.strokeStyle = `rgba(${rr},${gg},${bb},0.22)`;
  tx.lineWidth = 1;
  tx.beginPath();
  tx.moveTo(0, gy);
  tx.lineTo(WALL_PX_W, gy + (Math.random() - 0.5) * 5);
  tx.stroke();
}
tx.restore();
// Per-tile plank highlights (light top edge, dark bottom edge). Skip
// edges that fall inside a merged region (i.e., a same-merge cell is
// directly above for the top edge, or directly below for the bottom edge).
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const ox = c * TPX, oy = r * TPX;
    const m = mergeAt(r, c);
    const topInsideMerge = m && r > m.rowMin;
    const botInsideMerge = m && r < m.rowMax;
    if (!topInsideMerge) {
      tx.fillStyle = 'rgba(255,232,188,0.35)';
      tx.fillRect(ox, oy, TPX, 2);
    }
    if (!botInsideMerge) {
      tx.fillStyle = 'rgba(30,15,5,0.65)';
      tx.fillRect(ox, oy + TPX - 3, TPX, 3);
    }
  }
}

const shelfTex = new THREE.CanvasTexture(tc);
shelfTex.magFilter = THREE.NearestFilter;
shelfTex.minFilter = THREE.NearestFilter;
shelfTex.needsUpdate = true;

const wallMat = new THREE.MeshBasicMaterial({
  map: shelfTex, alphaTest: 0.5, side: THREE.FrontSide, transparent: true,
});
const wall = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W, GRID_H), wallMat);
scene.add(wall);

// Trophy Gallery room context — dark mahogany wood paneling on three
// sides + plush burgundy carpet below, framing the bookshelf as if it's
// mounted on the wall of a quiet, warm den. Sits just behind the wall
// plane (z = -0.01) and writes depth, occluding the outside scene
// everywhere except through the hallway opening. A brass-warm baseboard
// trim sits at the bookshelf/carpet seam for that "real room" detail.
{
  const M = 60;
  const wallMat2 = new THREE.MeshBasicMaterial({ color: 0x281208 });   // dark mahogany
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x4a1418 });   // deep burgundy carpet
  const trimMat  = new THREE.MeshBasicMaterial({ color: 0x5a3a1a });   // warm wood baseboard
  const add = (mat, w, h, x, y, z = -0.01) => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    q.position.set(x, y, z);
    scene.add(q);
  };
  add(wallMat2, M * 2, M,    0,  (GRID_H + M) / 2);                    // wall above
  add(floorMat, M * 2, M,    0, -(GRID_H + M) / 2);                    // carpet below
  add(wallMat2, M, GRID_H, -(GRID_W + M) / 2, 0);                      // left wall
  add(wallMat2, M, GRID_H,  (GRID_W + M) / 2, 0);                      // right wall
  add(trimMat,  GRID_W + 2, 0.3, 0, -GRID_H / 2 - 0.15, -0.005);       // baseboard
}

// --- Framed paintings hung on the mahogany wall flanking the cubby grid (grid
// spans x ±6, y ±4). Deliberately SMALLER than the album covers and built as
// gallery frames (dark frame + cream mat + image) so they read as wall art,
// not vinyls. Each pic is auto-sized to its own aspect at a fixed height H.
// Clicking a pic sets focusPainting → the camera zooms in head-on (updatePan);
// clicking anywhere returns. Move/resize via the hang(file, x, y, H) calls.
const paintingMeshes = [];
{
  const artLoader = new THREE.TextureLoader();
  const hang = (file, x, y, h) => {
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x171310 }));  // dark gallery frame
    const mat   = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xe9e2d0 }));  // cream mat border
    const pic   = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    const place = (w) => {                       // size frame/mat/pic around a w×h image
      frame.scale.set(w + 0.30, h + 0.30, 1);
      mat.scale.set(w + 0.14, h + 0.14, 1);
      pic.scale.set(w, h, 1);
    };
    place(h);                                    // square until the image loads
    frame.position.set(x, y, 0.020);
    mat.position.set(x, y, 0.025);
    pic.position.set(x, y, 0.030);
    pic.material.map = artLoader.load(file, (t) => {
      place(h * (t.image.width / t.image.height));   // honor the image's aspect ratio
      pic.material.needsUpdate = true;
    });
    pic.material.map.colorSpace = THREE.SRGBColorSpace;
    // Atmospheric recession (haze veil): after the texel is sampled, desaturate
    // slightly and mix toward the room's dark warm air, DENSER toward the top of
    // the frame (vMapUv.y→1), so the painting reads as set back in dimmer space
    // behind the cubbies. Linear-space fog color ≈ surround #1a1410. The strength
    // is a uniform so updatePan can ease it to 0 on the focused painting — haze
    // clears as you "step up" to view the art (see paintingMeshes loop).
    pic.material.userData.haze = { value: PAINTING_HAZE };
    pic.material.onBeforeCompile = (shader) => {
      shader.uniforms.uHaze = pic.material.userData.haze;
      shader.fragmentShader = 'uniform float uHaze;\n' + shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         {
           float _luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
           diffuseColor.rgb = mix(vec3(_luma), diffuseColor.rgb, mix(1.0, 0.85, uHaze / max(${PAINTING_HAZE.toFixed(3)}, 1e-4)));  // desaturate, scaled by haze
           float _haze = uHaze * mix(0.70, 1.0, clamp(vMapUv.y, 0.0, 1.0));
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.011, 0.006, 0.004), _haze);  // veil toward dark warm air
         }`,
      );
    };
    pic.userData.kind = 'painting';
    paintingMeshes.push(pic);
    scene.add(frame, mat, pic);
  };
  hang('paintings/photo1.png', 7.6,  1.4, 2.4);    // RIGHT column: photo1 above photo2
  hang('paintings/photo2.png', 7.6, -1.4, 2.4);
}

let updateSky = null;   // window cityscape ships/explosions; assigned in the window block
// --- Left-wall WINDOW (where the left paintings were): a tall vertical opening
// with a sky backdrop + `windowView`, an addressable Group in front of it that's
// clipped to the opening. Put anything here — cityscape, flying objects, etc.:
//   windowView.add(myMesh);            // mesh material: set clippingPlanes: windowView.userData.clip
// Also exposed as window.windowView for live console tinkering.
const WIN_X = -7.6, WIN_W = 2.8, WIN_H = 7.0, WIN_CY = 1.0;   // centre y; stretches upward
{
  // Daytime Mute City backdrop (vivid blue zenith → sky blue → pale horizon).
  const sc = document.createElement('canvas'); sc.width = 4; sc.height = 256;
  const x2 = sc.getContext('2d');
  const sg = x2.createLinearGradient(0, 0, 0, 256);
  sg.addColorStop(0, '#c7dfef'); sg.addColorStop(0.12, '#c7dfef'); sg.addColorStop(0.16, '#aecadf'); sg.addColorStop(0.58, '#aecadf'); sg.addColorStop(0.62, '#cfe6f4'); sg.addColorStop(1, '#cfe6f4');
  x2.fillStyle = sg; x2.fillRect(0, 0, 4, 256);
  const skyT = new THREE.CanvasTexture(sc); skyT.colorSpace = THREE.SRGBColorSpace;

  // World-space clip planes bounding the opening, so windowView content stays inside.
  const clip = [
    new THREE.Plane(new THREE.Vector3( 1, 0, 0), -(WIN_X - WIN_W / 2)),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0),  (WIN_X + WIN_W / 2)),
    new THREE.Plane(new THREE.Vector3( 0, 1, 0), -(WIN_CY - WIN_H / 2)),
    new THREE.Plane(new THREE.Vector3( 0,-1, 0),  (WIN_CY + WIN_H / 2)),
  ];

  const frame = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W + 0.3, WIN_H + 0.3), new THREE.MeshBasicMaterial({ color: 0x171310 }));
  frame.position.set(WIN_X, WIN_CY, 0.015);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W, WIN_H), new THREE.MeshBasicMaterial({ map: skyT }));
  back.position.set(WIN_X, WIN_CY, 0.020);
  const skyEdge = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W + 0.06, WIN_H + 0.06), new THREE.MeshBasicMaterial({ color: 0xb0b4ba }));   // thin grey border (ledge colour) around the sky
  skyEdge.position.set(WIN_X, WIN_CY, 0.019);
  scene.add(frame, skyEdge, back);

  const windowView = new THREE.Group();
  windowView.position.set(WIN_X, WIN_CY, 0.05);   // children are placed relative to the window centre
  windowView.userData.clip = clip;
  scene.add(windowView);
  window.windowView = windowView;

  // Brushed-steel skyscrapers (eskleo-city aesthetic): 3D boxes with faked
  // daylight face-shading (sky-lit top, mid front, shadowed sides) so they read
  // with real perspective off-axis, each capped by a narrower setback "crown"
  // for the tip-top motif. Clipped to the opening; farther towers fade to sky.
  const BLD_BOT = -4;                  // base sits below the window → clipped off (no ground)
  const SKY = [0.62, 0.84, 0.93];      // haze tint pulled toward with distance
  // Per-building window grid: panes with random brightness (lit/unlit hint) over
  // a dark mullion base. cols/rows derive from each tower's size, so layouts differ.
  const winTex = (cols, rows) => {
    const c = document.createElement('canvas'); c.width = cols * 8; c.height = rows * 8;
    const g = c.getContext('2d');
    g.fillStyle = '#70747a'; g.fillRect(0, 0, c.width, c.height);     // mullion grid
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const v = Math.round((0.6 + Math.random() * 0.4) * 255);
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(i * 8 + 1, j * 8 + 1, 6, 6);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    return t;
  };
  const faceMats = (far, sv, w, h) => {
    const col = (rgb) => new THREE.Color(...rgb.map((v, i) => v + (SKY[i] - v) * far * 0.7));
    const map = winTex(Math.max(3, Math.round(w * 8)), Math.max(7, Math.round(h * 4)));   // sv = silver base vs sky-tinted chrome
    const top  = new THREE.MeshBasicMaterial({ color: col(sv ? [0.86, 0.87, 0.89] : [0.82, 0.91, 0.97]), clippingPlanes: clip });
    const win  = (rgb) => new THREE.MeshBasicMaterial({ color: col(rgb), map, clippingPlanes: clip });
    const front = win(sv ? [0.70, 0.71, 0.74] : [0.72, 0.83, 0.91]);
    const side  = win(sv ? [0.55, 0.56, 0.60] : [0.62, 0.75, 0.85]);
    return [side, side, top, side, front, front];   // box faces: +x -x +y -y +z -z
  };
  const towers = [   // [x, width, depth, topY, far(0 near…1 far), silver]
    [-1.05, 0.70, 0.55, -0.2, 0.18, 0],
    [-0.45, 0.50, 0.40,  0.7, 0.06, 1],
    [ 0.15, 0.85, 0.65,  0.1, 0.00, 0],
    [ 0.78, 0.58, 0.45,  1.0, 0.12, 1],
    [ 1.22, 0.48, 0.38,  0.4, 0.28, 0],
  ];
  const tops = [];      // tower-top points for the antennas
  towers.forEach(([x, w, d, top, far, sv], i) => {
    const z = d / 2 + i * 0.004, h = top - BLD_BOT;     // back near the wall, slight stagger
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), faceMats(far, sv, w, h));
    body.position.set(x, (top + BLD_BOT) / 2, z);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.16, d * 0.55), faceMats(far, sv, w * 0.55, 0.16));
    crown.position.set(x, top + 0.08, z);
    windowView.add(body, crown);
    tops.push([x, top + 0.16, z, top]);            // sit the antenna on the crown (+ tower height)
  });

  // Red antennas on each tower top (wasantenna-01.glb): scaled to a short mast,
  // recoloured red, base seated on the crown, clipped to the window opening.
  new GLTFLoader().load('wasantenna-01.glb', (gltf) => {
    const src = gltf.scene, b = new THREE.Box3().setFromObject(src);
    const s = 0.6 / Math.max(0.001, b.max.y - b.min.y);
    const red = new THREE.MeshBasicMaterial({ color: 0xbe2839, clippingPlanes: clip });   // cherry red
    const deep = new THREE.MeshBasicMaterial({ color: 0x9e1f2f, clippingPlanes: clip });     // deeper cherry (tallest two)
    const silver = new THREE.MeshBasicMaterial({ color: 0xd6dade, clippingPlanes: clip });   // brightish silver shaft
    for (const [x, y, z, th] of tops) {
      const a = src.clone(true);
      a.scale.setScalar(s);
      const r = th >= 0.65 ? deep : red;
      a.traverse((o) => { if (o.isMesh) o.material = /cylinder/i.test(o.name) ? silver : r; });
      a.position.set(x, y - b.min.y * s, z);
      windowView.add(a);
    }
  });

  // #2 Glass sheen — a faint diagonal streak over the opening, in front of the
  // city, so it reads as reflective glass rather than an open hole.
  const shc = document.createElement('canvas'); shc.width = 64; shc.height = 128;
  const sx = shc.getContext('2d');
  const sgr = sx.createLinearGradient(0, 128, 64, 0);
  const O = 'rgba(255,255,255,0)';
  sgr.addColorStop(0.30, O); sgr.addColorStop(0.33, 'rgba(255,255,255,0.30)'); sgr.addColorStop(0.36, O);   // thin streak
  sgr.addColorStop(0.46, O); sgr.addColorStop(0.51, 'rgba(255,255,255,0.34)'); sgr.addColorStop(0.57, O);   // thick streak
  sgr.addColorStop(0.65, O); sgr.addColorStop(0.67, 'rgba(255,255,255,0.22)'); sgr.addColorStop(0.69, O);   // thinnest streak
  sx.fillStyle = sgr; sx.fillRect(0, 0, 64, 128);
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W, WIN_H),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shc), transparent: true, depthWrite: false, clippingPlanes: clip }));
  sheen.position.set(WIN_X, WIN_CY, 0.85);

  // #3 Frame depth — a lighter inner reveal step + a protruding sill at the base.
  const reveal = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W + 0.14, WIN_H + 0.14), new THREE.MeshBasicMaterial({ color: 0x3a3026 }));
  reveal.position.set(WIN_X, WIN_CY, 0.017);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(WIN_W + 0.26, 0.16, 0.22), new THREE.MeshBasicMaterial({ color: 0xb0b4ba }));
  sill.position.set(WIN_X, WIN_CY - WIN_H / 2 - 0.02, 0.10);
  // Whitish haze the tower bases descend into (kills the "diorama on a shelf"
  // read) — transparent up top, opaque pale near the bottom, in front of the
  // city but behind the glass sheen.
  const hzc = document.createElement('canvas'); hzc.width = 4; hzc.height = 128;
  const hx = hzc.getContext('2d');
  const hg = hx.createLinearGradient(0, 0, 0, 128);
  hg.addColorStop(0, 'rgba(223,234,242,0)'); hg.addColorStop(0.5, 'rgba(223,234,242,0)'); hg.addColorStop(1, 'rgba(223,234,242,0.95)');
  hx.fillStyle = hg; hx.fillRect(0, 0, 4, 128);
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W, WIN_H),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hzc), transparent: true, depthWrite: false, clippingPlanes: clip }));
  haze.position.set(WIN_X, WIN_CY, 0.78);
  scene.add(reveal, haze, sheen, sill);

  // Little ships fly across; one occasionally bursts into an orange cloud + black
  // ash. Very simple first pass — windowView-local, clipped to the opening.
  const ships = [], EDGE = WIN_W / 2 + 0.6;
  for (let k = 0; k < 7; k++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xeef2f6, clippingPlanes: clip }));
    if (k >= 5) {   // faster diagonals: top-right → bottom-left
      s.position.set(EDGE, 2.4 + Math.random() * 1.1, 0.7);
      s.userData.vx = -(0.020 + Math.random() * 0.012); s.userData.vy = -(0.006 + Math.random() * 0.004);
      s.rotation.z = Math.atan2(s.userData.vy, s.userData.vx);
    } else {        // horizontal: left → right
      s.position.set(-EDGE, 0.6 + Math.random() * 2.4, 0.7);
      s.userData.vx = 0.008 + Math.random() * 0.006; s.userData.vy = 0;
    }
    windowView.add(s); ships.push(s);
  }
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, clippingPlanes: clip }));
  const ash  = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, clippingPlanes: clip }));
  puff.visible = ash.visible = false; windowView.add(puff, ash);
  const boom = { life: 0, timer: 5 };
  updateSky = () => {
    for (const s of ships) {
      s.position.x += s.userData.vx; s.position.y += s.userData.vy;
      if (s.userData.vx > 0) { if (s.position.x > EDGE) s.position.x = -EDGE; }                       // horizontal wrap
      else if (s.position.x < -EDGE || s.position.y < -WIN_H / 2 - 0.3) s.position.set(EDGE, 2.4 + Math.random() * 1.1, 0.7);   // diagonal → respawn top-right
    }
    if (boom.life > 0) {
      boom.life -= 0.03; const k = 1 - boom.life;
      puff.scale.setScalar(0.5 + k * 1.6); puff.material.opacity = 1 - k;
      ash.scale.setScalar(0.5 + k * 2.2);  ash.material.opacity = (1 - k) * 0.8;
      if (boom.life <= 0) puff.visible = ash.visible = false;
    } else if ((boom.timer -= 0.03) <= 0) {
      const s = ships[Math.floor(Math.random() * ships.length)];
      puff.position.copy(s.position); ash.position.copy(s.position);
      puff.visible = ash.visible = true; boom.life = 1;
      s.position.x = -EDGE; boom.timer = 4 + Math.random() * 6;
    }
  };
}

// --- Recessed cubby box: 5 inward-facing panels (back + top + bottom + 2
// sides, no front). Vertex colors fake painted shading — dark back, lit
// bottom plank where things would sit. Brighter than the castle's dungeon
// shading because this scene has no fog/atmosphere to wade through.
const CUBBY_W = TILE_W * (right - left) / TPX;       // ~1.875m opening
const CUBBY_H = TILE_H * (bottom - top) / TPX;       // ~1.656m opening
const CUBBY_D = 0.7;                                 // depth into the wall
const FRONT_INSET = 0.006;                           // recess opening behind wall plane to dodge z-fighting
// Inner-divider widths (in world units) that get absorbed when cells merge.
const INNER_SIDE_W  = 2 * TILE_W * SIDE  / TPX;   // ~0.125m horizontal divider between adjacent cells
const INNER_PLANK_H = 2 * TILE_H * PLANK / TPX;   // ~0.344m vertical divider between stacked cells
// Augment each MERGES entry with its combined opening size + front-center
// world position.
for (const m of MERGES) {
  const nCols = m.colMax - m.colMin + 1;
  const nRows = m.rowMax - m.rowMin + 1;
  m.width   = nCols * CUBBY_W + (nCols - 1) * INNER_SIDE_W;
  m.height  = nRows * CUBBY_H + (nRows - 1) * INNER_PLANK_H;
  m.centerX = ((m.colMin + m.colMax) / 2 + 0.5) * TILE_W - GRID_W / 2;
  m.centerY = -(((m.rowMin + m.rowMax) / 2 + 0.5) * TILE_H - GRID_H / 2);
}
// Back-compat: MERGED_H = height of the A5+B5 doorway, still referenced
// by the outside scene's ground placement below.
const MERGED_H = MERGES[0].height;

const DEFAULT_CUBBY_COLORS = {
  back:   [0.04, 0.025, 0.012],
  top:    [0.06, 0.04,  0.02 ],
  bottom: [0.20, 0.13,  0.07 ],
  sides:  [0.06, 0.04,  0.02 ],
};
const makeCubbyGeom = (w, h, opts = {}) => {
  const w2 = w / 2, h2 = h / 2;
  const zF = -FRONT_INSET, zB = -CUBBY_D - FRONT_INSET;
  const positions = [], normals = [], colors = [], isBack = [], indices = [];
  const palette = { ...DEFAULT_CUBBY_COLORS, ...(opts.colors ?? {}) };
  // isBack: 1.0 for vertices at the back of the recessed box (z == zB),
  // 0.0 for front-facing vertices. The vertex shader shifts back verts by
  // uBackOffset.xy so each cubby's vanishing point tilts toward the cursor.
  const addQuad = (verts, n, col) => {
    const base = positions.length / 3;
    for (const v of verts) {
      positions.push(...v);
      isBack.push(Math.abs(v[2] - zB) < 1e-4 ? 1.0 : 0.0);
    }
    for (let i = 0; i < 4; i++) normals.push(...n);
    for (let i = 0; i < 4; i++) colors.push(...col);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // opts.omitBack=true skips the back panel entirely, leaving the rear
  // wide open — the merged hallway uses this so the page bg shows through
  // its whole back.
  if (!opts.omitBack) {
    addQuad([[-w2,-h2,zB],[ w2,-h2,zB],[ w2, h2,zB],[-w2, h2,zB]], [0,0,1], palette.back);
  }
  addQuad([[-w2, h2,zB],[ w2, h2,zB],[ w2, h2,zF],[-w2, h2,zF]], [0,-1,0], palette.top);
  addQuad([[-w2,-h2,zF],[ w2,-h2,zF],[ w2,-h2,zB],[-w2,-h2,zB]], [0, 1,0], palette.bottom);
  addQuad([[-w2,-h2,zF],[-w2,-h2,zB],[-w2, h2,zB],[-w2, h2,zF]], [1, 0,0], palette.sides);
  addQuad([[ w2,-h2,zF],[ w2, h2,zF],[ w2, h2,zB],[ w2,-h2,zB]], [-1,0,0], palette.sides);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('isBack',   new THREE.Float32BufferAttribute(isBack, 1));
  g.setIndex(indices);
  return g;
};
const cubbyGeom = makeCubbyGeom(CUBBY_W, CUBBY_H);
// One recessed-box geometry per merge, sized to its combined opening.
// omitBack=true (A5+B5 doorway) leaves the back open so the outside scene
// shows through; everything else gets a normal back panel and reads as a
// deeper cubby box.
for (const m of MERGES) {
  m.geom = makeCubbyGeom(m.width, m.height, { omitBack: m.omitBack });
}
// Shader: shifts vertices flagged isBack=1 by per-cubby uBackOffset.xy.
// Forwards the color attribute manually since ShaderMaterial doesn't auto-wire
// the vertexColors flag like MeshBasicMaterial does.
const makeCubbyMat = (clippingPlanes) => new THREE.ShaderMaterial({
  uniforms: { uBackOffset: { value: new THREE.Vector2(0, 0) } },
  vertexShader: `
    uniform vec2 uBackOffset;
    attribute float isBack;
    attribute vec3 color;
    varying vec3 vColor;
    void main() {
      vec3 p = position + vec3(uBackOffset * isBack, 0.0);
      vColor = color;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    void main() { gl_FragColor = vec4(vColor, 1.0); }
  `,
  side: THREE.DoubleSide,
  clippingPlanes,
});

// Build the 7×4 grid. cubbies[0] is the top row, cubbies[ROWS-1] the bottom.
const cubbies = [];
window.cubbies = cubbies;
for (let row = 0; row < ROWS; row++) {
  cubbies.push([]);
  for (let col = 0; col < COLS; col++) {
    const m = mergeAt(row, col);
    if (m && !(row === m.rowMin && col === m.colMin)) {
      // Non-anchor cell of a merge — alias the anchor's Group so all keys
      // for this merge (e.g., A5/B5, or C4/C5/D4/D5) resolve to one Group.
      cubbies[row].push(cubbies[m.rowMin][m.colMin]);
      continue;
    }
    const cellX     = m ? m.centerX : (col + 0.5) * TILE_W - GRID_W / 2;
    const cellY     = m ? m.centerY : -((row + 0.5) * TILE_H - GRID_H / 2);
    const openingW  = m ? m.width  : CUBBY_W;
    const openingH  = m ? m.height : CUBBY_H;
    const geom      = m ? m.geom   : cubbyGeom;
    const cubbyGroup = new THREE.Group();
    cubbyGroup.position.set(cellX, cellY, 0);
    // World-space clipping planes confine every material in this cubby's
    // subtree to its own footprint — no leakage into neighbors regardless
    // of how the parallax shader tilts the back.
    const halfW = openingW / 2 + 0.002;
    const halfH = openingH / 2 + 0.002;
    const wx = cubbyGroup.position.x;
    const wy = cubbyGroup.position.y;
    const clippingPlanes = [
      new THREE.Plane(new THREE.Vector3( 1, 0, 0), -wx + halfW),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0),  wx + halfW),
      new THREE.Plane(new THREE.Vector3( 0, 1, 0), -wy + halfH),
      new THREE.Plane(new THREE.Vector3( 0,-1, 0),  wy + halfH),
    ];
    const cubbyMesh = new THREE.Mesh(geom, makeCubbyMat(clippingPlanes));
    cubbyGroup.add(cubbyMesh);
    cubbyGroup.userData.cubbyMesh      = cubbyMesh;     // for per-frame uBackOffset updates
    cubbyGroup.userData.merge          = m || null;
    cubbyGroup.userData.openingW       = openingW;
    cubbyGroup.userData.openingH       = openingH;
    cubbyGroup.userData.clippingPlanes = clippingPlanes; // reused by the hallway's sky/ground
    scene.add(cubbyGroup);
    cubbies[row].push(cubbyGroup);
  }
}
// Label aliases: A–D rows from BOTTOM up, 1–6 cols from LEFT to right.
// Lets you write `cubbies.A1` instead of `cubbies[ROWS-1][0]`.
const ROW_LETTERS = 'ABCD';
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    cubbies[ROW_LETTERS[ROWS - 1 - row] + (col + 1)] = cubbies[row][col];
  }
}

// === Outside scene behind the merged A5+B5 hallway — rolling hills under a
// pale sky. Visible ONLY through the hallway opening: every other cubby
// has an opaque back panel that depth-occludes the sky/ground behind it,
// the front maple wall occludes everything outside the cubby openings,
// and the border mask quads above kill the negative space around the
// shelf. So the hills end up framed by the single hole that has nothing
// in front of them — the hallway.
const outsideScene = new THREE.Group();
outsideScene.position.set(0, 0, -CUBBY_D - FRONT_INSET);
cubbies.A5.add(outsideScene);

// --- Sky backdrop: pale blue → hazy horizon gradient on a vertical plane
// well behind the ground. Sized generously so the hallway's perspective
// never reveals its edges.
const skyTex = (() => {
  const W = 256, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,    '#9bc4e2');
  grad.addColorStop(0.65, '#c8dfee');
  grad.addColorStop(1,    '#e3ebec');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
})();
const SKY_Z = -36;
const sky = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 60),
  new THREE.MeshBasicMaterial({ map: skyTex }),
);
sky.position.set(0, 0, SKY_Z);
outsideScene.add(sky);

// --- Ground: subdivided plane rotated horizontal, vertex y displaced by a
// sum-of-sines hills function for organic rolling terrain. Vertex colors
// bake in slope shading (skyward-facing flat tops brighter than side
// slopes) and a distance haze mixing toward sky color at the far edge so
// hills blend smoothly into the horizon.
const GROUND_W = 36;
const GROUND_D = 32;
const GROUND_SEGS = 80;
const groundGeom = new THREE.PlaneGeometry(GROUND_W, GROUND_D, GROUND_SEGS, GROUND_SEGS);
groundGeom.rotateX(-Math.PI / 2);

const groundPos = groundGeom.attributes.position;
const bigHills = (x, z) =>
   1.00 * Math.sin(x * 0.30 + 1.2) +
   0.75 * Math.cos(z * 0.28 - 0.5) +
   1.20 * Math.sin(x * 0.13 + z * 0.18 + 2.4) +
   0.40 * Math.cos(x * 0.55 + z * 0.42 + 1.0);
const smallHills = (x, z) =>
   0.12 * Math.sin(x * 1.70 + 3.1) +
   0.10 * Math.cos(z * 1.90 + 1.8) +
   0.09 * Math.sin(x * 2.50 + z * 2.30 + 0.7);
const smallContrib = new Float32Array(groundPos.count);
for (let i = 0; i < groundPos.count; i++) {
  const x = groundPos.getX(i);
  const z = groundPos.getZ(i);
  // 0 at far edge → 1 at near edge, squared so small hills concentrate
  // in the closer foreground and fade out before the horizon.
  const t = (z + GROUND_D / 2) / GROUND_D;
  const nearW = Math.max(0, Math.min(1, t)) ** 2;
  const small = smallHills(x, z) * nearW;
  groundPos.setY(i, bigHills(x, z) + small);
  smallContrib[i] = Math.abs(small);
}
groundPos.needsUpdate = true;
groundGeom.computeVertexNormals();

const groundNorm = groundGeom.attributes.normal;
const groundColors = new Float32Array(groundPos.count * 3);
const BASE_R = 0.26, BASE_G = 0.45, BASE_B = 0.26;     // foresty, slightly lichen
const HAZE_R = 0.78, HAZE_G = 0.87, HAZE_B = 0.92;     // approach sky color
const quant = (v, steps) => Math.round(v * steps) / steps;
for (let i = 0; i < groundPos.count; i++) {
  const dist = 0.5 - groundPos.getZ(i) / GROUND_D;
  const distMix = quant(Math.pow(Math.max(0, Math.min(1, dist)), 1.4), 5);
  const ny = Math.max(0, groundNorm.getY(i));
  const lit = quant(0.60 + 0.40 * ny, 4);
  const tint = quant(1 - Math.min(0.55, smallContrib[i] * 3.0), 4);
  groundColors[i*3]     = (BASE_R + (HAZE_R - BASE_R) * distMix) * lit * tint;
  groundColors[i*3 + 1] = (BASE_G + (HAZE_G - BASE_G) * distMix) * lit * tint;
  groundColors[i*3 + 2] = (BASE_B + (HAZE_B - BASE_B) * distMix) * lit * tint;
}
groundGeom.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));

const ground = new THREE.Mesh(
  groundGeom,
  new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
);
ground.position.set(0, -MERGED_H / 2, -GROUND_D / 2);
outsideScene.add(ground);

// --- Mobile pagination. On touch devices held in portrait the full 6-column
// grid renders too small, so the view splits into two 3-column halves the
// user swipes between: page 0 = the vinyl side (diamond + turntable +
// records, cols 1–3), page 1 = pin art + door hallway + castle trophy
// (cols 4–6). Desktop keeps the whole grid (panTargetX stays 0).
const HALF_W = GRID_W / 2;
const PAGE_CENTER_X = [-GRID_W / 4, GRID_W / 4];   // camera x to center each page on
let paginated = false;
let currentPage = 0;
let panTargetX = 0;            // camera x the view eases toward
let panCurrentX = 0;           // current eased camera x (driven in the render loop)
const isTouch = window.matchMedia('(pointer: coarse)').matches;   // phone/tablet — drives touch input + half-split

// Page-dot indicator (shown only while paginated) so the second half is
// discoverable. Pure DOM overlay, styled to match the warm maple palette.
const pageDots = document.createElement('div');
pageDots.style.cssText =
  'position:fixed;left:0;right:0;bottom:18px;display:none;justify-content:center;' +
  'gap:10px;pointer-events:none;z-index:10;';
for (let i = 0; i < 2; i++) {
  const d = document.createElement('div');
  d.style.cssText =
    'width:9px;height:9px;border-radius:50%;background:#d2a574;opacity:0.35;' +
    'transition:opacity .25s,transform .25s;box-shadow:0 0 4px rgba(0,0,0,.55);';
  pageDots.appendChild(d);
}
document.body.appendChild(pageDots);
function updatePageUI() {
  pageDots.style.display = paginated ? 'flex' : 'none';
  for (let i = 0; i < pageDots.children.length; i++) {
    const on = i === currentPage;
    pageDots.children[i].style.opacity   = on ? '0.95' : '0.35';
    pageDots.children[i].style.transform = on ? 'scale(1.3)' : 'scale(1)';
  }
}
function goToPage(p) {
  p = Math.max(0, Math.min(1, p));
  if (p === currentPage) return;
  currentPage = p;
  panTargetX = PAGE_CENTER_X[currentPage];
  updatePageUI();
}

// === Homepage overlay — wordmark + ☰ menu, drawn to a 2D canvas and rendered
// through the SAME barrel-distortion as the scene so the type bulges with the
// room instead of sitting flat on top. The overlay canvas is full-screen and
// 1:1 with CSS pixels; a dedicated warp pass (overlayWarpMat, same lens math as
// fisheyeMat but no grade/vignette) composites it over the warped scene. Clicks
// are forward-warped via pointerNDC into this canvas's space for hit-testing.
const BRAND   = 'wasapok angleur';
const FONT    = "'Share Tech Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const LSP     = 0.18;        // letter-spacing as a fraction of font size (matches the old 0.18em)

const ovlCanvas = document.createElement('canvas');
const ovlCtx    = ovlCanvas.getContext('2d');
const ovlTex    = new THREE.CanvasTexture(ovlCanvas);
ovlTex.colorSpace = THREE.SRGBColorSpace;
ovlTex.minFilter = THREE.LinearFilter;          // NPOT canvas → no mipmaps
ovlTex.generateMipmaps = false;

// Overlay lens: a barrel warp anchored at the wordmark's OWN corner (top-left)
// instead of the screen center — so the type keeps a lens-like curl but stays
// pinned to the screen edge rather than being dragged into the scene's central
// bulge. Independent of the scene fisheye (FISHEYE_STRENGTH); OVERLAY_WARP is
// the knob for how much it curls. OVL_PIVOT is UV space, y-up: (0,1)=top-left.
const OVERLAY_WARP = 0.26;                    // curvature amount; 0.26 matches the scene fisheye's "angle"
const OVL_PIVOT = new THREE.Vector2(0.0, 1.0);   // the point kept fixed under the curve (top-left corner)

const overlayWarpScene = new THREE.Scene();
const overlayWarpCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const overlayWarpMat   = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: {
    tOverlay:  { value: ovlTex },
    uStrength: { value: OVERLAY_WARP },
    uAspect:   { value: 1 },
    uOpacity:  { value: 0 },                  // fades in just after load
    uPivot:    { value: OVL_PIVOT },          // corner anchor — keeps the curl pinned to the edge
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tOverlay;
    uniform float uStrength, uAspect, uOpacity;
    uniform vec2 uPivot;
    void main() {
      // Center-anchored barrel curvature (same angle as the scene fisheye) plus a
      // constant offset that re-pins uPivot — so the type curves like the lens but
      // sits at the corner instead of being dragged toward the middle.
      vec2 cc  = uPivot - 0.5;
      vec2 cca = vec2(cc.x * uAspect, cc.y);
      vec2 offset = uPivot - (0.5 + cc * (1.0 + uStrength * dot(cca, cca)));
      vec2 c  = vUv - 0.5;
      vec2 ca = vec2(c.x * uAspect, c.y);
      vec2 src = 0.5 + c * (1.0 + uStrength * dot(ca, ca)) + offset;
      if (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0) discard;
      vec4 t = texture2D(tOverlay, src);
      gl_FragColor = vec4(t.rgb, t.a * uOpacity);
    }
  `,
});
overlayWarpScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), overlayWarpMat));

// The overlay gets its OWN full-resolution, transparent canvas stacked above the
// pixelated scene canvas — so the warped type stays crisp/readable (the main
// renderer draws at 1/3 res). pointer-events:none so clicks fall through to the
// window handlers, which already resolve overlay hits via pointerNDC.
const ovlGLCanvas = document.createElement('canvas');
ovlGLCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
document.body.appendChild(ovlGLCanvas);
const ovlGL = new THREE.WebGLRenderer({ canvas: ovlGLCanvas, alpha: true, antialias: true });
ovlGL.setClearColor(0x000000, 0);

// Overlay state + layout. menuActions is assigned further down (it needs the
// interactive objects); overlayReady gates drawing until then so the first
// onResize() doesn't touch it.
let menuOpen = false, hoverKey = null, overlayReady = false, ovlFadeStart = 0;
let ovlElements = [];            // {key, x, y, w, h, action} hit-rects in canvas-pixel space
const _ovlN = new THREE.Vector2();

// Draw text with manual letter-spacing; returns total width (for hit-rects).
function drawSpaced(text, x, y, size) {
  const sp = size * LSP;
  let cx = x;
  for (const ch of text) { ovlCtx.fillText(ch, cx, y); cx += ovlCtx.measureText(ch).width + sp; }
  return cx - sp - x;
}
function measureSpaced(text, size) {
  const sp = size * LSP;
  let w = 0;
  for (const ch of text) w += ovlCtx.measureText(ch).width + sp;
  return w - sp;
}

// Lay out + paint the overlay canvas, rebuilding ovlElements for hit-testing.
function layoutAndDraw() {
  const W = ovlCanvas.width, H = ovlCanvas.height;
  ovlCtx.clearRect(0, 0, W, H);
  ovlCtx.textBaseline = 'top';
  ovlCtx.shadowColor = 'rgba(0,0,0,0.55)'; ovlCtx.shadowBlur = 4; ovlCtx.shadowOffsetY = 1;
  ovlElements = [];
  const left = 130, top = 115;
  const FS = 38.5, IFS = 31.5;     // 1.75× the originals (22 / 18)
  // Wordmark (display only — clicks pass through to the diamond behind it).
  ovlCtx.fillStyle = '#f3dcb0';
  ovlCtx.globalAlpha = 1;
  ovlCtx.font = `700 ${FS}px ${FONT}`;
  const wmW = drawSpaced(BRAND, left, top, FS);
  // ☰ menu icon, just right of the wordmark.
  ovlCtx.font = `${IFS}px ${FONT}`;
  const iconX = left + wmW + 12, iconY = top + 1;
  const iconW = ovlCtx.measureText('☰').width;
  ovlCtx.globalAlpha = (menuOpen || hoverKey === 'icon') ? 1 : 0.7;
  ovlCtx.fillText('☰', iconX, iconY);
  ovlElements.push({ key: 'icon', x: iconX, y: top, w: iconW, h: 24, action: toggleMenu });
  // Dropdown — one identical "wasapok angleur" link per interactive element.
  if (menuOpen) {
    ovlCtx.font = `700 ${FS}px ${FONT}`;
    let yy = top + FS + 12;
    menuActions.forEach((act, i) => {
      ovlCtx.globalAlpha = (hoverKey === 'item' + i) ? 1 : 0.62;
      const w = drawSpaced(BRAND, left, yy, FS);
      ovlElements.push({ key: 'item' + i, x: left, y: yy, w, h: FS, action: act });
      yy += FS + 7;
    });
    yy += 5;
    ovlCtx.globalAlpha = (hoverKey === 'credit') ? 0.85 : 0.5;
    const cw = drawSpaced('v.meste together', left, yy, FS);
    ovlElements.push({ key: 'credit', x: left, y: yy, w: cw, h: FS, action: openCredit });
  }
  ovlCtx.globalAlpha = 1; ovlCtx.shadowBlur = 0; ovlCtx.shadowOffsetY = 0;
  ovlTex.needsUpdate = true;
}
const toggleMenu = () => { menuOpen = !menuOpen; layoutAndDraw(); };
const openCredit = () => window.open('https://vmestetogether.com', '_blank', 'noopener');

// Forward-warp a screen point into the overlay canvas and return the hit element
// (clickable rects only), so clicks land on the warped glyphs, not flat boxes.
function overlayHitAt(clientX, clientY) {
  if (!overlayReady) return null;
  // Forward-warp the click with the SAME corner-anchored lens as the shader, so
  // hits land on the curled glyphs where they actually appear on screen.
  const A = overlayWarpMat.uniforms.uAspect.value;
  const ccx = OVL_PIVOT.x - 0.5, ccy = OVL_PIVOT.y - 0.5;
  const wC = 1 + OVERLAY_WARP * ((ccx * A) * (ccx * A) + ccy * ccy);
  const offX = OVL_PIVOT.x - (0.5 + ccx * wC), offY = OVL_PIVOT.y - (0.5 + ccy * wC);
  const cx = clientX / window.innerWidth - 0.5;
  const cy = (1 - clientY / window.innerHeight) - 0.5;             // y-up
  const w = 1 + OVERLAY_WARP * ((cx * A) * (cx * A) + cy * cy);
  const px = (0.5 + cx * w + offX) * ovlCanvas.width;
  const py = (1 - (0.5 + cy * w + offY)) * ovlCanvas.height;
  for (const el of ovlElements) {
    if (px >= el.x - 3 && px <= el.x + el.w + 3 && py >= el.y - 3 && py <= el.y + el.h + 4) return el;
  }
  return null;
}

// Shared touch state. The actual touchstart/move/end listeners live further
// down, next to the mouse handlers, so they can reach `raycaster`/`diamond*`
// for tap hit-testing and drag-spin. A swipe pages between halves; taps are
// handled directly (real phones don't reliably fire a `click` on the canvas).
let touchStartX = 0, touchStartY = 0, touchTracking = false, suppressClickUntil = 0;
const SWIPE_PX = 45;     // horizontal travel that counts as a page swipe
const TAP_PX   = 22;     // max travel still counted as a tap (forgiving for shaky fingers)

// --- Auto-fit: pick the camera distance that fits the visible region — the
// full grid on desktop, one 3-column half on mobile — on both axes,
// letterboxing the shorter axis. Low-res render buffer + CSS pixelated
// upscaling gives the chunky pixel-art look.
const onResize = () => {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;
  camera.aspect = aspect;
  paginated = isTouch && h > w;
  if (!paginated) currentPage = 0;
  const fitW = paginated ? HALF_W : GRID_W;
  const fovV = camera.fov * Math.PI / 180;
  const distH = (GRID_H / 2) / Math.tan(fovV / 2);
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
  const distW = (fitW / 2) / Math.tan(fovH / 2);
  camRestZ = Math.max(distH, distW) * 1.30;   // rest distance: pulled back enough that the bigger wall paintings are in view
  if (!focusPainting) camera.position.z = camRestZ;   // while zoomed on a painting, leave z to the focus lerp
  panTargetX = paginated ? PAGE_CENTER_X[currentPage] : 0;
  camera.updateProjectionMatrix();
  const rw = Math.floor(w / PIXELATION), rh = Math.floor(h / PIXELATION);
  renderer.setSize(rw, rh, false);
  fisheyeRT.setSize(rw, rh);
  fisheyeMat.uniforms.uAspect.value = rw / rh;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  ovlCanvas.width = w; ovlCanvas.height = h;     // overlay drawn 1:1 with CSS pixels
  ovlGL.setSize(w, h);                           // full-res overlay layer (crisp), 1:1 with the source canvas
  overlayWarpMat.uniforms.uAspect.value = rw / rh;
  if (overlayReady) layoutAndDraw();             // re-lay out the warped overlay at the new size
  updatePageUI();
};
window.addEventListener('resize', onResize);
onResize();
panCurrentX = panTargetX;                  // snap on first load — no pan-in animation
camera.position.x = panCurrentX;

// === Top-left cubby: same floating-diamond sculpture as the main hall of
// /castle — cel-shaded WasaDiminds-02 crystal with inverted-hull outline,
// hanging below the biopunk-manifold base. The whole base is scaled down
// and flipped (rotation.x = π) so the manifold mounts to the cubby's
// CEILING instead of the floor, with its respirator hoses plunging up into
// the wood frame above. Diamond gradually bobs ±6cm on a 4s cycle, no
// rotation.
const drawerMeshes = [], drawerGroups = [];   // filing-cabinet drawers — click a face to slide one out at a time
// --- Manila two-drawer filing cabinet in the merged A1+B1 cubby. Slightly
// taller than one cubby, fills a single cubby's width, sits on the floor. The
// drawers are separate groups (cabinet.userData.drawers / window.fileCabinet)
// so they can later slide out (+z, toward the viewer) and hold interactive files.
{
  const cab = cubbies.A1;
  const W = CUBBY_W * 0.9, H = CUBBY_H * 1.12, D = 0.58;   // deeper body for more volume
  const mergedH = 2 * CUBBY_H + INNER_PLANK_H;
  const baseY = -mergedH / 2, frontZ = -0.08;
  const manila = new THREE.MeshStandardMaterial({ color: 0xd9c193, roughness: 0.72, metalness: 0.04 });
  const pull   = new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.45, metalness: 0.55 });   // grey metal
  const cabinet = new THREE.Group(); cab.add(cabinet);
  cabinet.rotation.x = 0.14;   // tip the top toward the viewer so its top face shows
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), manila);
  body.position.set(0, baseY + H / 2, frontZ - D / 2);
  cabinet.add(body);
  const dh = H * 0.46, off = dh / 2 + H * 0.02, drawers = [];
  for (let k = 0; k < 2; k++) {
    const g = new THREE.Group();
    g.position.set(0, baseY + H / 2 + (k === 0 ? off : -off), frontZ);   // k0 = top drawer
    const face = new THREE.Mesh(new THREE.BoxGeometry(W * 0.97, dh, 0.10), manila);   // proud drawer faces (relief)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.40, 0.06, 0.05), pull);
    grip.position.set(0, 0, 0.045);
    // hollow metal label frame (rectangular border) above the handle
    const lw = W * 0.36, lh = dh * 0.16, t = 0.018, ly = dh * 0.26;
    const bar = (bw, bh, bx, by) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.015), pull); m.position.set(bx, ly + by, 0.055); g.add(m); };
    bar(lw, t, 0, lh / 2); bar(lw, t, 0, -lh / 2); bar(t, lh, -lw / 2, 0); bar(t, lh, lw / 2, 0);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.04), pull);   // handle lock, right of the handle
    lock.position.set(W * 0.28, 0, 0.055);
    g.add(face, grip, lock); cabinet.add(g); drawers.push(g);
    g.userData.baseZ = frontZ; g.userData.open = false;
    face.userData.drawer = g; grip.userData.drawer = g;
    drawerGroups.push(g); drawerMeshes.push(face, grip);
  }
  cabinet.userData.drawers = drawers;   // [top, bottom] — slide +z to open (later)
  window.fileCabinet = cabinet;

  // Single pink potted orchid sitting on top of the cabinet (rides the tilt).
  const orchid = new THREE.Group();
  const pot   = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.24, 16), new THREE.MeshStandardMaterial({ color: 0x8a4a32, roughness: 0.85 }));
  const stem  = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0x4a6a3c, roughness: 0.7 }));
  const petal = new THREE.MeshStandardMaterial({ color: 0xea8bc4, roughness: 0.55 });
  const f1 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), petal);
  const f2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), petal);
  pot.position.set(0, 0.12, 0); stem.position.set(0, 0.62, 0);
  f1.position.set(-0.08, 1.08, 0); f2.position.set(0.10, 1.12, 0.03);
  orchid.add(pot, stem, f1, f2);
  orchid.position.set(0, baseY + H, frontZ - D / 2);   // top-centre of the cabinet body
  cabinet.add(orchid);
}

const topLeftCubby = cubbies.D1;     // top row (D), leftmost column (1)
const SCULPT_Z   = -CUBBY_D * 0.5;
const CEILING_Y  =  CUBBY_H / 2;
const BASE_SCALE =  0.22;

// --- Biopunk manifold: stacked collar + hub + cap + port + 4 reinforced
// hoses, lifted straight from castle/museum/scene.js.
const baseGroup = new THREE.Group();
baseGroup.scale.setScalar(BASE_SCALE);
baseGroup.rotation.x = Math.PI;
baseGroup.position.set(0, CEILING_Y, SCULPT_Z);
baseGroup.renderOrder = 5;
topLeftCubby.add(baseGroup);
// renderOrder applies per-Mesh in Three.js (Groups don't propagate it), so we
// also stamp it on every child as they're added below via baseGroup.traverse.

// depthTest/depthWrite off + high renderOrder so the manifold always reads
// over the cubby panels — when the cursor tilts the perspective, the top
// panel rotates inward and would otherwise cut through the ring base.
const gunmetal  = new THREE.MeshStandardMaterial({
  color: 0x96a8b8, metalness: 0.85, roughness: 0.40,
  depthTest: false, depthWrite: false,
});
const bandSteel = new THREE.MeshStandardMaterial({
  color: 0xccdce8, metalness: 1.0,  roughness: 0.22,
  depthTest: false, depthWrite: false,
});

const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.92, 0.18, 32), gunmetal);
collar.position.y = 0.09;
baseGroup.add(collar);

const collarBand = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.025, 8, 48), bandSteel);
collarBand.rotation.x = -Math.PI / 2;
collarBand.position.y = 0.18;
baseGroup.add(collarBand);

const centralHub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.60, 0.30, 28), gunmetal);
centralHub.position.y = 0.32;
baseGroup.add(centralHub);

const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.05, 24), bandSteel);
cap.position.y = 0.50;
baseGroup.add(cap);

const port = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.18, 18), gunmetal);
port.position.y = 0.62;
baseGroup.add(port);

const TUBE_R = 0.105;
const HOSE_DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const bandRingGeom = new THREE.TorusGeometry(TUBE_R + 0.022, 0.022, 8, 14);
for (const [dx, dz] of HOSE_DIRS) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(dx * 0.45,  0.30, dz * 0.45),
    new THREE.Vector3(dx * 0.85,  0.27, dz * 0.85),
    new THREE.Vector3(dx * 1.20, -0.05, dz * 1.20),
    new THREE.Vector3(dx * 1.45, -0.75, dz * 1.45),
    new THREE.Vector3(dx * 1.55, -1.40, dz * 1.55),
  ]);
  const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, TUBE_R, 12, false), gunmetal);
  baseGroup.add(hose);
  const SEGMENTS = 8;
  for (let i = 1; i < SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const band = new THREE.Mesh(bandRingGeom, bandSteel);
    band.position.copy(p);
    band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    baseGroup.add(band);
  }
}
baseGroup.traverse(o => { if (o.isMesh) o.renderOrder = 5; });

// --- Polished metallic diamond — full metalness, low roughness so every
// facet throws sharp specular highlights from the warm directional key
// and the blue point light nested inside the diamond group. Base color is
// brushed silver; the surrounding lighting tints it cool from inside and
// warm from above for a chrome-jewelry read.
// Generate a soft studio cube map via PMREM from RoomEnvironment, then
// attach it only to the diamond material so other PBR meshes (turntable,
// manifold, easels) aren't disturbed by global lighting changes.
const pmrem = new THREE.PMREMGenerator(renderer);
const diamondEnvMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const crystalMat = new THREE.MeshStandardMaterial({
  color: 0xedf1f6,
  metalness: 1.0,
  roughness: 0.10,
  envMap: diamondEnvMap,
  envMapIntensity: 5.4,             // brighter reflections so the metallic facets read clearly against the wall
  side: THREE.DoubleSide,
});

let diamondMesh = null;       // assigned when WasaDiminds-02.obj finishes loading
let diamondDrag = null;       // { lastX } while user is dragging to spin
let diamondSpinVel = 0;       // angular velocity (rad/frame) — gives the spin inertia after release

const diamondGroup = new THREE.Group();
const DIAMOND_BASE_Y = 0.015;       // anchor — bob oscillates around this
diamondGroup.position.set(0, DIAMOND_BASE_Y, SCULPT_Z);
diamondGroup.rotation.x = Math.PI / 2;   // 90° tilt
topLeftCubby.add(diamondGroup);
diamondGroup.add(new THREE.PointLight(0x6aa8ff, 1.8, 1.6, 1.7));

// Soft blue spotlight from the manifold base ring shining down onto the
// diamond — short throw, wide cone, heavy penumbra so it reads as a
// glow halo rather than a sharp beam. Parented to the cubby (not the
// bobbing diamond) so the light source stays anchored at the base.
const baseSpot = new THREE.SpotLight(0x8ec4ff, 16.0, 1.4, Math.PI / 5, 0.7, 1.2);
baseSpot.position.set(0, CEILING_Y - 0.18, SCULPT_Z);
baseSpot.target.position.set(0, -CUBBY_H / 2 + 0.2, SCULPT_Z);
topLeftCubby.add(baseSpot);
topLeftCubby.add(baseSpot.target);

// === Emblem glow for D1 — cool icy lighting against the warm room to mark the
// crystal as the site's emblem: a bright cool key for facet sparkle plus the
// sparkle glints below. The additive bits are clipped to the D1 cubby so
// nothing bleeds onto neighbors.
const D1_CLIP = topLeftCubby.userData.clippingPlanes;

// Bright cool key from the upper-front so the facets throw sharp sparkle
// (complements baseSpot's top-down wash). Cool white, tight cone.
const keySpot = new THREE.SpotLight(0xdaf0ff, 22.0, 2.6, Math.PI / 7, 0.5, 1.3);
keySpot.position.set(0.5, CEILING_Y + 0.35, SCULPT_Z + 1.3);
keySpot.target.position.set(0, 0, SCULPT_Z);
topLeftCubby.add(keySpot);
topLeftCubby.add(keySpot.target);

// Sparkle glints — a couple of 4-point stars that flash briefly at random
// points on the crystal, like light catching a facet. Drawn in front of the
// crystal (depthTest off) so they read as surface glints.
const sparkleTex = (() => {
  const S = 64, cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.translate(S / 2, S / 2);
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.18);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(0, 0, S * 0.18, 0, Math.PI * 2); ctx.fill();
  // 8-point star: long bright cardinal spikes + shorter, fainter diagonals.
  const spikes = [
    { ang: 0,            len: 0.5,  w: 2.2, a: 0.95 },
    { ang: Math.PI / 2,  len: 0.5,  w: 2.2, a: 0.95 },
    { ang: Math.PI / 4,  len: 0.33, w: 1.3, a: 0.6  },
    { ang: -Math.PI / 4, len: 0.33, w: 1.3, a: 0.6  },
  ];
  for (const sk of spikes) {
    ctx.save(); ctx.rotate(sk.ang);
    const L = S * sk.len;
    const lg = ctx.createLinearGradient(-L, 0, L, 0);
    lg.addColorStop(0,   'rgba(210,236,255,0)');
    lg.addColorStop(0.5, `rgba(255,255,255,${sk.a})`);
    lg.addColorStop(1,   'rgba(210,236,255,0)');
    ctx.strokeStyle = lg; ctx.lineWidth = sk.w;
    ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  return tex;
})();
const sparkles = [];
const sparkleGeom = new THREE.PlaneGeometry(0.5, 0.5);
for (let i = 0; i < 11; i++) {
  const sp = new THREE.Mesh(sparkleGeom, new THREE.MeshBasicMaterial({
    map: sparkleTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, clippingPlanes: D1_CLIP,
  }));
  sp.position.set(0, DIAMOND_BASE_Y, SCULPT_Z + 0.12);
  sp.renderOrder = 7;
  sp.userData = {
    rate: 0.45 + Math.random() * 0.8,      // fast cycles → frequent twinkle
    off:  Math.random(),
    last: 1,
    scl:  0.5 + Math.random() * 0.85,      // varied glint sizes
  };
  topLeftCubby.add(sp);
  sparkles.push(sp);
}

// Minimal inline OBJ parser — read vertex (v) and face (f) lines, triangulate
// quads via fan, build a BufferGeometry. Skips materials/textures/normals
// from the file (we recompute normals and override the material below). Used
// instead of the addon OBJLoader to keep the load path simple and surface
// errors directly.
fetch('WasaDiminds-02.obj').then(r => {
  if (!r.ok) throw new Error('OBJ fetch ' + r.status);
  return r.text();
}).then(text => {
  const verts = [];
  const indices = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      verts.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith('f ')) {
      const t = line.slice(2).trim().split(/\s+/);
      const idxs = t.map(x => parseInt(x.split('/')[0], 10) - 1);
      for (let i = 1; i < idxs.length - 1; i++) {
        indices.push(idxs[0], idxs[i], idxs[i + 1]);
      }
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  const size = geom.boundingBox.getSize(new THREE.Vector3());
  const ctr  = geom.boundingBox.getCenter(new THREE.Vector3());
  const maxD = Math.max(size.x, size.y, size.z) || 1;
  geom.translate(-ctr.x, -ctr.y, -ctr.z);
  const s = 1.20 / maxD;
  geom.scale(s, s, s);
  diamondMesh = new THREE.Mesh(geom, crystalMat);
  diamondGroup.add(diamondMesh);
  console.log('[newhome] WasaDiminds-02 parsed: verts=' + (verts.length / 3) + ' tris=' + (indices.length / 3));
}).catch(err => { console.error('[newhome] WasaDiminds-02.obj failed:', err); });

const _sculptT0 = performance.now();
function updateSculpture() {
  const t = (performance.now() - _sculptT0) / 1000;
  diamondGroup.position.y = DIAMOND_BASE_Y + Math.sin(t * Math.PI * 2 / 4.0) * 0.06;
  // Carry-over spin after the user releases the drag — multiplicative decay
  // (0.95 per 30fps frame ≈ ~2s glide before fully stopping).
  if (!diamondDrag && Math.abs(diamondSpinVel) > 0.0005) {
    diamondGroup.rotateOnWorldAxis(_diamondYAxis, diamondSpinVel);
    diamondSpinVel *= 0.95;
  }
  // Sparkles: sharp bright twinkles scattered over the crystal — repositioned
  // and resized at the start of each (fast) cycle so the whole thing glitters.
  for (const sp of sparkles) {
    const ud  = sp.userData;
    const cyc = (t * ud.rate + ud.off) % 1;
    if (cyc < ud.last) {                                  // new glint somewhere on the crystal
      const r = 0.46 * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      sp.position.set(Math.cos(a) * r, diamondGroup.position.y + Math.sin(a) * r, SCULPT_Z + 0.12);
      sp.rotation.z = Math.random() * Math.PI;
      ud.scl = 0.5 + Math.random() * 0.85;
    }
    ud.last = cyc;
    const flash = Math.pow(Math.max(0, 1 - Math.abs(cyc - 0.12) * 7), 2.4);   // quick, snappy spike
    sp.material.opacity = flash;
    sp.scale.setScalar(ud.scl * (0.35 + 0.85 * flash));
  }
}

// === Album covers — single-pocket sleeves that "open like a book toward
// the user" when clicked.
//
// Per-album hierarchy (built inside the cubby):
//   cubby
//     albumRoot                  — pops forward + scales up when opening
//       coverPivot               — Group hinged on the cover's LEFT edge,
//                                  rotation.y lerps 0 → ~-110° to swing open
//         front (cover image)    — mesh shifted +ALBUM_SIZE/2 so its left
//                                  edge sits at the pivot origin
//       inside (blank panel)     — paperboard interior of the sleeve, sits
//                                  where the cover was, revealed when open
//       vinylGroup (record)      — black disc + colored label, peeking out
//                                  the right of the sleeve when open
//
// Position stays anchored in the cubby — opening only pops forward (Z) and
// scales up. No left-shift; the cover doesn't unfold into a wide spread.
//
// Click handling:
//   - click hits a front cover           → toggle that album's open state
//   - click hits an open album's interior → no-op (stays open, future hook
//                                            for vinyl interactions)
//   - click misses every album entirely  → close all open albums
const ALBUM_SIZE   = 1.4;
const INSIDE_COLOR = 0x1f1810;       // raw paperboard color for the blank inside
const VINYL_COLOR  = 0x080808;
const LABEL_COLOR  = 0xb8651a;
const HOVER_SCALE    = 1.08;
const HOVER_TIP_RAD  = 0.25;
const HOVER_LERP     = 0.30;
const OPEN_LERP      = 0.20;
const OPEN_SCALE     = 1.45;         // albumRoot scale when fully open
const OPEN_Z_POP     = 0.55;         // albumRoot Z translation toward camera
const OPEN_COVER_ROT = -1.95;        // ~-112°, cover swings open toward the user
const VINYL_PEEK_X   = ALBUM_SIZE * 0.40;   // vinyl peeks out far enough that a slice of the orange label shows past the sleeve edge
const VINYL_OUT_X    = ALBUM_SIZE * 0.95;   // fully popped out (label visible past the sleeve)
// Lean: when closed, the cover leans back ~12° with its bottom edge
// resting on the cubby floor — like a record on display. Lerps to flat
// as the cover opens so the book-swing reads cleanly.
const LEAN_ANGLE     = 0.21;                // rad (~12° back tilt)
const LEAN_Y         = -0.143;              // y shift so the rotated cover's bottom touches the cubby floor

// Procedural vinyl texture — dark base with faint concentric grooves so the
// disc reads as a record rather than a flat black circle. One canvas shared
// across every vinyl mesh.
const vinylTex = (() => {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  const maxR = size / 2;
  const minR = maxR * 0.32;            // grooves start outside the label area
  const N = 26;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const r = minR + t * (maxR - minR);
    // Alternate slightly brighter / darker so adjacent grooves catch the eye
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(46,46,46,0.55)' : 'rgba(24,24,24,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Short bright shine arcs scattered at varying radii + angles. Concentric
  // grooves are rotationally symmetric (invisible when spinning), so these
  // asymmetric highlights are what actually sells the rotation — they read
  // as the iridescent reflections real vinyl catches.
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(140, 145, 165, 0.38)';
  const shines = [
    { rT: 0.18, a0: 0.08, span: 0.18 },
    { rT: 0.36, a0: 0.55, span: 0.14 },
    { rT: 0.58, a0: 1.15, span: 0.20 },
    { rT: 0.74, a0: 1.62, span: 0.16 },
    { rT: 0.90, a0: 0.32, span: 0.12 },
  ];
  for (const s of shines) {
    const r = minR + s.rT * (maxR - minR);
    ctx.beginPath();
    ctx.arc(cx, cy, r, s.a0 * Math.PI * 2, (s.a0 + s.span) * Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
})();

const albumCoverMeshes = [];         // front-cover meshes (toggle-on-click targets)
const albumVinylMeshes = [];         // vinyl + label meshes (hover-to-spin targets)
const albumAllMeshes   = [];         // every interactive album mesh (hit-test "outside?")
const albumStates      = [];
const _hoverLocal      = new THREE.Vector3();

let albumZSeq = 0;   // bumped each time an album is opened/touched; orders the open stack
function placeAlbumCover(cubbyKey, texPath, audioSrc, labelColor = LABEL_COLOR) {
  const cubby = cubbies[cubbyKey];
  const tex = new THREE.TextureLoader().load(texPath);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;

  // transparent:true forces these materials into the transparent render queue
  // (after the opaque + transparent wall plane), so the album can draw OVER
  // the wooden cubby frame when it pops forward — without it, the wall's
  // wood pixels render after the album and cover it.
  const matOpts = { depthTest: false, depthWrite: false, side: THREE.DoubleSide, transparent: true };

  const albumRoot = new THREE.Group();
  albumRoot.position.set(0, LEAN_Y, -CUBBY_D * 0.55);
  albumRoot.rotation.x = -LEAN_ANGLE;
  cubby.add(albumRoot);

  // Easel — two thin diagonal back-supports flanking the cover, leaning at
  // the same angle. Lives in the cubby (not albumRoot), so it stays put
  // when the album pops forward to open, like a plate stand left on the
  // shelf. Legs sit 0.10m outside the cover's edges (clear of the hover
  // scale-up) and 0.025m behind the cover plane, so they read as a back
  // support without poking through the front.
  const EASEL_R = 0.045;
  const easelGeom = new THREE.CylinderGeometry(EASEL_R, EASEL_R, ALBUM_SIZE, 12);
  // depthTest/depthWrite off + renderOrder=5 so the tilting cubby side
  // walls never sweep over the easel during cursor parallax (same trick
  // the biopunk manifold uses). Stays under album covers (renderOrder 8).
  const easelMat = new THREE.MeshStandardMaterial({
    color: 0xc99a5b, metalness: 0.05, roughness: 0.6,
    depthTest: false, depthWrite: false,
  });
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(easelGeom, easelMat);
    leg.position.set(sx * 0.80, LEAN_Y, -CUBBY_D * 0.55 - EASEL_R);
    leg.rotation.x = -LEAN_ANGLE;
    leg.renderOrder = 5;
    cubby.add(leg);
  }

  // Cover pivot at the cover's LEFT edge. The cover mesh is shifted +x by
  // half its size so its center sits at the cubby cover position when closed,
  // with its left edge at the pivot.
  const coverPivot = new THREE.Group();
  coverPivot.position.x = -ALBUM_SIZE / 2;
  albumRoot.add(coverPivot);
  // Cover art only: desaturate the sampled texels toward their luminance by
  // COVER_SAT, injected into the MeshBasic shader so it touches just this
  // material (not the vinyl/label/wall) and stacks under the global grade.
  const coverMat = new THREE.MeshBasicMaterial({ map: tex, ...matOpts });
  coverMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, ${COVER_SAT.toFixed(3)});`,
    );
  };
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(ALBUM_SIZE, ALBUM_SIZE),
    coverMat,
  );
  front.position.x = ALBUM_SIZE / 2;
  front.renderOrder = 8;             // top of the stack so it covers vinyl/inside when closed
  front.userData.kind = 'albumCover';
  coverPivot.add(front);

  // Vinyl record (built BEFORE inside so render order can layer inside on
  // top — inside panel must occlude the vinyl when it's tucked in).
  const vinylGroup = new THREE.Group();
  vinylGroup.position.set(0, 0, -0.01);
  albumRoot.add(vinylGroup);
  const vinyl = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.46, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, map: vinylTex, ...matOpts }),
  );
  vinyl.renderOrder = 5;
  vinyl.userData.kind = 'albumVinyl';
  vinylGroup.add(vinyl);
  const label = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.13, 24),
    new THREE.MeshBasicMaterial({ color: labelColor, ...matOpts }),
  );
  label.position.z = 0.001;
  label.renderOrder = 6;
  label.userData.kind = 'albumLabel';
  vinylGroup.add(label);
  // Spindle hole at the label center. Hits register as the label so clicks
  // / hover-spin on the dead-center still behave the same as the label.
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.013, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, ...matOpts }),
  );
  hole.position.z = 0.002;
  hole.renderOrder = 7;
  hole.userData.kind = 'albumLabel';
  vinylGroup.add(hole);

  // Inside panel — paperboard interior of the sleeve. renderOrder=7 so it
  // sits ON TOP of the vinyl/label, hiding whatever portion of the vinyl is
  // still inside the sleeve. Only the part of the vinyl that's slid past the
  // panel's right edge stays visible.
  const inside = new THREE.Mesh(
    new THREE.PlaneGeometry(ALBUM_SIZE, ALBUM_SIZE),
    new THREE.MeshBasicMaterial({ color: INSIDE_COLOR, ...matOpts }),
  );
  inside.position.set(0, 0, -0.015);
  inside.renderOrder = 7;
  inside.userData.kind = 'albumInside';
  albumRoot.add(inside);

  cubby.userData.albumCover = front;
  cubby.userData.albumRoot  = albumRoot;
  albumCoverMeshes.push(front);
  albumVinylMeshes.push(vinyl, label, hole);
  albumAllMeshes.push(front, inside, vinyl, label, hole);
  const state = {
    albumRoot, coverPivot, front, inside, vinylGroup, vinyl, label, hole,
    isOpen: false, openness: 0,
    vinylOut: false, vinylness: 0,
    z: 0,                                // activation order — higher draws atop other open albums
    col: parseInt(cubbyKey.slice(1), 10), // grid column (1–6) — used to relocate on mobile
    // Offset from this album's own cubby to BiomePlain's (C2): on mobile, the
    // rightmost-column albums glide here as they open so they (and their
    // popping record) stay on-screen.
    openShiftX: cubbies.C2.position.x - cubby.position.x,
    openShiftY: cubbies.C2.position.y - cubby.position.y,
    audioSrc, labelColor, audio: null,   // audio lazy-initialized on first play
  };
  // Back-references so the click handler can find a state from any of its
  // meshes without a search.
  front.userData.albumState = state;
  inside.userData.albumState = state;
  vinyl.userData.albumState = state;
  label.userData.albumState = state;
  hole.userData.albumState = state;
  albumStates.push(state);
}
// Audio + label color per album. Drop matching MP3 (or OGG) files into
// newhome/ when you have clips ready — they'll loop on the turntable when
// the record is loaded. Until the files exist, .play() fails silently.
placeAlbumCover('C2', 'BiomePlain_Album.png',   'BiomePlain.mp3',    0x4ea84e);   // forest green
placeAlbumCover('C3', 'PalmTreeSyrup_Cover.png','PalmTreeSyrup.mp3', 0xe8a730);   // amber
placeAlbumCover('B3', 'Periphsisha_Cover.png',  'Periphsisha.mp3',   0xb8651a);   // burnt orange (default)

// === Cubby B2: harman/kardon T25 turntable. Procedurally modeled to match
// reference photos — light champagne plinth, bright aluminum platter rim,
// black felt mat with cross spoke marks, polished silver center disc + spindle,
// BLACK plastic tonearm housing (not chrome), chrome arm, cream/white headshell
// with a reddish-brown cartridge and stylus + finger lift, two silver knobs +
// rectangular power button on the front face, four dark rubber feet, and a
// clear acrylic dust cover hinged at the back lifted open. Tilted forward ~63°
// so the top reads cleanly to the head-on camera.
function buildRecordPlayer() {
  const player = new THREE.Group();
  const W = 1.5, H = 0.12, D = 0.60;
  const platterR = 0.30;
  const platterTopY = H / 2 + 0.018;
  const platterX = -0.18;
  const armPivotX = 0.42;
  const armPivotZ = -0.20;

  const matOpts = { depthTest: false, depthWrite: false, transparent: true, emissive: 0x3a3833, emissiveIntensity: 0.28 };

  const plinthMat    = new THREE.MeshStandardMaterial({ color: 0xc7c2b3, metalness: 0.35, roughness: 0.45, ...matOpts });
  const rimMat       = new THREE.MeshStandardMaterial({ color: 0xd6d3c8, metalness: 0.90, roughness: 0.20, ...matOpts });
  const feltMat      = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, metalness: 0.05, roughness: 0.95, ...matOpts });
  const spokeMat     = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.10, roughness: 0.85, ...matOpts });
  const centerDiscMat = new THREE.MeshStandardMaterial({ color: 0xb8b3a4, metalness: 0.95, roughness: 0.18, ...matOpts });
  const chromeMat    = new THREE.MeshStandardMaterial({ color: 0xb8b3a4, metalness: 0.92, roughness: 0.22, ...matOpts });
  const blackPlastic = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, metalness: 0.15, roughness: 0.55, ...matOpts });
  const headshellMat = new THREE.MeshStandardMaterial({ color: 0xeae3d1, metalness: 0.15, roughness: 0.45, ...matOpts });
  const cartridgeMat = new THREE.MeshStandardMaterial({ color: 0x6b3a26, metalness: 0.30, roughness: 0.50, ...matOpts });
  const rubberMat    = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.00, roughness: 0.85, ...matOpts });
  const dustCoverMat = new THREE.MeshStandardMaterial({
    color: 0xdde8f4, metalness: 0.00, roughness: 0.05,
    opacity: 0.14, side: THREE.DoubleSide, ...matOpts,
  });
  const recordVinylMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: vinylTex, side: THREE.DoubleSide, ...matOpts });
  const labelMat     = new THREE.MeshBasicMaterial({ color: LABEL_COLOR, side: THREE.DoubleSide, ...matOpts });

  const ro = (m, n) => { m.renderOrder = n; player.add(m); return m; };

  // Plinth — light champagne / brushed silver rectangle
  ro(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), plinthMat), 5);

  // Rubber feet at 4 corners
  for (const [sx, sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.04, 16), rubberMat);
    foot.position.set(sx * (W / 2 - 0.10), -H / 2 - 0.02, sz * (D / 2 - 0.10));
    ro(foot, 5);
  }

  // Platter rim — bright aluminum
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(platterR, platterR, 0.030, 48), rimMat);
  rim.position.set(platterX, platterTopY, 0);
  ro(rim, 6);
  // Black felt mat sitting on top of the rim
  const feltR = platterR * 0.96;
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(feltR, feltR, 0.010, 48), feltMat);
  felt.position.set(platterX, platterTopY + 0.020, 0);
  ro(felt, 7);
  // Cross spoke marks across the felt (2 perpendicular thin strips)
  for (let i = 0; i < 2; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(feltR * 1.85, 0.0025, 0.010), spokeMat);
    spoke.position.set(platterX, platterTopY + 0.026, 0);
    spoke.rotation.y = i * Math.PI / 2;
    spoke.renderOrder = 8;
    player.add(spoke);
  }
  // Polished silver center disc — where the harman/kardon emblem sits IRL
  const centerDisc = new THREE.Mesh(new THREE.CylinderGeometry(feltR * 0.33, feltR * 0.33, 0.005, 32), centerDiscMat);
  centerDisc.position.set(platterX, platterTopY + 0.027, 0);
  ro(centerDisc, 9);

  // Vinyl record loaded on top (uses the shared grooved texture). Wrapped in
  // a spin-group so the playback loop can rotate the record+label around
  // their shared center while music is playing.
  const spinGroup = new THREE.Group();
  spinGroup.position.set(platterX, platterTopY + 0.029, 0);
  player.add(spinGroup);
  const record = new THREE.Mesh(new THREE.CircleGeometry(feltR * 0.94, 48), recordVinylMat);
  record.rotation.x = -Math.PI / 2;
  record.renderOrder = 10;
  spinGroup.add(record);
  const recordLabel = new THREE.Mesh(new THREE.CircleGeometry(feltR * 0.30, 24), labelMat);
  recordLabel.rotation.x = -Math.PI / 2;
  recordLabel.position.y = 0.0005;
  recordLabel.renderOrder = 11;
  spinGroup.add(recordLabel);
  // Spindle hole — slightly wider than the chrome spindle (r=0.010) so a
  // black ring reads around the spindle's base where it meets the disc.
  const recordHole = new THREE.Mesh(
    new THREE.CircleGeometry(0.020, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, ...matOpts }),
  );
  recordHole.rotation.x = -Math.PI / 2;
  recordHole.position.y = 0.0008;
  recordHole.renderOrder = 12;
  spinGroup.add(recordHole);
  spinGroup.visible = false;        // empty turntable until a record is loaded
  player.userData.spinGroup         = spinGroup;
  player.userData.recordLabel       = recordLabel;
  player.userData.defaultLabelColor = LABEL_COLOR;

  // Spindle through the record's center hole — renderOrder 13 keeps it on
  // top of the black spindle-hole disc (renderOrder 12) so chrome reads in
  // the middle of the hole instead of the hole overpainting it.
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.060, 16), chromeMat);
  spindle.position.set(platterX, platterTopY + 0.055, 0);
  ro(spindle, 13);

  // Tonearm BASE — black plastic housing on the back-right
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.080, 0.080, 24), blackPlastic);
  housing.position.set(armPivotX, H / 2 + 0.040, armPivotZ);
  ro(housing, 7);
  const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.050, 0.030, 24), blackPlastic);
  bearing.position.set(armPivotX, H / 2 + 0.095, armPivotZ);
  ro(bearing, 8);

  // Tonearm group — pivots above the bearing, sweeps over the record
  const tonearmGroup = new THREE.Group();
  tonearmGroup.position.set(armPivotX, H / 2 + 0.115, armPivotZ);
  tonearmGroup.rotation.y = 0.55;
  player.add(tonearmGroup);
  // Black counterweight at the back
  const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.060, 16), blackPlastic);
  cw.rotation.z = Math.PI / 2;
  cw.position.x = 0.07;
  cw.renderOrder = 8;
  tonearmGroup.add(cw);
  // Chrome arm
  const armLen = 0.48;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, armLen, 12), chromeMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.x = -armLen / 2;
  arm.renderOrder = 8;
  tonearmGroup.add(arm);
  // Cream/white headshell
  const headshell = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.025, 0.038), headshellMat);
  headshell.position.x = -armLen;
  headshell.renderOrder = 9;
  tonearmGroup.add(headshell);
  // Reddish-brown cartridge under the headshell
  const cartridge = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.018, 0.032), cartridgeMat);
  cartridge.position.set(-armLen, -0.020, 0);
  cartridge.renderOrder = 9;
  tonearmGroup.add(cartridge);
  // Stylus needle
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.001, 0.014, 8), chromeMat);
  needle.position.set(-armLen, -0.035, 0);
  needle.renderOrder = 10;
  tonearmGroup.add(needle);
  // Finger lift — small tab off the headshell
  const lift = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.010, 0.026), chromeMat);
  lift.position.set(-armLen + 0.030, 0, 0.025);
  lift.renderOrder = 9;
  tonearmGroup.add(lift);

  // Tonearm rest clip near the front-right of the arm area
  const rest = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.045, 16), blackPlastic);
  rest.position.set(W / 2 - 0.13, H / 2 + 0.022, 0.06);
  ro(rest, 7);

  // Front controls: two chrome knobs (speed / control) + rectangular power button
  for (let i = 0; i < 2; i++) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.014, 24), chromeMat);
    knob.position.set(0.22 + i * 0.10, H / 2 + 0.007, D / 2 - 0.08);
    ro(knob, 7);
  }
  const power = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.012, 0.046), chromeMat);
  power.position.set(W / 2 - 0.10, H / 2 + 0.006, D / 2 - 0.08);
  ro(power, 7);

  // Dust cover — clear acrylic box that hinges at a height above the plinth
  // top (so when closed it sits ABOVE the platter + tonearm, not through
  // them). Starts CLOSED (horizontal) and lerps OPEN (lifted nearly vertical
  // with a small backward lean) while the cursor hovers anywhere on the
  // turntable.
  const COVER_CLOSED_Y = 0.20;
  const coverPanelD    = D * 0.95;
  const coverThickness = 0.018;
  const coverHinge = new THREE.Group();
  coverHinge.position.set(0, COVER_CLOSED_Y, -D / 2);
  coverHinge.rotation.x = 0;                                // start closed (horizontal)
  player.add(coverHinge);
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.97, coverThickness, coverPanelD),
    dustCoverMat,
  );
  cover.position.z = coverPanelD / 2;                       // back edge sits at the hinge
  cover.renderOrder = 13;
  coverHinge.add(cover);
  player.userData.coverHinge = coverHinge;
  player.userData.coverClosedRot = 0;
  player.userData.coverOpenRot   = -Math.PI / 2 + 0.20;     // ~80° from horizontal, slight lean back

  return player;
}
const recordPlayer = buildRecordPlayer();
recordPlayer.rotation.x = 0;                                                // flat — viewed straight-on like an actual bookshelf turntable
recordPlayer.position.set(0, -CUBBY_H / 2 + (0.12 / 2) + 0.04, -CUBBY_D * 0.40);
cubbies.B2.add(recordPlayer);
cubbies.B2.userData.recordPlayer = recordPlayer;

// === Turntable record-loading + playback. One record may be on the platter
// at a time. A temporary "flying" vinyl mesh tweens between the source
// album's slot and the platter — arcing slightly forward so it passes in
// front of the maple wall instead of getting clipped behind it. Audio
// starts on arrival (load) or stops immediately (unload, then animates
// the return flight).
let currentRecord = null;     // { state } when a record is loaded; null otherwise
let flightAnim = null;        // active fly tween; clicks are locked out while non-null
const FLIGHT_MS = 600;
const TURNTABLE_VINYL_SCALE = 0.42;   // album-vinyl geom ÷ turntable-vinyl geom radius

const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;

function buildFlyingRecord(labelColor) {
  // Stand-alone copy of the album's vinyl + label, parented to the scene so
  // it can travel between the cubby and the turntable in world coordinates.
  // depthTest off + high renderOrder so it always reads in front of the
  // maple wall and any cubby panels during the arc.
  const matOpts = { depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide };
  const g = new THREE.Group();
  const vinyl = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.46, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, map: vinylTex, ...matOpts }),
  );
  vinyl.renderOrder = 20;
  g.add(vinyl);
  const label = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.13, 24),
    new THREE.MeshBasicMaterial({ color: labelColor, ...matOpts }),
  );
  label.position.z = 0.001;
  label.renderOrder = 21;
  g.add(label);
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.013, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, ...matOpts }),
  );
  hole.position.z = 0.002;
  hole.renderOrder = 22;
  g.add(hole);
  return g;
}

function startFlight(fromVec, toVec, fromRotX, toRotX, fromScale, toScale, labelColor, onArrive) {
  const mesh = buildFlyingRecord(labelColor);
  mesh.position.copy(fromVec);
  mesh.rotation.x = fromRotX;
  mesh.scale.setScalar(fromScale);
  scene.add(mesh);
  flightAnim = { mesh, fromVec: fromVec.clone(), toVec: toVec.clone(),
                 fromRotX, toRotX, fromScale, toScale, startMs: performance.now(), onArrive };
}

function updateFlight() {
  if (!flightAnim) return;
  const t = Math.min(1, (performance.now() - flightAnim.startMs) / FLIGHT_MS);
  const e = easeInOutCubic(t);
  flightAnim.mesh.position.lerpVectors(flightAnim.fromVec, flightAnim.toVec, e);
  flightAnim.mesh.position.z += Math.sin(e * Math.PI) * 0.35;   // forward arc to clear the maple wall
  flightAnim.mesh.rotation.x = THREE.MathUtils.lerp(flightAnim.fromRotX, flightAnim.toRotX, e);
  flightAnim.mesh.rotation.z = e * Math.PI * 0.6;               // gentle spin during flight
  const s = THREE.MathUtils.lerp(flightAnim.fromScale, flightAnim.toScale, e);
  flightAnim.mesh.scale.setScalar(s);
  if (t >= 1) {
    flightAnim.onArrive?.();
    scene.remove(flightAnim.mesh);
    flightAnim = null;
  }
}

// === Web Audio analyser shared by the turntable + pin-art visualizer. The
// playing record is routed element -> analyser -> speakers, and the pin art
// reads analyser.getByteFrequencyData() each frame (see musicDepth). The
// AudioContext is created/resumed on the first record load — a user gesture,
// which satisfies the browser autoplay policy. createMediaElementSource can
// only run once per <audio> element, so the source node is cached on state.
let audioCtx = null, analyser = null, freqData = null, musicActive = false;
function ensureAudioGraph() {
  if (audioCtx) return;
  audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
  analyser  = audioCtx.createAnalyser();
  analyser.fftSize = 128;                  // 64 freq bins — coarse, matches 32 pin columns
  analyser.smoothingTimeConstant = 0.68;   // balanced: 0.75 laggy, 0.6 slightly twitchy, 0.68 = sweet spot
  freqData  = new Uint8Array(analyser.frequencyBinCount);
  analyser.connect(audioCtx.destination);
}

function loadRecord(state) {
  if (flightAnim || currentRecord) return;
  currentRecord = { state };
  recordPlayer.userData.recordLabel.material.color.set(state.labelColor);
  const fromVec  = state.vinyl.getWorldPosition(new THREE.Vector3());
  const toVec    = recordPlayer.userData.spinGroup.getWorldPosition(new THREE.Vector3());
  const fromScl  = state.vinyl.getWorldScale(new THREE.Vector3()).x;
  state.vinylGroup.visible = false;
  startFlight(fromVec, toVec, 0, -Math.PI / 2, fromScl, TURNTABLE_VINYL_SCALE, state.labelColor, () => {
    recordPlayer.userData.spinGroup.visible = true;
    if (!state.audioSrc) return;
    if (!state.audio) { state.audio = new Audio(state.audioSrc); state.audio.loop = true; }
    state.audio.currentTime = 0;
    state.audio.play().catch(err => console.warn('[turntable] play failed', state.audioSrc, err.message));
    // Tap the playback into the shared analyser so the pin art reacts.
    ensureAudioGraph();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!state.srcNode) state.srcNode = audioCtx.createMediaElementSource(state.audio);
    state.srcNode.connect(analyser);
    musicActive = true;
  });
}

function unloadRecord() {
  if (flightAnim || !currentRecord) return;
  const { state } = currentRecord;
  if (state.audio) { state.audio.pause(); state.audio.currentTime = 0; }
  musicActive = false;   // pins fall back to idle ripple + hover
  const fromVec = recordPlayer.userData.spinGroup.getWorldPosition(new THREE.Vector3());
  const toVec   = state.vinyl.getWorldPosition(new THREE.Vector3());
  const toScl   = state.vinyl.getWorldScale(new THREE.Vector3()).x;
  recordPlayer.userData.spinGroup.visible = false;
  currentRecord = null;
  startFlight(fromVec, toVec, -Math.PI / 2, 0, TURNTABLE_VINYL_SCALE, toScl, state.labelColor, () => {
    state.vinylGroup.visible = true;
    recordPlayer.userData.recordLabel.material.color.set(recordPlayer.userData.defaultLabelColor);
  });
}

function updateTurntable() {
  if (currentRecord && !flightAnim) recordPlayer.userData.spinGroup.rotation.y -= 0.06;
}

// === Top-right cubby D6: shrunk Temmys-Castle3 icon GLB, sitting on the
// shelf like a trophy. Fit by bbox to ~85% of the cubby's tightest dimension,
// re-center horizontally and depth-wise, drop so bbox.min.y rests on the
// cubby floor with a hair of padding to avoid z-fighting.
// The GLB ships with surrounding terrain (dirt_block, grass_texture,
// ocean_texture_1/2/3). On a shelf we only want the castle structure, so
// hide the terrain meshes AND exclude them from the bbox so the fit-to-cubby
// scale is driven by the castle silhouette alone, not a 300m-wide ocean.
const D6_HIDE_NAMES = /^(dirt_block|grass_texture|ocean_texture_\d+|walkable_plane|cube017|cube018|gate[ _]?0?1)$/i;
new GLTFLoader().load('Temmys-Castle3-ICON.q.glb', (gltf) => {
  const castle = gltf.scene;
  const box = new THREE.Box3();
  const planes = cubbies.D6.userData.clippingPlanes;
  castle.traverse(o => {
    if (!o.isMesh) return;
    if (D6_HIDE_NAMES.test(o.name)) { o.visible = false; return; }
    box.expandByObject(o);
    // Apply cubby's world-space X/Y clipping planes so any overflow past the
    // cubby opening is masked instead of poking into adjacent cubbies.
    // DoubleSide so reversed-normal roof panels don't render as holes.
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.clippingPlanes = planes;
      m.side = THREE.DoubleSide;
    }
  });
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Generous in-plane margin (X/Y overflow is clipped to the cubby footprint
  // by the planes above), tighter depth margin so the castle doesn't poke
  // through the front maple wall.
  const fit = Math.min(
    (CUBBY_W * 1.25) / size.x,
    (CUBBY_H * 1.25) / size.y,
    (CUBBY_D * 0.9)  / size.z,
  ) * 2;
  castle.scale.setScalar(fit);
  const X_NUDGE = 0.22;     // visual centering — bbox center reads slightly left of cubby midline
  castle.position.set(
    -center.x * fit + X_NUDGE,
    -box.min.y * fit - CUBBY_H / 2 + 0.005,
    -center.z * fit - CUBBY_D * 0.5,
  );
  cubbies.D6.add(castle);
  cubbies.D6.userData.castle = castle;
});

// === D6 castle waterfall: pixelated stream that spills from the castle
// entrance in D6 and falls 4 cubby-heights to the floor below the shelf.
// Lives at scene-level (not parented to a cubby) so it crosses cubby
// boundaries; sits forward of the maple wall (z > 0) so cubby dividers
// don't slice it into segments.
const WF_W = 0.40;
const WF_TOP_Y = cubbies.D6.position.y - CUBBY_H / 2 + 0.02;   // just above the D6 floor
const WF_BOT_Y = -GRID_H / 2 + 0.08;                           // anchor right under the cubbies (bottom plank)
const WF_FALL  = WF_TOP_Y - WF_BOT_Y;
const WF_X     = cubbies.D6.position.x + 0.22;                 // line up with castle (X_NUDGE)
const WF_Z     = 0.06;                                         // in front of the maple wall

// 16×128 pixelated canvas — pale cyan base with a few bright vertical streak
// columns and dark speckles for depth. NearestFilter keeps it chunky.
const wfCv = document.createElement('canvas');
wfCv.width = 16; wfCv.height = 128;
const wfCtx = wfCv.getContext('2d');
wfCtx.fillStyle = 'rgba(150, 200, 235, 0.45)';
wfCtx.fillRect(0, 0, 16, 128);
wfCtx.fillStyle = 'rgba(225, 240, 255, 0.92)';
for (const [x, w] of [[2, 1], [5, 2], [9, 1], [12, 2]]) wfCtx.fillRect(x, 0, w, 128);
wfCtx.fillStyle = 'rgba(80, 130, 180, 0.55)';
for (let i = 0; i < 36; i++) wfCtx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 128), 1, 2);
const wfTex = new THREE.CanvasTexture(wfCv);
wfTex.wrapS = wfTex.wrapT = THREE.RepeatWrapping;
wfTex.magFilter = THREE.NearestFilter;
wfTex.minFilter = THREE.NearestFilter;
wfTex.repeat.set(1, WF_FALL / 0.8);   // each texture tile ~0.8m tall over the full fall

const waterfall = new THREE.Mesh(
  new THREE.PlaneGeometry(WF_W, WF_FALL),
  new THREE.MeshBasicMaterial({ map: wfTex, transparent: true, depthWrite: false }),
);
waterfall.position.set(WF_X, (WF_TOP_Y + WF_BOT_Y) / 2, WF_Z);
scene.add(waterfall);

function updateWaterfall() {
  wfTex.offset.y -= 0.0015;   // scroll DOWN → streaks read as falling (meditative pace)
  puddleTex.offset.x += 0.0008;  // gentle horizontal ripple drift
  sprayTex.offset.y  -= 0.004;   // sparse droplets reading as rising spray
}

// === Waterfall splash at impact point. Two stacked pixelated elements:
// a wide horizontal puddle that ripples sideways, and a smaller spray
// patch just above with sparse bright droplets scrolling upward.

// --- Puddle: 32×8 canvas. Darker pool rows at the bottom, ripple pixels
// above. Horizontal-scrolling texture sells the spreading water.
const puddleCv = document.createElement('canvas');
puddleCv.width = 32; puddleCv.height = 8;
const puddleCtx = puddleCv.getContext('2d');
puddleCtx.fillStyle = 'rgba(70, 120, 175, 0.78)';
puddleCtx.fillRect(0, 4, 32, 4);                       // pool body
puddleCtx.fillStyle = 'rgba(170, 210, 240, 0.85)';
for (const x of [1, 5, 10, 15, 20, 25, 29]) puddleCtx.fillRect(x, 3, 2, 1);  // bright ripple crests
puddleCtx.fillStyle = 'rgba(220, 240, 255, 0.65)';
for (const x of [3, 7, 12, 17, 21, 26, 30]) puddleCtx.fillRect(x, 2, 1, 1);  // foam dots
const puddleTex = new THREE.CanvasTexture(puddleCv);
puddleTex.wrapS = puddleTex.wrapT = THREE.RepeatWrapping;
puddleTex.magFilter = THREE.NearestFilter;
puddleTex.minFilter = THREE.NearestFilter;
const puddle = new THREE.Mesh(
  new THREE.PlaneGeometry(WF_W * 2.2, 0.20),
  new THREE.MeshBasicMaterial({ map: puddleTex, transparent: true, depthWrite: false }),
);
puddle.position.set(WF_X, WF_BOT_Y + 0.05, WF_Z + 0.01);
scene.add(puddle);

// --- Spray: 32×24, mostly transparent with sparse bright pixels at varied
// heights. Scrolling UP gives the impression of droplets jumping out of
// the impact, the empty rows breaking it up so it doesn't read as a stream.
const sprayCv = document.createElement('canvas');
sprayCv.width = 32; sprayCv.height = 24;
const sprayCtx = sprayCv.getContext('2d');
sprayCtx.clearRect(0, 0, 32, 24);
sprayCtx.fillStyle = 'rgba(225, 240, 255, 0.90)';
for (let i = 0; i < 35; i++) {
  sprayCtx.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 24), 1, 1);
}
sprayCtx.fillStyle = 'rgba(150, 195, 230, 0.70)';
for (let i = 0; i < 23; i++) {
  sprayCtx.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 24), 1, 1);
}
const sprayTex = new THREE.CanvasTexture(sprayCv);
sprayTex.wrapS = sprayTex.wrapT = THREE.RepeatWrapping;
sprayTex.magFilter = THREE.NearestFilter;
sprayTex.minFilter = THREE.NearestFilter;
const spray = new THREE.Mesh(
  new THREE.PlaneGeometry(WF_W * 1.75, 0.375),
  new THREE.MeshBasicMaterial({ map: sprayTex, transparent: true, depthWrite: false }),
);
spray.position.set(WF_X, WF_BOT_Y + 0.22, WF_Z + 0.015);
scene.add(spray);

// Cursor over ANY part of the turntable → dust cover lifts open. Cursor off
// → cover lerps back closed. Raycaster tests the whole player subtree, so
// any mesh (plinth, platter, tonearm, even the cover itself) counts as a
// hover, keeping the cover stable while the cursor is anywhere on the model.
function updateRecordPlayerCover() {
  const ch = recordPlayer.userData.coverHinge;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(recordPlayer, true);
  // Touch has no hover, so lift the lid whenever a record is loaded; otherwise
  // (desktop) follow the cursor as before.
  const open = hits.length || (isTouch && currentRecord);
  const target = open
    ? recordPlayer.userData.coverOpenRot
    : recordPlayer.userData.coverClosedRot;
  ch.rotation.x += (target - ch.rotation.x) * 0.20;
}

// The A5/B5 hallway doorway is a link to /castle. The green outside scene
// is visible only through this opening, and nothing is ever placed or pops out
// in front of it, so a ray passing through the opening rectangle (at the z=0
// mouth) landed on the hills/sky — not on a cubby, album, or frame. Anything
// physically in front would be a nearer hit and is handled before we get here.
const DOORWAY = cubbies.A5;
const CASTLE_URL = '/castle';
function rayHitsDoorway(ray) {
  if (Math.abs(ray.direction.z) < 1e-6) return false;
  const t = -ray.origin.z / ray.direction.z;                 // intersect the opening plane (z = 0)
  if (t < 0) return false;
  const wx = ray.origin.x + ray.direction.x * t;
  const wy = ray.origin.y + ray.direction.y * t;
  return Math.abs(wx - DOORWAY.position.x) <= DOORWAY.userData.openingW / 2
      && Math.abs(wy - DOORWAY.position.y) <= DOORWAY.userData.openingH / 2;
}

// Shared tap/click resolver — raycasts the scene at a screen point and runs
// the album/turntable interaction. Driven by mouse `click` (desktop) and by
// `touchend` taps (mobile, where a synthetic canvas click can't be relied on).
function handleTapAt(clientX, clientY) {
  if (flightAnim) return;                                     // lock input during fly-to/from animations
  if (focusPainting) { focusPainting = null; return; }        // zoomed in on a painting → any click returns to the wall
  const ovl = overlayHitAt(clientX, clientY);                 // warped wordmark/☰/menu click → run its action, don't poke the scene
  if (ovl) { ovl.action(); return; }
  raycaster.setFromCamera(pointerNDC(clientX, clientY), camera);
  // Click a filing-cabinet drawer → slide it out; only one open at a time.
  const dHit = raycaster.intersectObjects(drawerMeshes, false);
  if (dHit.length) {
    const g = dHit[0].object.userData.drawer, was = g.userData.open;
    drawerGroups.forEach((d) => (d.userData.open = false));
    g.userData.open = !was;
    return;
  }
  // Click a wall painting → zoom the camera in to view it head-on.
  const artHits = raycaster.intersectObjects(paintingMeshes, false);
  if (artHits.length) { focusPainting = artHits[0].object; return; }
  // Tapping through the doorway (the green outside scene) → /castle.
  if (rayHitsDoorway(raycaster.ray)) { window.location.href = CASTLE_URL; return; }
  // Tap anywhere on the turntable while a record is loaded → eject.
  if (currentRecord && raycaster.intersectObject(recordPlayer, true).length) {
    unloadRecord();
    return;
  }
  // Diamond taps are handled by the drag interaction — ignore here so
  // an un-drag tap doesn't trigger the "close all open albums" path.
  if (diamondMesh && raycaster.intersectObject(diamondMesh, false).length) return;
  const anyHits = raycaster.intersectObjects(albumAllMeshes, false);
  if (!anyHits.length) {
    // Empty space — close every open album (vinyls retract along with covers).
    for (const s of albumStates) { s.isOpen = false; s.vinylOut = false; }
    return;
  }
  const hit = anyHits[0].object;
  const state = hit.userData.albumState;
  if (!state) return;
  if (hit.userData.kind === 'albumCover') {
    state.isOpen = !state.isOpen;
    if (!state.isOpen) state.vinylOut = false;     // closing cover pulls vinyl back in
    if (state.isOpen) state.z = ++albumZSeq;        // bring to the front of the open stack
  } else if (hit.userData.kind === 'albumVinyl' || hit.userData.kind === 'albumLabel') {
    if (!state.isOpen) return;
    state.z = ++albumZSeq;                          // touching it raises it over other open albums
    // First tap on the peeking vinyl slides it fully out; a second tap
    // on the slid-out vinyl loads it onto the turntable and starts playback.
    if (state.vinylOut) loadRecord(state);
    else                state.vinylOut = true;
  }
  // Tapping the inside panel of an open album is a no-op for now.
}
window.addEventListener('click', (e) => {
  if (performance.now() < suppressClickUntil) { suppressClickUntil = 0; return; }  // already handled by a touch tap/swipe
  handleTapAt(e.clientX, e.clientY);                                               // overlay hits are resolved inside handleTapAt
});

function updateAlbumState() {
  // Hover only counts when the album is closed.
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(albumCoverMeshes, false);
  const hovered = hits.length ? hits[0].object : null;
  const hitPt   = hits.length ? hits[0].point  : null;
  // Separate raycast against the slid-out vinyl meshes for hover-spin preview.
  // Raycaster auto-skips hidden meshes, so a record loaded on the turntable
  // (source vinylGroup invisible) is naturally excluded.
  const vinylHits = raycaster.intersectObjects(albumVinylMeshes, false);
  const vinylHoveredState = vinylHits.length ? vinylHits[0].object.userData.albumState : null;

  // Layering: open albums pop forward, so they must render above closed
  // neighbors (depthTest is off everywhere here, so renderOrder is the only
  // arbiter). Rank the currently-open albums by activation recency and give
  // each its own renderOrder band. Bands are 1 apart with fractional internal
  // offsets, so even 3 stacked albums stay under the atmosphere layer (20).
  const openStack = albumStates.filter(s => s.openness > 0.002).sort((a, b) => a.z - b.z);
  openStack.forEach((s, i) => { s._band = 10 + i; });

  for (const s of albumStates) {
    // --- Hover (closed only) — scale + nearest-corner tip on the cover mesh.
    let tScale = 1.0, tRotX = 0, tRotY = 0;
    if (!s.isOpen && s.front === hovered) {
      tScale = HOVER_SCALE;
      _hoverLocal.copy(hitPt);
      s.front.worldToLocal(_hoverLocal);
      const dx = _hoverLocal.x / (ALBUM_SIZE / 2);
      const dy = _hoverLocal.y / (ALBUM_SIZE / 2);
      tRotX =  HOVER_TIP_RAD * dy;
      tRotY = -HOVER_TIP_RAD * dx;
    }
    s.front.scale.x += (tScale - s.front.scale.x) * HOVER_LERP;
    s.front.scale.y += (tScale - s.front.scale.y) * HOVER_LERP;
    s.front.scale.z += (tScale - s.front.scale.z) * HOVER_LERP;
    s.front.rotation.x += (tRotX - s.front.rotation.x) * HOVER_LERP;
    s.front.rotation.y += (tRotY - s.front.rotation.y) * HOVER_LERP;

    // --- Open / close — pop forward, scale up, swing cover open like a book.
    const target = s.isOpen ? 1 : 0;
    s.openness += (target - s.openness) * OPEN_LERP;
    const o = s.openness;
    const ps = 1 + (OPEN_SCALE - 1) * o;
    s.albumRoot.scale.set(ps, ps, ps);
    s.albumRoot.position.z = -CUBBY_D * 0.55 + OPEN_Z_POP * o;
    // On mobile, a rightmost-column album (col 3 or 6) would pop its record off
    // the screen edge. Instead, as it opens it glides over to BiomePlain's
    // cubby (C2, the center of the visible half); the record then pops right
    // as normal and stays on-screen. shiftK ramps the move in with openness.
    const shiftK = (paginated && s.col % 3 === 0) ? o : 0;
    s.albumRoot.position.x = s.openShiftX * shiftK;
    // Lean rolls flat as the cover opens: full -12° back-tilt at closed,
    // 0° at fully open. Position.y follows so the bottom stays anchored
    // while leaned but the cover re-centers when flat.
    const lean = 1 - o;
    s.albumRoot.rotation.x = -LEAN_ANGLE * lean;
    s.albumRoot.position.y =  LEAN_Y * lean + s.openShiftY * shiftK;
    s.coverPivot.rotation.y = OPEN_COVER_ROT * o;

    // --- Vinyl pop-out (only meaningful when cover is open). When cover is
    // closed, vinyl x=0 keeps it hidden behind the cover. When open + tucked
    // in, vinyl sits at VINYL_PEEK_X with its right edge poking past the
    // inside panel. Click on the peek and it slides out to VINYL_OUT_X.
    const targetV = s.vinylOut ? 1 : 0;
    s.vinylness += (targetV - s.vinylness) * OPEN_LERP;
    const v = s.vinylness;
    s.vinylGroup.position.x = (VINYL_PEEK_X + (VINYL_OUT_X - VINYL_PEEK_X) * v) * o;

    // Hover-spin preview: when cursor is over the slid-out vinyl, spin it
    // around its own normal (Z axis in album-local space) at the same rate
    // as the turntable. Stops the instant the cursor leaves — last rotation
    // value persists so it doesn't snap back to zero.
    if (s.isOpen && s.vinylOut && s === vinylHoveredState) {
      s.vinylGroup.rotation.z -= 0.06;
    }

    // Apply the layering band. Open albums ride in their recency band (>=10);
    // closed albums fall back to the original base orders. Internal order is
    // preserved either way: vinyl < label < hole = inside < cover.
    if (s.openness > 0.002) {
      const b = s._band;
      s.vinyl.renderOrder  = b;
      s.label.renderOrder  = b + 0.25;
      s.hole.renderOrder   = b + 0.5;
      s.inside.renderOrder = b + 0.5;
      s.front.renderOrder  = b + 0.75;
    } else {
      s.vinyl.renderOrder = 5; s.label.renderOrder = 6; s.hole.renderOrder = 7;
      s.inside.renderOrder = 7; s.front.renderOrder = 8;
    }
  }
}

// === Cursor tracking → per-cubby perspective tilt.
// Mouse is unprojected onto the z=0 plane (where the cubby openings live);
// each cubby's uBackOffset is set proportional to (mouseWorld - cubbyPos) so
// the recessed box appears to look at the cursor. Distant cubbies need
// larger angular tilt, so their offsets are larger (clamped to keep the back
// from punching through the side panels). Lerped each frame for smooth glide.
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(0, 0);
const mouseWorld = new THREE.Vector3(0, 0, 0);
let mouseSeen = false;
window.addEventListener('mousemove', (e) => {
  pointerNDC(e.clientX, e.clientY, ndc);
  mouseSeen = true;
  if (diamondDrag) {
    const dx = e.clientX - diamondDrag.lastX;
    diamondDrag.lastX = e.clientX;
    const deltaRot = dx * 0.012;                                 // ~7° per 10px drag
    diamondGroup.rotateOnWorldAxis(_diamondYAxis, deltaRot);
    // Track a smoothed velocity from recent drag input — heavy weight on the
    // latest delta so a slow-down before release reduces the carry-over spin.
    diamondSpinVel = diamondSpinVel * 0.5 + deltaRot * 0.5;
  }
});
const _diamondYAxis = new THREE.Vector3(0, 1, 0);

// Drag-to-spin on the D1 diamond. Mousedown on the mesh starts the drag,
// horizontal cursor movement rotates the diamondGroup around world Y
// (so the existing 90° tilt is preserved), mouseup anywhere releases.
window.addEventListener('mousedown', (e) => {
  if (!diamondMesh || overlayHitAt(e.clientX, e.clientY)) return;     // don't start a diamond drag from a warped overlay element
  raycaster.setFromCamera(pointerNDC(e.clientX, e.clientY), camera);
  if (raycaster.intersectObject(diamondMesh, false).length) {
    diamondDrag = { lastX: e.clientX };
  }
});
window.addEventListener('mouseup', () => { diamondDrag = null; });

// === Touch input (phones/tablets). Routes taps straight into handleTapAt
// because a real device often won't deliver a usable synthetic `click` to
// the WebGL canvas. A touch that lands on the diamond becomes a drag-spin
// (mirrors the mouse path); a horizontal swipe pages between halves; a
// near-stationary touch is a tap.
let touchDragDiamond = false;
window.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) { touchTracking = false; return; }
  const ovl = overlayHitAt(e.touches[0].clientX, e.touches[0].clientY);   // tap a warped overlay element → run it now, eat the trailing click
  if (ovl) { ovl.action(); touchTracking = false; suppressClickUntil = performance.now() + 600; return; }
  const tt = e.touches[0];
  touchTracking = true;
  touchStartX = tt.clientX;
  touchStartY = tt.clientY;
  touchDragDiamond = false;
  if (diamondMesh) {                                          // start a drag-spin if the touch hit the diamond
    raycaster.setFromCamera(pointerNDC(tt.clientX, tt.clientY), camera);
    if (raycaster.intersectObject(diamondMesh, false).length) {
      diamondDrag = { lastX: tt.clientX };
      touchDragDiamond = true;
    }
  }
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!touchDragDiamond || !diamondDrag || e.touches.length !== 1) return;
  const x = e.touches[0].clientX;
  const dx = x - diamondDrag.lastX;
  diamondDrag.lastX = x;
  const deltaRot = dx * 0.012;
  diamondGroup.rotateOnWorldAxis(_diamondYAxis, deltaRot);
  diamondSpinVel = diamondSpinVel * 0.5 + deltaRot * 0.5;
}, { passive: true });
window.addEventListener('touchend', (e) => {
  const wasDiamond = touchDragDiamond;
  touchDragDiamond = false;
  diamondDrag = null;                                         // release drag-spin (momentum carries via updateSculpture)
  if (!touchTracking) return;
  touchTracking = false;
  if (wasDiamond) return;                                     // diamond drag — not a tap or swipe
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
  if (paginated && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.3) {
    suppressClickUntil = performance.now() + 600;             // eat the trailing synthetic click
    goToPage(currentPage + (dx < 0 ? 1 : -1));
    return;
  }
  if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) {       // near-stationary → a tap
    suppressClickUntil = performance.now() + 600;             // de-dupe: handled here, ignore the synthetic click
    handleTapAt(t.clientX, t.clientY);
  }
}, { passive: true });

// === Drop-down menu (☰ next to the wordmark). Opening it reveals one
// identical "wasapok angleur" link per interactive element; clicking a link
// runs that element's interaction, exactly as tapping the object in the scene
// would. Album links advance through their own stages on repeated clicks
// (open → reveal vinyl → play → stop). The window click/touch handlers above
// ignore anything inside the overlay, so a menu click never also pokes the 3D
// scene behind it.
function activateAlbum(state) {
  if (flightAnim) return;                                   // ignore while a record flies to/from the deck
  if (currentRecord && currentRecord.state === state) {     // this one is playing → stop it and tuck it away
    unloadRecord();
    state.isOpen = false; state.vinylOut = false;
    return;
  }
  if (currentRecord) { unloadRecord(); return; }            // a different record is playing → clear the deck first
  if (!state.isOpen || !state.vinylOut) {                   // closed → open the sleeve and slide the vinyl out
    state.isOpen = true; state.vinylOut = true; state.z = ++albumZSeq;
    return;
  }
  state.z = ++albumZSeq;                                    // already revealed → drop it on the turntable and play
  loadRecord(state);
}

// One action per clickable element, in display order: the records, then the
// doorway, then the diamond. Tied to albumStates, so adding a record adds a
// link automatically — the menu length tracks the interactive elements.
const menuActions = [
  ...albumStates.map((s) => () => activateAlbum(s)),
  () => { window.location.href = CASTLE_URL; },             // doorway → /castle
  () => { diamondSpinVel += 0.12; },                        // give the floating diamond a spin
];

// The warped overlay can render now that menuActions exists: enable drawing,
// paint the initial wordmark + ☰, and start the fade-in (matches the old CSS:
// ~0.25s delay, ~1.2s ease). The render loop composites it through the warp.
overlayReady = true;
layoutAndDraw();
ovlFadeStart = performance.now() + 250;
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutAndDraw);   // redraw once 'Earth 2073' finishes loading

// Hover: forward-warp the cursor onto the overlay element under it, bump its
// opacity (redraw only on change), and flag a pointer cursor for the per-frame
// cursor logic. Touch devices have no hover and skip this.
let overlayHover = false;
window.addEventListener('mousemove', (e) => {
  const el = overlayHitAt(e.clientX, e.clientY);
  overlayHover = !!el;
  const key = el ? el.key : null;
  if (key !== hoverKey) { hoverKey = key; layoutAndDraw(); }
});

const TILT_SCALE = 0.12;                     // how strongly each cubby tilts per meter of cursor offset
const TILT_MAX_X = CUBBY_W * 0.42;           // clamp so back stays inside the side panels
const TILT_MAX_Y = CUBBY_H * 0.42;
const _target = new THREE.Vector2();

function updateTilt() {
  if (mouseSeen) {
    raycaster.setFromCamera(ndc, camera);
    const ray = raycaster.ray;
    if (Math.abs(ray.direction.z) > 1e-6) {
      const t = -ray.origin.z / ray.direction.z;
      mouseWorld.copy(ray.origin).addScaledVector(ray.direction, t);
    }
  }
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      // Non-anchor merge cells share their Group with the anchor — tilt once.
      if (isMergeNonAnchor(row, col)) continue;
      const cg = cubbies[row][col];
      // D6 holds the castle model; tilting the back into it causes clipping.
      if (cg === cubbies.D6) continue;
      if (mouseSeen) {
        const dx = (mouseWorld.x - cg.position.x) * TILT_SCALE;
        const dy = (mouseWorld.y - cg.position.y) * TILT_SCALE;
        _target.set(
          Math.max(-TILT_MAX_X, Math.min(TILT_MAX_X, dx)),
          Math.max(-TILT_MAX_Y, Math.min(TILT_MAX_Y, dy)),
        );
      } else {
        _target.set(0, 0);                  // no pointer (touch): rest head-on
      }
      cg.userData.cubbyMesh.material.uniforms.uBackOffset.value.lerp(_target, 0.55);
    }
  }
  // Affordance: pointer cursor while the mouse hovers the doorway link.
  if (mouseSeen) {
    const overDoor =
      Math.abs(mouseWorld.x - DOORWAY.position.x) <= DOORWAY.userData.openingW / 2 &&
      Math.abs(mouseWorld.y - DOORWAY.position.y) <= DOORWAY.userData.openingH / 2;
    canvas.style.cursor = (overDoor || overlayHover) ? 'pointer' : '';
  }
}

// === Dust motes — slow-drifting warm specks suspended in front of the
// bookshelf, catching the amber lighting. Sells the hushed late-night
// trophy-room atmosphere. High renderOrder so they pass over every other
// layer (cubby panels, albums, manifold) instead of being occluded.
const DUST_COUNT = 30;
const dustGeom = new THREE.PlaneGeometry(0.026, 0.026);
const dustMat = new THREE.MeshBasicMaterial({
  color: 0xfff0c8, transparent: true, opacity: 0.32, depthWrite: false,
});
const dustMotes = [];
for (let i = 0; i < DUST_COUNT; i++) {
  const m = new THREE.Mesh(dustGeom, dustMat);
  m.position.set(
    (Math.random() - 0.5) * 14,
    (Math.random() - 0.5) * 9,
    (Math.random() - 0.5) * 3 + 4,                       // in front of the bookshelf
  );
  m.renderOrder = 20;
  m.userData = {
    vy:      -0.0033 - Math.random() * 0.0057,           // slow downward drift
    baseX:    m.position.x,                              // sway pivots around the spawn x
    swayAmp:  0.35 + Math.random() * 0.55,               // ~0.35–0.9 m peak-to-pivot horizontal swing
    rotAmp:   0.30 + Math.random() * 0.40,               // gentle tilt — leaf catching air
    phase:    Math.random() * Math.PI * 2,
    freq:     0.55 + Math.random() * 0.70,               // ~0.55–1.25 rad/s
  };
  scene.add(m);
  dustMotes.push(m);
}
function updateDust() {
  const t = performance.now() / 1000;
  for (const m of dustMotes) {
    const ud = m.userData;
    m.position.y += ud.vy;
    const swing = Math.sin(t * ud.freq + ud.phase);
    m.position.x   = ud.baseX + swing * ud.swayAmp;                       // swing around base x
    m.rotation.z   = Math.cos(t * ud.freq + ud.phase) * ud.rotAmp;        // tilt leads the swing by 90°
    if (m.position.y < -GRID_H / 2 - 1) {
      m.position.y = GRID_H / 2 + 1;
      ud.baseX     = (Math.random() - 0.5) * 14;
    }
  }
}

// === Pin art toy hanging in the C4+C5+D4+D5 merged cubby. A backing plate
// holds a 32×32 grid of gunmetal pins; each pin's protrusion is a 0..1
// depth that lerps toward a per-frame target. The target is the sum of a
// faint idle ripple plus a soft bump that tracks the cursor when it hovers
// over the board (see updatePinArt). A future music driver can feed the
// same target via musicDepth() to visualize audio on the pins.
const PIN_COLS           = 32;
const PIN_ROWS           = 32;
const PIN_AREA_W         = 2.4;
const PIN_AREA_H         = 2.4;
const PIN_DIAMETER       = Math.min(PIN_AREA_W / PIN_COLS, PIN_AREA_H / PIN_ROWS);
const PIN_RADIUS         = PIN_DIAMETER * 0.42;     // slight gap between pins
const PIN_LENGTH         = 0.80;
const PIN_MAX_PROTRUSION = 0.66;                    // how far a fully-pricked pin shoots out front (back end still hides behind the plate)
const PLATE_THICKNESS    = 0.05;
const PIN_ART_CENTER_Y   = -0.10;                   // vertical offset within cubby (below center → leaves room for chains)
const PIN_ART_Z          = -0.32;                   // plate front Z within the cubby (in local space of cubbies.D4)

const pinArt = new THREE.Group();
pinArt.position.set(0, PIN_ART_CENTER_Y, PIN_ART_Z);
pinArt.scale.setScalar(1.20);
cubbies.D4.add(pinArt);

// Reuse the cubby's clipping planes so the pin art can't spill out of the
// merged opening if the parallax shader tilts the back. (Necessary because
// the StandardMaterials we use here are otherwise unclipped.)
const pinClipPlanes = cubbies.D4.userData.clippingPlanes;

// --- Backing plate. Slightly larger than the pin area; opaque dark so
// the back ends of the pins (which slide through it) stay hidden.
const plate = new THREE.Mesh(
  new THREE.BoxGeometry(PIN_AREA_W + 0.06, PIN_AREA_H + 0.06, PLATE_THICKNESS),
  new THREE.MeshStandardMaterial({
    color: 0x141414, roughness: 0.85, metalness: 0.1,
    clippingPlanes: pinClipPlanes,
  }),
);
plate.position.set(0, 0, -PLATE_THICKNESS / 2);
pinArt.add(plate);
// Little frame LED at the bottom — red when music plays, dim when idle.
const led = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x331010 }));
led.position.set(-0.2, -(PIN_AREA_H / 2 + 0.08), 0.03);   // bottom of pin-art frame, stretched leftward as a thin bar
pinArt.add(led);

// --- Pin grid. One InstancedMesh, ~1024 instances, gunmetal. Cylinder
// geometry is rotated so its axis aligns with +Z (pins point toward the
// camera). The pin's local Z is the only thing the animation moves.
const pinGeom = new THREE.CylinderGeometry(PIN_RADIUS, PIN_RADIUS * 0.85, PIN_LENGTH, 12);
pinGeom.rotateX(Math.PI / 2);
// Tint each pin along its length: gunmetal base → cool "space grey" tip so the
// protruding tips pop. Base unchanged. Tune the two colors below.
{
  const p = pinGeom.attributes.position, c = new Float32Array(p.count * 3);
  const base = new THREE.Color(0xc2c8d0), tip = new THREE.Color(0x6a6f76), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    t.copy(base).lerp(tip, Math.min(1, Math.max(0, (p.getZ(i) + PIN_LENGTH / 2) / PIN_LENGTH)));
    c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b;
  }
  pinGeom.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
const pinMat = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.35, metalness: 0.85,
  emissive: 0x2a2e36, emissiveIntensity: 1.0,
  clippingPlanes: pinClipPlanes,
});
const pins = new THREE.InstancedMesh(pinGeom, pinMat, PIN_COLS * PIN_ROWS);
pinArt.add(pins);
// Bright icy-blue dot riding each pin's tip — a single-pixel highlight for pop.
const pinDots = new THREE.InstancedMesh(
  new THREE.SphereGeometry(PIN_RADIUS * 0.7, 6, 4),
  new THREE.MeshBasicMaterial({ color: 0xffffff, clippingPlanes: pinClipPlanes }),   // hue set per-dot via instanceColor
  PIN_COLS * PIN_ROWS,
);
pinArt.add(pinDots);
const _dotCol = new THREE.Color();
// Duplicate sparkle layer in orange-brown (#703901), independent phase.
const pinDots2 = new THREE.InstancedMesh(
  new THREE.SphereGeometry(PIN_RADIUS * 0.7, 6, 4),
  new THREE.MeshBasicMaterial({ color: 0xffffff, clippingPlanes: pinClipPlanes }),
  PIN_COLS * PIN_ROWS,
);
pinArt.add(pinDots2);

// Precompute each pin's base XY; only Z changes per frame.
const pinXY = [];
for (let row = 0; row < PIN_ROWS; row++) {
  for (let col = 0; col < PIN_COLS; col++) {
    const x = (col + 0.5) / PIN_COLS * PIN_AREA_W - PIN_AREA_W / 2;
    const y = (row + 0.5) / PIN_ROWS * PIN_AREA_H - PIN_AREA_H / 2;
    pinXY.push({ x, y, u: (col + 0.5) / PIN_COLS, v: (row + 0.5) / PIN_ROWS });
  }
}

// --- Hover-reactive depth field. The board idles with a faint breathing
// ripple, and the few pins directly under the cursor prick up sharply when
// it hovers over the plate — a tight bump plus a fast attack / slow release
// so each pin snaps up crisply and eases back down after the cursor passes.
const HOVER_RADIUS = 0.13;     // local-space falloff radius — a tight burst of pins under the cursor
const HOVER_PEAK   = 1.0;      // depth added at the bump center (0..1) — full prick
const IDLE_BASE    = 0.12;     // resting protrusion so pins aren't flush with the plate
const IDLE_AMP     = 0.05;     // amplitude of the idle breathing ripple
const PIN_ATTACK   = 0.85;     // near-instant rise — pins fire up the moment the cursor reaches them
const PIN_RELEASE  = 0.09;     // slow per-frame fall — pricked pins linger, leaving a tall trailing wake

const pinDepth = new Float32Array(PIN_COLS * PIN_ROWS);   // current protrusion per pin

// Cursor in pinArt-local space, plus a 0..1 envelope that fades the bump in
// while hovering and out when the cursor leaves, so it melts in place rather
// than snapping off.
let hoverX = 0, hoverY = 0, hoverAmp = 0;
const _pinHit = new THREE.Vector3();

// Music visualizer: extra 0..1 depth for the pin at (u, v) driven by the
// turntable's AnalyserNode (see ensureAudioGraph). Equalizer bars — the
// column (u) picks a frequency bin, its magnitude is the bar height, and a
// pin lights when it sits below the bar top (v=0 is the bottom row). The soft
// (m - v) ramp fades the bar's top edge instead of cutting a hard step. The
// spectrum is sampled once per frame in updatePinArt, not per pin.
const MUSIC_SPECTRUM_SPAN = 0.6;   // use the lower 60% of bins (where the energy is)
const MUSIC_BAR_SOFTNESS  = 8;     // higher = crisper bar top
const MUSIC_RELEASE       = 0.4;   // bar fall speed (vs PIN_RELEASE 0.09) — higher = snappier, beat-tight
function musicDepth(u, v) {
  if (!musicActive || !freqData) return 0;
  const bins = freqData.length;
  const idx  = Math.min(bins - 1, (u * bins * MUSIC_SPECTRUM_SPAN) | 0);
  const m    = freqData[idx] / 255;              // 0..1 bar height for this column
  return Math.max(0, Math.min(1, (m - v) * MUSIC_BAR_SOFTNESS));
}

const _pinDummy = new THREE.Object3D();
function updatePinArt() {
  const t = performance.now() / 1000;

  // Pull the current spectrum once per frame; musicDepth() then indexes it per pin.
  if (musicActive && analyser) analyser.getByteFrequencyData(freqData);
  led.material.color.setHex(musicActive ? 0xff2020 : 0x331010);   // frame LED reacts to playback
  // Bass / mid / treble averages → three vertical EQ bar columns on the pin art.
  let bassAv = 0, midAv = 0, trebAv = 0;
  if (musicActive) {
    for (let k = 1;  k <= 8;  k++) bassAv += freqData[k];
    for (let k = 9;  k <= 24; k++) midAv  += freqData[k];
    for (let k = 25; k <= 60; k++) trebAv += freqData[k];
    bassAv /= 8 * 255; midAv /= 16 * 255; trebAv /= 36 * 255;
  }
  const BARS = [-PIN_AREA_W * 0.30, 0, PIN_AREA_W * 0.30], BVALS = [bassAv, midAv, trebAv], BAR_W = 0.04;   // half a pin-col → single column line

  // Cursor → board. Raycast only the flat backing plate (never the pins) so
  // we get a stable (x, y) on the board plane no matter how far the pins are
  // pushed out. A hit steers the bump toward the cursor and drives the
  // envelope up; a miss lets it fade so the bump dissolves where it sat.
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(plate, false)[0];
  if (hit) {
    _pinHit.copy(hit.point);
    pinArt.worldToLocal(_pinHit);
    hoverX = _pinHit.x;
    hoverY = _pinHit.y;
    hoverAmp += (1 - hoverAmp) * 0.45;
  } else {
    hoverAmp += (0 - hoverAmp) * 0.15;
  }

  // baseZ = pin position when depth=0 (tip flush with plate front at z=0).
  const baseZ = -PIN_LENGTH / 2 + 0.001;
  const r2 = HOVER_RADIUS * HOVER_RADIUS;
  for (let i = 0; i < pinXY.length; i++) {
    const p = pinXY[i];
    // Idle breathing ripple radiating from center — low amplitude, always on.
    const rad  = Math.sqrt(p.x * p.x + p.y * p.y);
    const idle = IDLE_BASE + IDLE_AMP * Math.sin(rad * 4.5 - t * 2.0);
    // Cursor bump — tight gaussian around the hover point so only the pin(s)
    // beneath the cursor lift, scaled by the hover envelope.
    const hx = p.x - hoverX, hy = p.y - hoverY;
    const bump = hoverAmp * HOVER_PEAK * Math.exp(-(hx * hx + hy * hy) / r2);
    const target = Math.max(0, Math.min(1, idle + bump + musicDepth(p.u, p.v)));
    // Asymmetric approach: snap up fast (the prick), settle down slow.
    // While music plays, bars fall fast (MUSIC_RELEASE) so they punch to the
    // beat — but pins under the cursor keep the slow trailing wake, blended in
    // by the bump strength. With no music, fall stays PIN_RELEASE everywhere.
    const fall = musicActive
      ? MUSIC_RELEASE + (PIN_RELEASE - MUSIC_RELEASE) * Math.min(1, bump)
      : PIN_RELEASE;
    const delta = target - pinDepth[i];
    pinDepth[i] += delta * (delta > 0 ? PIN_ATTACK : fall);
    _pinDummy.position.set(p.x, p.y, baseZ + pinDepth[i] * PIN_MAX_PROTRUSION);
    _pinDummy.updateMatrix();
    pins.setMatrixAt(i, _pinDummy.matrix);
    // Tip dot: bright on raised (cursor/music) pins; otherwise a faint sparkle
    // riding the SAME radial idle ripple as the pins, fading + converging toward
    // the cursor as it passes over.
    const prox = hoverAmp * Math.exp(-(hx * hx + hy * hy) / r2);   // cursor influence here
    // Idle drift field + shift-speed → blobs settle onto scattered star-anise
    // stencils where slow, amorphous where shifting fast (the faint base layer).
    const a1 = p.x * 3.8 + t * 1.3, a2 = p.y * 4.6 - t * 1.1, a3 = (p.x - p.y) * 3.1 + t * 0.6, a4 = (p.x + p.y) * 4.1 - t * 0.9;
    const amorph = Math.sin(a1) + Math.sin(a2) + Math.sin(a3) + Math.sin(a4);
    const stable = Math.max(0, 1 - Math.abs(1.3 * Math.cos(a1) - 1.1 * Math.cos(a2) + 0.6 * Math.cos(a3) - 0.9 * Math.cos(a4)) / 1.4);
    const CELL = 0.50, cx = Math.round(p.x / CELL) * CELL, cy = Math.round(p.y / CELL) * CELL;   // ~20% more stars
    const petalR = CELL * 0.6 * (0.4 + 0.6 * Math.max(0, Math.cos(8 * Math.atan2(p.y - cy, p.x - cx))));   // 120% star density
    const blobOn = stable > 0.55 ? (Math.hypot(p.x - cx, p.y - cy) < petalR) : (amorph > 1.15);
    let dShow = 0, dC = 0, dx = 0, dy = 0, glow = false, bar = false;
    if (pinDepth[i] > 0.45) { dShow = 1; dC = 1; glow = true; }   // music/active level dots → original blue 0x8fb0c8
    else {
      let bShow = 0, bC = 0;
      if (blobOn) { const f = Math.max(0, 1 - prox * 1.5); bShow = 0.8 * f; bC = 0.22 * f; }
      // sparse, periodic fog-light glows on top — slightly brighter than the blobs
      const fr = (x) => x - Math.floor(x);
      const ph = fr(performance.now() / 1000 * 0.006048 + fr(Math.sin(i * 127.1) * 43758.5));   // 2x faster fade
      let gShow = 0, gC = 0;
      if (ph < 0.0174) { const g = Math.sin(ph / 0.0174 * Math.PI); gShow = g; gC = 0.55 * g; }   // 40% fewer
      if (gC >= bC) { dShow = gShow; dC = gC; glow = true; }
      else { dShow = bShow; dC = bC; dx = (hoverX - p.x) * prox * 0.6; dy = (hoverY - p.y) * prox * 0.6; }
    }
    // EQ bar override — light the dots up to the band's average height
    if (musicActive) {
      for (let k = 0; k < 3; k++) if (Math.abs(p.x - BARS[k]) < BAR_W) {
        if ((p.y + PIN_AREA_H / 2) / PIN_AREA_H <= BVALS[k]) { dShow = 1; dC = 1; bar = true; dx = 0; dy = 0; }
        break;
      }
    }
    _pinDummy.position.set(p.x + dx, p.y + dy, baseZ + pinDepth[i] * PIN_MAX_PROTRUSION + PIN_LENGTH / 2);
    _pinDummy.scale.setScalar(dShow);
    _pinDummy.updateMatrix();
    pinDots.setMatrixAt(i, _pinDummy.matrix);
    pinDots.setColorAt(i, _dotCol.set(bar ? 0xdfe3f7 : (glow ? 0x8fb0c8 : 0x8fc8b6)).multiplyScalar(dC));
    // orange-brown duplicate sparkle (same animation, independent phase)
    const f2 = (x) => x - Math.floor(x);
    const ph2 = f2(performance.now() / 1000 * 0.006048 + f2(Math.sin(i * 89.3) * 43758.5));
    let g2Show = 0, g2C = 0;
    if (ph2 < 0.0174) { const g = Math.sin(ph2 / 0.0174 * Math.PI); g2Show = g; g2C = 0.55 * g; }
    _pinDummy.scale.setScalar(g2Show);
    _pinDummy.updateMatrix();
    pinDots2.setMatrixAt(i, _pinDummy.matrix);
    pinDots2.setColorAt(i, _dotCol.set(0xb06a02).multiplyScalar(g2C));
    _pinDummy.scale.setScalar(1);
  }
  pins.instanceMatrix.needsUpdate = true;
  pinDots.instanceMatrix.needsUpdate = true;
  if (pinDots.instanceColor) pinDots.instanceColor.needsUpdate = true;
  pinDots2.instanceMatrix.needsUpdate = true;
  if (pinDots2.instanceColor) pinDots2.instanceColor.needsUpdate = true;
}
updatePinArt();   // initial pose so it's not all stuck at z=0 before first tick

// --- Two thin chains from the upper corners of the plate up to the
// cubby's ceiling. Gunmetal cylinders — simple but reads as "hanging".
{
  const cubbyOpeningH = cubbies.D4.userData.openingH;
  // Ceiling Y in pinArt-local space: cubby ceiling minus pinArt's Y offset,
  // minus a small inset so the chain doesn't penetrate the cubby ceiling.
  const ceilingY     = cubbyOpeningH / 2 - PIN_ART_CENTER_Y - 0.04;
  const plateTopY    = PIN_AREA_H / 2 + 0.03;
  const chainLength  = ceilingY - plateTopY;
  const chainGeom    = new THREE.CylinderGeometry(0.014, 0.014, chainLength, 6);
  const chainMat     = new THREE.MeshStandardMaterial({
    color: 0x2a2c30, roughness: 0.6, metalness: 0.7,
    clippingPlanes: pinClipPlanes,
  });
  const chainOffsetX = PIN_AREA_W / 2 - 0.08;
  for (const sx of [-1, 1]) {
    const chain = new THREE.Mesh(chainGeom, chainMat);
    chain.position.set(sx * chainOffsetX, plateTopY + chainLength / 2, 0);
    pinArt.add(chain);
  }
}

// Throttle the full render loop to ~30fps so the tilt reads as chunky/pixel-y
// while staying responsive to fast cursor moves. The per-frame lerp factor
// below was bumped to ~0.55 so the cubbies catch up to the cursor in 2–3
// ticks rather than gliding sluggishly behind it.
const FRAME_MS = 1000 / 30;
let lastFrame = 0;
// Eased camera pan between mobile pages. No-op on desktop (panTargetX === 0).
function updatePan() {
  panCurrentX += (panTargetX - panCurrentX) * 0.18;
  if (Math.abs(panTargetX - panCurrentX) < 0.0015) panCurrentX = panTargetX;

  // Pick the camera + lookAt + fisheye targets: a focused painting (zoom in,
  // head-on, flat) vs the resting wall view. Lerp toward whichever each frame.
  let tx, ty, tz, lx, ly, tFish;
  if (focusPainting) {
    const p = focusPainting, w = p.scale.x, h = p.scale.y;
    const fovV = camera.fov * Math.PI / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
    const dz = Math.max((h / 2) / Math.tan(fovV / 2), (w / 2) / Math.tan(fovH / 2)) * 1.12;  // distance that fills the FOV with a small margin
    tx = p.position.x; ty = p.position.y; tz = p.position.z + dz;
    lx = p.position.x; ly = p.position.y; tFish = 0;          // ease the warp out so the art reads true
  } else {
    tx = panCurrentX; ty = 0; tz = camRestZ;
    lx = panCurrentX; ly = 0; tFish = FISHEYE_STRENGTH;
  }
  const k = 0.12;
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (ty - camera.position.y) * k;
  camera.position.z += (tz - camera.position.z) * k;
  camLookX += (lx - camLookX) * k;
  camLookY += (ly - camLookY) * k;
  camera.lookAt(camLookX, camLookY, 0);
  fisheyeMat.uniforms.uStrength.value += (tFish - fisheyeMat.uniforms.uStrength.value) * k;

  // Haze clears on the painting you've stepped up to; others stay veiled.
  for (const p of paintingMeshes) {
    const u = p.material.userData.haze;
    const tgt = (p === focusPainting) ? 0 : PAINTING_HAZE;
    u.value += (tgt - u.value) * k;
  }
}
function render(now) {
  if (now - lastFrame >= FRAME_MS) {
    lastFrame = now;
    const lt = now * 0.0006;                  // sweep the lamp so highlights travel across the metallics
    lamp.position.set(Math.cos(lt) * 9, 3 + Math.sin(lt * 0.7) * 4, 6 + Math.sin(lt) * 3);
    updatePan();
    updateTilt();
    updateSculpture();
    updateAlbumState();
    updateRecordPlayerCover();
    updateTurntable();
    updateFlight();
    updateDust();
    updateWaterfall();
    updatePinArt();
    for (const g of drawerGroups) g.position.z += ((g.userData.open ? g.userData.baseZ + 0.42 : g.userData.baseZ) - g.position.z) * 0.2;   // ease drawers open/closed
    if (updateSky) updateSky();
    renderer.setRenderTarget(fisheyeRT);     // scene → off-screen target
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);          // → screen, warped through the fisheye quad
    renderer.render(fisheyeScene, fisheyeCam);
    // Warped homepage overlay, composited on top with the SAME lens math and a
    // post-load fade. autoClear off so it doesn't wipe the scene just drawn.
    if (overlayReady) {
      overlayWarpMat.uniforms.uAspect.value   = fisheyeMat.uniforms.uAspect.value;   // same w/h ratio as the scene
      overlayWarpMat.uniforms.uOpacity.value  = Math.max(0, Math.min(1, (now - ovlFadeStart) / 1200));
      ovlGL.render(overlayWarpScene, overlayWarpCam);   // crisp, full-res, corner-anchored warp on its own layer
    }
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
