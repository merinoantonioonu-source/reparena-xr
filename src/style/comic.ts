/**
 * El estilo Cómic de RepArena (src/38_comic.js), el de serie: la estética de dibujo animado de juegos de VR como Retronika
 * o Broken Edge.
 *  · sombreado plano con un solo corte duro entre luz y sombra; la sombra es de color (fría, violácea), no negra; un
 *    brillo duro a manchas y, en la sombra, un rayado a lápiz (fijo en el mundo: no baila al mover la cabeza)
 *  · colores claros y vivos: las superficies que tenían texturas de relieve quedan lisas, del tono pastel de su color
 *  · contornos de tinta alrededor de cada figura: una copia de su forma algo más gruesa, de la que solo se ven las caras de
 *    atrás; finos de lejos (grosor fijo en el mundo pasados 2,5 m) y solo en el borde de verdad (sin parpadeos)
 * Cada material sigue siendo el mismo, con otro sombreador: valen igual los destellos al recibir un golpe, los fundidos y
 * los colores que cambia el juego; al quitarlo («Realista»), todo vuelve a ser como antes.
 * Adaptado a la versión de Three de IWSDK: el punto donde se juntan las luces ya no es el de r128.
 */
import { BackSide, BufferAttribute, Color, FrontSide, InstancedMesh, Mesh, MeshBasicMaterial, SkinnedMesh, Vector3 } from '@iwsdk/core';
import type { BufferGeometry, Material, MeshStandardMaterial, Object3D, Texture } from '@iwsdk/core';

interface ComicState {
  on: boolean;
  saved: Record<string, unknown> | null;
  wrap: (shader: { fragmentShader: string; uniforms: Record<string, unknown> }, renderer: unknown) => void;
  key: () => string;
}

export const COMIC = {
  mats: new Set<MeshStandardMaterial>(),
  st: new WeakMap<Material, ComicState>(),
  ol: new WeakMap<Object3D, Mesh | null>(),
  uL: { value: new Vector3(-0.45, 0.8, 0.4).normalize() },
  uK: { value: 1.08 },
  uShadow: { value: new Color().setRGB(0.6, 0.56, 0.86) },
  on: true,
};

// (la línea de Three donde se juntan las luces: ahí entra el cómic)
const COMIC_OUT = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
// (COMIC_SOFT: un degradado redondeado en vez del corte duro; COMIC_CHAR: los personajes con esqueleto, corte suave para
// que el relieve de la cara se lea, sin el brillo plano ni el rayado, que les deformaban la cara; y a todo, un poco de luz
// dentro de cada tono y un degradado de abajo arriba, para que los planos grandes no queden de un solo color)
const COMIC_LIGHT = `
	vec3 cL = normalize( ( viewMatrix * vec4( uComicL, 0.0 ) ).xyz );
	float cD = dot( normal, cL );
	#ifdef COMIC_SOFT
		float cLit = smoothstep( -0.45, 0.75, cD );
	#elif defined( COMIC_CHAR )
		float cLit = smoothstep( -0.18, 0.32, cD );
	#else
		float cLit = smoothstep( 0.0, 0.035, cD );
	#endif
	vec3 cBase = diffuseColor.rgb; float cLum = dot( cBase, vec3( 0.299, 0.587, 0.114 ) ); cBase = max( mix( vec3( cLum ), cBase, 1.3 ), 0.0 );
	vec3 cCol = mix( cBase * uComicShadow, cBase, cLit ) * ( 0.9 + 0.13 * clamp( cD, 0.0, 1.0 ) );
	#ifndef COMIC_CHAR
		float cSp = smoothstep( 0.9, 0.93, dot( reflect( - cL, normal ), normalize( vViewPosition ) ) ) * cLit; cCol += vec3( 0.3 ) * cSp;
		vec3 cW = transpose( mat3( viewMatrix ) ) * ( - vViewPosition ) + cameraPosition;
		cCol *= mix( 0.8, 1.07, smoothstep( -0.2, 3.4, cW.y ) );
		float cH = abs( fract( dot( cW, vec3( 0.9, 0.55, -0.7 ) ) * 26.0 ) - 0.5 );
		cCol *= 1.0 - ( 1.0 - smoothstep( 0.1, 0.2, cH ) ) * ( 1.0 - cLit ) * 0.3 * smoothstep( 7.0, 3.0, length( vViewPosition ) ); // (solo de cerca: a lo lejos hacía aguas)
	#endif
	vec3 outgoingLight = cCol * uComicK + totalEmissiveRadiance * 1.4;`;

