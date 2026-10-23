// Generatore pseudocasuale deterministico per i test (mulberry32, T. Ettinger, dominio pubblico).

/** Seme registrato dei test del modulo tempo. */
export const SEME_TEMPO = 20261018;

export function generatore(seme: number): () => number {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Intero uniforme in [min, max]. */
export function interoTra(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}
