// Partida simulada en un navegador sin gafas (modo ordenador), sobre la versión construida (dist/), servida en una
// subcarpeta como en GitHub Pages: si algo pide un archivo con una ruta absoluta, aquí falla.
//
//   npm run test:e2e            (construye y juega)
//   E2E_SHOTS=carpeta npm run test:e2e   (guarda capturas en esa carpeta)
//   E2E_TREK_BOSS=1 npm run test:e2e     (la Travesía, hasta derrotar al jefe del tercer tramo: unos 2 minutos más)
//
// Juega: EMPEZAR (Enter) → sale el primer zombi → sentadilla aguantada (flecha abajo) hasta ×2 (la carga se escribe en el
// suelo) → arriba (cuenta la repetición y, en el ordenador, sin manos, el rayo sale solo al zombi más cercano) → otra
// sentadilla si no le ha dado; comprueba que ha sonado lo de la partida (la oleada, la compuerta, la carga, el rayo y el
// impacto), ya cargado, y el vapor de las compuertas; una sentadilla a medias saca «¡Baja más!» en grande en el suelo; y
// sale un volador que vuela hacia ti zumbando. Luego, rondas cortas de Arcos, Toques y Barras, y la Travesía de plataformas
// (sentadillas que empujan, el hueco que se cruza con un salto, las piezas fluidas y el cofre del tramo).
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
/** La semilla del recorrido de la Travesía (E2E_TREK_SEED para probar otra). */
const SEED_TREK = +(process.env.E2E_TREK_SEED || 7);
/** Con E2E_TREK_BOSS, la Travesía no acaba al tener lo que busca: sigue hasta el jefe del tercer tramo y lo derrota. */
const BOSS_TREK = !!process.env.E2E_TREK_BOSS;
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
// lo oscura que está la imagen de `from` (fracción del alto) hacia abajo, y cuánto de toda ella está iluminado
async function blackShare(from) {
  // (sin la barra de ayuda de la prueba, que en esta ventana tan pequeña tapa media imagen)
  await page.evaluate(() => document.querySelector('.pbar')?.setAttribute('style', 'display:none'));
  const b64 = (await page.locator('#scene-container canvas').first().screenshot()).toString('base64');
  await page.evaluate(() => document.querySelector('.pbar')?.removeAttribute('style'));
  return page.evaluate(async ([b64, from]) => {
    const im = new Image();
    im.src = 'data:image/png;base64,' + b64;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let dark = 0, n = 0, lit = 0;
    for (let y = 0; y < c.height; y++)
      for (let k = 0; k < c.width; k++) {
        const i = (y * c.width + k) * 4, m = Math.max(d[i], d[i + 1], d[i + 2]);
        if (m > 80) lit++;
        if (y < from * c.height) continue;
        n++;
        if (m < 30) dark++;
      }
    return { dark: dark / n, lit: lit / (c.width * c.height) };
  }, [b64, from]);
}
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
  // la página (en el ordenador): sus apartados, el formulario de ajustes y los botones de entrar; «Probar en el ordenador»
  // enseña la escena y esconde la página
  await page.setViewportSize({ width: 1280, height: 900 });
  // (agrandar el lienzo con la tarjeta gráfica simulada tarda: 5 s en local y más de 10 en GitHub, también en main)
  await page.waitForFunction(() => !document.documentElement.classList.contains('app'), null, { timeout: 40000 });
  const pg = await page.evaluate(() => ({ secs: [...document.querySelectorAll('.main > section')].map((x) => x.id), rest: !!document.querySelector('#f-rest'), vr: !!document.querySelector('#btnVR'), shown: !!document.querySelector('#page')?.offsetParent, toc: document.querySelectorAll('#toc .tocList li').length, today: !!document.querySelector('#todayBox .ring') }));
  if (!pg.shown || !pg.rest || !pg.vr || pg.secs.length < 7 || pg.toc < 7 || !pg.today) throw new Error('la página no está bien: ' + JSON.stringify(pg));
  console.log(`  ✓ la página: ${pg.secs.length} apartados, el índice, lo de hoy y el formulario de ajustes`);
  await page.evaluate(() => { const r = document.querySelector('#f-rest'); if (r) { r.value = '20'; r.dispatchEvent(new Event('input', { bubbles: true })); } });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('reparena3-settings') || '{}').rest);
  if (stored !== 20) throw new Error('el formulario no guarda: rest = ' + stored);
  console.log('  ✓ el formulario guarda en los ajustes de RepArena (rest = 20)');
  await shot('0-pagina');
  await page.click('#btnPreview');
  if (!(await page.evaluate(() => document.documentElement.classList.contains('stage') && !document.querySelector('#page')?.offsetParent))) throw new Error('«Probar en el ordenador» no enseña la escena');
  console.log('  ✓ «Probar en el ordenador» enseña la escena y esconde la página');
  await page.setViewportSize({ width: 400, height: 250 });
  await shot('1-menu');
  await page.mouse.click(4, 4); // (abre el sonido; en una esquina, fuera del panel: en el centro hay botones)
  await page.keyboard.press('Enter');
  await until('EMPEZAR: empieza la ronda y se quita el menú', (s) => s.phase === 'playing' && s.wave <= 1 && s.menu === 'none', 15);
  await until('sale el primer enemigo, con sus cuentas de vida encima', (s) => s.foes.length > 0 && s.life > 0, 90);
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
    hit = last.kills > 0 || last.foes.some((f) => f.state === 'stagger' || f.state === 'dead' || f.hp < 2); // (el rayo viaja: le da al llegar)
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
  const snd = await until('el sonido se abre y tiene sus archivos cargados (y suena el impacto, que llega con el rayo)', (s) => s.sound?.running && s.sound.loaded[0] === s.sound.loaded[1] && s.sound.loaded[1] > 0 && !!s.sound.played.impacto, 30);
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
  // los voladores (con los de tierra, uno de cada): sale uno por el hueco de una compuerta, vuela hacia ti y zumba
  const fl = await until('sale un volador (abeja o murciélago) y vuela hacia ti', (s) => s.foes.some((f) => f.fly && f.state === 'walk' && f.y > 0.8 && f.z > -9), 120);
  if (!fl.sound.played['zumbido-dron']) throw new Error('el volador no zumba\nsonidos: ' + JSON.stringify(fl.sound.played));
  console.log('  ✓ el volador zumba');
  await shot('5-volador');
  // derribar a un volador: el rayo sale solo al más cercano; muerto, cae al suelo como un cuerpo suelto
  const t1 = Date.now();
  let down = null;
  while (!down && Date.now() - t1 < 90000) {
    await page.keyboard.down('ArrowDown');
    await until('otra carga', (s) => s.charge >= 1 || s.phase !== 'playing', 30);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(600);
    last = await snap();
    down = last.foes.find((f) => f.fly && f.state === 'dead');
    if (last.phase !== 'playing') break;
  }
  if (!down) throw new Error('no ha caído ningún volador\núltimo estado: ' + JSON.stringify(last));
  await until('el volador derribado cae al suelo', (s) => s.foes.some((f) => f.fly && f.state === 'dead' && f.y < 0.6), 20);
  // los puntos: cada repetición y cada derribo suman (RepArena: registerRep y onKilled)
  if (!(last.score > 0)) throw new Error('no hay puntos\núltimo estado: ' + JSON.stringify(last));
  console.log(`  ✓ los puntos suben (${last.score})`);
  // la oleada superada: se vacía la cola y se quitan los que quedan (para no jugarla entera); sale «¡Oleada superada!», el
  // descanso (acortado a 1 s) y el panel de la oleada siguiente, con la escena algo oscurecida; mientras, no sale nadie
  await page.evaluate(() => {
    window.__rx.game.queue.length = 0;
    for (const p of window.__rx.game.pending) p.gate = null; // (y los que estaban saliendo por una compuerta)
    window.__rx.enemies.clear();
  });
  await until('oleada superada: el descanso', (s) => s.between && s.wave === 1 && s.resting, 20);
  // las cartas de mejora (adelantadas: salen cada tres oleadas superadas): la oleada siguiente espera a que elijas
  await page.evaluate(() => {
    window.__rx.game.rw.perks.offerT = 0.2;
    window.__rx.game.restT = 1;
  });
  await until('salen las cartas de mejora', (s) => s.cards && s.resting, 20);
  await shot('6-cartas');
  await page.waitForTimeout(2500);
  last = await snap();
  if (last.wave !== 1 || !last.resting) throw new Error('la oleada no espera a que elijas\núltimo estado: ' + JSON.stringify(last));
  console.log('  ✓ la oleada siguiente espera a que elijas');
  await page.evaluate(() => window.__rx.game.rw.pick(0));
  await until('elegida: la mejora es tuya', (s) => s.perks.length === 1 && !s.cards, 10);
  await until('el panel de la oleada 2', (s) => s.wave === 2 && s.intro && s.foes.length === 0 && s.queue > 0, 20);
  await shot('7-oleada');
  await until('se va el panel y siguen saliendo', (s) => !s.intro && s.foes.length > 0, 60);
  // los jefes: el de una clase (el zombi verde, a lo grande) y el de los voladores (el dragón), los primeros de la cola
  await page.evaluate(() => window.__rx.game.queue.unshift({ kind: 'zgreenboss', hp: 4 }, { kind: 'dragon', hp: 4 }));
  await until('sale el jefe zombi verde, a lo grande', (s) => s.foes.some((f) => f.kind === 'zgreen' && f.boss && f.y > 1.2), 60);
  await until('sale el dragón, el jefe de los voladores', (s) => s.foes.some((f) => f.kind === 'dragon' && f.boss), 60);
  await shot('8-jefes');
  // terminar la ronda (como «Terminar ronda» en la pausa): fundido a negro, el resumen y la ronda en el historial (el de
  // RepArena: las dos versiones lo comparten)
  await page.evaluate(() => window.__rx.game.endRound(false, true));
  await until('el resumen de la ronda', (s) => s.menu === 'summary' && s.phase === 'over', 20);
  // el negro del final, negro del todo (lo grabó el usuario: al agacharse se veía el suelo y el aro turquesa y, al apartarse,
  // el resumen desaparecía): con la cabeza a 40 cm del suelo y 2 m atrás, abajo todo es negro y el resumen sigue a la vista
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__rx.game.world.player.position.set(0, -1.2, 2));
  await page.waitForTimeout(600);
  const dark = await blackShare(0.7);
  await shot('9-negro');
  await page.evaluate(() => window.__rx.game.world.player.position.set(0, 0, 0));
  if (!(dark.dark > 0.97 && dark.lit > 0.01)) throw new Error('el negro del final deja ver la escena o esconde el resumen: ' + JSON.stringify(dark));
  console.log(`  ✓ el negro del final: agachado y apartado, abajo negro (${(dark.dark * 100).toFixed(1)} %) y el resumen a la vista`);
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('reparena3-history') || '[]'));
  const lastRun = hist[hist.length - 1];
  if (!lastRun || lastRun.ex !== 'squat' || !(lastRun.reps > 0) || typeof lastRun.kcal !== 'number') throw new Error('la ronda no está en el historial: ' + JSON.stringify(lastRun));
  console.log(`  ✓ la ronda, en el historial (${lastRun.reps} repeticiones, ${lastRun.kcal} kcal)`);
  // la carrera: la experiencia de la ronda (cada repetición y cada perfecta, 1 XP) y las tres misiones de hoy
  const car = await page.evaluate(() => JSON.parse(localStorage.getItem('reparena3-career') || 'null'));
  const gain = lastRun.reps + (lastRun.perfect || 0);
  if (!car || !(car.xp >= gain) || !car.mis || car.mis.list.length !== 3) throw new Error('la carrera no se ha guardado: ' + JSON.stringify(car));
  if (car.mis.list.some((m) => !(m.n > 0) || m.got < 0)) throw new Error('misiones raras: ' + JSON.stringify(car.mis));
  console.log(`  ✓ la carrera: ${car.xp} XP y ${car.mis.list.length} misiones de hoy (${car.mis.list.map((m) => m.t).join(', ')})`);
  await shot('9-resumen');
  // los entornos de día: el bosque y la isla se cargan y se ven (la fortaleza de siempre se esconde)
  for (const k of ['nature', 'island']) {
    await page.evaluate((e) => window.__rx.setSetting('scenery', e), k);
    await page.waitForFunction(() => window.__rx.sceneryOn(), null, { timeout: 60000 });
    console.log(`  ✓ entorno de día: ${k === 'nature' ? 'el bosque' : 'la isla pirata'}`);
  }
  await page.evaluate(() => window.__rx.setSetting('scenery', 'arena'));
  await page.waitForFunction(() => !window.__rx.sceneryOn(), null, { timeout: 10000 });
  // los otros modos: una ronda corta de Arcos y otra de Toques (sin manos: nadie toca, pero todo sale, se ve y se juzga)
  for (const [mode, ex, what] of [['arcs', 'squat', 'Arcos'], ['touch', 'slam', 'Toques']]) {
    await page.evaluate(([m, e]) => { window.__rx.setSetting('lives', 0); window.__rx.setSetting('mode', m); window.__rx.setSetting('exercise', e); window.__rx.HOOKS.startRound(); }, [mode, ex]);
    await until(`${what}: empieza la oleada 1`, (s) => s.mode === mode && s.phase === 'playing' && s.wave >= 1, 30);
    await page.waitForFunction((m) => { const g = window.__rx.game; return m === 'arcs' ? g.arcs().obstacles.length + g.arcs().arcs.length > 0 : g.touch().entries.length > 0; }, mode, { timeout: 40000 });
    console.log(`  ✓ ${what}: sale lo primero`);
    await page.evaluate(() => window.__rx.game.endRound(false, true));
    await until(`${what}: el resumen`, (s) => s.menu === 'summary' && s.phase === 'over', 20);
  }
  // Barras: con la barra colocada, la ronda empieza pidiendo colgarse (nadie se cuelga: sin manos, se queda en la cuenta)
  await page.evaluate(() => {
    const e = window.__rx.game.bars().eq.xr.door;
    Object.assign(e, { x: 0, z: -0.2, yaw: 0, set: true });
    window.__rx.setSetting('mode', 'bars');
    window.__rx.setSetting('exercise', 'pullup');
    window.__rx.HOOKS.startRound();
  });
  await page.waitForFunction(() => window.__rx.game.bars().center()?.title === 'BARRA', null, { timeout: 20000 });
  console.log('  ✓ Barras: pide colgarse de la barra');
  await page.evaluate(() => window.__rx.game.endRound(false, true));
  await until('Barras: el resumen', (s) => s.menu === 'summary' && s.phase === 'over', 20);
  // La Travesía de plataformas: un tramo corto (40 m, el mínimo) jugado como en el ordenador: la sentadilla (flecha abajo)
  // empuja, el avance nunca se para ante un obstáculo (el hueco se salta en marcha con Espacio al llegar a su borde; si no,
  // se tropieza y se sigue), las demás se pasan con Espacio (tronco), C (viga baja) y A/D (obstáculo a un lado), y el tramo
  // acaba en el cofre.
  // El guion juega por lo que ve en el estado (a cuánto está lo que viene y a qué velocidad vas; del jefe, qué lanza y
  // cuándo llega), no por esperas fijas: sin tarjeta gráfica el juego va de 4 a 13 imágenes por segundo según la máquina, y
  // unas esperas medidas en una fallaban en las demás (en GitHub no pasaba ninguna pieza y llegaba al jefe del tercer tramo,
  // donde solo sabía hacer sentadillas: pasaba o no según cayera la piedra). Lo que se mantiene (C, A, D, la flecha) vale a
  // cualquier ritmo; el salto solo se ve a más de unas 4 imágenes por segundo, así que lo que la prueba exige (una pieza
  // superada además del hueco: la viga, con C) no depende de saltar.
  const t2 = Date.now();
  await page.evaluate((SEED_TREK) => {
    const rx = window.__rx;
    rx.setSetting('lives', 0);
    rx.setSetting('mode', 'trek');
    rx.setSetting('exercise', 'squat');
    rx.setSetting('repsWave', 1); // (el tramo mide entonces lo mínimo: 40 m)
    rx.setSetting('repsInc', 0);
    rx.setSetting('rest', 3);
    // (el recorrido, con semilla: con el azar libre, a veces no salía nada que la prueba sepa pasar con el teclado antes del
    // jefe —una viga— y fallaba por mala suerte)
    rx.game.trek().seedRnd(SEED_TREK);
    rx.HOOKS.startRound();
  }, SEED_TREK);
  const tv = await until('Travesía: empieza el tramo 1, con piezas a la vista', (s) => s.mode === 'trek' && s.phase === 'playing' && s.wave >= 1 && !s.between && !!s.trek?.next, 90);
  console.log(`  ✓ Travesía: el tramo 1 trae ${tv.trek.live.slice(0, tv.trek.live.indexOf('chest')).join(', ')} (la primera, ${tv.trek.next.k} a ${tv.trek.next.rel} m)`);
  await shot('11-travesia');
  // las teclas que se mantienen (C, A, D)
  let held = '';
  const hold = async (k) => {
    if (held === k) return;
    if (held) await page.keyboard.up(held);
    held = k;
    if (k) await page.keyboard.down(k);
  };
  // la sentadilla, por pasos (uno en cada vuelta, sin dejar de mirar lo que viene): abajo hasta el fondo, un instante allí
  // y arriba hasta que cuenta y la cabeza termina de subir
  let sq = null;
  const squat = async (s) => {
    const y = s.head[1], now = Date.now();
    if (!sq) {
      sq = { ph: 'down', r0: s.reps, t: now };
      await page.keyboard.down('ArrowDown');
    } else if (sq.ph === 'down' && (y < 1.25 || now - sq.t > 5000)) sq = { ph: 'low', r0: sq.r0, t: now };
    else if (sq.ph === 'low' && now - sq.t > 300) {
      sq = { ph: 'up', r0: sq.r0, t: now };
      await page.keyboard.up('ArrowDown');
    } else if (sq.ph === 'up' && ((s.reps > sq.r0 && y > 1.55) || now - sq.t > 6000)) sq = null;
  };
  // el salto: una pulsación corta (el juego la guarda hasta su fotograma siguiente), como mucho una cada 0,7 s (lo que dura)
  let jumpT = 0;
  const jump = async () => {
    if (Date.now() - jumpT < 700) return;
    jumpT = Date.now();
    await page.keyboard.down('Space');
    await page.waitForTimeout(60);
    await page.keyboard.up('Space');
  };
  // 2: las sentadillas te hacen avanzar
  const d0 = (await snap()).trek.dist;
  let adv = null;
  const tAdv = Date.now();
  while (!adv && Date.now() - tAdv < 40000) {
    const s = await snap();
    if (!sq && s.trek.dist > d0 + 0.5 && s.trek.v > 0) adv = s.trek;
    else await squat(s);
    await page.waitForTimeout(50);
  }
  if (!adv) throw new Error('Travesía: las sentadillas no te hacen avanzar\núltimo estado: ' + JSON.stringify(await snap()));
  console.log(`  ✓ Travesía: las sentadillas te hacen avanzar (${adv.dist} m, ${adv.v} m/s)`);
  // el tramo entero, pieza a pieza (con un tiempo límite). La marcha sigue por inercia unos metros tras cada sentadilla: se
  // hace una cuando te quedas sin impulso o lo que viene aún tarda, y cada tecla se pulsa cuando lo que viene está a tiro
  // el hueco: cuántos se han cruzado y cuántos saltando; si alguna vez el mundo se paró ante uno (no debe)
  let gapAt = null, gapsDone = 0, gaps = 0, gapStop = false, tramo1 = null, tramo2 = null, foeSeen = null, foeShot = false, bossSaid = false;
  const tried = new Set();
  let fin = null;
  const tEnd = Date.now() + (BOSS_TREK ? 330000 : 170000);
  while (!fin && Date.now() < tEnd) {
    const s = await snap();
    if (s.phase !== 'playing') throw new Error('Travesía: la ronda ha acabado sola\núltimo estado: ' + JSON.stringify(s));
    if (sq) await squat(s); // (la sentadilla empezada sigue su curso)
    // el tramo 1 se supera al llegar a su cofre; si en él no ha salido hueco o ninguna fluida se ha pasado, se sigue con
    // el tramo 2 (ya montado) hasta tenerlo todo
    if ((s.between || s.wave >= 2) && !tramo1) {
      tramo1 = s;
      console.log(`  ✓ Travesía: llegas al cofre del tramo 1 (cofre ${s.trek.chest}) y el tramo se supera (${s.between ? 'descanso' : 'oleada ' + s.wave}, ${s.trek.dist} m)`);
    }
    if (s.trek.stop === 'gap') gapStop = true;
    // el tramo 2, con su paisaje (la aldea: otro fondo) y la seta, que llega andando y se ve animada
    if (s.wave >= 2 && !s.between && !tramo2) {
      tramo2 = s;
      console.log(`  ✓ Travesía: el tramo 2, con su paisaje (${s.trek.biome}: fondo «${s.trek.pano}»)`);
    }
    if (!foeSeen && s.trek.foes.some((f) => f.startsWith('foe:'))) foeSeen = s.trek.foes;
    if (!foeShot && s.trek.next?.k === 'foe' && s.trek.next.rel < 9) {
      foeShot = true;
      await shot('11b-travesia-seta');
    }
    if (gapAt && !s.trek.hop && s.trek.next?.k !== 'gap') {
      // el hueco ya ha quedado atrás: ¿saltado o tropezado? Sin pararse, en los dos casos
      const won = s.trek.passed > gapAt.passed;
      gapsDone++;
      if (won) gaps++;
      console.log(`  ✓ Travesía: el hueco, sin pararte: ${won ? 'saltado' : 'tropiezas y sigues'} (de ${gapAt.dist} m a ${s.trek.dist} m, a ${s.trek.v} m/s)`);
      gapAt = null;
    }
    if (tramo1 && gapsDone >= 1 && s.trek.passed - gaps >= 1 && !s.between && (!BOSS_TREK || s.trek.bosses >= 1)) {
      fin = s;
      break;
    }
    if (s.between) {
      await hold('');
      await page.waitForTimeout(250);
      continue;
    }
    const t = s.trek, nx = t.next, B = t.boss, up = s.head[1] > 1.5;
    if (B) {
      // el jefe (si se llega a él: con otra semilla, o con E2E_TREK_BOSS). Cada piedra, según la que sea y mientras llega: la
      // alta, C (agachado); la del cuerpo, A o D (apartado de donde estabas); la baja, Espacio para estar en el aire cuando
      // llega (se juzga en `hit`; un salto dura 0,45 s). Mareado: sentadilla honda y, al subir, el salto
      tried.add('boss');
      if (!bossSaid) {
        bossSaid = true;
        console.log(`  ✓ Travesía: el jefe te corta el paso (a ${t.dist} m)`);
        await shot('11c-travesia-jefe');
      }
      if (B.phase === 'dizzy') {
        await hold('');
        if (!sq) {
          if (Date.now() - jumpT > 900) await squat(s); // (tras un salto, se espera a ver si ha valido)
        } else if (sq.ph === 'up' && s.head[1] > 1.48) await jump();
      } else if (B.phase === 'throw' && B.shot === 'high') await hold('KeyC');
      else if (B.phase === 'throw' && B.shot === 'body') {
        if (held !== 'KeyA' && held !== 'KeyD') await hold(s.head[0] > 0.03 ? 'KeyA' : 'KeyD');
      } else {
        await hold('');
        if (B.phase === 'throw' && B.shot === 'low' && up && B.t >= B.hit - 1.05 && B.t <= B.hit - 0.15) await jump();
      }
      await page.waitForTimeout(40);
      continue;
    }
    if (t.hop) {
      await hold('');
      await page.waitForTimeout(100);
      continue;
    }
    const rel = nx ? nx.rel : 99, v = t.v;
    // a empujar: otra sentadilla si te quedas sin impulso o si lo que viene aún tarda (más de 4 s); si no, a esperar
    const push = async (c = v) => {
      if (!sq && (v < 0.5 || rel > 4 * c)) await squat(s);
      else await page.waitForTimeout(50);
    };
    if (nx && nx.k === 'gap') {
      // el hueco: Espacio al llegar a su borde (el juego lo da por bueno desde 1,5 m antes, o lo que recorres en 0,6 s)
      await hold('');
      if (!gapAt) gapAt = { passed: t.passed, dist: t.dist };
      if (rel <= Math.max(1.5, 0.6 * v) && rel > -0.2 && up) {
        tried.add('gap');
        await jump();
        await page.waitForTimeout(50);
      } else await push();
      continue;
    }
    if (t.stop === 'chest') {
      await hold('');
      await page.waitForTimeout(250);
      continue;
    }
    if (!nx || nx.k === 'chest' || nx.k === 'boss' || rel < -1) {
      // sin nada a la vista (o ya pasado): a empujar (el cofre y el jefe te paran solos)
      await hold('');
      await push();
      continue;
    }
    if (nx.k === 'log' || nx.k === 'foe') {
      // el tronco y la seta: en el aire cuando pasan bajo ti. El juego mira una ventana a cada lado (0,45 m, o lo que os
      // acercáis en 0,3 s: la seta, además, anda hacia ti) y el salto dura 0,45 s: se pide al entrar en ella, con margen
      await hold('');
      const c = v + (nx.walk > 0 ? t.foeV : 0), win = Math.max(0.45, 0.3 * c);
      if (rel <= win + 0.3 * c && rel > -win && up && c > 0.3) {
        tried.add(nx.k);
        await jump();
        await page.waitForTimeout(50);
      } else await push(c);
      continue;
    }
    // viga baja (C) y obstáculo a un lado (A/D, al lado contrario), con la tecla mantenida desde 1,2 s antes de llegar
    // (la fruta, hacia su lado, para cogerla; el cangrejo, al lado contrario)
    const key = nx.k === 'low' ? 'KeyC' : nx.k === 'fruit' ? (nx.side > 0 ? 'KeyD' : 'KeyA') : nx.side < 0 ? 'KeyD' : 'KeyA';
    if (rel <= 1.2 * Math.max(v, 0.5)) {
      tried.add(nx.k);
      await hold(key);
    } else await hold('');
    await push();
  }
  await hold('');
  if (sq && sq.ph !== 'up') await page.keyboard.up('ArrowDown');
  if (gapStop) throw new Error('Travesía: el mundo se ha parado ante un hueco (el avance tiene que seguir)');
  if (!fin) throw new Error(`Travesía: no se ha completado a tiempo (tramo 1 superado: ${!!tramo1}, huecos cruzados: ${gapsDone}, intentadas: ${[...tried].join(', ') || 'ninguna'})\núltimo estado: ` + JSON.stringify(await snap()));
  const tr = fin.trek, fluid = tr.passed - gaps;
  if (!(tramo1.trek.chest === 0 || tramo1.wave >= 2)) throw new Error('Travesía: el tramo 1 ha acabado sin llegar al cofre\núltimo estado: ' + JSON.stringify(tramo1));
  // las demás: cuántas se han pasado y cuántas han chocado (los huecos, aparte)
  console.log(`  ✓ Travesía: ${fluid} pieza(s) superada(s) además de los huecos y ${tr.hits} choque(s) o tropiezo(s) (intentadas: ${[...tried].join(', ') || 'ninguna'}; ${gaps} de ${gapsDone} hueco(s) saltado(s))`);
  // el cofre se abrió (una llave y una gema) y, en el tramo 2, otro paisaje y la seta animada
  if (!(tramo1.trek.keys >= 1)) throw new Error('Travesía: el cofre del tramo 1 no ha dado su llave\núltimo estado: ' + JSON.stringify(tramo1));
  const gemsT = await page.evaluate(() => JSON.parse(localStorage.getItem('reparena3-gems') || '0'));
  if (!(gemsT >= 1)) throw new Error('Travesía: el cofre no ha guardado su gema: ' + gemsT);
  console.log(`  ✓ Travesía: el cofre del tramo 1 da su llave (${tramo1.trek.keys} de 3) y su gema (llevas ${gemsT})`);
  if (tramo2 && (tramo2.trek.biome !== 1 || tramo2.trek.pano !== 'aldea')) throw new Error('Travesía: el tramo 2 no trae su paisaje: ' + JSON.stringify(tramo2.trek));
  if (foeSeen) console.log(`  ✓ Travesía: la seta se ve, animada (${foeSeen.join(', ')})`);
  await page.evaluate(() => window.__rx.game.endRound(false, true));
  await until('Travesía: el resumen', (s) => s.menu === 'summary' && s.phase === 'over', 20);
  const ghostT = await page.evaluate(() => JSON.parse(localStorage.getItem('reparenaxr-trekghost') || 'null'));
  if (!ghostT || !(ghostT.dist > 0) || !Array.isArray(ghostT.tl)) throw new Error('Travesía: no se ha guardado el fantasma: ' + JSON.stringify(ghostT));
  console.log(`  ✓ Travesía: tu mejor Travesía, guardada para el fantasma (${ghostT.dist} m)`);
  const hT = await page.evaluate(() => JSON.parse(localStorage.getItem('reparena3-history') || '[]'));
  const runT = hT[hT.length - 1];
  if (!runT || runT.mode !== 'trek' || !(runT.dist > 0)) throw new Error('la ronda de la Travesía no está en el historial: ' + JSON.stringify(runT));
  console.log(`  ✓ Travesía: la ronda, en el historial (${runT.dist} m); la Travesía ha durado ${((Date.now() - t2) / 1000).toFixed(0)} s`);
  // en el móvil (estrecho y fuera de las gafas), la página es una app: el inicio con sus listas y cada apartado, una pantalla
  await page.click('#btnExitPreview');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForFunction(() => document.documentElement.classList.contains('app') && !!document.querySelector('#appHome'), null, { timeout: 40000 });
  const rows = await page.evaluate(() => document.querySelectorAll('#appHome [data-app]').length);
  if (!(rows >= 5)) throw new Error('la app del móvil no tiene sus filas: ' + rows);
  console.log(`  ✓ en el móvil, la página es una app (${rows} filas en el inicio)`);
  await shot('10-app-movil');
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
