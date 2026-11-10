// Cargar trozos del código original de RepArena para compararlo con lo portado (npm run test:compare).
// RA_DIR: la carpeta de un clon de RepArena (merinoantonioonu-source/reparena) en main. Sin ella, las comparaciones se
// saltan. El código de RepArena se ejecuta aislado (vm), con lo mínimo simulado (THREE, document, el almacén…).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const RA_DIR = process.env.RA_DIR || '';

/** Las líneas de un archivo de RepArena desde la que empieza por `from` hasta la que empieza por `to` (incluida si
 * `inclusive`), o solo esa línea si no hay `to`. */
export function raSlice(file: string, from: string, to?: string, inclusive = true): string {
  const lines = fs.readFileSync(path.join(RA_DIR, 'src', file), 'utf8').split('\n');
  const a = lines.findIndex((l) => l.startsWith(from));
  if (a < 0) throw new Error(`no está «${from}» en ${file}`);
  if (!to) return lines[a];
  const b = lines.findIndex((l, i) => i > a && l.startsWith(to));
  if (b < 0) throw new Error(`no está «${to}» en ${file}`);
  return lines.slice(a, inclusive ? b + 1 : b).join('\n');
}

/** Un almacén del navegador en memoria. */
export class Mem {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
}

/** Ejecuta código de RepArena en un contexto aislado y devuelve lo que pida `ret` (una expresión con sus nombres). */
export function raRun<T>(code: string, ret: string, globals: Record<string, unknown>): T {
  const ctx: Record<string, unknown> = {
    THREE: { Vector3: class {}, Quaternion: class {} },
    document: { querySelector: () => null },
    location: { search: '' },
    console: { ...console, warn: () => {} },
    performance,
    URLSearchParams,
  };
  // (con sus «get» y «set»: así el código de RepArena ve los valores de la prueba en cada momento, no una copia)
  Object.defineProperties(ctx, Object.getOwnPropertyDescriptors(globals));
  vm.createContext(ctx);
  return vm.runInContext(`(function(){\n${code}\n;return (${ret});})()`, ctx) as T;
}
