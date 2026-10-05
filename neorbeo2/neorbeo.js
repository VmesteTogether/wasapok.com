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
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import * as CANNON from 'cannon-es';

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
// installed to the Home Screen (or any true standalone) -> drop the desktop phone mock
if(navigator.standalone === true || matchMedia('(display-mode: standalone)').matches)
  document.body.classList.add('standalone');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(FIELD, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(FIELD);

let W = innerWidth, H = innerHeight, aspect = W/H;
// Subtle PERSPECTIVE (so objects flicked "back into the backdrop" actually read as
// receding). fov + distance are chosen so the framing at the origin plane matches the
// old orthographic VIEW_H, keeping every size/position roughly where it was.
const FOV = 30, DEG = Math.PI/180;
const CAM_DIST = (VIEW_H/2) / Math.tan(FOV*0.5*DEG);        // ~11.6
const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 200);
// same gentle top-right vantage as before, just farther out for the narrow fov
camera.position.copy(new THREE.Vector3(2.9, 3.1, 8.2).normalize().multiplyScalar(CAM_DIST));
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
// visible half-extents of the origin plane (replaces the ortho frustum halves)
function frustumHalf(){ const hh = CAM_DIST*Math.tan(FOV*0.5*DEG); return { halfW:hh*aspect, halfH:hh }; }

const camRight = new THREE.Vector3(), camUp = new THREE.Vector3(), camFwd = new THREE.Vector3();
function refreshCamBasis(){
  camera.matrixWorld.extractBasis(camRight, camUp, camFwd); // fwd points +Z out of screen
}
refreshCamBasis();

// ================================================================ physics (cannon-es)
// Flicked solids fall "back into the backdrop": gravity points along the view axis (into
// the screen), and an invisible plane behind the origin is the surface they settle on.
const viewAxis = camFwd.clone().multiplyScalar(-1);        // into the screen
const G = 22;
const world = new CANNON.World({ gravity: new CANNON.Vec3(viewAxis.x*G, viewAxis.y*G, viewAxis.z*G) });
world.allowSleep = true;
world.defaultContactMaterial.friction = 1.4;     // very grippy — rocks plant on contact
world.defaultContactMaterial.restitution = 0.04;  // barely any bounce — a heavy thud
const BACKDROP_DIST = 3.2;                                  // how far behind origin the surface sits
function addPlane(normal, point){        // static plane; normal points toward where objects live
  const b = new CANNON.Body({ mass:0, shape:new CANNON.Plane() });
  b.quaternion.setFromVectors(new CANNON.Vec3(0,0,1), new CANNON.Vec3(normal.x,normal.y,normal.z));
  b.position.set(point.x, point.y, point.z);
  world.addBody(b); return b;
}
// the backdrop surface objects settle against
addPlane(camFwd, viewAxis.clone().multiplyScalar(BACKDROP_DIST));

// compose a flick: a modest sideways nudge from the drag + a firm push straight back into
// the screen, so it reads as "falls back onto the backdrop" and stays in your space
function flickVel(raw){
  const v = _tmpV.set(0,0,0);
  if(raw) v.copy(raw).multiplyScalar(0.25);        // less sideways throw -> less slide
  const sp = v.length(); if(sp>1.9) v.multiplyScalar(1.9/sp);
  v.addScaledVector(viewAxis, 3.0);
  return v;
}

const trinkets = [];              // settled/flying { mesh, body }
const TRINKET_CAP = 12;
function syncTrinkets(){
  for(const t of trinkets){
    t.mesh.position.set(t.body.position.x, t.body.position.y, t.body.position.z);
    t.mesh.quaternion.set(t.body.quaternion.x, t.body.quaternion.y, t.body.quaternion.z, t.body.quaternion.w);
  }
}
// the instant a flicked trinket first touches the streambed, freeze it to STATIC so it's a
// fixed rock (no creeping) — a conclusive geometry to build the ripple around
function freezeOnContact(){
  for(const t of trinkets){
    if(t.frozen) continue;
    const p = t.body.position, depth = p.x*viewAxis.x + p.y*viewAxis.y + p.z*viewAxis.z;
    const onBed = depth >= BACKDROP_DIST - t.colliderR - 0.03;                     // freeze the INSTANT it touches
    const settled = t.body.velocity.length() < 0.12 && depth > BACKDROP_DIST*0.5;  // or resting on another rock
    if(onBed || settled){
      t.body.velocity.set(0,0,0); t.body.angularVelocity.set(0,0,0);
      t.body.type = CANNON.Body.STATIC; t.body.updateMassProperties();
      t.frozen = true;
      t.settledAt = performance.now();             // start the patina clock the moment it comes to rest
      if(!t.ps1) togglePS1(t);                     // on impact with the backdrop the stone turns PS1
    }
  }
}
// hand the active hero to the physics world with a flick velocity (world units/s)
function commitToPhysics(vx,vy,vz){
  if(!solid) return;
  const s = solid, geo = s.mesh.geometry; geo.computeBoundingSphere();
  const R = geo.boundingSphere.radius * 0.82;
  const body = new CANNON.Body({ mass:1, shape:new CANNON.Sphere(R), linearDamping:0.66, angularDamping:0.8 });
  body.position.set(s.pos.x, s.pos.y, s.pos.z);
  body.quaternion.set(s.mesh.quaternion.x, s.mesh.quaternion.y, s.mesh.quaternion.z, s.mesh.quaternion.w);
  body.velocity.set(vx, vy, vz);
  body.angularVelocity.set((Math.random()-0.5)*5,(Math.random()-0.5)*5,(Math.random()-0.5)*5);
  world.addBody(body);
  scene.remove(s.wire); s.wire.geometry.dispose(); s.wire.material.dispose();  // drop hero-only bits
  if(s.mini) uiScene.remove(s.mini);
  if(s.points){ uiScene.remove(s.points); s.points.geometry.dispose(); s.points.material.dispose(); }
  s.mesh.scale.setScalar(1);
  s.mesh.layers.enable(1);                          // so the rock mask camera sees it
  trinkets.push({ mesh:s.mesh, body, r:(geo.boundingSphere?geo.boundingSphere.radius:R), colliderR:R, frozen:false });
  solid = null; readEl.classList.remove('show');
  startWater();                                       // the first dropped stone brings the water in
}
function deleteTrinket(t){
  const i = trinkets.indexOf(t); if(i<0) return;
  trinkets.splice(i,1); world.removeBody(t.body);
  scene.remove(t.mesh); t.mesh.geometry.dispose();
  const chrome = t.ps1 ? t.chromeMat : t.mesh.material;   // the per-rock chrome material
  if(chrome) chrome.dispose();
  if(t.ps1Mat) t.ps1Mat.dispose();                        // and the per-rock PS1 clone (own uniforms)
  if(trinkets.length === 0) startDrain();            // last stone gone -> cut the dam, drain the water
}
// a settled rock that drifted off the visible field has effectively fallen away - drop it, so an
// off-screen stray never keeps the water flowing after the on-screen ones are all deleted.
const _scrn = new THREE.Vector3(), _scrnE = new THREE.Vector3();
function pruneOffScreen(){
  for(const t of [...trinkets]){
    if(!t.frozen) continue;
    _scrn.copy(t.mesh.position).project(camera);                          // centre in NDC
    const rx = Math.abs(_scrnE.copy(t.mesh.position).addScaledVector(camRight, t.r).project(camera).x - _scrn.x);
    const ry = Math.abs(_scrnE.copy(t.mesh.position).addScaledVector(camUp,    t.r).project(camera).y - _scrn.y);
    // only once the WHOLE stone has cleared the frame - its nearest edge is past the screen edge
    if(Math.abs(_scrn.x) - rx > 1.0 || Math.abs(_scrn.y) - ry > 1.0) deleteTrinket(t);
  }
}

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

