// Ganci di test (§ 5.4 di docs/PROGETTO.md): dopo un ridimensionamento della finestra waitIdle si conclude solo
// quando l'ultimo frame ha le dimensioni correnti della canvas; vista() e getScreenPosition() non riportano
// lo stato della dimensione precedente.

import { expect, test } from '@playwright/test';
import { apri, verificaPulita } from './aiuti';

const DIMENSIONI = [
  { width: 900, height: 1440 },
  { width: 1440, height: 900 },
  { width: 393, height: 851 },
  { width: 851, height: 393 },
];

test('waitIdle dopo setViewportSize: vista e posizioni con le dimensioni correnti della canvas', async ({ page }) => {
  const a = await apri(page);
  const esiti: string[] = [];
  for (let giro = 0; giro < 3; giro++) {
    for (const d of DIMENSIONI) {
      await page.setViewportSize(d);
      const m = await page.evaluate(async () => {
        const ss = window.__ssTest!;
        await ss.waitIdle();
        const v = ss.vista();
        const sole = ss.getScreenPosition('sole');
        const c = document.querySelector('canvas')!;
        return { vw: v?.larghezzaPx, vh: v?.altezzaPx, cw: c.clientWidth, ch: c.clientHeight, sx: sole?.x, sy: sole?.y };
      });
      // Sole a fuoco (vista iniziale): proiettato al centro della canvas corrente.
      const ok = m.vw === m.cw && m.vh === m.ch && Math.abs(m.sx! - m.cw / 2) <= 2 && Math.abs(m.sy! - m.ch / 2) <= 2;
      if (!ok) esiti.push(`${d.width}x${d.height}: canvas ${m.cw}x${m.ch}, vista ${m.vw}x${m.vh}, Sole ${m.sx},${m.sy}`);
    }
  }
  expect(esiti).toEqual([]);
  verificaPulita(a);
});
