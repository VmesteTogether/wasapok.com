// neorbeo — encircle empty space, and a low-poly chrome solid is drawn out of the
// loop. The truer the circle you draw, the truer the sphere; a loopy, jagged splat
// begets a loopy, jagged solid. Orthographic drafting field, chrome-white sheen,
// angelic dust. Reference: poetengineer's "digital garden" (cobalt #2243ee, hairline
// wireframe, floating dust, lower-left utility panel).
//
// Coordinate convention: the loop you draw lands in the XY plane (facing the camera);
// the solid is lofted along Z (depth), so the mid-slice (z=0) is exactly your drawing.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------- palette / tuning
const FIELD   = 0x2243ee;          // the cobalt drafting field (sampled from ref)
const YELLOW  = 0xffe000;          // utility accent — the trinket cube only
const VIEW_H  = 6.2;               // world units visible top-to-bottom (ortho height)
const OUTLINE_N = 56;              // points around the loft (low-poly)
const LEVELS    = 22;              // vertical rings of the loft (low-poly)

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp  = (a,b,t)=>a+(b-a)*t;
const easeOut = t => 1-Math.pow(1-t,3);
const easeInOut = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;

// ================================================================ renderer / scene
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(FIELD, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(FIELD);

let W = innerWidth, H = innerHeight, aspect = W/H;
const camera = new THREE.OrthographicCamera(
  -VIEW_H*aspect/2, VIEW_H*aspect/2, VIEW_H/2, -VIEW_H/2, -50, 50);
// gentle top-right drafting vantage: "back" recedes toward the upper-left, which is
// what lets the lower-left cube read as a box tilting up-and-away to the left.
camera.position.set(2.9, 3.1, 8.2);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

const camRight = new THREE.Vector3(), camUp = new THREE.Vector3(), camFwd = new THREE.Vector3();
function refreshCamBasis(){
  camera.matrixWorld.extractBasis(camRight, camUp, camFwd); // fwd points +Z out of screen
}
refreshCamBasis();

// ================================================================ chrome environment
// A hand-painted equirect gradient — a bright "heaven" cap up top for the angelic
// hotspot, cooling into the cobalt field below so the chrome carries the drafting
// blue in its reflections. No external HDR needed.
function makeEnvTexture(){
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  // upper hemisphere = bright angelic sky
  const sky = x.createLinearGradient(0,0,0,256);
  sky.addColorStop(0.00,'#ffffff'); sky.addColorStop(0.60,'#e3ecff'); sky.addColorStop(1.00,'#9fb6f4');
  x.fillStyle = sky; x.fillRect(0,0,1024,256);
  // lower hemisphere = deep cobalt "ground" — the darkness that makes metal read as chrome
  const gnd = x.createLinearGradient(0,256,0,512);
  gnd.addColorStop(0.00,'#2c46cc'); gnd.addColorStop(0.5,'#15298a'); gnd.addColorStop(1.00,'#080f36');
  x.fillStyle = gnd; x.fillRect(0,256,1024,256);
  // a crisp horizon line so the reflection has a hard edge to catch
  x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(0,253,1024,3);
  // the sun of this little heaven
  const halo = x.createRadialGradient(512,86,6, 512,86,210);
  halo.addColorStop(0,'rgba(255,255,255,1)'); halo.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle = halo; x.fillRect(0,0,1024,300);
  // two hard-edged softboxes — these become the sharp glints that say "chrome"
  x.fillStyle = '#ffffff';
  x.fillRect(180,64,132,86); x.fillRect(690,54,150,66);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromEquirectangular(makeEnvTexture()).texture;
scene.environment = envMap;

// a touch of direct light so facets still read as facets away from the hotspot
const hemi = new THREE.HemisphereLight(0xffffff, 0x2038c0, 0.5);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(-4, 6, 6); scene.add(key);

// ================================================================ atmospheric dust
const dust = (()=>{
  const N = 420;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N*3);
  const spd = new Float32Array(N);
  const R = VIEW_H*1.3;
  for(let i=0;i<N;i++){
    pos[i*3+0] = (Math.random()*2-1)*R*aspect;
    pos[i*3+1] = (Math.random()*2-1)*R;
    pos[i*3+2] = (Math.random()*2-1)*R*0.5;
    spd[i] = 0.02 + Math.random()*0.06;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const mat = new THREE.PointsMaterial({
    color:0xdfe8ff, size:0.028, transparent:true, opacity:0.55,
    depthWrite:false, blending:THREE.AdditiveBlending, sizeAttenuation:true });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -1;
  scene.add(pts);
  return { pts, pos, spd, N, R };
})();

// ================================================================ the trinket cube
// A real 3D wireframe box, pinned to the lower-left of the frame and oriented so it
// tips up-and-back toward the left. It is a live drop-target: carry a solid into it
// to wipe the slate clean.
const cube = (()=>{
  const group = new THREE.Group();
  const size = 0.72;
  const box = new THREE.BoxGeometry(size,size,size);
  const edges = new THREE.EdgesGeometry(box);
  const line = new THREE.LineSegments(edges,
    new THREE.LineBasicMaterial({ color:0xffe910, transparent:true, opacity:1.0 }));
  // faint filled floor of the box so a dropped solid looks like it lands *inside*
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size,size),
    new THREE.MeshBasicMaterial({ color:YELLOW, transparent:true, opacity:0.06, side:THREE.DoubleSide }));
  floor.rotation.x = -Math.PI/2; floor.position.y = -size/2;
  group.add(line); group.add(floor);
  // a soft glow sprite that swells when the cube is a valid drop target
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(size*1.7,size*1.7),
    new THREE.MeshBasicMaterial({ color:YELLOW, transparent:true, opacity:0, depthWrite:false,
      blending:THREE.AdditiveBlending }));
  glow.renderOrder = -1;
  group.add(glow);
  group.userData = { size, line, glow, floor };
  group.renderOrder = 2;
  scene.add(group);
  return group;
})();