// ---- flat PS1 material: a settled rock, single-tapped, swaps its chrome for this. Matte grey, banded
// to a few shade levels (low colour depth), flat-faceted (screen-derivative normal), and vertex-SNAPPED
// to a coarse grid with a tiny ~8fps re-rolled jitter so it wobbles with that PlayStation-1 low-refresh
// feel even while the stone sits still. Shared across all PS1 rocks (one uniform set drives them all).
const MOSS_FULL_MS = 75000;   // a rock reaches full patina after sitting still this long ("very slowly")
const ps1Mat = new THREE.ShaderMaterial({
  uniforms:{ uGrey:{ value:new THREE.Color(0xb6bac2) }, uMoss:{ value:new THREE.Color(0x5a6e33) },
             uLight:{ value:new THREE.Vector3(-0.4,0.75,0.55).normalize() },
             uSnap:{ value:88.0 }, uTime:{ value:0 }, uAge:{ value:0 } },
  vertexShader:`
    varying vec3 vView; uniform float uSnap, uTime;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position,1.0); vView = mv.xyz;
      vec4 clip = projectionMatrix * mv;
      vec2 ndc = clip.xy / clip.w;
      float step = floor(uTime*8.0);                                   // ~8 "frames"/sec -> low refresh
      vec2 j = vec2(fract(sin(dot(position.xy,vec2(12.9,78.2))+step)*43758.5),
                    fract(sin(dot(position.yz,vec2(39.3,11.1))+step)*43758.5)) - 0.5;
      ndc = floor((ndc + j*0.006) * uSnap) / uSnap;                    // per-vertex jitter + coarse snap -> PS1 wobble
      clip.xy = ndc * clip.w; gl_Position = clip;
    }`,
  fragmentShader:`
    precision highp float;
    varying vec3 vView; uniform vec3 uGrey, uMoss, uLight; uniform float uAge;
    float h21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
    void main(){
      vec3 n = normalize(cross(dFdx(vView), dFdy(vView))); if(n.z<0.0) n=-n;  // flat facet normal
      float d = clamp(dot(n, uLight), 0.0, 1.0);
      float shade = floor((0.42 + 0.58*d)*4.0 + 0.5)/4.0;              // band to ~4 levels (low colour depth)
      vec3 col = uGrey*shade;
      // PATINA: moss creeps over the UPSTREAM-facing facets (screen-up, view-space n.y>0) the longer
      // the rock has sat undisturbed. A clumpy hash keeps it mottled, not a flat wash, and it eases in
      // so a freshly-set stone stays bare grey until it has held still a while.
      float upFace = smoothstep(0.10, 0.80, n.y);
      float mottle = 0.55 + 0.45*h21(floor(vView.xy*7.0));
      float moss = smoothstep(0.0, 0.9, clamp(uAge,0.0,1.0) * upFace * mottle);
      col = mix(col, uMoss*shade, moss*0.85);
      gl_FragColor = vec4(col, 1.0);
    }`,
  side:THREE.FrontSide, extensions:{ derivatives:true } });
// swap a settled rock's material chrome <-> flat PS1 (keeps the per-rock chrome material to restore/dispose)
function togglePS1(t){
  if(t.ps1){ t.mesh.material = t.chromeMat; t.ps1 = false; }
  else {
    t.chromeMat = t.mesh.material;
    if(!t.ps1Mat) t.ps1Mat = ps1Mat.clone();   // own uniform set so each rock's patina ages independently
    t.mesh.material = t.ps1Mat; t.ps1 = true;
  }
}

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

