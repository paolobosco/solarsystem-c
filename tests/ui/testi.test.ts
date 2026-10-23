// Criterio A23 lato interfaccia: testi visibili solo in src/ui/testi.it.ts, nessun U+2014 nei file
// dell'interfaccia; contenuto minimo di "Fonti e metodi" (RF7).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONTI_METODI_SEZIONI, RIFERIMENTI, T, TESTI_SCENA_IT, VELOCITA_ETICHETTE, VOCI_ACCURATEZZA, partiTasti, testoTasti } from '../../src/ui/testi.it';
import { VALORI_VALIDAZIONE } from '../../src/ui/valoriValidazione';

const RADICE = new URL('../../', import.meta.url).pathname;
const LINEETTA_EM = String.fromCharCode(0x2014);

function elenca(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(join(RADICE, dir))) {
    const rel = join(dir, nome);
    if (statSync(join(RADICE, rel)).isDirectory()) out.push(...elenca(rel));
    else out.push(rel);
  }
  return out;
}

const FILE_INTERFACCIA = [
  ...elenca('src/ui'),
  ...elenca('tests/ui'),
  'src/app/store.ts',
  'e2e/ui-lab.spec.ts',
  'e2e/ui-lab.config.ts',
  'ui-lab.html',
  'index.html',
  'docs/_parti/interfaccia.md',
];