function pinCube(){
  // pin the cube a fixed WORLD margin in from the lower-left frustum edges, so it keeps
  // the same inset (and never clips) whether the phone is wide or narrow. Face it
  // consistently to the camera so it always reads as a box receding up-and-back-left.
  const halfW = (camera.right - camera.left)/2;
  const halfH = (camera.top - camera.bottom)/2;
  const ext = cube.userData.size*0.95;          // the box's on-screen half-spread
  const x = -halfW + VIEW_H*0.055 + ext;
  const y = -halfH + VIEW_H*0.11  + ext;         // extra bottom room for the home indicator
  cube.position.copy(camera.position)
    .addScaledVector(camRight, x)
    .addScaledVector(camUp,    y)
    .addScaledVector(camFwd,  -8.2);            // sit on the origin plane
  cube.quaternion.copy(camera.quaternion);       // upright to the camera...
  cube.rotateY(0.66); cube.rotateX(0.30);        // ...then tip so the top opening shows
                                                 // and the box recedes up-and-back-left
  cube.userData.glow.quaternion.copy(camera.quaternion); // billboard the glow
}

// ================================================================ shape → geometry
// Resample a closed 2D loop to N evenly-spaced points by arc length.
function resampleClosed(pts, N){
  const P = pts.slice();
  // total perimeter
  let per = 0; const seg = [];
  for(let i=0;i<P.length;i++){
    const a=P[i], b=P[(i+1)%P.length];
    const d=Math.hypot(b.x-a.x,b.y-a.y); seg.push(d); per+=d;
  }
  const step = per/N, out = []; let i=0, acc=0;
  for(let k=0;k<N;k++){
    const target = k*step;
    while(acc+seg[i] < target && i<P.length-1){ acc+=seg[i]; i++; }
    const a=P[i], b=P[(i+1)%P.length];
    const t = seg[i] ? (target-acc)/seg[i] : 0;
    out.push({ x: lerp(a.x,b.x,t), y: lerp(a.y,b.y,t) });
  }
  return out;
}

