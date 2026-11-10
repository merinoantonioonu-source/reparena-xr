/**
 * Graba como archivos los sonidos que RepArena fabricaba al vuelo (sintetizados con WebAudio en su src/10_audio.js), para
 * que en RepArena XR todo suene por el sistema de sonido de IWSDK, que solo reproduce archivos. Ejecuta el código original
 * de RepArena en Chromium con un OfflineAudioContext: cada sonido solo, con su reverberación y antes del compresor (el
 * compresor de RepArena va en el oído, src/audio/sound.ts, y lo pasan todos los sonidos, también los tuyos). Los efectos,
 * en .mp3; los que se repiten en bucle, en .ogg, con el final fundido con el principio para que empalmen sin corte.
 *
 * Uso: RA_DIR=../reparena node tests/sonidos.mjs [nombre…]   (necesita ffmpeg y el Chromium de Playwright)
 * Escribe sounds/de-serie/<nombre>.mp3 (o .ogg). Con el mismo azar cada vez (sale igual si no cambia nada).
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const RA = process.env.RA_DIR ? resolve(process.env.RA_DIR) : '';
if (!RA) {
  console.error('Falta RA_DIR: la carpeta de un clon de RepArena (merinoantonioonu-source/reparena, en main)');
  process.exit(1);
}
const OUT = resolve(import.meta.dirname, '..', 'sounds', 'de-serie');
const SR = 48000;

// el tono de la voz de cada monstruo (RepArena, src/70_game.js: BEAST_PITCH; los que no están, 1,4) y el de los robots (1)
const PITCH = { skeleton: 1.3, captain: 0.8, sharky: 1.0, mako: 1.1, puglin: 1.9, zombie: 0.75, zgreen: 0.85, zchubby: 0.65, raptor: 1.6, yeti: 1.0, cyclops: 1.15, demon: 1.5, greendemon: 1.5, skull: 1.7, alien: 1.8, alientall: 1.6, bee: 2.4, bat: 2.2, cthulhu: 1.2, dragon: 0.9, robot: 1 };

// [nombre, lo que suena (código de RepArena; P es un sitio delante), canales]: los que suenan «en tu cabeza», en estéreo
// (su reverberación se abre a los lados); los que suenan desde un sitio, en mono (IWSDK los coloca al tocarlos)
const ONE = [
  ['clic', 'SND.click()', 2], ['tic', 'SND.tick()', 2], ['carga', 'SND.charge()', 2], ['perfecta', 'SND.perfect()', 2],
  ['carga-nivel', 'SND.power(2)', 2], ['a-medias', 'SND.partial()', 2], ['fallo', 'SND.miss()', 2], ['combo', 'SND.combo()', 2],
  ['pitido', 'SND.beep(1)', 2], ['oleada', 'SND.horn()', 2], ['victoria', 'SND.victory()', 2], ['derrota', 'SND.defeat()', 2],
  ['golpe-recibido', 'SND.hurt()', 2], ['trueno', 'SND.thunder(0)', 2],
  ['onda-expansiva', 'SND.shock(P)', 1], ['explosion', 'SND.explosion(P, false)', 1], ['impacto-metal', 'SND.metalHit(P, false)', 1],
  ['compuerta', 'SND.door(P)', 1], ['paso-robot', 'SND.step(P, false)', 1], ['servo', 'SND.servo(P)', 1], ['orbe', 'SND.orb(P)', 1],
  ['patas-arana', 'SND.skitter(P, 1)', 1], ['aplastar', 'SND.squish(P)', 1], ['chispazo', 'SND.zap(P)', 1],
  ['ameba', 'SND.waterPop(P, false)', 1], ['chapoteo', 'SND.splash(P)', 1], ['pompa', 'SND.pop(P, false)', 1],
  ['remolino-engulle', 'SND.engulf(P)', 1], ['remolino-cierra', 'SND.vortexClose(P)', 1],
  ['buho', 'SND.owl(P)', 1], ['pajaro', 'SND.bird(P)', 1], ['gaviota', 'SND.gull(P)', 1], ['crujido', 'SND.creak(P)', 1],
  ['metal-lejano', 'SND.clankFar(P)', 1], ['lobo-aullido', 'SND.wolfHowl(P)', 1], ['lobo-grunido', 'SND.wolfGrowl(P, 0.5)', 1],
  ['lobo-ataque', 'SND.wolfBite(P)', 1], ['bandido-lanza', 'SND.banditThrow(P)', 1], ['bandido-dolor', 'SND.banditHurt(P)', 1],
  ['bandido-muere', 'SND.banditDeath(P)', 1],
  ['rayo', 'SND.bolt(P, 0)', 1], ['rayo-cargado', 'SND.bolt(P, 3)', 1], ['impacto', 'SND.boltHit(P, 1)', 1],
  ['tentaculos', 'SND.tentacle(P, 1)', 1],
  // la caída al foso, sin el chapoteo (suena aparte, como en RepArena)
  ['caida-foso', 'const sp = SND.splash; SND.splash = () => {}; SND.horror(P); SND.splash = sp;', 1],
];
// las espadas: la metálica y la láser
for (const [n, f, extra] of [['espada-aire', 'swordSwish', ', 3'], ['espada-choque', 'swordClang', ', 1'], ['espada-golpe', 'swordHit', ''], ['espada-bloqueo', 'swordBlock', ''], ['espada-corte', 'swordSlice', '']]) {
  ONE.push([n, `SND.${f}(P, false${extra})`, 1], [n + '-laser', `SND.${f}(P, true${extra})`, 1]);
}
// la voz de cada uno (RepArena, VOICE_FILES): el rugido con su tono, el siseo y el ataque al lanzarse
const ROAR = { robot: 'rugido-robot', imp: 'rugido-diablillo', puglin: 'rugido-puglin', zombie: 'rugido-zombi', raptor: 'rugido-velociraptor', zgreen: 'rugido-zombi-verde', zchubby: 'rugido-zombi-gordo', demon: 'voz-demonio', greendemon: 'voz-demonio-verde', cyclops: 'voz-ciclope', yeti: 'voz-yeti', skull: 'voz-calavera', alien: 'voz-alien', alientall: 'voz-alien-alto', skeleton: 'voz-esqueleto', captain: 'voz-capitan', sharky: 'voz-tiburon', mako: 'voz-tiburon-gris', bee: 'voz-abeja', bat: 'voz-murcielago', cthulhu: 'voz-cthulhu', dragon: 'voz-dragon' };
for (const [who, n] of Object.entries(ROAR)) ONE.push([n, `SND.roar(P, ${PITCH[who] ?? 1.4}, '${who}')`, 1]);
// (la calavera ya tiene su voz en los rugidos: andando o saliendo de las trampillas, el mismo archivo)
for (const [who, n, s] of [['spider', 'siseo-arana', 1], ['wasp', 'siseo-avispa', 0.9], ['crab', 'voz-cangrejo', 1], ['mushroom', 'voz-seta', 1]]) ONE.push([n, `SND.hiss(P, ${s}, '${who}')`, 1]);
for (const [who, n] of [['flyer', 'ataque-volador'], ['spider', 'ataque-arana'], ['arc', 'arco-pasa'], ['throw', 'lanzamiento']]) ONE.push([n, `SND.whoosh(P, '${who}')`, 1]);

// los bucles: [nombre, código, canales, segundos del bucle, fundido, y la corrección del volumen: en RepArena, con archivo
// suenan a otro volumen (Loop.file) que el sintetizado; así, a ese volumen, el grabado suena como sonaba]
const LOOPS = [
  ['zumbido-dron', "RAND_MID = true; buzzLoop('drone', P)", 1, 3, 0.5, 0.18 / 0.55],
  ['zumbido-avispa', "RAND_MID = true; buzzLoop('hornet', P)", 1, 3, 0.5, 0.18 / 0.55],
  ['espada-laser-zumbido', 'saberLoop(P)', 1, 3, 0.5, 0.025 / 0.3],
  ['remolino', 'suctionLoop(P).set(P, 1)', 1, 6, 1, 0.4 / 0.75],
  ['arco-zumbido', 'humLoop(P)', 1, 4, 0.5, 0.3 / 0.6],
  ['ambiente-arena', "AMB.force = 'arena'; ambientStart()", 2, 24, 4, 1],
  ['ambiente-bosque', "AMB.force = 'forest'; ambientStart()", 2, 24, 4, 1],
  ['ambiente-naturaleza', "AMB.force = 'nature'; ambientStart()", 2, 24, 4, 1],
  ['ambiente-isla', "AMB.force = 'island'; ambientStart()", 2, 24, 4, 1],
];

// ---------------------------------------------------------------- RepArena en la página, con lo que necesita de su alrededor
function pageScript() {
  let src = readFileSync(join(RA, 'src', '10_audio.js'), 'utf8');
  // en un contexto sin conexión no hay «running» hasta que graba: que suene igual
  const ok = "AUD.C.state === 'running'";
  if (src.split(ok).length !== 2) throw new Error('No encuentro sndOK en 10_audio.js: ¿ha cambiado RepArena?');
  src = src.replace(ok, 'true');
  const stubs = `
const SR = ${SR};
let OFF = null, RAND_MID = false, seed = 1;
const SUSP = new Set();
// el azar de RepArena, con semilla (Math.random lo usan el ruido, la reverberación y cada efecto)
Math.random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rand = (a, b) => (RAND_MID ? (a + b) / 2 : a + Math.random() * (b - a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new V3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  applyQuaternion() { return this; }
}
const settings = { volume: 100, ambient: 100 }, settingHooks = [], arMode = false;
const store = () => null, forestOn = () => false, natureOn = () => false, islandOn = () => false;
const head = { p: new V3(0, 1.6, 0), q: null }, fwd = () => new V3(0, 0, -1), $ = () => null;
const fetch = null; // (sin archivos: siempre el sintetizado)
// lo que RepArena retrasa con setTimeout (los tentáculos de la caída al foso), a su hora dentro de la grabación
const setTimeout = (fn, ms) => {
  const q = 128 / SR;
  let t = Math.max(q, Math.ceil(ms / 1000 / q) * q);
  while (SUSP.has(t)) t += q;
  SUSP.add(t);
  OFF.suspend(t).then(() => { fn(); OFF.resume(); });
};
`;
  const hooks = `
// sin colocar en el espacio: lo coloca IWSDK al tocarlo (con la distancia de RepArena)
panner = () => AUD.C.createGain();
setPos = () => {};
const b64 = (f32) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(new Blob([f32.slice().buffer])); });
window.__render = async (code, ch, secs, s0) => {
  seed = s0; RAND_MID = false; SUSP.clear();
  OFF = new OfflineAudioContext(ch, Math.ceil(secs * SR), SR);
  window.AudioContext = function () { return OFF; };
  AUD.C = null; AUD.loading = true; AMB.nodes = null; AMB.force = '';
  audioInit();
  AUD.master.disconnect(); AUD.master.connect(OFF.destination); // (antes del compresor)
  const P = new V3(0, 1.5, -2);
  eval(code);
  const buf = await OFF.startRendering();
  const out = [];
  for (let c = 0; c < ch; c++) out.push(await b64(buf.getChannelData(c)));
  return out;
};
`;
  return '(() => {\n' + stubs + '\n' + src + '\n' + hooks + '\n})();';
}

// ---------------------------------------------------------------- recortar, empalmar y guardar
const db = (x) => Math.pow(10, x / 20);
const peakOf = (chs) => chs.reduce((p, c) => c.reduce((q, v) => Math.max(q, Math.abs(v)), p), 0);
const loud = (chs, i, th) => chs.some((c) => Math.abs(c[i]) > th);

// un efecto: sin el silencio de antes y de después (lo que queda 60 dB por debajo del pico) y con un fundido al final
function trimOne(chs) {
  const n = chs[0].length, pk = peakOf(chs);
  if (pk < 1e-5) throw new Error('no suena nada');
  let a = 0, b = n - 1;
  while (a < n && !loud(chs, a, pk * db(-60))) a++;
  while (b > a && !loud(chs, b, pk * db(-54))) b--;
  a = Math.max(0, a - Math.round(0.004 * SR));
  b = Math.min(n - 1, b + Math.round(0.03 * SR));
  const out = chs.map((c) => c.slice(a, b + 1));
  const f = Math.min(out[0].length, Math.round(0.03 * SR));
  for (const c of out) for (let i = 0; i < f; i++) c[c.length - 1 - i] *= i / f;
  return out;
}

// un bucle de len segundos (pasado el arranque, warm): sus primeros x segundos se funden con lo que seguiría al final, así
// el final empalma con el principio (con potencia constante: el ruido no baja en el empalme)
function makeLoop(chs, warm, len, x) {
  const s0 = Math.round(warm * SR), N = Math.round(len * SR), X = Math.round(x * SR);
  return chs.map((c) => {
    const o = c.slice(s0, s0 + N);
    for (let i = 0; i < X; i++) {
      const t = (i / X) * (Math.PI / 2);
      o[i] = c[s0 + i] * Math.sin(t) + c[s0 + N + i] * Math.cos(t);
    }
    return o;
  });
}

function encode(tmp, name, chs, loop) {
  const n = chs[0].length, C = chs.length, inter = new Float32Array(n * C);
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) inter[i * C + c] = chs[c][i];
  const raw = join(tmp, name + '.f32');
  writeFileSync(raw, Buffer.from(inter.buffer));
  const codec = loop ? ['-c:a', 'libvorbis', '-q:a', '4'] : ['-c:a', 'libmp3lame', '-q:a', '4'];
  const file = join(OUT, name + (loop ? '.ogg' : '.mp3'));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', String(C), '-i', raw, ...codec, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', file]);
  rmSync(raw);
}

const hash = (s) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
const fromB64 = (s) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const fit = (chs, pk) => { if (pk > 0.98) for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= 0.98 / pk; };

const only = new Set(process.argv.slice(2));
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'sonidos-'));
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('página:', e.message));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: pageScript() });
const render = async (code, ch, secs, name) => (await page.evaluate(([c, k, s, h]) => window.__render(c, k, s, h), [code, ch, secs, hash(name)])).map(fromB64);
const report = [];
for (const [n, code, ch] of ONE) {
  if (only.size && !only.has(n)) continue;
  const out = trimOne(await render(code, ch, 9, n)), pk = peakOf(out);
  fit(out, pk);
  encode(tmp, n, out, false);
  report.push([n, out[0].length / SR, pk]);
}
for (const [n, code, ch, len, x, corr] of LOOPS) {
  if (only.size && !only.has(n)) continue;
  const warm = ch === 2 ? 8 : 1, out = makeLoop(await render(code, ch, warm + len + x + 0.1, n), warm, len, x);
  for (const c of out) for (let i = 0; i < c.length; i++) c[i] *= corr;
  const pk = peakOf(out);
  fit(out, pk);
  encode(tmp, n, out, true);
  report.push([n, len, pk]);
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });
for (const [n, d, pk] of report) console.log(`${n.padEnd(24)} ${d.toFixed(2).padStart(5)} s  pico ${(20 * Math.log10(pk)).toFixed(1).padStart(5)} dB${pk > 0.98 ? '  (bajado a −0,2 dB)' : ''}`);
console.log(`${report.length} sonidos en sounds/de-serie`);
