/**
 * La pasarela de los Arcos (RepArena: src/71_arcs.js, ARX_DECO): rayas luminosas en la pista que corren hacia ti y farolas en
 * arco a los dos lados que pasan junto a ti a la velocidad de los arcos («Sensación de avance»). Sin reloj ni azar: el sistema de
 * los Arcos mueve las rayas (uScroll) y las farolas, y pone su color (el de la racha; rojo en la fiebre).
 */
import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, SphereGeometry, TorusGeometry } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';

export interface ArcTrackParts {
  grp: Group;
  grid: Mesh;
  gridMat: ShaderMaterial;
  archMat: MeshBasicMaterial;
  tipMat: MeshBasicMaterial;
  posts: Group[];
  own: Material[];
}

export function createArcTrack(): ArcTrackParts {
  const grp = new Group();
  grp.name = 'arc-track';
  const gridMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: { uCol: { value: new Color(0x3cf0c6) }, uScroll: { value: 0 }, uLen: { value: 12 }, uK: { value: 0.8 } },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uCol; uniform float uScroll; uniform float uLen; uniform float uK; varying vec2 vU;
void main(){
  float z = vU.y * uLen - uScroll, x = (vU.x - 0.5) * 2.2;
  float across = smoothstep(0.455, 0.49, abs(fract(z) - 0.5));
  float along = max(1.0 - smoothstep(0.0, 0.02, abs(abs(x) - 0.55)), 1.0 - smoothstep(0.0, 0.015, abs(x))) * 0.7;
  float edge = 1.0 - smoothstep(0.0, 0.03, abs(abs(x) - 1.08));
  float far = 1.0 - smoothstep(0.5, 1.0, vU.y);
  gl_FragColor = vec4(uCol * (max(max(across, along), edge) * uK * far), 1.0);
}`,
  });
  const grid = new Mesh(new PlaneGeometry(2.2, 1), gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.009;
  grid.userData.noInk = true;
  grp.add(grid);
  const archMat = new MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const tipMat = new MeshBasicMaterial({ color: 0x3cf0c6, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
  const archGeo = new TorusGeometry(1, 0.02, 5, 20, Math.PI / 2), tipGeo = new SphereGeometry(0.05, 10, 8);
  const posts: Group[] = [];
  for (let i = 0; i < 8; i++)
    for (const s of [-1, 1]) {
      const g = new Group(), a = new Mesh(archGeo, archMat);
      a.scale.set(0.45, 2.6, 1);
      a.position.x = 1.1; // (de 1,55 m en el suelo a 1,1 arriba, a 2,6 m)
      a.userData.noInk = true;
      const tip = new Mesh(tipGeo, tipMat);
      tip.position.set(1.1, 2.6, 0);
      tip.userData.noInk = true;
      g.add(a, tip);
      g.scale.x = s;
      grp.add(g);
      posts.push(g);
    }
  return { grp, grid, gridMat, archMat, tipMat, posts, own: [gridMat, archMat, tipMat] };
}