// Measure how "un-circular" the loop is, split into two flavours the app treats
// differently: DRAMA (a few big smooth lobes — a splat) is kept as real shape, while
// WIGGLE (fast jitter — a shaky hand) becomes faceted surface roughness.
function shapeMetrics(outline){
  const N = outline.length;
  let cx=0, cy=0; for(const p of outline){ cx+=p.x; cy+=p.y; } cx/=N; cy/=N;
  const r = outline.map(p=>Math.hypot(p.x-cx,p.y-cy));
  const rMean = r.reduce((a,b)=>a+b,0)/N;
  // discrete radial harmonics r(θ) ~ Σ Ck e^{ikθ}, all the way to Nyquist so fast
  // hand-jitter isn't missed
  const KMAX = Math.floor(N/2)-1;
  const mag = [];
  for(let kf=0;kf<=KMAX;kf++){
    let re=0, im=0;
    for(let n=0;n<N;n++){ const a=2*Math.PI*kf*n/N; re+=r[n]*Math.cos(a); im-=r[n]*Math.sin(a); }
    mag.push(Math.hypot(re,im)/N);
  }
  let low=0, high=0;                         // 2-3 = drama (big smooth lobes), 4+ = wiggle
  for(let kf=2;kf<=3;kf++) low += mag[kf]*mag[kf];
  for(let kf=4;kf<=KMAX;kf++) high += mag[kf]*mag[kf];
  const norm = rMean*rMean + 1e-6;
  const drama  = clamp(Math.sqrt(low/norm)*2.2, 0, 1);
  const wiggle = clamp(Math.sqrt(high/norm)*2.7, 0, 1);
  // roundness readout: 1.0 == a true circle
  const roundness = clamp(1 - Math.sqrt((low+high)/norm)*1.5, 0, 1);
  return { cx, cy, rMean, drama, wiggle, roundness };
}