describe('A23: lingua e testi', () => {
  it('nessun carattere U+2014 nei file dell’interfaccia', () => {
    for (const f of FILE_INTERFACCIA) {
      let testo: string;
      try {
        testo = readFileSync(join(RADICE, f), 'utf8');
      } catch {
        continue;
      }
      expect(testo.includes(LINEETTA_EM), f).toBe(false);
    }
  });

  it('nessuna frase visibile nei componenti fuori da testi.it.ts', () => {
    const componenti = readdirSync(join(RADICE, 'src/ui')).filter(
      (f) => f.endsWith('.ts') && f !== 'testi.it.ts' && f !== 'valoriValidazione.ts',
    );
    const letterale = /(['"`])((?:\\.|(?!\1).)*)\1/g;
    const frase = /[A-Za-zÀ-ú]{3,} [A-Za-zÀ-ú]{2,}/;
    const trovate: string[] = [];
    for (const f of componenti) {
      readFileSync(join(RADICE, 'src/ui', f), 'utf8')
        .split('\n')
        .forEach((riga, i) => {
          const t = riga.trim();
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('import ')) return;
          for (const m of riga.matchAll(letterale)) {
            const s = m[2] ?? '';
            if (frase.test(s) && !s.includes('ss-')) trovate.push(`${f}:${i + 1} ${s}`);
          }
        });
    }
    expect(trovate).toEqual([]);
  });

  it('valori di accuratezza: solo numeri, unità e nomi propri; righe nominate in testi.it.ts', () => {
    for (const v of VALORI_VALIDAZIONE.voci) {
      expect(VOCI_ACCURATEZZA[v.id].modello.length).toBeGreaterThan(0);
      for (const s of [v.valore ?? '', v.soglia]) expect(/[a-zà-ù]{3,} [a-zà-ù]{3,}/.test(s), s).toBe(false);
    }
  });

  it('"Fonti e metodi": modelli, sorgenti, limiti, licenze e riferimenti', () => {
    const titoli = FONTI_METODI_SEZIONI.map((s) => s.titolo);
    for (const t of ['Tempo e calendario', 'Pianeti e Plutone', 'Luna', 'Satelliti', 'Piccoli corpi', 'Affidabilità', 'Limiti', 'Licenze e attribuzioni']) {
      expect(titoli).toContain(t);
    }
    const rif = RIFERIMENTI.join('\n');
    for (const autore of ['Park, R. S.', 'Archinal, B. A.', 'Vondrák, J.', 'Morrison, L. V.', 'Holman, M. J.', 'Hoffleit, D.', 'W3C (2024)']) {
      expect(rif).toContain(autore);
    }
  });
});

describe('elenco delle scorciatoie (§ 11.9)', () => {
  it('un tasto per voce dei tasti: congiunzioni, virgole e "+" sono connettori, non tasti', () => {
    for (const gruppo of Object.values(T.scorciatoie.voci)) {
      for (const [tasti, azione] of gruppo) {
        for (const combinazione of tasti) {
          for (const tasto of combinazione) {
            expect(tasto, azione).toMatch(/^\S+$/u);
            expect(tasto.length === 1 || /^\p{L}+$/u.test(tasto), `${azione}: «${tasto}»`).toBe(true);
          }
        }
      }
    }
    const passo = T.scorciatoie.voci.globali.find(([, a]) => a === 'Passo indietro e avanti')![0];
    expect(partiTasti(passo)).toEqual([{ tasto: ',' }, ' e ', { tasto: '.' }]);
    const corpo = T.scorciatoie.voci.mappa.find(([, a]) => a.startsWith('Corpo visibile'))![0];
    expect(partiTasti(corpo)).toEqual([{ tasto: 'N' }, ' e ', { tasto: 'Maiusc' }, ' + ', { tasto: 'N' }]);
    const zoom = T.scorciatoie.voci.mappa.find(([, a]) => a === 'Avvicina e allontana')![0];
    expect(testoTasti(zoom)).toBe('+, −, PagSu e PagGiù');
  });
});

describe('italiano dei testi composti (RNF8)', () => {
  it('participi accordati con il genere della categoria', () => {
    expect(T.annunci.filtro('luna', false)).toBe('Lune nascoste');
    expect(T.annunci.filtro('cometa', false)).toBe('Comete nascoste');
    expect(T.annunci.filtro('cometa', true)).toBe('Comete mostrate');
    expect(T.annunci.filtro('pianeta', false)).toBe('Pianeti nascosti');
    expect(T.annunci.filtro('asteroide', true)).toBe('Asteroidi mostrati');
    expect(T.scheda.nascostoDaFiltri('luna')).toBe('Lune nascoste dai filtri: il corpo è mostrato perché selezionato.');
    expect(T.scheda.nascostoDaFiltri('tno')).toBe('TNO nascosti dai filtri: il corpo è mostrato perché selezionato.');
  });

  it('annuncio della selezione indipendente dal genere del nome', () => {
    for (const nome of ['Terra', 'Luna', 'Io', 'Cerere']) {
      expect(T.annunci.selezionato(nome)).toBe(`Corpo selezionato: ${nome}`);
      expect(T.annunci.selezionato(nome)).not.toMatch(/^Selezionat[oa] /);
    }
    expect(T.annunci.selezionatoTra('Io', 2, 5)).toBe('Corpo selezionato: Io (2 di 5 qui)');
  });

  it('annunci dell\'arresto per errore e dell\'uscita implicita da «Segui l\'ora attuale» (§ 11.9)', () => {
    const data = '11 maggio 1012, 16:14 UT, domenica';
    expect(T.annunci.riproduzioneFermaErrore(data)).toBe(`Riproduzione in pausa: dati non caricati. ${data}`);
    // Data o limite e disattivazione in un solo annuncio: due annunci ravvicinati si sostituirebbero.
    expect(T.annunci.conSeguiDisattivato(data)).toBe(`${data}. Segui l'ora attuale: disattivato`);
    expect(T.annunci.conSeguiDisattivato('Raggiunto il limite superiore: 31 dicembre 2120, 23:59 UT')).toBe(
      "Raggiunto il limite superiore: 31 dicembre 2120, 23:59 UT. Segui l'ora attuale: disattivato",
    );
    expect(T.annunci.conSeguiDisattivato(data).endsWith(T.annunci.seguiOra(false))).toBe(true);
  });

  it('preposizioni articolate con la Terra', () => {
    expect(T.trova.lunaDi('Terra')).toBe('luna della Terra');
    expect(T.trova.lunaDi('Giove')).toBe('luna di Giove');
    expect(T.scheda.velocitaRispetto('Terra')).toBe('Velocità rispetto alla Terra');
    expect(T.scheda.velocitaRispetto('Saturno')).toBe('Velocità rispetto a Saturno');
    expect(T.scheda.riferimentoPlaneto('Terra')).toBe('rispetto alla Terra, piano di riferimento F');
    expect(T.scheda.riferimentoPlanetoEclittica('Terra')).toBe('rispetto alla Terra, eclittica J2000');
    expect(T.catalogo.lune('Terra', 1)).toBe('Luna della Terra');
    expect(T.catalogo.lune('Giove', 6)).toBe('Lune di Giove');
  });

  it('preposizioni articolate in tutti i modelli con un nome: mappa, Inquadra, fasce, pulsante della scheda', () => {
    expect(T.mappa.etichetta('Sistema interno', 'Sole')).toBe('Mappa 3D: Sistema interno, fuoco sul Sole');
    expect(T.mappa.etichetta('Sistema interno', 'Terra')).toBe('Mappa 3D: Sistema interno, fuoco sulla Terra');
    expect(T.mappa.etichetta('Sistema di Giove', 'Giove')).toBe('Mappa 3D: Sistema di Giove, fuoco su Giove');
    expect(T.annunci.fuoco('Terra')).toBe('Vista centrata sulla Terra');
    expect(T.annunci.fuoco('Luna')).toBe('Vista centrata sulla Luna');
    expect(T.annunci.fuoco('Sole')).toBe('Vista centrata sul Sole');
    expect(T.annunci.fuoco('Marte')).toBe('Vista centrata su Marte');
    expect(T.annunci.fuocoSenzaPosizione('Luna')).toBe('Posizione della Luna non determinabile a questa data');
    expect(T.annunci.fuocoSenzaPosizione('Cerere')).toBe('Posizione di Cerere non determinabile a questa data');
    expect(T.console.bandeAffidabilita('Terra', 'precisa dal 1550 al 2120')).toBe(
      "Affidabilità della Terra nell'intervallo: precisa dal 1550 al 2120.",
    );
    expect(T.foglio.apriScheda('Terra')).toBe('Apri la scheda della Terra');
    expect(T.foglio.apriScheda('Sole')).toBe('Apri la scheda del Sole');
    expect(T.foglio.apriScheda('Io')).toBe('Apri la scheda di Io');
    // Nessun modello con "di", "su", "a" davanti al nome senza preposizione articolata.
    const modelli = [T.mappa.etichetta('v', 'Terra'), T.annunci.fuoco('Terra'), T.annunci.fuocoSenzaPosizione('Terra'), T.foglio.apriScheda('Terra')];
    for (const m of modelli) expect(m, m).not.toMatch(/\b(di|su|a) Terra\b/);
  });

  it('elisione davanti agli anni letti con vocale iniziale', () => {
    expect(T.console.bandaIntervallo('buona', `8000${'\u00a0'}a.C.`, `800${'\u00a0'}a.C.`)).toBe(`buona dall'8000${'\u00a0'}a.C. all'800${'\u00a0'}a.C.`);
    expect(T.console.bandaIntervallo('precisa', '1100', '2120')).toBe('precisa dal 1100 al 2120');
    expect(T.console.bandaTitolo('Precisa', `11${'\u00a0'}a.C.`, '1582')).toBe(`Precisa: dall'11${'\u00a0'}a.C. al 1582`);
  });

  it('«Leggi posizione»: distanze non applicabili omesse (§ 11.9)', () => {
    expect(T.scheda.posizione('Sole', null, '0,995674 UA')).toBe('Sole: 0,995674 UA dalla Terra.');
    expect(T.scheda.posizione('Terra', '0,995667 UA', null)).toBe('Terra: 0,995667 UA dal Sole.');
    expect(T.scheda.posizione('Marte', '1,4 UA', '0,8 UA')).toBe('Marte: 1,4 UA dal Sole, 0,8 UA dalla Terra.');
  });

  it('elisione dell’articolo davanti alle date dell’8 e dell’11', () => {
    expect(T.scheda.osculanti('8 marzo 2024, 12:00 UT')).toBe("Elementi osculanti all'8 marzo 2024, 12:00 UT");
    expect(T.scheda.osculanti('11 febbraio 2024, 12:00 UT')).toBe("Elementi osculanti all'11 febbraio 2024, 12:00 UT");
    expect(T.scheda.osculanti('18 ottobre 2026, 09:00 UT')).toBe('Elementi osculanti al 18 ottobre 2026, 09:00 UT');
    expect(T.scheda.osculanti('1° gennaio 2024, 00:00 UT')).toBe('Elementi osculanti al 1° gennaio 2024, 00:00 UT');
    expect(T.testuale.didascalia('8 marzo 2024, 12:00 UT', 'gregoriano')).toMatch(/^Posizioni all'8 marzo 2024/);
    expect(T.testuale.didascalia('19 ottobre 2026, 12:00 UT', 'gregoriano')).toMatch(/^Posizioni al 19 ottobre 2026/);
    expect(T.validazione.fuoriIntervalloTT('6 gennaio 10000 a.C. alle 01:47', '11 gennaio 2121 alle 00:01')).toBe(
      "In TT: dal 6 gennaio 10000 a.C. alle 01:47 all'11 gennaio 2121 alle 00:01.",
    );
  });

  it('velocità di 1000 anni al secondo con il separatore delle migliaia (§ 11.13)', () => {
    expect(VELOCITA_ETICHETTE[9]).toEqual({ breve: '1\u2009000\u00a0anni/s', lunga: '1\u2009000\u00a0anni al secondo' });
  });

  it('anelli di distanza: separatore delle migliaia da 4 cifre, spazio non separabile prima dell’unità (§ 11.13)', () => {
    expect(TESTI_SCENA_IT.anelloDistanza(1000)).toBe('1\u2009000\u00a0UA');
    expect(TESTI_SCENA_IT.anelloDistanza(500)).toBe('500\u00a0UA');
    expect(TESTI_SCENA_IT.anelloDistanza(1)).toBe('1\u00a0UA');
  });
});

describe('"Fonti e metodi": riferimenti e valori coerenti con i documenti', () => {
  it('riferimenti delle fonti dei dati mostrati (§ 16.1)', () => {
    const rif = RIFERIMENTI.join('\n');
    expect(rif).toContain('Vilenius, E. et al. (2012), A&A 541, A94, doi:10.1051/0004-6361/201118743');
    expect(rif).toContain('Müller, T., Lellouch, E., Fornasier, S. (2020)');
    expect(rif).toContain('doi:10.1016/B978-0-12-816490-7.00007-2');
    expect(rif).toContain('Muñoz-Gutiérrez, M. A., Reyes-Ruiz, M., Pichardo, B. (2015)');
    expect(rif).toContain('BIPM (2019)');
    expect(rif).toContain('Wyman, C., Sloan, P.-P., Shirley, P. (2013)');
  });

  it('ogni autore del § 16.1 di PROGETTO.md compare nei riferimenti', () => {
    const progetto = readFileSync(join(RADICE, 'docs/PROGETTO.md'), 'utf8');
    const sezione = progetto.slice(progetto.indexOf('### 16.1'), progetto.indexOf('### 16.2'));
    const rif = RIFERIMENTI.join('\n');
    const autori = [...sezione.matchAll(/(?:^- |; )([A-ZÀ-Ž][\p{L}'-]+(?: [A-Z]\.)?), [A-Z]\./gmu)].map((m) => m[1]!);
    expect(autori.length).toBeGreaterThan(40);
    for (const a of autori) expect(rif, a).toContain(a);
    expect(sezione).toContain('Wyman, C., Sloan, P.-P., Shirley, P. (2013)');
    expect(sezione).toContain('doi:10.1016/B978-0-12-816490-7.00007-2');
  });

  it('scarto di ΔT da Horizons nel 2120 uguale a quello dei documenti (28,6 s)', () => {
    const tempo = FONTI_METODI_SEZIONI.find((x) => x.titolo === 'Tempo e calendario')!.paragrafi.join(' ');
    expect(tempo).toContain('28,6\u00a0s nel 2120');
    expect(tempo).not.toMatch(/circa 28\u00a0s/);
    expect(readFileSync(join(RADICE, 'docs/PROGETTO.md'), 'utf8')).toContain('28,6 s nel 2120');
  });

  it('incertezza di ΔT: u definito e nodi storici di time.json elencati per intero (§ 6.5)', () => {
    const tempo = FONTI_METODI_SEZIONI.find((x) => x.titolo === 'Tempo e calendario')!.paragrafi.join(' ');
    expect(tempo).toContain('0,8·u²\u00a0s, con u = (anno − 1825)/100');
    const dati = JSON.parse(readFileSync(join(RADICE, 'public/data/v1/time.json'), 'utf8')) as {
      sigma: { storico: { anni: number[]; valori: number[] } };
    };
    const { anni, valori } = dati.sigma.storico;
    // Il primo nodo prolunga 0,8·u²: la curva è continua nel 1200.
    expect(0.8 * ((anni[0]! - 1825) / 100) ** 2).toBeCloseTo(valori[0]!, 9);
    const frase = tempo.slice(tempo.indexOf('dal 1200 al 1900'));
    const numero = (v: number) => `${String(v).replace('.', ',')}\u00a0s`;
    for (let k = 0; k < anni.length; k++) {
      // Nodi consecutivi con lo stesso valore: "20 s dal 1300 al 1600".
      let j = k;
      while (j + 1 < anni.length && valori[j + 1] === valori[k]) j++;
      const atteso = j === k ? `${numero(valori[k]!)} nel ${anni[k]}` : `${numero(valori[k]!)} dal ${anni[k]} al ${anni[j]}`;
      expect(frase, atteso).toContain(atteso);
      k = j;
    }
  });

  it('segno del periodo di rotazione spiegato', () => {
    const fisici = FONTI_METODI_SEZIONI.find((x) => x.titolo === 'Dati fisici')!.paragrafi.join(' ');
    expect(fisici).toContain('valore assoluto');
    expect(fisici).toContain('«retrograda»');
    expect(fisici).toContain('per i corpi senza polo noto il verso non è indicato');
  });

  it('corpi con rotazione retrograda elencati in "Fonti e metodi" e nel § 9 uguali al catalogo', () => {
    const fisici = FONTI_METODI_SEZIONI.find((x) => x.titolo === 'Dati fisici')!.paragrafi.join(' ');
    const elenco = /retrograda» indica[^(]*\(([^)]*)\)/.exec(fisici)?.[1] ?? '';
    const progetto = readFileSync(join(RADICE, 'docs/PROGETTO.md'), 'utf8');
    const s9 = /rotazione retrograda \(([^)]*)\)/.exec(progetto.slice(progetto.indexOf('## 9. ')))?.[1] ?? '';
    const catalogo = JSON.parse(readFileSync(join(RADICE, 'public/data/v1/catalog.json'), 'utf8')) as {
      corpi: { nome: string; fisica: { inclinazioneAssiale_gradi?: { valore: number } | null } }[];
    };
    const nomi = (testo: string) => new Set(testo.split(/,\s*|\s+e\s+/).map((n) => n.trim().split('/')[0]!).filter((n) => n.length > 0));
    const retrogradi = catalogo.corpi.filter((c) => (c.fisica.inclinazioneAssiale_gradi?.valore ?? 0) > 90).map((c) => c.nome.split('/')[0]!);
    expect(retrogradi.length).toBeGreaterThan(10);
    for (const testo of [elenco, s9]) {
      const n = nomi(testo.replace(/\s+e,\s*tra i corpi con polo noto,/, ','));
      expect([...n].sort()).toEqual([...retrogradi].sort());
    }
  });

  it('selezione dei centauri dichiarata non esaustiva, come quella dei TNO (§ 4.1)', () => {
    const limiti = FONTI_METODI_SEZIONI.find((x) => x.titolo === 'Limiti')!.paragrafi.join(' ');
    expect(limiti).toContain('per gli oggetti transnettuniani e per i centauri la selezione non è esaustiva');
    const progetto = readFileSync(join(RADICE, 'docs/PROGETTO.md'), 'utf8');
    const centauri = progetto.split('\n').find((r) => r.startsWith('- Centauri:'))!;
    expect(centauri).toContain('selezione non esaustiva');
    for (const nome of ['2002 GZ32', 'Pholus', 'Bienor']) expect(centauri).toContain(nome);
  });
});
