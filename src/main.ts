// Punto d'ingresso unico (§ 5.6 di docs/PROGETTO.md): avvio dell'applicazione nella radice #app e, solo nella
// build di test (import.meta.env.MODE === 'test'), ganci window.__ssTest per i test end-to-end.

import { avvia } from './app/avvio';
import { creaGanciTest, installaGanciTest } from './test-hooks';

// Lingua del documento (RNF8): nella pagina singola lo scheletro della piattaforma non la dichiara.
if (document.documentElement.lang !== 'it') document.documentElement.lang = 'it';

const radice = document.getElementById('app');
if (radice !== null) {
  void avvia(radice).then((app) => {
    if (import.meta.env.MODE === 'test') installaGanciTest(creaGanciTest(app));
  });
}