// Build the chrome solid. `rng` is a seeded PRNG so each draw is a unique 3D form
// that nonetheless keeps YOUR loop as its exact z=0 cross-section.
function buildForm(loopXY, rng){
  const outline = resampleClosed(loopXY, OUTLINE_N);
  const m = shapeMetrics(outline);
  // normalise: centre on centroid, scale so mean radius maps to a size that fits the
  // *narrow* side of the frustum — so even dramatic shapes never clip on a phone
  const halfW=(camera.right-camera.left)/2, halfH=(camera.top-camera.bottom)/2;
  const target = Math.min(halfW,halfH)*0.52, s = target/(m.rMean||1);
  const O = outline.map(p=>({ x:(p.x-m.cx)*s, y:(p.y-m.cy)*s }));

  // depth of the loft along Z relative to the loop's size + a little randomness so
  // some solids are plump and some are lens-thin
  const depth = target * lerp(0.82, 1.22, rng());

  // random-but-smooth vertical profile (keeps z=0 == your loop, poles pinch to 0):
  // radiusScale(phi)=cos(phi)*(1+lobe), lobe(0)=0 so the mid-slice is untouched.
  const la = (rng()*2-1)*0.22, lb=(rng()*2-1)*0.14, hw=(rng()*2-1)*0.18;
  const profile = phi => ({
    rs: Math.max(0, Math.cos(phi) * (1 + la*Math.sin(phi) + lb*Math.sin(2*phi))),
    z : depth * (Math.sin(phi) + hw*Math.sin(2*phi))
  });

  // coherent surface displacement: a stack of angular harmonics with random phase.
  // higher harmonics are unlocked by WIGGLE, so a shaky loop erupts into faceted
  // ridges while a clean loop stays glassy.
  const H = 7, amp=[], pha=[], kz=[], phz=[];
  for(let h=1;h<=H;h++){
    const hi = (h-1)/(H-1);
    const gate = h<=2 ? 1 : m.wiggle;            // low harmonics always a touch alive
    amp.push(gate * (0.16/h) * (0.5+rng()));
    pha.push(rng()*Math.PI*2);
    kz.push(1+Math.floor(rng()*3));
    phz.push(rng()*Math.PI*2);
  }
  const noise = (theta, u) => {                   // u in [-1,1] along the axis
    let d=0; for(let h=0;h<H;h++)
      d += amp[h]*Math.sin((h+1)*theta+pha[h])*Math.cos(kz[h]*u*Math.PI+phz[h]);
    return d;
  };
  const roughAmp = lerp(0.03, 0.62, m.wiggle);    // overall bump gain

  // ---- assemble vertices: pole, LEVELS-2 rings, pole ----
  const verts = [];
  const push = (x,y,z)=>{ verts.push(x,y,z); return verts.length/3-1; };
  const ring = [];                                // ring[i] -> array of vertex indices
  const iTop = push(0,0,profile( Math.PI/2).z);
  for(let i=1;i<LEVELS-1;i++){
    const phi = -Math.PI/2 + Math.PI*i/(LEVELS-1);
    const { rs, z } = profile(phi);
    const u = Math.sin(phi);
    const idx=[];
    for(let j=0;j<OUTLINE_N;j++){
      const theta = 2*Math.PI*j/OUTLINE_N;
      const bump = 1 + roughAmp*noise(theta,u)*Math.cos(phi); // fade bumps at poles
      idx.push(push(O[j].x*rs*bump, O[j].y*rs*bump, z));
    }
    ring.push(idx);
  }
  const iBot = push(0,0,profile(-Math.PI/2).z);

  // ---- triangles ----
  const tri = [];
  const top = ring[0], bot = ring[ring.length-1];
  for(let j=0;j<OUTLINE_N;j++){
    const jn=(j+1)%OUTLINE_N;
    tri.push(iTop, top[jn], top[j]);          // north cap
    tri.push(iBot, bot[j], bot[jn]);          // south cap
  }
  for(let i=0;i<ring.length-1;i++){
    const a=ring[i], b=ring[i+1];
    for(let j=0;j<OUTLINE_N;j++){
      const jn=(j+1)%OUTLINE_N;
      tri.push(a[j], b[j], b[jn]);
      tri.push(a[j], b[jn], a[jn]);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
  geo.setIndex(tri);
  geo.computeVertexNormals();
  geo.center();
  return { geo, metrics:m };
}

// ================================================================ the solid on stage
let solid = null;   // { mesh, wire, born, spin, ... }

function disposeSolid(s){
  if(!s) return;
  scene.remove(s.mesh); scene.remove(s.wire);
  s.mesh.geometry.dispose(); s.mesh.material.dispose();
  s.wire.geometry.dispose(); s.wire.material.dispose();
}

function spawnSolid(loopXY){
  const rng = mulberry32((Math.random()*2**32)>>>0);
  const { geo, metrics } = buildForm(loopXY, rng);

  const mat = new THREE.MeshStandardMaterial({
    color:0xffffff, metalness:1.0,
    roughness: clamp(lerp(0.26, 0.06, metrics.roundness), 0.05, 0.4),
    envMapIntensity:1.05, flatShading:true });
  const mesh = new THREE.Mesh(geo, mat);

  // faint triangulation overlay — the drafting understructure, brightest at birth
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color:0xdfe8ff, transparent:true, opacity:0.0 }));

  // born facing the camera so you first see EXACTLY the loop you drew, then it turns
  mesh.quaternion.copy(camera.quaternion);
  wire.quaternion.copy(camera.quaternion);

  disposeSolid(solid);
  scene.add(mesh); scene.add(wire);
  solid = {
    mesh, wire, metrics,
    born: performance.now(),
    spin: 0.28,                 // idle turn speed (rad/s)
    angVel: 0,                  // inertia from dragging
    home: new THREE.Vector3(0,0,0),
    pos: new THREE.Vector3(0,0,0),
    scale: 0.0,
    state:'birth'               // birth | idle | grabbed | dropping | springing
  };
  showReadout(metrics);
}

// ================================================================ lasso (2D overlay)
const ink = document.getElementById('ink');
const ictx = ink.getContext('2d');
let stroke = null;            // array of {x,y} in css px while drawing

