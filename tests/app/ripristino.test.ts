// Ripristino dopo il cambio di lingua (RF8, § 11.12): passaggio una tantum in sessionStorage, letto e cancellato.

import { describe, expect, it } from 'vitest';
import { CHIAVE_RIPRISTINO, consumaRipristino, leggiStatoRipristino, salvaRipristino } from '../../src/app/ripristino';
import type { StatoRipristino } from '../../src/app/ripristino';
import { creaPreferenze } from '../../src/app/preferenze';

class ArchivioFinto {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  get length(): number {
    return this.m.size;
  }
}
const finto = (): Storage => new ArchivioFinto() as unknown as Storage;

const STATO: StatoRipristino = {
  jd: 2_461_332.5,
  scala: 'UT',
  offsetMinuti: 120,
  selezionato: 'giove',
  fuoco: 'giove',
  ampiezzaKm: 3.2e6,
  vistaTestuale: false,
};

describe('passaggio dello stato', () => {
  it('si salva, si legge una volta e si cancella', () => {
    const a = finto();
    expect(salvaRipristino(STATO, a)).toBe(true);
    expect(a.getItem(CHIAVE_RIPRISTINO)).not.toBeNull();
    expect(consumaRipristino(a)).toEqual(STATO);
    expect(a.getItem(CHIAVE_RIPRISTINO)).toBeNull();
    expect(consumaRipristino(a)).toBeNull();
  });

  it('senza passaggio, senza archivio o con archivio che lancia: null', () => {
    expect(consumaRipristino(finto())).toBeNull();
    expect(consumaRipristino(null)).toBeNull();
    expect(salvaRipristino(STATO, null)).toBe(false);
    const rotto = {
      getItem: () => {
        throw new Error('bloccato');
      },
      setItem: () => {
        throw new Error('bloccato');
      },
      removeItem: () => {
        throw new Error('bloccato');
      },
    } as unknown as Storage;
    expect(consumaRipristino(rotto)).toBeNull();
    expect(salvaRipristino(STATO, rotto)).toBe(false);
  });

  it('contenuto non valido: null e passaggio comunque cancellato', () => {
    const a = finto();
    a.setItem(CHIAVE_RIPRISTINO, '{non json');
    expect(consumaRipristino(a)).toBeNull();
    expect(a.getItem(CHIAVE_RIPRISTINO)).toBeNull();
    a.setItem(CHIAVE_RIPRISTINO, JSON.stringify({ ...STATO, jd: 1e9 }));
    expect(consumaRipristino(a)).toBeNull();
  });

  it('validazione dei campi', () => {
    expect(leggiStatoRipristino(STATO)).toEqual(STATO);
    expect(leggiStatoRipristino({ ...STATO, scala: 'TT', offsetMinuti: null, selezionato: null, ampiezzaKm: null })).not.toBeNull();
    for (const guasto of [
      { scala: 'GMT' },
      { jd: Number.NaN },
      { jd: -1_931_077 },
      { offsetMinuti: 1000 },
      { offsetMinuti: 1.5 },
      { selezionato: 'Giove!' },
      { fuoco: '' },
      { ampiezzaKm: -1 },
    ]) {
      expect(leggiStatoRipristino({ ...STATO, ...guasto }), JSON.stringify(guasto)).toBeNull();
    }
    expect(leggiStatoRipristino(null)).toBeNull();
    expect(leggiStatoRipristino('x')).toBeNull();
  });
});

describe('la data non entra nelle preferenze (RF8)', () => {
  it('la lingua si salva, le chiavi della data restano rifiutate', () => {
    const a = finto();
    const p = creaPreferenze(() => a);
    p.scrivi('ss.ui.lingua', 'en');
    p.scrivi('ss.ripristino.data', 2_461_332.5);
    p.scrivi('ss.jd', 1);
    expect(a.getItem('ss.ui.lingua')).toBe('"en"');
    expect(a.length).toBe(1);
  });
});
