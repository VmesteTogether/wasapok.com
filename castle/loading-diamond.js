// Shared loading-screen icon: the WasaDiminds crystal spinning in place, solid
// cream. Included by every castle room's loading screen. Stops + disposes once
// the loading overlay is gone.
import * as THREE from 'three';

const crest = document.querySelector('#loading .crest');
if (crest) {
  crest.style.background = 'none';
  crest.style.animation = 'none';
  const S = 120;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(S, S); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  crest.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100); cam.position.z = 4.2;
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(-3, 4, 5); scene.add(key);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });   // flat white silhouette, unlit
  const gem = new THREE.Group(); scene.add(gem);
  fetch('/newhome/WasaDiminds-02.obj').then(r => r.text()).then(t => {
    const v = [], idx = [];
    for (const raw of t.split('\n')) {
      const l = raw.trim();
      if (l[0] === 'v' && l[1] === ' ') { const p = l.split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
      else if (l[0] === 'f') { const a = l.slice(2).trim().split(/\s+/).map(x => parseInt(x, 10) - 1); for (let k = 1; k < a.length - 1; k++) idx.push(a[0], a[k], a[k + 1]); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx); g.computeVertexNormals();
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3()), s = g.boundingBox.getSize(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z); const sc = 2.2 / (Math.max(s.x, s.y, s.z) || 1); g.scale(sc, sc, sc);
    const m = new THREE.Mesh(g, mat); m.rotation.x = Math.PI / 2; gem.add(m);
  }).catch(() => {});
  const ld = document.getElementById('loading');
  (function loop() {
    const cs = ld && getComputedStyle(ld);
    if (!ld || cs.display === 'none' || cs.opacity === '0') { renderer.dispose(); return; }
    requestAnimationFrame(loop); gem.rotation.y += 0.03; renderer.render(scene, cam);
  })();
}