function drawStroke(){
  ictx.clearRect(0,0,ink.width,ink.height);
  if(!stroke || stroke.length<2) return;
  const dpr = renderer.getPixelRatio();
  ictx.save(); ictx.scale(dpr,dpr);
  ictx.lineJoin='round'; ictx.lineCap='round';
  // glow underlay
  ictx.strokeStyle='rgba(180,205,255,.35)'; ictx.lineWidth=6;
  ictx.beginPath(); ictx.moveTo(stroke[0].x,stroke[0].y);
  for(const p of stroke) ictx.lineTo(p.x,p.y); ictx.stroke();
  // crisp hairline
  ictx.strokeStyle='rgba(238,244,255,.95)'; ictx.lineWidth=1.6;
  ictx.beginPath(); ictx.moveTo(stroke[0].x,stroke[0].y);
  for(const p of stroke) ictx.lineTo(p.x,p.y); ictx.stroke();
  // closing chord hint
  const a=stroke[0], b=stroke[stroke.length-1];
  if(Math.hypot(a.x-b.x,a.y-b.y) < 46){
    ictx.setLineDash([2,5]); ictx.strokeStyle='rgba(238,244,255,.5)'; ictx.lineWidth=1;
    ictx.beginPath(); ictx.moveTo(b.x,b.y); ictx.lineTo(a.x,a.y); ictx.stroke();
    ictx.setLineDash([]);
  }
  ictx.restore();
}

// screen px -> world XY on the plane through the origin (facing the camera)
function screenToPlane(px, py){
  const ndcX = (px/W)*2-1, ndcY = -((py/H)*2-1);
  return new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);
}
// map a css-px loop into the camera-facing plane's local right/up coords, so the
// solid is built in the same orientation you drew it in
function loopToLocal(px){
  const out=[];
  for(const p of px){
    const w = screenToPlane(p.x, p.y).sub(camera.position);
    out.push({ x: w.dot(camRight), y: w.dot(camUp) });
  }
  return out;
}

// ================================================================ HUD helpers
const hintEl = document.getElementById('hint');
const readEl = document.getElementById('read');
let hintGone = false;
function killHint(){ if(!hintGone){ hintGone=true; hintEl.classList.add('gone'); } }
// nearly-bare HUD: a single-line whisper of how true your circle was, shown for a
// beat after each draw, then it fades back to nothing.
let readFade = 0;
function showReadout(m){
  readEl.textContent = `roundness ${(m.roundness*100|0).toString().padStart(2,'0')}%`;
  readEl.classList.add('show');
  clearTimeout(readFade);
  readFade = setTimeout(()=>readEl.classList.remove('show'), 1900);
}

// ================================================================ pointer gestures
let pointer = null;   // active pointer id
let mode = null;      // 'draw' | 'rotate' | 'grab'
let last = {x:0,y:0};
let downAt = 0, moved = 0, grabTimer = 0;
const ray = new THREE.Raycaster();

function hitSolid(px,py){
  if(!solid) return false;
  const ndc = new THREE.Vector2((px/W)*2-1, -((py/H)*2-1));
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(solid.mesh, false).length>0;
}
function cubeScreen(){
  const v = cube.position.clone().project(camera);
  return { x:(v.x*0.5+0.5)*W, y:(-v.y*0.5+0.5)*H };
}
function overCube(px,py){
  const c = cubeScreen();
  return Math.hypot(px-c.x, py-c.y) < Math.min(W,H)*0.17;
}