/** El sombreador de un material estándar de Three, con el cómic (null si no es uno: se queda como estaba). */
export function comicFragment(src: string, soft: boolean, char: boolean): string | null {
  if (!src.includes(COMIC_OUT)) return null;
  let f = src;
  if (soft) f = '#define COMIC_SOFT\n' + f;
  else if (char) f = '#define COMIC_CHAR\n' + f;
  for (const inc of ['lights_physical_fragment', 'lights_fragment_begin', 'lights_fragment_maps', 'lights_fragment_end', 'aomap_fragment']) f = f.replace(`#include <${inc}>`, '');
  return 'uniform vec3 uComicL;\nuniform float uComicK;\nuniform vec3 uComicShadow;\n' + f.replace(COMIC_OUT, COMIC_LIGHT);
}
function comicShader(sh: { fragmentShader: string; uniforms: Record<string, unknown> }, soft: boolean, char: boolean): void {
  const f = comicFragment(sh.fragmentShader, soft, char);
  if (!f) return;
  Object.assign(sh.uniforms, { uComicL: COMIC.uL, uComicK: COMIC.uK, uComicShadow: COMIC.uShadow });
  sh.fragmentShader = f;
}

// Prepara un material (una vez): su sombreador, con el cómic si toca. La clave del programa distingue las versiones (y
// conserva la del sombreador propio que ya tuviera). El estado va aparte (COMIC.st), no en userData: Three lo copia como
// texto al clonar un material, y ahí no caben las texturas guardadas
const COMIC_MAPS = ['normalMap', 'roughnessMap', 'metalnessMap', 'envMap', 'aoMap'] as const;
export function comicPatch(m: MeshStandardMaterial): void {
  let S = COMIC.st.get(m);
  if (S && m.onBeforeCompile === S.wrap) return;
  const prev = m.onBeforeCompile;
  if (!S) {
    S = { on: false, saved: null, wrap: () => {}, key: () => '' };
    COMIC.st.set(m, S);
    COMIC.mats.add(m);
    m.addEventListener('dispose', () => COMIC.mats.delete(m));
  }
  const st = S, prevKey = m.customProgramCacheKey.bind(m);
  st.wrap = function (this: MeshStandardMaterial, sh, r) {
    prev.call(this, sh as never, r as never);
    if (st.on) comicShader(sh, !!this.userData.comicSoft, !!this.userData.comicChar);
  };
  st.key = function (this: MeshStandardMaterial) {
    return prevKey() + (st.on ? (this.userData.comicSoft ? '|comicsoft' : this.userData.comicChar ? '|comicchar' : '|comic') : '');
  };
  m.onBeforeCompile = st.wrap as MeshStandardMaterial['onBeforeCompile'];
  m.customProgramCacheKey = st.key;
  comicSet(m, COMIC.on);
}

// En cómic, fuera las texturas de relieve, rugosidad, brillo y reflejos; en las superficies que las tenían (sin esqueleto),
// también la de color: quedan lisas, del tono pastel de su color medio. Sin cómic, vuelven
export function comicSet(m: MeshStandardMaterial, on: boolean): void {
  const S = COMIC.st.get(m);
  if (!S || S.on === on) return;
  S.on = on;
  const M = m as unknown as Record<string, unknown>;
  if (on) {
    const sv: Record<string, unknown> = (S.saved = {}), detailed = !!(m.normalMap || m.roughnessMap) && !m.userData.comicChar && !m.userData.keepMap;
    if (detailed && m.map) {
      const a = texAvg(m.map);
      if (a) {
        sv.color = m.color.getHex();
        m.color.multiply(pastel(a));
      }
    }
    for (const k of [...COMIC_MAPS, ...(detailed ? (['map'] as const) : [])]) {
      if (k === 'normalMap' && m.userData.comicChar) continue; // (los personajes conservan el relieve: sin él se perdían las facciones)
      sv[k] = M[k];
      M[k] = null;
    }
  } else if (S.saved) {
    const sv = S.saved;
    if (sv.color !== undefined) {
      m.color.setHex(sv.color as number);
      delete sv.color;
    }
    Object.assign(M, sv);
    S.saved = null;
  }
  m.needsUpdate = true;
}