// ================================================================ dithered current
// A full-screen background: a simulated stream flowing down the screen, rendered in the
// same ordered-dither as monitor style 0 — cobalt water with yellow highlight-dots that
// thicken over ripples/streaks and scroll downward. (First slice of the meditation mode.)
const WATER_VERT = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`;   // fullscreen, far plane
const WATER_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uCell, uDebug, uReveal, uDrain, uAspect; // uReveal: water falls in from the top; uDrain: it drains out the bottom
  uniform vec3 uRipples[8];             // tap ripples: xy = uv centre, z = birth time (uTime units)
  uniform vec3 uDeep, uLit;
  uniform sampler2D uMask; uniform vec2 uTexel;      // offscreen silhouettes of the rocks
  float hash(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
  float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.02; a*=0.5; } return s; }
  float B2(vec2 a){ a=floor(a); return fract(a.x*0.5+a.y*a.y*0.75); }
  float B4(vec2 a){ return B2(0.5*a)*0.25+B2(a); }
  float B8(vec2 a){ return B4(0.5*a)*0.25+B2(a); }
  float M(vec2 uv){ return texture2D(uMask, uv).r; }
  void main(){
    float t = uTime;
    vec2  flowDir = vec2(0.0,-1.0);                           // the stream runs top -> bottom
    float m0 = M(vUv);                                        // 1 inside a stone, 0 in open water

    // --- silhouette field: a smooth outward halo + the stone's outward surface normal -------------
    // Three concentric ring-averages give a clean falloff (no blocky diamond); a 4-tap gradient at
    // the mid ring gives the outward normal, so we can tell the upstream face (stone's top) from
    // its shoulders (tangent to the flow).
    vec2  tx = uTexel;
    float ml=M(vUv-vec2(tx.x*6.,0.)), mr=M(vUv+vec2(tx.x*6.,0.));
    float md=M(vUv-vec2(0.,tx.y*6.)), mu=M(vUv+vec2(0.,tx.y*6.));
    float A1=(M(vUv-vec2(tx.x*2.,0.))+M(vUv+vec2(tx.x*2.,0.))+M(vUv-vec2(0.,tx.y*2.))+M(vUv+vec2(0.,tx.y*2.)))*0.25;
    float A2=(ml+mr+md+mu)*0.25;
    float A3=(M(vUv-vec2(tx.x*12.,0.))+M(vUv+vec2(tx.x*12.,0.))+M(vUv-vec2(0.,tx.y*12.))+M(vUv+vec2(0.,tx.y*12.)))*0.25;
    float rim  = max(m0, A1);                                 // thin contact rim
    float halo = clamp(m0 + A1*0.55 + A2*0.30 + A3*0.18, 0.0, 1.0);  // smooth outward proximity
    vec2  grad = vec2(mr-ml, mu-md);                          // points toward the stone
    vec2  g    = grad/(length(grad)+1e-4);                    // unit, toward the stone
    vec2  outN = -g;                                          // outward surface normal
    float up    = clamp( outN.y, 0.0, 1.0);                   // faces UPSTREAM (stone's top)
    float shldr = clamp(1.0 - abs(outN.y), 0.0, 1.0);         // shoulders (tangent to the flow)

    float open = 1.0 - m0;

    // --- downstream shadow: how deep behind a stone am I? (confines & fades the trailing drag) -----
    // March upstream (+Y) in a slightly-widening cone; nearer stone counts for more, so the value is
    // strongest right behind the stone and tapers softly downstream - the envelope of the drag trail.
    float shadow = 0.0;
    for(int i=1;i<=8;i++){
      float fi = float(i), dY = fi*0.019, sp = fi*0.006;
      float cover = (M(vUv+vec2(-sp,dY)) + M(vUv+vec2(0.0,dY)) + M(vUv+vec2(sp,dY)))*0.33333;
      shadow += cover*(1.0 - fi/9.0);
    }
    shadow = clamp(shadow*0.55, 0.0, 1.0) * open;

    // --- rock-to-rock shelter + stone mass: one march, two cues -----------------------------------
    // Looking UP the stream (+Y), past the near-lee, tells whether ANOTHER stone shelters this spot -
    // a stone standing in a bigger stone's wake meets already-broken water, so its split reads weaker.
    // Looking DOWN (-Y) measures how much stone sits below: a cheap proxy for a big/near boulder that
    // the current piles up against (used by the depth tint).
    float shelter = 0.0, mass = 0.0;
    for(int i=1;i<=8;i++){
      float fi = float(i);
      float uY = 0.055 + fi*0.030;                                              // reach past the near-lee, up to ~0.30
      float cov = (M(vUv+vec2(-fi*0.004,uY)) + M(vUv+vec2(0.0,uY)) + M(vUv+vec2(fi*0.004,uY)))*0.33333;
      shelter = max(shelter, cov*(1.0 - fi/10.0));                              // a nearer upstream stone shelters more
      mass += M(vUv+vec2(0.0,-fi*0.028)) * (1.0 - fi/9.0);                      // stone directly below (its bulk)
    }
    mass = clamp(mass*0.34, 0.0, 1.0);

    // --- steer the flowing texture so streamlines bend around the stone ---------------------------
    vec2 tang = vec2(-g.y, g.x); if(dot(tang,flowDir)<0.0) tang=-tang;   // downstream tangent
    vec2 p = vUv + (tang*0.9 - g*0.25) * halo * 0.14;

    // --- eddies: a slow, counter-drifting curl that lives only in the deepest lee -----------------
    // Two fbm fields drifting against each other give a swirling vector; gated to the deep lee it
    // becomes the recirculation right behind the stone - the trailing lines bend into it and the
    // water there slowly boils over rather than dragging in dead-straight streaks.
    float leeDeep = smoothstep(0.30, 0.85, shadow);
    float e1 = fbm(vec2(p.x*6.0 + t*0.13, p.y*6.0 - t*0.10));
    float e2 = fbm(vec2(p.x*6.0 - t*0.11 + 5.3, p.y*6.0 + t*0.15 + 2.1));
    vec2  curl = vec2(e1, e2) - 0.5;                                            // a slowly swirling vector
    vec2  pLee = p + curl * leeDeep * 0.05;                                     // bend the lee texture into the eddy

    float flow   = fbm(vec2(p.x*3.2, p.y*1.9 + t*0.30));
    float ripple = fbm(vec2(p.x*7.5, p.y*5.5 + t*0.72));
    float streak = fbm(vec2(p.x*20.0,p.y*2.4 + t*0.50));      // subtle streaks stretched along the flow
    float base = flow*0.60 + ripple*0.22 + streak*0.26;
    float v = clamp((base - 0.46)*1.35, 0.0, 1.0);           // calm, sparse open water (as before)

    // A. THE SPLIT - a thin bright bow-crest hugging the upstream face, brightest at the top-centre
    //    apex and thinning to nothing by the shoulders, so the stream reads as piling and dividing.
    float apex  = smoothstep(0.22, 0.92, up);                 // only the top-centre-facing band
    float crest = rim * apex * open * (1.0 - 0.7*shelter);    // a stone in another's lee splits more softly
    v += crest * (0.95 + 0.30*fbm(vec2(p.x*9.0, p.y*9.0 - t*1.3)));

    // B. SHOULDERS - the flow accelerates past into smooth, slightly darker fast water, lightly
    //    scored by fine speed-lines stretched along the current (not whitecaps).
    float sh = shldr * halo * open;
    v -= sh * 0.14;
    float speed = fbm(vec2(p.x*24.0, p.y*3.0 + t*1.4));
    v += sh * smoothstep(0.58, 0.82, speed) * 0.16;

    // C. THE TRAIL - GLITTERING LINES dragging from the back of the stone. A few sharp streak-lines
    //    peel downstream within the lee, and each one SCINTILLATES: a per-dither-cell sparkle that
    //    re-rolls several times a second lights the dots along the lines in and out, so the trail
    //    glitters rather than sitting as a flat smear.
    float lines = fbm(vec2(pLee.x*30.0, pLee.y*1.4 + t*0.9)); // stretched along flow, bent by the eddy -> curling drag-lines
    float lineMask = smoothstep(0.48, 0.70, lines);          // sharpen into discrete lines
    vec2  cellId = floor(gl_FragCoord.xy / max(uCell,1.0));  // align the sparkle to the dither dots
    float tw = hash(cellId + floor(vec2(t*7.0, t*7.0)));     // per-cell twinkle, re-rolls ~7x/sec
    float glitter = 0.55 + 1.15*smoothstep(0.5, 1.0, tw);    // steady line + bright intermittent sparks
    v += shadow * lineMask * glitter * 0.55;
    // recirculation churn: the deepest lee turns over slowly, lifting AND darkening as the eddy rolls
    float swirl = fbm(vec2(pLee.x*9.0, pLee.y*4.0 - t*0.22));
    v += leeDeep * (smoothstep(0.42, 0.74, swirl) - 0.28) * 0.34;

    // C2. HORIZONTAL DRAG - a very, very faint sideways tail wisping off the stone's flanks: the same
    //     glittering dither but stretched HORIZONTALLY and drifting, so it just barely complements the
    //     vertical garland without competing. hdrag is a short symmetric smear off either flank.
    float hdrag = 0.0;
    for(int i=1;i<=5;i++){ float fi=float(i), dX=fi*0.018;
      hdrag = max(hdrag, (M(vUv+vec2(dX,0.0)) + M(vUv+vec2(-dX,0.0)))*0.5 * (1.0-fi/6.0)); }
    hdrag *= open;
    float hlines = fbm(vec2(p.x*1.7 + t*0.25, p.y*26.0));    // stretched along X -> drifting horizontal streaks
    v += hdrag * smoothstep(0.50, 0.72, hlines) * glitter * 0.16;

    // D. CLICK RIPPLES - a tap on the water sends out a little expanding dithered ring that fades away.
    //    Added into v so it's gated by the fill/drain reveal below -> ripples only where water is on.
    for(int i=0;i<8;i++){
      vec3 rp = uRipples[i];
      float age = t - rp.z;
      if(age < 0.0 || age > 1.0) continue;
      vec2 dd = vUv - rp.xy; dd.x *= uAspect;               // aspect-correct so the ring is round
      float ring = smoothstep(0.03, 0.0, abs(length(dd) - age*0.09));  // a small ring expanding outward
      v += ring * (1.0-age)*(1.0-age) * 0.7;                          // bright early, fading over ~1s
    }

    v = clamp(v, 0.0, 1.0);

    // FILL + DRAIN: the field is bare base-blue (just floating dust) until the first stone is dropped;
    // then the water falls IN from the top (uReveal 0->1, a soft wavy front dropping down). When the
    // LAST stone is removed the supply is cut like a dam: the water stops at the top and drains out
    // the bottom (uDrain 0->1, its top surface sinking away). Water is present ABOVE the fill front
    // AND BELOW the draining surface; below the fill front or above the drain surface it's bare field.
    float fillFront = mix(1.14, -0.14, uReveal);
    fillFront -= 0.035*fbm(vec2(vUv.x*5.0, uTime*0.4));                    // wavy leading edge, filling
    float fillRev = smoothstep(fillFront - 0.06, fillFront + 0.02, vUv.y); // 1 above the fill front
    float drainTop = mix(1.14, -0.14, uDrain);
    drainTop -= 0.035*fbm(vec2(vUv.x*5.0, uTime*0.5 + 9.0));               // wavy trailing surface, draining
    float drainRev = smoothstep(drainTop + 0.06, drainTop - 0.02, vUv.y);  // 1 below the sinking surface
    float rev = fillRev * drainRev;
    v *= rev;

    // DEPTH TINT: water piling up in front of a big/near boulder pools into a darker, deeper blue.
    // Strongest on the upstream face (up), close to the stone (halo), and only where a lot of stone
    // sits below (mass) - so a small pebble barely stains while a broad rock casts a deep pool.
    vec3 deepCol = uDeep;
    float pool = clamp(up * halo * open * mass * 1.6, 0.0, 1.0);
    deepCol = mix(deepCol, uDeep*0.5, pool * rev);

    if(uDebug>0.5){ gl_FragColor = vec4(crest, shadow, lineMask, 1.0); return; }  // R=crest G=lee B=lines
    // dots only where the water has arrived; the bare field stays flat base-blue (step(B8,0) would
    // otherwise light every Bayer-zero cell into a grid).
    float lit = step(B8(gl_FragCoord.xy/max(uCell,1.0)), v) * step(0.001, rev);
    gl_FragColor = vec4(mix(deepCol, uLit, lit), 1.0);
  }`;