function onDown(e){
  if(pointer!==null) return;
  pointer = e.pointerId; try{ canvas.setPointerCapture(pointer); }catch(_){}
  const p = getXY(e); last=p; downAt=performance.now(); moved=0;

  if(solid && hitSolid(p.x,p.y)){
    mode='rotate'; solid.angVel=0;
    grabTimer = setTimeout(()=>{           // hold still to pick it up
      if(mode==='rotate' && moved<10){ mode='grab'; solid.state='grabbed'; }
    }, 260);
  } else {
    mode='draw'; stroke=[p]; killHint();
  }
}
function onMove(e){
  if(e.pointerId!==pointer) return;
  const p = getXY(e); const dx=p.x-last.x, dy=p.y-last.y;
  moved += Math.hypot(dx,dy);

  if(mode==='draw'){
    stroke.push(p); drawStroke();
  } else if(mode==='rotate' && solid){
    const k=0.008;
    const qx=new THREE.Quaternion().setFromAxisAngle(camUp,   dx*k);
    const qy=new THREE.Quaternion().setFromAxisAngle(camRight,dy*k);
    solid.mesh.quaternion.premultiply(qx).premultiply(qy);
    solid.wire.quaternion.copy(solid.mesh.quaternion);
    solid.angVel = dx*k; // carry spin as horizontal inertia
    if(moved>10 && grabTimer){ clearTimeout(grabTimer); grabTimer=0; }
  } else if(mode==='grab' && solid){
    const w = screenToPlane(p.x,p.y);
    solid.pos.copy(w);
    cube.userData.glow.material.opacity = overCube(p.x,p.y) ? 0.5 : 0.14;
  }
  last=p;
}
function onUp(e){
  if(e.pointerId!==pointer) return;
  if(grabTimer){ clearTimeout(grabTimer); grabTimer=0; }
  const p = getXY(e);

  if(mode==='draw'){
    stroke.push(p);
    const loop = stroke.slice();
    fadeStroke();
    // needs to be a real loop: enough points, enough area, roughly closed
    if(loop.length>=8 && loopArea(loop) > (Math.min(W,H)*0.12)**2){
      spawnSolid(loopToLocal(loop));
    }
    stroke=null;
  } else if(mode==='grab' && solid){
    if(overCube(p.x,p.y)) dropIntoCube(); else springHome();
    cube.userData.glow.material.opacity = 0;
  } else if(mode==='rotate' && solid){
    solid.state='idle';
  }
  pointer=null; mode=null;
}
function getXY(e){ return { x:e.clientX, y:e.clientY }; }
function loopArea(pts){       // shoelace, abs
  let a=0; for(let i=0;i<pts.length;i++){ const p=pts[i], q=pts[(i+1)%pts.length];
    a += p.x*q.y - q.x*p.y; } return Math.abs(a)/2;
}
function fadeStroke(){        // quick dissolve of the drawn line as the solid is born
  const t0=performance.now();
  (function f(){ const k=(performance.now()-t0)/260;
    ictx.clearRect(0,0,ink.width,ink.height);
    if(stroke && k<1){ ictx.save(); const dpr=renderer.getPixelRatio(); ictx.scale(dpr,dpr);
      ictx.globalAlpha=1-k; ictx.strokeStyle='rgba(238,244,255,.9)'; ictx.lineWidth=1.6;
      ictx.lineJoin='round'; ictx.beginPath(); ictx.moveTo(stroke[0].x,stroke[0].y);
      for(const p of stroke) ictx.lineTo(p.x,p.y); ictx.stroke(); ictx.restore();
      requestAnimationFrame(f);
    }
  })();
}

function dropIntoCube(){ solid.state='dropping'; solid.dropAt=performance.now();
  solid.dropFrom=solid.pos.clone(); }
function springHome(){ solid.state='springing'; solid.springAt=performance.now();
  solid.springFrom=solid.pos.clone(); }

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup',   onUp);
canvas.addEventListener('pointercancel', onUp);

