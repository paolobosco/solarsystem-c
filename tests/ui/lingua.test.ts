// Scelta della lingua iniziale (RNF8, RF8): preferenza salvata, lingua del browser, italiano senza browser.

import { describe, expect, it } from 'vitest';
import { LINGUA, CHIAVE_LINGUA, determinaLingua, eLingua, sceglieLingua } from '../../src/ui/lingua';

describe('sceglieLingua', () => {
  it('la preferenza salvata ha la precedenza', () => {
    expect(sceglieLingua('it', ['en-US'])).toBe('it');
    expect(sceglieLingua('en', ['it-IT'])).toBe('en');
  });

  it('senza preferenza (o con preferenza non valida) vale la prima lingua del browser tra it e en', () => {
    expect(sceglieLingua(null, ['it-IT', 'en-US'])).toBe('it');
    expect(sceglieLingua(null, ['en-GB', 'it'])).toBe('en');
    expect(sceglieLingua(undefined, ['it'])).toBe('it');
    expect(sceglieLingua('fr', ['it-IT'])).toBe('it');
    expect(sceglieLingua(42, ['en'])).toBe('en');
  });

  it('le lingue diverse sono saltate: la prima con prefisso it o en decide', () => {
    expect(sceglieLingua(null, ['fr-FR', 'it-CH', 'en-US'])).toBe('it');
    expect(sceglieLingua(null, ['de', 'en-AU', 'it'])).toBe('en');
  });

  it('nessuna corrispondenza: inglese, anche con elenco vuoto', () => {
    expect(sceglieLingua(null, ['fr-FR', 'de-DE'])).toBe('en');
    expect(sceglieLingua(null, [])).toBe('en');
  });

  it('maiuscole e underscore nei codici', () => {
    expect(sceglieLingua(null, ['IT_it'])).toBe('it');
    expect(sceglieLingua(null, ['EN-us'])).toBe('en');
  });
});

describe('determinaLingua', () => {
  it('senza browser (Node, Vitest) italiano, anche con una preferenza inglese', () => {
    expect(determinaLingua({ preferenza: () => 'en', linguaggi: () => null })).toBe('it');
    expect(LINGUA).toBe('it');
  });

  it('con il browser: preferenza, poi lingue del browser', () => {
    expect(determinaLingua({ preferenza: () => 'en', linguaggi: () => ['it-IT'] })).toBe('en');
    expect(determinaLingua({ preferenza: () => null, linguaggi: () => ['it-IT'] })).toBe('it');
    expect(determinaLingua({ preferenza: () => null, linguaggi: () => ['pt-BR'] })).toBe('en');
  });

  it('eLingua e chiave delle preferenze', () => {
    expect(eLingua('it') && eLingua('en')).toBe(true);
    expect(eLingua('fr') || eLingua(null)).toBe(false);
    expect(CHIAVE_LINGUA).toBe('ss.ui.lingua');
  });
});
