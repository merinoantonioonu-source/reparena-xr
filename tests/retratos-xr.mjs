// Script de una sola vez: los retratos de los enemigos nuevos de RepArena XR (los esqueletos de KayKit) para sus fichas del menú,
// de cuerpo entero como los de RepArena, hechos con su propio modelo en reposo. Uso: node tests/retratos-xr.mjs (desde la raíz);
// deja `public/retratos/<enemigo>-256.png`, que se reducen a 128 px.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const REPO = process.cwd(), HTML = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
r.setSize(256, 256); r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(1.5, 2, 3); scene.add(d);
const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
window.shot = async (url) => {
  const g = await new GLTFLoader().loadAsync(url);
  const m = g.scene; scene.add(m);
  const mix = new THREE.AnimationMixer(m); const c = g.animations.find((a) => a.name === 'Idle'); if (c) { mix.clipAction(c).play(); mix.update(0.4); }
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3()), ce = b.getCenter(new THREE.Vector3());
  // (la cabeza y el pecho, como los retratos de RepArena)
  const look = new THREE.Vector3(ce.x, ce.y, ce.z);
  cam.position.set(look.x + s.y * 0.5, look.y + s.y * 0.1, look.z + s.y * 2.6); cam.lookAt(look);
  r.setClearColor(0, 0); r.render(scene, cam);
  const out = r.domElement.toDataURL('image/png'); scene.remove(m); return out;
};
window.ready = true;
</script></body></html>
`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const srv = createServer(async (q, s) => { const u = decodeURIComponent(q.url.split('?')[0]); if (u === '/') return void s.writeHead(200, { 'Content-Type': 'text/html' }).end(HTML); const f = path.join(REPO, u); let body = null; try { body = await readFile(f); } catch { console.log('404', u); } if (body) s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }).end(body); else s.writeHead(404).end(); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`);
await p.waitForFunction(() => window.ready);
for (const [k, f] of [['skelminion', 'minion'], ['skelwarrior', 'warrior'], ['skelmage', 'mage']]) {
  const data = await p.evaluate((u) => window.shot(u), `/public/models/kaykit/esqueleto_${f}.glb`);
  await writeFile(`public/retratos/${k}-256.png`, Buffer.from(data.split(',')[1], 'base64')); // (luego, a 128 px)
  console.log(k);
}
await b.close(); srv.close();