// ================================================================ compositor
let composer, bloom;
function buildComposer(){
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y,
    { type:THREE.HalfFloatType, samples:4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(size.x,size.y), 0.30, 0.55, 0.90);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
buildComposer();

// ================================================================ resize
let forceW=0, forceH=0;   // dev-only: preview a fixed phone viewport
function resize(){
  W=forceW||innerWidth; H=forceH||innerHeight; aspect=W/H;
  camera.left=-VIEW_H*aspect/2; camera.right=VIEW_H*aspect/2;
  camera.top=VIEW_H/2; camera.bottom=-VIEW_H/2; camera.updateProjectionMatrix();
  camera.updateMatrixWorld(); refreshCamBasis();
  renderer.setSize(W,H,false);
  ink.width = Math.floor(W*renderer.getPixelRatio());
  ink.height= Math.floor(H*renderer.getPixelRatio());
  ink.style.width=W+'px'; ink.style.height=H+'px';
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  composer.setSize(size.x,size.y); bloom.setSize(size.x,size.y);
}
addEventListener('resize', resize);
resize();

// ================================================================ loop
const clock = new THREE.Clock();
function tick(){
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  // dust drift + gentle recycle
  const d=dust; for(let i=0;i<d.N;i++){
    d.pos[i*3+1] += d.spd[i]*dt;
    if(d.pos[i*3+1] > d.R){ d.pos[i*3+1] = -d.R; }
  }
  d.pts.geometry.attributes.position.needsUpdate = true;
  d.pts.rotation.y += dt*0.02;

  pinCube();
  cube.userData.glow.material.opacity *= (1 - dt*3); // ease glow back down

  if(solid){
    const s = solid;
    if(s.state==='birth'){
      const k = clamp((now-s.born)/900, 0, 1);
      s.scale = easeOut(k);
      s.wire.material.opacity = (1-k)*0.6 + 0.05;     // wire assembles, then fades
      s.mesh.material.opacity = 1;
      if(k>=1) s.state='idle';
    } else if(s.state==='idle'){
      s.wire.material.opacity += (0.05 - s.wire.material.opacity)*0.1;
      // idle turn + inertia from the last drag
      const spin = s.spin*dt + s.angVel;
      const q=new THREE.Quaternion().setFromAxisAngle(camUp, spin);
      s.mesh.quaternion.premultiply(q); s.wire.quaternion.copy(s.mesh.quaternion);
      s.angVel *= 0.92;
    } else if(s.state==='dropping'){
      const k = clamp((now-s.dropAt)/420, 0, 1);
      const e = easeInOut(k);
      s.pos.copy(s.dropFrom).lerp(cube.position, e);
      s.pos.y -= Math.sin(k*Math.PI)*0.15;            // little arc down into the box
      s.scale = (1-k);
      if(k>=1){ disposeSolid(s); solid=null; readEl.classList.remove('show');
        cube.userData.glow.material.opacity = 0.32; } // a soft flash as it lands
    } else if(s.state==='springing'){
      const k = clamp((now-s.springAt)/360, 0, 1);
      s.pos.copy(s.springFrom).lerp(s.home, easeOut(k));
      if(k>=1) s.state='idle';
    }
    if(solid){
      s.mesh.position.copy(s.pos); s.wire.position.copy(s.pos);
      s.mesh.scale.setScalar(s.scale); s.wire.scale.setScalar(s.scale);
    }
  }

  composer.render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// dismiss the boot flash once the first frame is up
requestAnimationFrame(()=>{ const b=document.getElementById('boot');
  setTimeout(()=>b.classList.add('gone'), 260); });

// ================================================================ utils
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }

// ---- debug hook: synthesise known loops so the mapping can be verified ----
window.__neo = {
  spawn: spawnSolid,
  feed(px){ spawnSolid(loopToLocal(px)); },
  camera, cube, scene, get solid(){ return solid; },
  originNDC(){ const v=new THREE.Vector3(0,0,0).project(camera);
    return { x:(v.x*0.5+0.5)*W, y:(-v.y*0.5+0.5)*H }; },
  forceSize(w,h){ forceW=w; forceH=h;
    for(const el of [canvas, ink]){ el.style.position='fixed'; el.style.left='0'; el.style.top='0';
      el.style.width=w+'px'; el.style.height=h+'px'; el.style.inset='auto'; }
    resize(); },
  test(kind='circle'){
    const cx=W/2, cy=H/2, R=Math.min(W,H)*0.28, pts=[];
    for(let i=0;i<120;i++){ const a=2*Math.PI*i/120; let r=R;
      if(kind==='blob')   r=R*(1+0.34*Math.sin(3*a)+0.18*Math.cos(2*a));
      if(kind==='jagged') r=R*(1+0.13*Math.sin(6*a+1)+0.11*Math.sin(9*a+2)+0.09*Math.sin(13*a)+0.05*(Math.random()-0.5));
      if(kind==='star')   r=R*(1+0.42*Math.sin(5*a));
      pts.push({ x:cx+r*Math.cos(a), y:cy+r*Math.sin(a) });
    }
    killHint(); spawnSolid(loopToLocal(pts)); return kind;
  }
};