// el mismo tono, más claro y algo más vivo (los colores de dibujo animado)
const _hsl = { h: 0, s: 0, l: 0 };
function pastel(c: Color): Color {
  const o = c.clone();
  o.getHSL(_hsl);
  return o.setHSL(_hsl.h, Math.min(0.75, Math.max(_hsl.s, 0.28) * 1.1), _hsl.l + (0.5 - _hsl.l) * 0.7);
}
// el color medio de una textura (en lineal), una vez por textura
const _texAvg = new Map<string, Color | null>();
let _avgCtx: CanvasRenderingContext2D | null = null;
function texAvg(t: Texture): Color | null {
  if (_texAvg.has(t.uuid)) return _texAvg.get(t.uuid)!;
  let c: Color | null = null;
  try {
    const img = t.image as CanvasImageSource & { width?: number };
    if (img && img.width) {
      if (!_avgCtx) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 4;
        _avgCtx = cv.getContext('2d', { willReadFrequently: true });
      }
      if (_avgCtx) {
        _avgCtx.clearRect(0, 0, 4, 4);
        _avgCtx.drawImage(img, 0, 0, 4, 4);
        const d = _avgCtx.getImageData(0, 0, 4, 4).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < 64; i += 4) {
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
        }
        c = new Color().setRGB(r / 16 / 255, g / 16 / 255, b / 16 / 255, 'srgb'); // (de sRGB a lineal)
      }
    }
  } catch {
    c = null;
  }
  _texAvg.set(t.uuid, c);
  return c;
}

