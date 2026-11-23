/**
 * La lluvia y la nieve de los entornos (src/env/sky-plan.ts): gotas en rayas finas que caen deprisa y copos que bajan
 * despacio meciéndose, en un cilindro alrededor de tu cabeza. Todo en la tarjeta gráfica: los puntos se hacen una vez y el
 * sombreador los mueve con el reloj (nada se crea ni se sube en cada fotograma). Como las chispas, nunca pegados a los ojos:
 * se apagan a menos de 45 cm y desaparecen a menos de 12 (docs/REGLAS.md).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, LineSegments, NormalBlending, Points, ShaderMaterial, Vector3 } from '@iwsdk/core';

const RAIN_N = 1400, SNOW_N = 900, R = 11, H = 12;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// (dónde cae cada una respecto a tu cabeza: en un cilindro, con el suelo en y = 0; la altura se mueve con el reloj)
const FALL = /* glsl */ `
uniform float uT, uSpeed, uAmt; uniform vec3 uHead;
float fallY(float y0, float sp){ return mod(y0 - uT * uSpeed * sp, ${H.toFixed(1)}); }
float nearEye(vec3 p){ float d = distance(p, cameraPosition); return smoothstep(0.12, 0.45, d); }
`;

export class Weather {
  readonly rain: LineSegments;
  readonly snow: Points;
  private readonly rainMat: ShaderMaterial;
  private readonly snowMat: ShaderMaterial;

  constructor() {
    const Rn = rng(5);
    // la lluvia: dos puntos por gota (arriba y abajo de su raya)
    const rp = new Float32Array(RAIN_N * 2 * 3), re = new Float32Array(RAIN_N * 2);
    for (let i = 0; i < RAIN_N; i++) {
      const a = Rn() * Math.PI * 2, r = Math.sqrt(Rn()) * R, x = Math.cos(a) * r, z = Math.sin(a) * r, y = Rn() * H, sp = 0.85 + Rn() * 0.3;
      for (let j = 0; j < 2; j++) {
        rp.set([x, y, z], (i * 2 + j) * 3);
        re[i * 2 + j] = j ? sp : -sp;
      }
    }
    const rg = new BufferGeometry();
    rg.setAttribute('position', new BufferAttribute(rp, 3));
    rg.setAttribute('aEnd', new BufferAttribute(re, 1));
    this.rainMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      fog: false,
      uniforms: { uT: { value: 0 }, uSpeed: { value: 9 }, uAmt: { value: 0 }, uHead: { value: new Vector3() } },
      vertexShader: `${FALL} attribute float aEnd; varying float vA;
        void main(){ float sp = abs(aEnd); vec3 p = position; p.y = fallY(p.y, sp) + (aEnd > 0.0 ? 0.32 : 0.0); p.x += uHead.x; p.z += uHead.z;
          p.x += p.y * 0.04; // (algo inclinada por el viento)
          vA = uAmt * (aEnd > 0.0 ? 0.0 : 0.55) * nearEye(p) * smoothstep(0.0, 1.5, p.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(0.82, 0.88, 0.96, vA); }`,
    });
    this.rain = new LineSegments(rg, this.rainMat);
    // la nieve: un punto por copo, con su vaivén
    const sp = new Float32Array(SNOW_N * 3), ss = new Float32Array(SNOW_N);
    for (let i = 0; i < SNOW_N; i++) {
      const a = Rn() * Math.PI * 2, r = Math.sqrt(Rn()) * R;
      sp.set([Math.cos(a) * r, Rn() * H, Math.sin(a) * r], i * 3);
      ss[i] = Rn();
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(sp, 3));
    sg.setAttribute('aSeed', new BufferAttribute(ss, 1));
    this.snowMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
      uniforms: { uT: { value: 0 }, uSpeed: { value: 0.9 }, uAmt: { value: 0 }, uHead: { value: new Vector3() }, uVH: { value: 1000 } },
      vertexShader: `${FALL} attribute float aSeed; uniform float uVH; varying float vA;
        void main(){ vec3 p = position; p.y = fallY(p.y, 0.7 + aSeed * 0.6); p.x += uHead.x + sin(uT * (0.6 + aSeed) + aSeed * 30.0) * 0.35; p.z += uHead.z + cos(uT * 0.7 + aSeed * 20.0) * 0.3;
          vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = uAmt * nearEye(p) * smoothstep(0.0, 1.0, p.y);
          gl_PointSize = clamp(uVH * 0.012 / max(0.5, -mv.z), 1.0, 10.0); }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5 || vA < 0.01) discard; gl_FragColor = vec4(vec3(0.95), vA * (1.0 - d * 2.0)); }`,
    });
    this.snow = new Points(sg, this.snowMat);
    for (const o of [this.rain, this.snow]) {
      o.frustumCulled = false;
      o.renderOrder = 5;
      o.userData.noInk = true;
      o.visible = false;
    }
  }

  /** Cada fotograma: cuánta lluvia y nieve (0 a 1), el reloj, tu cabeza y el alto de la imagen (para el tamaño de los copos). */
  update(rain: number, snow: number, t: number, head: Vector3, vh: number): void {
    this.rain.visible = rain > 0.01;
    this.snow.visible = snow > 0.01;
    const ru = this.rainMat.uniforms, su = this.snowMat.uniforms;
    ru.uT.value = t % 1000;
    ru.uAmt.value = rain;
    (ru.uHead.value as Vector3).copy(head);
    su.uT.value = t % 1000;
    su.uAmt.value = snow;
    su.uVH.value = vh;
    (su.uHead.value as Vector3).copy(head);
  }
}
