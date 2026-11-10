// Partida simulada en un navegador sin gafas (modo ordenador), sobre la versión construida (dist/), servida en una
// subcarpeta como en GitHub Pages: si algo pide un archivo con una ruta absoluta, aquí falla.
//
//   npm run test:e2e            (construye y juega)
//   E2E_SHOTS=carpeta npm run test:e2e   (guarda capturas en esa carpeta)
//
// Juega: EMPEZAR (Enter) → sale el primer zombi → sentadilla aguantada (flecha abajo) hasta ×2 (la carga se escribe en el
// suelo) → arriba (cuenta la repetición y, en el ordenador, sin manos, el rayo sale solo al zombi más cercano) → otra
// sentadilla si no le ha dado; comprueba que ha sonado lo de la partida (la oleada, la compuerta, la carga, el rayo y el
// impacto), ya cargado, y el vapor de las compuertas; y una sentadilla a medias saca «¡Baja más!» en grande en el suelo.
// Falla si algo no pasa a tiempo o si la página da errores.
// Necesita el Chromium de Playwright (npx playwright install chromium; ver MIGRACION.md › Cómo probar).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const BASE = '/reparena-xr/';
const SHOTS = process.env.E2E_SHOTS || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.uikitml': 'text/plain', '.md': 'text/markdown', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

if (!existsSync(path.join(ROOT, 'index.html'))) {
  console.error('No está dist/: construye antes (npm run build).');
  process.exit(1);
}

// servidor estático mínimo, con el juego en /reparena-xr/
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!url.startsWith(BASE)) {
    res.writeHead(404).end('fuera de ' + BASE);
    return;
  }
  let file = path.join(ROOT, url.slice(BASE.length));
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    missing.push(url);
    res.writeHead(404).end('no está');
  }
});
const missing = [];
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 250 } });
const errors = [];
page.on('pageerror', (e) => errors.push('página: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('consola: ' + m.text().slice(0, 300));
});

const snap = () => page.evaluate(() => window.__rx?.snapshot());
let last = null;
async function until(what, cond, secs) {
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) {
    last = await snap();
    if (last && cond(last)) {
      console.log(`  ✓ ${what} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      return last;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`no ha pasado a tiempo: ${what}\núltimo estado: ${JSON.stringify(last)}`);
}
const shot = async (name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
};

let ok = false;
try {
  console.log(`Partida simulada en http://127.0.0.1:${port}${BASE}`);
  await page.goto(`http://127.0.0.1:${port}${BASE}`);
  await page.waitForFunction(() => !!window.__rx, null, { timeout: 90000 });
  await until('el juego carga y espera en el menú principal', (s) => s.phase === 'menu' && s.menu === 'lobby', 30);
  await shot('1-menu');
  await page.mouse.click(4, 4); // (abre el sonido; en una esquina, fuera del panel: en el centro hay botones)
  await page.keyboard.press('Enter');
  await until('EMPEZAR: empieza la ronda y se quita el menú', (s) => s.phase === 'playing' && s.wave === 1 && s.menu === 'none', 15);
  await until('sale el primer zombi', (s) => s.foes.length > 0, 90);
  await page.keyboard.down('ArrowDown');
  await until('al bajar, la bola carga el disparo', (s) => s.charge >= 1 && s.ballOn, 30);
  await until('aguantando abajo, la carga sube a ×2', (s) => s.charge >= 2, 60);
  await until('la carga, escrita en el suelo', (s) => s.chargeFloor === 'CARGA ×2', 10);
  await shot('2-bola');
  await page.keyboard.up('ArrowDown');
  await until('al subir, cuenta la sentadilla', (s) => s.reps >= 1, 30);
  // en el ordenador, la repetición dispara sola al zombi más cercano; si no le ha dado (aún no había nadie), otra
  const t0 = Date.now();
  let hit = false;
  while (!hit && Date.now() - t0 < 60000) {
    await page.waitForTimeout(400);
    last = await snap();
    hit = last.kills > 0 || last.foes.some((f) => f.state !== 'walk' || f.hp < 2);
    if (!hit) {
      await page.keyboard.down('ArrowDown');
      await until('otra carga', (s) => s.charge >= 1, 30);
      await page.keyboard.up('ArrowDown');
      await until('otra sentadilla', (s) => s.charge === 0, 30);
    }
  }
  if (!hit) throw new Error('el rayo no ha dado a ningún zombi\núltimo estado: ' + JSON.stringify(last));
  console.log('  ✓ el rayo le da a un zombi');
  // el sonido: se abre con el primer toque, IWSDK carga los archivos y suena lo de la partida
  const snd = await until('el sonido se abre y tiene sus archivos cargados', (s) => s.sound?.running && s.sound.loaded[0] === s.sound.loaded[1] && s.sound.loaded[1] > 0, 30);
  const played = snd.sound.played, want = ['oleada', 'compuerta', 'carga', 'carga-nivel', 'impacto'].filter((n) => !played[n]);
  if (!played.rayo && !played['rayo-cargado']) want.push('rayo');
  if (want.length) throw new Error('no han sonado: ' + want.join(', ') + '\nsonidos: ' + JSON.stringify(snd.sound));
  console.log(`  ✓ suenan la oleada, la compuerta, la carga, el rayo y el impacto (${Object.keys(played).length} distintos)`);
  // el vapor: cada compuerta que se abre echa doce bocanadas (seis a cada lado) y se llegan a ver
  const vap = await until('la compuerta echa vapor', (s) => s.steam && s.steam.added >= 12 && s.steam.peak > 0, 30);
  await shot('3-vapor');
  console.log(`  ✓ la compuerta echa vapor (${vap.steam.added} bocanadas, hasta ${vap.steam.peak} a la vez)`);
  await shot('3-rayo');
  // a medias: la flecha baja 40 cm; con la sentadilla pidiendo 60 (solo para esta prueba) no llega y sale el aviso, en
  // grande en el suelo
  if (last.ex !== 'squat') throw new Error('la partida simulada espera la sentadilla, y es ' + last.ex);
  await page.evaluate(() => (window.__rx.game.stCfg.squatDepth = 60));
  await page.keyboard.down('ArrowDown');
  await until('bajando del todo con la flecha', (s) => s.head[1] < 1.25, 20);
  await page.keyboard.up('ArrowDown');
  await until('a medias: «¡Baja más!» en grande en el suelo', (s) => s.warn === '¡Baja más!', 20);
  await page.evaluate(() => (window.__rx.game.stCfg.squatDepth = 26));
  await shot('4-aviso');
  if (missing.length) throw new Error('faltan archivos: ' + missing.join(', '));
  if (errors.length) throw new Error('errores en la página:\n' + errors.join('\n'));
  ok = true;
  console.log('Partida simulada: bien.');
} catch (e) {
  console.error('Partida simulada: FALLO\n' + (e instanceof Error ? e.message : e));
  if (errors.length) console.error('errores en la página:\n' + errors.join('\n'));
  await shot('fallo');
} finally {
  await browser.close();
  server.close();
}
process.exit(ok ? 0 : 1);
