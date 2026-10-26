// Configurazione Playwright dedicata alla pagina di prova dell'interfaccia (ui-lab.html), servita
// dal server di sviluppo di Vite: la pagina è esclusa dalla build di produzione.
// Uso: npx playwright test -c e2e/ui-lab.config.ts
// Con NODE_USE_ENV_PROXY=1 i caratteri di Google Fonts si scaricano attraverso il proxy
// dell'ambiente; senza rete si usano i caratteri di ripiego.

import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const radice = fileURLToPath(new URL('..', import.meta.url));
const PORTA = 5199;

export default defineConfig({
  testDir: '.',
  testMatch: 'ui-lab.spec.ts',
  outputDir: '../test-results/ui-lab-artefatti',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    // Lingua del browser: la pagina di prova parte in italiano, come le prove (RNF8).
    locale: 'it-IT',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [{ name: 'ui-lab', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORTA} --strictPort --host 127.0.0.1`,
    cwd: radice,
    url: `http://127.0.0.1:${PORTA}/ui-lab.html`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
