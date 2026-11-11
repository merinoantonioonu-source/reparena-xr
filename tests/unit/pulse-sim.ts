// Lo de fuera del pulsómetro, falso, para las pruebas (tests/unit/pulse.test.ts y tests/compare/pulse.compare.test.ts):
// un reloj que se mueve a mano, un Bluetooth con un pulsómetro de mentira, Firebase en memoria, el flujo (EventSource) y
// los temporizadores en una cola.

/** Un paquete de la medida estándar: banderas y pulso (en 16 bits si flags & 1), con bytes de más detrás (RR…). */
export function hrPacket(flags: number, bpm: number, extra = 0): DataView {
  const n = (flags & 1 ? 3 : 2) + extra, dv = new DataView(new ArrayBuffer(n));
  dv.setUint8(0, flags);
  if (flags & 1) dv.setUint16(1, bpm, true);
  else dv.setUint8(1, bpm & 255);
  return dv;
}

export type Fail = '' | 'connect' | 'notify';
/** Un pulsómetro de mentira: emit() manda un paquete; drop() lo desconecta. */
export class FakeHrDevice {
  listeners: ((ev: { target: { value: DataView } }) => void)[] = [];
  lostFns: (() => void)[] = [];
  connected = false;
  disconnects = 0;
  fail: Fail = '';
  constructor(public name?: string) {}
  gatt = {
    connected: false,
    connect: async () => {
      if (this.fail === 'connect') throw new Error('GATT no responde');
      this.gatt.connected = true;
      return {
        getPrimaryService: async (s: string) => {
          if (s !== 'heart_rate') throw new Error('sin servicio');
          return {
            getCharacteristic: async (c: string) => {
              if (c !== 'heart_rate_measurement') throw new Error('sin característica');
              return {
                addEventListener: (_t: string, fn: (ev: { target: { value: DataView } }) => void) => this.listeners.push(fn),
                startNotifications: async () => {
                  if (this.fail === 'notify') throw new Error('no avisa');
                },
              };
            },
          };
        },
      };
    },
    disconnect: () => {
      this.gatt.connected = false;
      this.disconnects++;
    },
  };
  addEventListener(_t: string, fn: () => void): void {
    this.lostFns.push(fn);
  }
  emit(dv: DataView): void {
    for (const f of this.listeners) f({ target: { value: dv } });
  }
  drop(): void {
    this.gatt.connected = false;
    for (const f of this.lostFns) f();
  }
}

export class FakeBt {
  next: FakeHrDevice | Error | null = null;
  avail = true;
  hasAvail = true;
  requests = 0;
  async requestDevice(): Promise<FakeHrDevice> {
    this.requests++;
    const d = this.next;
    if (d instanceof Error) throw d;
    if (!d) {
      const e = new Error('User cancelled');
      e.name = 'NotFoundError';
      throw e;
    }
    return d;
  }
  get getAvailability(): (() => Promise<boolean>) | undefined {
    return this.hasAvail ? async () => this.avail : undefined;
  }
}

export class FakeES {
  static all: FakeES[] = [];
  readyState = 1;
  onerror: ((ev: unknown) => void) | null = null;
  closed = false;
  fns: Record<string, ((ev: { data: string }) => void)[]> = {};
  constructor(public url: string) {
    FakeES.all.push(this);
  }
  addEventListener(t: string, fn: (ev: { data: string }) => void): void {
    (this.fns[t] = this.fns[t] || []).push(fn);
  }
  fire(t: string, data: unknown): void {
    for (const f of this.fns[t] || []) f({ data: JSON.stringify(data) });
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
}

/** Firebase en memoria: lo que se guarda con PUT y se lee con GET; `status` para fallar. */
export class FakeDb {
  data = new Map<string, unknown>();
  calls: { url: string; method: string; body?: string }[] = [];
  status = 200;
  fetch = async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method || 'GET';
    this.calls.push({ url, method, body: init?.body });
    if (method === 'PUT' && this.status === 200) this.data.set(url, JSON.parse(init!.body!));
    const st = this.status, v = this.data.get(url) ?? null;
    return { ok: st === 200, status: st, json: async () => v };
  };
}

/** Espera a que se acabe todo lo pendiente (las promesas encadenadas y el cifrado de Node). */
export const settle = async (n = 30): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};