/* ---------- Contornos de tinta ---------- */
// Una copia de la malla con sus caras de atrás, empujada hacia fuera en la pantalla: asoma como un borde negro alrededor de
// la figura. Las normales de las esquinas se promedian (aOutN) para que el borde no se abra en los cantos de las cajas
// (faceless: sin tinta en la cabeza, para los que llevan userData.noFaceInk: de lejos, el borde se colaba por los huecos
// de la cara y la llenaba de manchas negras; aOutK lo apaga allí). El grosor es fijo en la pantalla hasta OUTL.d metros
// y, más lejos, fijo en el mundo (cada vez más fino). Y solo en el borde de verdad: donde la cara mira hacia ti, nada
export const OUTL = { w: { value: 0.006 }, d: { value: 2.5 }, mats: new Map<string, MeshBasicMaterial>() };
function outlMat(faceless: boolean): MeshBasicMaterial {
  const k = faceless ? 'f' : 'n';
  const have = OUTL.mats.get(k);
  if (have) return have;
  const m = new MeshBasicMaterial({ color: new Color('#1b1222'), side: BackSide, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutW = OUTL.w;
    sh.uniforms.uOutD = OUTL.d;
    sh.vertexShader =
      (faceless ? '#define OUT_K\nattribute float aOutK;\n' : '') +
      'attribute vec3 aOutN;\nuniform float uOutW;\nuniform float uOutD;\n' +
      sh.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
	vec3 oN = aOutN;
	#ifdef USE_SKINNING
		oN = ( bindMatrixInverse * ( skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW ) * bindMatrix * vec4( oN, 0.0 ) ).xyz;
	#endif
	#ifdef USE_INSTANCING
		oN = mat3( instanceMatrix ) * oN;
	#endif
	vec2 oD = ( projectionMatrix * vec4( normalize( normalMatrix * oN ), 0.0 ) ).xy;
	float oK = 1.0;
	#ifdef OUT_K
		oK = aOutK;
	#endif
	float oL = length( oD );
	gl_Position.xy += oD / max( oL, 1e-4 ) * smoothstep( 0.03, 0.3, oL ) * uOutW * oK * min( gl_Position.w, uOutD );`,
      );
  };
  m.customProgramCacheKey = () => 'comic-outline2' + (faceless ? 'f' : '');
  OUTL.mats.set(k, m);
  return m;
}
// las normales promediadas por posición (para que el borde no se abra en los cantos)
function outN(g: BufferGeometry): boolean {
  if (g.attributes.aOutN) return true;
  const p = g.attributes.position, n = g.attributes.normal;
  if (!p || !n) return false;
  const cnt = p.count, acc = new Map<string, [number, number, number]>(), keys: string[] = new Array(cnt), out = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const k = (keys[i] = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4));
    const a = acc.get(k) || [0, 0, 0];
    a[0] += n.getX(i);
    a[1] += n.getY(i);
    a[2] += n.getZ(i);
    acc.set(k, a);
  }
  for (let i = 0; i < cnt; i++) {
    const a = acc.get(keys[i])!, l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l;
    out[i * 3 + 1] = a[1] / l;
    out[i * 3 + 2] = a[2] / l;
  }
  g.setAttribute('aOutN', new BufferAttribute(out, 3));
  return true;
}
// cuánta tinta lleva cada vértice: 0 en lo que mueve la cabeza (el hueso Head y los que cuelgan de él), 1 en el resto
function outK(mesh: SkinnedMesh): boolean {
  const g = mesh.geometry;
  if (g.attributes.aOutK) return true;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, sk = mesh.skeleton;
  if (!si || !sw || !sk) return false;
  const head = sk.bones.find((b) => /^head$/i.test(b.name));
  if (!head) return false;
  const ids = new Set<number>();
  head.traverse((b) => {
    const i = sk.bones.indexOf(b as (typeof sk.bones)[number]);
    if (i >= 0) ids.add(i);
  });
  const out = new Float32Array(si.count);
  for (let v = 0; v < si.count; v++) {
    let w = 0;
    for (let c = 0; c < 4; c++) if (ids.has(si.getComponent(v, c))) w += sw.getComponent(v, c);
    out[v] = 1 - Math.max(0, Math.min(1, w * 1.6)); // (el cuello, a medias)
  }
  g.setAttribute('aOutK', new BufferAttribute(out, 1));
  return true;
}

// su contorno, como hijo suyo (va con ella); los transparentes, los de dos caras, los que no tienen normales y la
// vegetación de miles de copias, sin contorno; userData.noInk: sin contorno (como los bandidos de RepArena)
function outlAdd(mesh: Mesh): void {
  if (COMIC.ol.has(mesh) || mesh.userData.isOutline || mesh.userData.noInk) return;
  const mt = mesh.material as MeshStandardMaterial;
  COMIC.ol.set(mesh, null);
  if (!mt || Array.isArray(mt) || !mt.isMeshStandardMaterial || mt.transparent || mt.side !== FrontSide || !mesh.geometry) return;
  if ((mesh as InstancedMesh).isInstancedMesh && (mesh as InstancedMesh).count > 64) return;
  if (!outN(mesh.geometry)) return;
  let o: Mesh;
  if ((mesh as SkinnedMesh).isSkinnedMesh) {
    const sm = mesh as SkinnedMesh, so = new SkinnedMesh(sm.geometry, outlMat(!!sm.userData.noFaceInk && outK(sm)));
    so.bind(sm.skeleton, sm.bindMatrix);
    so.bindMode = sm.bindMode;
    o = so;
  } else if ((mesh as InstancedMesh).isInstancedMesh) {
    const im = mesh as InstancedMesh, io = new InstancedMesh(im.geometry, outlMat(false), im.instanceMatrix.count);
    io.instanceMatrix = im.instanceMatrix;
    io.onBeforeRender = () => {
      io.count = im.count;
    };
    o = io;
  } else o = new Mesh(mesh.geometry, outlMat(false));
  o.name = 'ink-outline';
  o.userData.isOutline = true;
  o.frustumCulled = mesh.frustumCulled;
  o.renderOrder = mesh.renderOrder;
  o.raycast = () => {};
  o.visible = COMIC.on;
  mesh.add(o);
  COMIC.ol.set(mesh, o);
}

// ¿Es un panel de UIKit? (tienen sus propios materiales: el cómic no los toca)
export type SkipTest = (o: Object3D) => boolean;

// Recorre lo que cuelga de root (sin entrar en los paneles): prepara sus materiales y, en cómic, pone los contornos que falten
const _meshes: Mesh[] = [];
export function comicScan(root: Object3D, skip: SkipTest): void {
  _meshes.length = 0;
  walk(root, skip);
  for (const m of _meshes) outlAdd(m); // (después de recorrer: añadir hijos mientras se recorre no es buena idea)
  _meshes.length = 0;
}
function walk(o: Object3D, skip: SkipTest): void {
  if (skip(o)) return;
  if (o.userData.isOutline) {
    o.visible = COMIC.on;
    return;
  }
  const mesh = o as Mesh, ms = mesh.material;
  if (ms) {
    for (const m of Array.isArray(ms) ? ms : [ms]) {
      const sm = m as MeshStandardMaterial;
      if (!sm.isMeshStandardMaterial) continue;
      if ((mesh as SkinnedMesh).isSkinnedMesh) sm.userData.comicChar = true; // (los personajes: su corte suave)
      comicPatch(sm);
    }
    if (COMIC.on && (mesh.isMesh || (mesh as SkinnedMesh).isSkinnedMesh)) _meshes.push(mesh);
  }
  for (const c of o.children) walk(c, skip);
}

/** Pone o quita el cómic en todo lo preparado (los contornos aparecen o se esconden en el siguiente recorrido). */
export function comicApply(on: boolean, root: Object3D, skip: SkipTest): void {
  COMIC.on = on;
  comicScan(root, skip);
  for (const m of COMIC.mats) comicSet(m, on);
}
