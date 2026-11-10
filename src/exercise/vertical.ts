/**
 * El detector de «bajar y subir»: la sentadilla y los demás ejercicios que se miden por la altura de la cabeza (en
 * RepArena, `vertDetector` de src/70_game.js, con los mismos números y reglas). Es lógica pura, sin IWSDK ni Three:
 * recibe la altura de la cabeza en cada fotograma y devuelve lo que ha pasado (se prueba en tests/unit).
 *
 *  - Arriba, la referencia (la altura de pie) sube enseguida y baja despacio: se ajusta a tu postura real.
 *  - Al bajar lo pedido (`req`), la carga del disparo (`charge`).
 *  - Aguantando abajo en la postura perfecta (lo pedido y 3 cm más, con 1,5 cm de margen), la carga sube de nivel
 *    (`power`, ×2 a ×4); cada nivel pide aguantar más que el anterior (`powLevel`).
 *  - Al volver arriba, la repetición (`rep`), PERFECTA si duró lo pedido y bajó 3 cm de más; si no llegaste a lo
 *    pedido pero bajaste algo, el aviso de que bajes más (`partial`).
 */

/** Lo que pide el ejercicio (en metros y segundos). */
export interface VertConfig {
  /** Cuánto tiene que bajar la cabeza para que cuente (la «Profundidad de la sentadilla»). */
  req: number;
  /** Cuánto bajar desde arriba para empezar la bajada. */
  start: number;
  /** Margen bajo la referencia para dar por vuelta arriba. */
  back: number;
  /** A partir de cuánto, una bajada que no llega avisa de que bajes más. */
  partial: number;
  /** Duración mínima de una PERFECTA (0: sin perfectas). */
  perfectDur: number;
  /** ¿Sube la carga aguantando abajo (×2-×4)? (con pistolas o espadas, no) */
  power: boolean;
  /** Segundos abajo para el ×2 y lo que pide de más cada nivel siguiente («Aguantar para el ×2» y «Cada nivel más»). */
  powHold: number;
  powHoldInc: number;
  /** Recarga profunda: bajar esto de más da el ×4 al instante (0: desactivada; «deepDrop» en RepArena). */
  deepDrop: number;
}

/** Lo que pasa en un fotograma. */
export type VertEvent =
  | { type: 'charge' }
  | { type: 'power'; level: number; deep: boolean }
  | { type: 'rep'; perfect: boolean; fast: boolean; pow: number }
  | { type: 'partial' };

/** Los valores de serie de RepArena para la sentadilla (26 cm, PERFECTA de 1,2 s, ×2 a los 1,5 s y medio segundo más
 * por nivel). */
export function squatConfig(depthCm = 26, perfectTime = 1.2, powHold = 1.5, powHoldInc = 0.5, deepDropCm = 0): VertConfig {
  const req = depthCm / 100;
  return { req, start: Math.min(0.08, req * 0.5), back: 0.05, partial: req * 0.4, perfectDur: perfectTime, power: true, powHold, powHoldInc, deepDrop: deepDropCm / 100 };
}

/** El nivel de carga tras aguantar h segundos abajo: ×2 tras powHold s y cada nivel siguiente pide powHoldInc s más. */
export function powLevel(h: number, powHold = 1.5, powHoldInc = 0.5): number {
  let p = 1, need = powHold, acc = 0;
  while (p < 4 && h >= acc + need) {
    acc += need;
    need += powHoldInc;
    p++;
  }
  return p;
}

export class VertDetector {
  state: 'up' | 'down' = 'up';
  /** La altura de referencia (de pie). */
  ref = 1.6;
  private peak = 1.6;
  private min = 1.6;
  private t0 = 0;
  /** ¿Ha llegado abajo (carga dada) en la bajada de ahora? */
  charged = false;
  private stillT = 0;
  private holdT = 0;
  /** El nivel de carga de la bajada de ahora (1 a 4). */
  pow = 1;

  /** Empieza de pie a la altura y (al calibrar o empezar la ronda). */
  reset(y: number): void {
    this.state = 'up';
    this.ref = this.peak = this.min = y;
    this.charged = false;
    this.stillT = this.holdT = 0;
    this.pow = 1;
  }

  /**
   * Un fotograma: y, la altura de la cabeza; t, el reloj (s); dt, lo que ha pasado; headSpeed, lo deprisa que se mueve
   * la cabeza (m/s, suavizada). Añade a `out` lo que haya pasado (sin crear listas nuevas).
   */
  update(y: number, t: number, dt: number, headSpeed: number, cfg: VertConfig, out: VertEvent[]): void {
    const still = headSpeed < 0.06;
    if (this.state === 'up') {
      // la referencia de arriba sube enseguida y baja despacio: se ajusta a tu postura real
      this.ref += (y - this.ref) * Math.min(1, dt * (y > this.ref ? 1.5 : 0.25));
      // tras una repetición, la siguiente bajada se mide desde lo más alto que llegaste después (si la repetición se
      // confirmó con la cabeza aún subiendo, no se toma ese final de la subida por otra bajada)
      this.peak = Math.max(this.peak, y);
      if (y < this.ref - cfg.start && y < this.peak - cfg.start * 0.6) {
        this.state = 'down';
        this.min = y;
        this.t0 = t;
        this.charged = false;
        this.stillT = 0;
        this.holdT = 0;
        this.pow = 1;
      }
      return;
    }
    if (y < this.min) this.min = y;
    const drop = this.ref - this.min;
    if (!this.charged && drop >= cfg.req) {
      this.charged = true;
      out.push({ type: 'charge' });
    }
    // carga: aguantando abajo en la postura perfecta sube de nivel; si subes un poco, el tiempo se para
    if (cfg.power && this.charged && y <= this.ref - cfg.req - 0.015) {
      this.holdT += dt;
      const p = powLevel(this.holdT, cfg.powHold, cfg.powHoldInc);
      if (p > this.pow) {
        this.pow = p;
        out.push({ type: 'power', level: p, deep: false });
      }
    }
    // recarga profunda: bajando mucho más de lo pedido, la carga máxima al instante
    if (cfg.power && this.charged && this.pow < 4 && cfg.deepDrop > 0 && drop >= cfg.req + cfg.deepDrop) {
      this.pow = 4;
      out.push({ type: 'power', level: 4, deep: true });
    }
    this.stillT = still ? this.stillT + dt : 0;
    // vuelve arriba al recuperar la mayor parte del recorrido, aunque no llegues a la referencia
    const upAt = Math.min(this.ref - cfg.back, this.min + Math.max(cfg.req * 0.9, drop * 0.6));
    // ya arriba y quieto, pero por debajo de la referencia: la referencia era alta y se corrige
    const stuck = this.charged && this.stillT > 0.8 && y - this.min >= cfg.req * 0.7;
    if (y > upAt || stuck) {
      const dur = t - this.t0;
      if (this.charged) {
        out.push({
          type: 'rep',
          perfect: dur >= cfg.perfectDur && dur < 12 && drop >= cfg.req + 0.03,
          fast: cfg.perfectDur > 0 && dur < cfg.perfectDur * 0.5,
          pow: cfg.power ? this.pow : 1,
        });
      } else if (drop > cfg.partial) out.push({ type: 'partial' });
      if (stuck) this.ref = y;
      this.state = 'up';
      this.peak = y;
    } else if (!this.charged && this.stillT > 3) {
      this.ref = y + cfg.back * 0.5;
      this.state = 'up';
      this.stillT = 0;
    }
  }
}