const water = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.ShaderMaterial({
  uniforms:{ uTime:{value:0}, uCell:{value:3.0*renderer.getPixelRatio()}, uDebug:{value:0},
    uReveal:{value:0}, uDrain:{value:0}, uAspect:{value:aspect},
    uRipples:{value:Array.from({length:8},()=>new THREE.Vector3(0,0,-999))},
    uDeep:{value:new THREE.Color(0x2243ee)}, uLit:{value:new THREE.Color(0xffe910)},
    uMask:{value:null}, uTexel:{value:new THREE.Vector2(1,1)} },
  vertexShader:WATER_VERT, fragmentShader:WATER_FRAG, depthTest:false, depthWrite:false }));
water.renderOrder = -1000; water.frustumCulled = false;
scene.add(water);

// a tap on open water drops a little expanding dithered ripple. Ring-buffer of 8 so quick taps stack.
let rippleIdx = 0;
function spawnRipple(px, py){
  water.material.uniforms.uRipples.value[rippleIdx].set(px/W, 1 - py/H, performance.now()/1000);
  rippleIdx = (rippleIdx + 1) % 8;
}

// water lifecycle: bare base-blue + floating dust until the first stone is dropped; then the water
// FALLS IN from the top (fill) and keeps flowing (on); when the LAST stone is removed the dam is cut
// and it DRAINS out the bottom (drain) back to bare field (off).
let waterState = 'off';                            // 'off' | 'fill' | 'on' | 'drain'
let waterStart = 0, drainStart = 0;
const WATER_FILL_MS = 2000, WATER_DRAIN_MS = 1900;
function startWater(){                              // a dropped stone opens the water
  if(waterState === 'off' || waterState === 'drain'){ waterState = 'fill'; waterStart = performance.now(); }
}
function startDrain(){                              // the last stone removed cuts the dam
  if(waterState === 'fill' || waterState === 'on'){ waterState = 'drain'; drainStart = performance.now(); }
}
function updateWater(now){
  const w = water.material.uniforms;
  if(waterState === 'fill'){
    const k = clamp((now-waterStart)/WATER_FILL_MS, 0, 1);
    w.uReveal.value = easeOut(k); w.uDrain.value = 0;
    if(k >= 1) waterState = 'on';
  } else if(waterState === 'on'){
    w.uReveal.value = 1; w.uDrain.value = 0;
  } else if(waterState === 'drain'){
    const k = clamp((now-drainStart)/WATER_DRAIN_MS, 0, 1);
    w.uReveal.value = 1; w.uDrain.value = k*k;      // accelerate as it falls away
    if(k >= 1){ waterState = 'off'; w.uReveal.value = 0; w.uDrain.value = 0; }
  } else {
    w.uReveal.value = 0; w.uDrain.value = 0;
  }
}

// Render the rocks' exact silhouettes to an offscreen mask (white on black) the water reads,
// so the foam/wake/flow conform to each unique geometry. Trinket meshes are put on layer 1;
// the mask camera renders only that layer, flat white.
const MASK_SCALE = 0.5;
const rockRT = new THREE.WebGLRenderTarget(2, 2, { depthBuffer:true });
const whiteMat = new THREE.MeshBasicMaterial({ color:0xffffff });
const _clr = new THREE.Color();
function renderRockMask(){
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const w = Math.max(2, Math.floor(size.x*MASK_SCALE)), h = Math.max(2, Math.floor(size.y*MASK_SCALE));
  if(rockRT.width!==w || rockRT.height!==h) rockRT.setSize(w,h);
  const pClr = renderer.getClearColor(_clr).getHex(), pAlpha = renderer.getClearAlpha(), pLayers = camera.layers.mask;
  scene.overrideMaterial = whiteMat; camera.layers.set(1);
  renderer.setClearColor(0x000000, 1); renderer.setRenderTarget(rockRT); renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.setClearColor(pClr, pAlpha);
  camera.layers.mask = pLayers; scene.overrideMaterial = null;
  const u = water.material.uniforms;
  u.uMask.value = rockRT.texture; u.uTexel.value.set(1/w, 1/h);
}

