// Punto d'ingresso unico (§ 5.6 di docs/PROGETTO.md): avvio dell'applicazione nella radice #app e, solo nella
// build di test (import.meta.env.MODE === 'test'), ganci window.__ssTest per i test end-to-end.

import { avvia } from './app/avvio';
import { creaGanciTest, installaGanciTest } from './test-hooks';
import { LINGUA } from './ui/lingua';
import { T } from './ui/testi';

// Lingua e titolo del documento (RNF8) dalla lingua scelta all'avvio: l'HTML porta solo il valore iniziale italiano e nella
// pagina singola lo scheletro della piattaforma non dichiara la lingua.
if (document.documentElement.lang !== LINGUA) document.documentElement.lang = LINGUA;
document.title = T.avvio.titolo;

const radice = document.getElementById('app');
if (radice !== null) {
  void avvia(radice).then((app) => {
    if (import.meta.env.MODE === 'test') installaGanciTest(creaGanciTest(app));
  });
}