// ================================================================ the trinket cube
// A real 3D wireframe box, pinned to the lower-left of the frame and oriented so it
// tips up-and-back toward the left. It is a live drop-target: carry a solid into it
// to wipe the slate clean.
// UI overlay scene — rendered straight to the screen AFTER post-processing, so the
// cube's yellow keeps its true colour instead of being washed toward white by the
// field's ACES tone mapping / bloom.
const uiScene = new THREE.Scene();
const cube = (()=>{
  const group = new THREE.Group();
  const size = 0.72, half = size/2;
  // a plain square frame — a little monitor the spawned solid is mirrored into
  const pts = [
    -half,-half,0,  half,-half,0,   half,-half,0,  half, half,0,
     half, half,0, -half, half,0,  -half, half,0, -half,-half,0 ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  const line = new THREE.LineSegments(geo,
    new THREE.LineBasicMaterial({ color:0xffe910, transparent:true, opacity:1.0,
      toneMapped:false, depthTest:false, depthWrite:false }));
  group.add(line);
  // a pure base-blue backdrop that fills the monitor square once the water has arrived, so the
  // flowing "rain" never shows through — the little screen keeps its own clean field. Until then it
  // is HIDDEN, so the monitor inherits the resting field (the glowing dust drifting over the blue)
  // just like the rest of the screen; pinCube() flips it on when the falling water front reaches it.
  // Untone-mapped so it's the exact cobalt. Added straight to uiScene (NOT the group), because a
  // group's renderOrder propagates to its children as the primary sort key and would push the panel
  // on top of the dithered mini; at group-order 0 its renderOrder -2 sits it cleanly behind the mini.
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color:FIELD, toneMapped:false, depthTest:false, depthWrite:false }));
  panel.renderOrder = -2; panel.visible = false;
  uiScene.add(panel);
  // an inner-edge glow that hugs the INSIDE of the frame while a rock is being carried - the "drop it
  // here to delete" tell. Sized to the frame; brightest right at the border, fading inward, contained.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.ShaderMaterial({
      uniforms:{ uColor:{ value:new THREE.Color(YELLOW) }, uStrength:{ value:0 } },
      vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`precision highp float; varying vec2 vUv; uniform vec3 uColor; uniform float uStrength;
        void main(){ float d = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));  // 0 at the frame, 0.5 centre
          float band = smoothstep(0.15, 0.0, d);                                    // hug the frame, fade inward
          gl_FragColor = vec4(uColor, band*uStrength); }`,
      transparent:true, depthTest:false, depthWrite:false, blending:THREE.AdditiveBlending }));
  glow.renderOrder = -1;
  group.add(glow);
  group.userData = { size, line, glow, panel };
  group.renderOrder = 2;
  uiScene.add(group);
  return group;
})();

// ---- corner monitor material: takes the REAL solid geometry and re-renders it small in
// the square, shading each facet (flat normal via screen derivatives) and ordered-dithering
// (Bayer) the brightness into yellow dots. Because it's the actual geometry spun to match,
// the dithered readout is always exactly the model on screen — just drawn in dots.
const ditherMat = new THREE.ShaderMaterial({
  uniforms:{ uCell:{value:2.0*renderer.getPixelRatio()}, uColor:{value:new THREE.Color(0xffe910)},
             uLight:{value:new THREE.Vector3(-0.45,0.7,0.6).normalize()}, uStyle:{value:0} },
  vertexShader:`
    varying vec3 vView;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vView=mv.xyz; gl_Position=projectionMatrix*mv; }`,
  fragmentShader:`
    precision highp float;
    varying vec3 vView;
    uniform float uCell, uStyle; uniform vec3 uColor, uLight;
    float B2(vec2 a){ a=floor(a); return fract(a.x*0.5 + a.y*a.y*0.75); }
    float B4(vec2 a){ return B2(0.5*a)*0.25 + B2(a); }
    float B8(vec2 a){ return B4(0.5*a)*0.25 + B2(a); }   // ordered dither threshold 0..1
    float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
    void main(){
      vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));  // flat facet normal, view space
      if(n.z < 0.0) n = -n;                                 // face the viewer
      float diff = clamp(dot(n, uLight), 0.0, 1.0);
      float rim  = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.0);
      float v = clamp(0.13 + 0.9*diff + 0.30*rim, 0.0, 1.0);
      float th;
      if(uStyle < 0.5) th = B8(gl_FragCoord.xy/max(uCell,1.0));                 // style 0: ordered halftone dots
      else             th = hash21(floor(gl_FragCoord.xy/max(uCell*1.6,1.0)));  // style 1: scattered noise stipple
      if(v < th) discard;                                   // brighter -> denser dots
      gl_FragColor = vec4(uColor, 1.0);
    }`,
  side:THREE.DoubleSide, transparent:false, depthTest:true, depthWrite:true,
  extensions:{ derivatives:true } });

function pinCube(){
  // face the cube straight on (no tilt) and tuck it flush into the lower-left corner —
  // its bottom and left edges sit just inside the bottom-left frustum edges.
  const { halfW, halfH } = frustumHalf();
  const half = cube.userData.size/2;             // face-on, the box is a square
  const m = VIEW_H*0.03;                          // hair of margin so it isn't clipped
  const x = -halfW + m + half;
  const y = -halfH + m + half;
  cube.position.set(0,0,0)                        // on the origin plane, lower-left
    .addScaledVector(camRight, x)
    .addScaledVector(camUp,    y);
  cube.quaternion.copy(camera.quaternion);       // straight on, not tilted
  // the glow is a CHILD of this (already camera-facing) group, so it must stay at identity locally -
  // re-copying the camera quaternion onto it double-rotates it and leaves the square glow crooked.
  cube.userData.glow.quaternion.identity();
  const panel = cube.userData.panel;             // the blue backdrop rides with the monitor
  panel.position.copy(cube.position); panel.quaternion.copy(camera.quaternion);
  // the monitor inherits the resting field (dust on blue) only while the water is fully OFF; the
  // instant a stone drops (water begins) it snaps to solid blue - no waiting for the fill front to
  // wash across it, which flickered - and it stays blue through the drain, returning to the field
  // once the water has fully drained away.
  panel.visible = waterState !== 'off';
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

// circular (wrap-around) box blur — shaves single-sample spikes while keeping bumps
function smoothCircular(a, passes){
  let r = a.slice(); const n = r.length;
  for(let p=0;p<passes;p++){
    const o = r.slice();
    for(let i=0;i<n;i++) r[i] = 0.25*o[(i-1+n)%n] + 0.5*o[i] + 0.25*o[(i+1)%n];
  }
  return r;
}
// Turn a hand-drawn (imprecise, maybe self-crossing) loop into a clean cross-section:
// one radius per angle, taken as the OUTER silhouette cast from the centroid, then
// lightly smoothed and FLOORED to a minimum radius. This is what kills the "two deep
// cones" artifact — the inward tails you make while trying to close the loop can no
// longer spike toward the centre — while the lobes/bumps (drama + wiggle) survive.
function radialize(loopXY, N, raw){
  const poly = resampleClosed(loopXY, Math.max(N*2, 96));   // dense boundary to cast against
  let cx=0, cy=0; for(const p of poly){ cx+=p.x; cy+=p.y; } cx/=poly.length; cy/=poly.length;
  const R = new Array(N).fill(0);
  for(let k=0;k<N;k++){
    const a=2*Math.PI*k/N, dx=Math.cos(a), dy=Math.sin(a);
    let best=0;                                             // farthest crossing = the outer edge
    for(let i=0;i<poly.length;i++){
      const p=poly[i], q=poly[(i+1)%poly.length], ex=q.x-p.x, ey=q.y-p.y;
      const den = dx*ey - dy*ex; if(Math.abs(den)<1e-9) continue;
      const t = ((p.x-cx)*ey - (p.y-cy)*ex)/den;            // distance out along the ray
      const s = ((p.x-cx)*dy - (p.y-cy)*dx)/den;            // param along the segment
      if(t>0 && s>=-1e-6 && s<=1+1e-6) best = Math.max(best, t);
    }
    R[k]=best;
  }
  for(let k=0;k<N;k++) if(R[k]<=0){                          // fill any grazed misses
    const a=R[(k-1+N)%N], b=R[(k+1)%N]; R[k] = (a+b)>0 ? (a+b)/2 : 1;
  }
  const Rs = raw ? R : smoothCircular(R, 1);                // jagged mode keeps the raw jaggedness
  const sorted=[...Rs].sort((x,y)=>x-y), med=sorted[sorted.length>>1] || 1;
  const floor = med*(raw ? 0.22 : 0.42);                    // nothing may dive toward the centre
  const out=[];
  for(let k=0;k<N;k++){ const a=2*Math.PI*k/N, r=Math.max(Rs[k], floor);
    out.push({ x:cx + r*Math.cos(a), y:cy + r*Math.sin(a) }); }
  return out;
}

// Build the chrome solid. `rng` is a seeded PRNG so each draw is a unique 3D form that keeps
// YOUR loop as its exact z=0 cross-section. `jagged` swaps the tame surface for the
// jaggedness-AMPLIFIED build: a clean circle still makes a clean sphere, but the wilder
// (less circular) the loop, the spikier / more "gobstopper" the mesh.
function buildForm(loopXY, rng, jagged=false){
  const outline = radialize(loopXY, OUTLINE_N);          // rounded single-valued silhouette
  const m = shapeMetrics(outline);
  // how hard the draw's jaggedness drives the exaggeration. Steep, so a near-circle still
  // makes a clean sphere; a wild loop balloons into big ROUNDED lumps.
  const drive = jagged ? clamp(Math.pow(m.wiggle,1.3)*1.9, 0, 1) : m.wiggle;
  // normalise: centre on centroid, scale so mean radius fits the *narrow* side of the
  // frustum (a touch smaller in jagged mode to leave room for the lumps)
  const { halfW, halfH } = frustumHalf();
  const target = Math.min(halfW,halfH)*(jagged?0.42:0.52), s = target/(m.rMean||1);
  const O = outline.map(p=>({ x:(p.x-m.cx)*s, y:(p.y-m.cy)*s }));
  if(jagged){                                            // swell the lobes, then ROUND the corners
    const exag = 1 + drive*1.2;
    for(const p of O){ const r=Math.hypot(p.x,p.y)||1e-6, k=(target+(r-target)*exag)/r; p.x*=k; p.y*=k; }
    const n=O.length;
    for(let pass=0; pass<3; pass++){                      // Laplacian smoothing -> bulges, not points
      const c = O.map(p=>({x:p.x,y:p.y}));
      for(let i=0;i<n;i++){ const a=c[(i-1+n)%n], b=c[(i+1)%n];
        O[i].x=c[i].x*0.5+(a.x+b.x)*0.25; O[i].y=c[i].y*0.5+(a.y+b.y)*0.25; }
    }
  }

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

  // coherent surface displacement: angular harmonics with random phase, unlocked by `drive`.
  // Jagged mode stays on LOW harmonics with a steep falloff, so the exaggeration reads as
  // big ROUNDED bulges rather than fine spikes.
  const H = jagged ? 6 : 7, amp=[], pha=[], kz=[], phz=[];
  for(let h=1;h<=H;h++){
    const gate = h<=2 ? 1 : drive;               // low harmonics always a touch alive
    amp.push(gate * ((jagged?0.34:0.16)/Math.pow(h, jagged?1.4:1)) * (0.5+rng()));
    pha.push(rng()*Math.PI*2);
    kz.push(1+Math.floor(rng()*(jagged?2:3)));
    phz.push(rng()*Math.PI*2);
  }
  const noise = (theta, u) => {                   // u in [-1,1] along the axis
    let d=0; for(let h=0;h<H;h++)
      d += amp[h]*Math.sin((h+1)*theta+pha[h])*Math.cos(kz[h]*u*Math.PI+phz[h]);
    return d;
  };
  const roughAmp = jagged ? lerp(0.02, 1.25, drive) : lerp(0.03, 0.62, m.wiggle);

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
      const bump = Math.max(0.15, 1 + roughAmp*noise(theta,u)*Math.cos(phi)); // fade at poles
      idx.push(push(O[j].x*rs*bump, O[j].y*rs*bump, z));
    }
    ring.push(idx);
  }
  const iBot = push(0,0,profile(-Math.PI/2).z);

  // ---- triangles ----
  // rings run bottom(ring[0], -z) -> top(ring[last], +z); cap each pole to its OWN-end
  // ring, not the far one (capping across the body is what made two cones meet at centre)
  const tri = [];
  const top = ring[ring.length-1], bot = ring[0];
  for(let j=0;j<OUTLINE_N;j++){
    const jn=(j+1)%OUTLINE_N;
    tri.push(iTop, top[jn], top[j]);          // north cap -> +z pole
    tri.push(iBot, bot[j], bot[jn]);          // south cap -> -z pole
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

// The dithered corner image has a few STYLES (just 2 for now). Tapping the monitor cycles
// them — it changes only how the SAME model is dithered, not the model.
let styleIndex = 0; const N_STYLES = 2;
function cycleStyle(){ styleIndex = (styleIndex+1)%N_STYLES; ditherMat.uniforms.uStyle.value = styleIndex; }

function disposeSolid(s){
  if(!s) return;
  scene.remove(s.mesh); scene.remove(s.wire);
  s.mesh.geometry.dispose(); s.mesh.material.dispose();
  s.wire.geometry.dispose(); s.wire.material.dispose();
  if(s.mini) uiScene.remove(s.mini);   // shares geo + ditherMat, nothing else to dispose
  if(s.points){ uiScene.remove(s.points); s.points.geometry.dispose(); s.points.material.dispose(); }
}

function spawnSolid(loopXY){
  const rng = mulberry32((Math.random()*2**32)>>>0);
  const { geo, metrics } = buildForm(loopXY, rng, styleIndex===1);  // style 1 = jaggedness-amplified
  const mat = new THREE.MeshStandardMaterial({
    color:0xffffff, metalness:1.0,
    roughness: clamp(lerp(0.26, 0.06, metrics.roundness), 0.05, 0.4),
    envMapIntensity:1.05, flatShading:true });
  const mesh = new THREE.Mesh(geo, mat);
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color:0xdfe8ff, transparent:true, opacity:0.0 }));
  mesh.quaternion.copy(camera.quaternion);
  wire.quaternion.copy(camera.quaternion);
  // dithered corner twin: same geometry, dot-shaded, spun in lockstep (see tick)
  geo.computeBoundingSphere();
  const miniFit = (cube.userData.size*0.34) / (geo.boundingSphere.radius || 1);
  const mini = new THREE.Mesh(geo, ditherMat);
  mini.frustumCulled = false; mini.renderOrder = 3;
  // style 1: the older real point-cloud twin (surface-sampled dots)
  const NP=540, mp=new Float32Array(NP*3), sampler=new MeshSurfaceSampler(mesh).build(), tv=new THREE.Vector3();
  for(let i=0;i<NP;i++){ sampler.sample(tv); mp[i*3]=tv.x; mp[i*3+1]=tv.y; mp[i*3+2]=tv.z; }
  const pgeo=new THREE.BufferGeometry(); pgeo.setAttribute('position', new THREE.BufferAttribute(mp,3));
  const points=new THREE.Points(pgeo, new THREE.PointsMaterial({ color:0xffe910, size:2.4,
    sizeAttenuation:false, transparent:true, opacity:0.9, toneMapped:false, depthTest:false, depthWrite:false }));
  points.frustumCulled=false; points.renderOrder=3;

  disposeSolid(solid);
  scene.add(mesh); scene.add(wire); uiScene.add(mini); uiScene.add(points);
  solid = {
    mesh, wire, mini, points, miniFit, metrics,
    born: performance.now(), spin:0.28, angVel:0,
    home: new THREE.Vector3(0,0,0),
    homeQuat: camera.quaternion.clone(), snap:null,
    pos: new THREE.Vector3(0,0,0), scale:0.0, state:'birth'
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
const _planeHit = new THREE.Vector3(), _originPlane = new THREE.Plane();
function screenToPlane(px, py){
  // perspective ray from the screen point, intersected with the plane through the origin
  // that faces the camera (normal = camFwd)
  ray.setFromCamera(new THREE.Vector2((px/W)*2-1, -((py/H)*2-1)), camera);
  _originPlane.set(camFwd, 0);
  ray.ray.intersectPlane(_originPlane, _planeHit);
  return _planeHit.clone();
}
// map a css-px loop into the origin plane's local right/up coords, so the solid is built
// in the same orientation you drew it in
function loopToLocal(px){
  const out=[];
  for(const p of px){
    const w = screenToPlane(p.x, p.y);           // point on the origin plane (origin = 0)
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
function flashFull(){                     // shelf is at the trinket cap
  readEl.textContent = 'shelf full';
  readEl.classList.add('show');
  clearTimeout(readFade); readFade = setTimeout(()=>readEl.classList.remove('show'), 1400);
}

// ================================================================ pointer gestures
let pointer = null;   // active pointer id
let mode = null;      // 'draw' | 'rotate' | 'grab' | 'grabT' | 'trinketDown' | 'monitor'
let last = {x:0,y:0};
let downAt = 0, moved = 0, grabTimer = 0;
let grabbedT = null;                 // a settled trinket being re-grabbed
let glowTarget = 0;                   // where the monitor's delete-glow is easing to (armed vs not)
const ray = new THREE.Raycaster();
const _tmpV = new THREE.Vector3();

function hitTrinket(px,py){
  if(!trinkets.length) return null;
  ray.setFromCamera(new THREE.Vector2((px/W)*2-1, -((py/H)*2-1)), camera);
  const hits = ray.intersectObjects(trinkets.map(t=>t.mesh), false);
  return hits.length ? trinkets.find(t=>t.mesh===hits[0].object) : null;
}
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
// true only when the pointer is INSIDE the yellow monitor square's own footprint (not a loose halo
// around it) - so what you aim at, what lights up, and what deletes are all the one yellow frame.
const _edgeR = new THREE.Vector3(), _edgeU = new THREE.Vector3();
function overCube(px,py){
  const c = cubeScreen(), half = cube.userData.size*0.5;
  const hx = Math.abs((_edgeR.copy(cube.position).addScaledVector(camRight, half).project(camera).x*0.5+0.5)*W - c.x);
  const hy = Math.abs((-_edgeU.copy(cube.position).addScaledVector(camUp, half).project(camera).y*0.5+0.5)*H - c.y);
  return Math.abs(px-c.x) <= hx && Math.abs(py-c.y) <= hy;
}

function onDown(e){
  if(pointer!==null) return;
  pointer = e.pointerId; try{ canvas.setPointerCapture(pointer); }catch(_){}
  const p = getXY(e); last=p; downAt=performance.now(); moved=0;

  let t;
  if(solid && hitSolid(p.x,p.y)){
    mode='rotate'; solid.angVel=0;
    grabTimer = setTimeout(()=>{           // hold still to pick it up
      if(mode==='rotate' && moved<10){ mode='grab'; solid.state='grabbed';
        solid._lastT=0; solid._vel=null; glowTarget=0.8; }   // picked up -> the monitor's inner border glows
    }, 260);
  } else if((t = hitTrinket(p.x,p.y))){    // touch a settled rock: a bare TAP toggles its PS1 texture,
    mode='trinketDown'; grabbedT=t;        // a DRAG picks it up (grab deferred until you actually move)
    t._tapFrozen = t.frozen;               // only a rock stuck at touch-down may be tap-swapped
  } else if(overCube(p.x,p.y)){
    mode='monitor';                        // a tap on the corner monitor cycles dither styles
  } else {
    mode='draw'; stroke=[p]; killHint();
  }
}
function onMove(e){
  if(e.pointerId!==pointer) return;
  const p = getXY(e); const dx=p.x-last.x, dy=p.y-last.y;
  moved += Math.hypot(dx,dy);

  if(mode==='trinketDown' && grabbedT && moved>8){    // the touch became a drag -> pick the rock up
    const t=grabbedT; t._vel=t._vel||new THREE.Vector3(); t._vel.set(0,0,0); t._lastT=0;
    t.frozen=false; t.body.type=CANNON.Body.KINEMATIC; t.body.wakeUp();
    glowTarget=0.8; mode='grabT';                      // (falls through to the grabT drag below)
  }

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
    const w = screenToPlane(p.x,p.y), nowT = performance.now();
    if(solid._lastT){ const ddt=(nowT-solid._lastT)/1000;
      if(ddt>0){ if(!solid._vel) solid._vel=new THREE.Vector3();
        solid._vel.multiplyScalar(0.35).addScaledVector(
          _tmpV.set((w.x-solid.pos.x)/ddt,(w.y-solid.pos.y)/ddt,(w.z-solid.pos.z)/ddt), 0.65); } }
    solid._lastT = nowT; solid.pos.copy(w);
  } else if(mode==='grabT' && grabbedT){
    const w = screenToPlane(p.x,p.y), nowT = performance.now(), b=grabbedT.body;
    if(grabbedT._lastT){ const ddt=(nowT-grabbedT._lastT)/1000;
      if(ddt>0) grabbedT._vel.set((w.x-b.position.x)/ddt,(w.y-b.position.y)/ddt,(w.z-b.position.z)/ddt); }
    grabbedT._lastT = nowT;
    b.position.set(w.x,w.y,w.z); b.velocity.set(0,0,0); b.angularVelocity.set(0,0,0);
    grabbedT.mesh.position.copy(w);
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
    } else if(moved < 12 && waterState !== 'off'){  // a bare tap on LIVE water (not a loop) -> a little ripple
      spawnRipple(p.x, p.y);
    }
    stroke=null;
  } else if(mode==='grab' && solid){
    glowTarget = 0;
    if(overCube(p.x,p.y)){ dropIntoCube(); }                 // bin it
    else if(trinkets.length >= TRINKET_CAP){ springHome(); flashFull(); }  // shelf full
    else { const v = flickVel(solid._vel); commitToPhysics(v.x, v.y, v.z); } // FLICK it back
  } else if(mode==='grabT' && grabbedT){
    glowTarget = 0;
    const t = grabbedT; grabbedT=null;
    if(overCube(p.x,p.y)){ deleteTrinket(t); }               // bin the trinket
    else { t.body.type = CANNON.Body.DYNAMIC;                // drop it STRAIGHT BACK onto the bed -
      const v=flickVel(null); t.body.velocity.set(v.x,v.y,v.z); t.body.wakeUp(); } // deadweight, no drag-slide
      // (a re-grab always carries drag momentum; ignoring it makes the re-drop plant like a still drop)
  } else if(mode==='trinketDown' && grabbedT){              // a bare tap on a rock (never dragged)
    const t = grabbedT; grabbedT=null;
    const isTap = moved < 8 && (performance.now()-downAt) < 400;
    if(isTap && t._tapFrozen) togglePS1(t);                 // single-click a STUCK rock -> swap its texture
  } else if(mode==='monitor'){
    if(moved < 12 && overCube(p.x,p.y)) cycleStyle();     // tap the monitor -> next dither style
  } else if(mode==='rotate' && solid){
    solid.state='idle';
    // a quick, still press on the solid is a "tap"; two in a row = double-tap -> snap back
    const isTap = moved < 12 && (performance.now()-downAt) < 300;
    if(isTap){
      if(performance.now()-lastTap < 320 && Math.hypot(p.x-lastTapXY.x, p.y-lastTapXY.y) < 44){
        snapBack(); lastTap = 0;
      } else { lastTap = performance.now(); lastTapXY = p; }
    }
  }
  pointer=null; mode=null;
}
function getXY(e){                // viewport px -> canvas-local px (the screen may be
  const r = canvas.getBoundingClientRect();   // inset inside the desktop phone frame)
  return { x:(e.clientX-r.left)*(W/r.width), y:(e.clientY-r.top)*(H/r.height) };
}
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

let lastTap = 0, lastTapXY = {x:0,y:0};        // for double-tap detection
function snapBack(){                             // ease the solid back to its birth pose,
  if(!solid) return;                             // then the idle spin picks up again
  solid.angVel = 0;
  solid.snap = { from: solid.mesh.quaternion.clone(), to: solid.homeQuat.clone(),
                 t0: performance.now(), dur: 480 };
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
// The renderer sizes to the on-screen canvas element (the phone SCREEN), not the
// window — on desktop that's the framed phone mock; on a real phone / installed app
// the CSS makes the screen fill the display, so this just tracks whatever the screen is.
function resize(){
  W = Math.max(1, canvas.clientWidth);
  H = Math.max(1, canvas.clientHeight);
  aspect = W/H;
  camera.aspect = aspect; camera.updateProjectionMatrix();
  camera.updateMatrixWorld(); refreshCamBasis();
  renderer.setSize(W,H,false);                 // false = leave CSS in charge of display size
  const pr = renderer.getPixelRatio();
  ink.width = Math.floor(W*pr); ink.height = Math.floor(H*pr);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  composer.setSize(size.x,size.y); bloom.setSize(size.x,size.y);
  water.material.uniforms.uAspect.value = aspect;    // keep ripples round
}
addEventListener('resize', resize);
if(window.ResizeObserver) new ResizeObserver(resize).observe(canvas); // track the screen box
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

  water.material.uniforms.uTime.value = now/1000;     // flow the dithered current
  // step each settled rock's PS1 wobble, and creep its moss on as it keeps sitting still
  for(const t of trinkets){
    if(!t.ps1Mat) continue;
    t.ps1Mat.uniforms.uTime.value = now/1000;
    t.ps1Mat.uniforms.uAge.value = t.settledAt ? clamp((now - t.settledAt)/MOSS_FULL_MS, 0, 1) : 0;
  }
  updateWater(now);                                    // fill in on first drop, drain out when last removed
  pinCube();
  world.step(1/60, dt, 3); syncTrinkets();            // advance the flicked trinkets
  freezeOnContact();                                   // lock each rock on first touch
  pruneOffScreen();                                    // drop any settled rock that fell off the field
  { const u=cube.userData.glow.material.uniforms.uStrength; u.value += (glowTarget - u.value) * Math.min(1, dt*9); } // ease the pickup glow

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
      if(s.snap){
        // double-tap snap-back: slerp to the birth pose, then hand control to idle spin
        const k = clamp((now-s.snap.t0)/s.snap.dur, 0, 1);
        s.mesh.quaternion.slerpQuaternions(s.snap.from, s.snap.to, easeInOut(k));
        s.wire.quaternion.copy(s.mesh.quaternion);
        if(k>=1) s.snap = null;
      } else {
        // idle turn + inertia from the last drag
        const spin = s.spin*dt + s.angVel;
        const q=new THREE.Quaternion().setFromAxisAngle(camUp, spin);
        s.mesh.quaternion.premultiply(q); s.wire.quaternion.copy(s.mesh.quaternion);
        s.angVel *= 0.92;
      }
    } else if(s.state==='dropping'){
      const k = clamp((now-s.dropAt)/420, 0, 1);
      const e = easeInOut(k);
      s.pos.copy(s.dropFrom).lerp(cube.position, e);
      s.pos.y -= Math.sin(k*Math.PI)*0.15;            // little arc down into the box
      s.scale = (1-k);
      if(k>=1){ disposeSolid(s); solid=null; readEl.classList.remove('show');
        cube.userData.glow.material.uniforms.uStrength.value = 0.55; } // a soft border flash as it lands
    } else if(s.state==='springing'){
      const k = clamp((now-s.springAt)/360, 0, 1);
      s.pos.copy(s.springFrom).lerp(s.home, easeOut(k));
      if(k>=1) s.state='idle';
    }
    if(solid){
      s.mesh.position.copy(s.pos); s.wire.position.copy(s.pos);
      s.mesh.scale.setScalar(s.scale); s.wire.scale.setScalar(s.scale);
      // corner monitor: both twins spun/scaled like the big solid; styleIndex picks which
      const showMon = s.scale > 0.02, fit = s.miniFit * s.scale;
      s.mini.position.copy(cube.position);   s.mini.quaternion.copy(s.mesh.quaternion);
      s.mini.scale.setScalar(fit);           s.mini.visible = showMon && styleIndex===0;
      s.points.position.copy(cube.position); s.points.quaternion.copy(s.mesh.quaternion);
      s.points.scale.setScalar(fit);         s.points.visible = showMon && styleIndex===1;
    }
  }

  renderRockMask();                                    // silhouettes -> water shapes to each rock
  composer.render();
  // draw the corner UI crisply on top, straight to screen (no tone mapping / bloom).
  // clear depth first so the dithered mini can self-occlude correctly.
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(uiScene, camera);
  renderer.autoClear = true;
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
  world, trinkets, viewAxis, deleteTrinket, overCube, cubeScreen, togglePS1, pruneOffScreen, spawnRipple,
  get waterState(){ return waterState; },
  flick(vx=0,vy=0,vz=0){ const v=flickVel({x:vx,y:vy,z:vz}); commitToPhysics(v.x,v.y,v.z); },
  step(n=60){ for(let i=0;i<n;i++){ world.step(1/60); freezeOnContact(); } syncTrinkets(); },
  // render one frame on demand (rAF is paused while the tab is hidden; WebGL draws still work)
  renderNow(t){ if(t!==undefined) water.material.uniforms.uTime.value=t; pinCube();
    renderRockMask(); composer.render();
    renderer.autoClear=false; renderer.clearDepth(); renderer.render(uiScene, camera); renderer.autoClear=true; },
  originNDC(){ const v=new THREE.Vector3(0,0,0).project(camera);
    return { x:(v.x*0.5+0.5)*W, y:(-v.y*0.5+0.5)*H }; },
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
