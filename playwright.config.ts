// Prove end-to-end dell'applicazione con i dati reali (§ 13 di docs/PROGETTO.md).
// - Progetti "desktop" e "mobile": build di test (npm run build:test, cartella dist-test/, ganci
//   window.__ssTest) servita da vite preview sulla porta PORTA_SITO. Le prove marcate @telefono girano nel
//   progetto mobile, le altre nel progetto desktop.
// - Progetto "pagina-singola" (A24): pacchetto di npm run build:artifact (dist-artifact/) servito da
//   scripts/servi-artifact.mjs sulla porta PORTA_PAGINA_SINGOLA dentro uno scheletro che emula quello della
//   piattaforma.
// Porte dedicate, diverse da quelle predefinite di "npm run preview" (4173) e di servi-artifact.mjs (4174), così
// i server di sviluppo e queste prove possono girare insieme. Nessun server già attivo è riusato
// (reuseExistingServer: false): le build sono eseguite a ogni avvio e, se la porta è occupata, Playwright si
// ferma subito con un messaggio esplicito, invece di provare un server estraneo o una build superata.
// Le pagine di sviluppo hanno configurazioni proprie (e2e/ui-lab.config.ts,
// tests/render/playwright.render.config.ts). Schermate in test-results/e2e/.

import { defineConfig, devices } from '@playwright/test';

const SWIFTSHADER = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const LABORATORI = ['**/ui-lab.spec.ts', '**/render-lab.spec.ts'];
const PORTA_SITO = 4273;
const PORTA_PAGINA_SINGOLA = 4274;

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  outputDir: 'test-results/e2e-artefatti',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORTA_SITO}`,
    trace: 'retain-on-failure',
    launchOptions: { args: SWIFTSHADER },
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: [...LABORATORI, '**/pagina-singola.spec.ts'],
      grepInvert: /@telefono/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testIgnore: [...LABORATORI, '**/pagina-singola.spec.ts'],
      grep: /@telefono/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'pagina-singola',
      testMatch: '**/pagina-singola.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: `http://localhost:${PORTA_PAGINA_SINGOLA}` },
    },
  ],
  webServer: [
    {
      command: `npm run build:test && npx vite preview --outDir dist-test --port ${PORTA_SITO} --strictPort`,
      port: PORTA_SITO,
      reuseExistingServer: false,
      timeout: 300_000,
    },
    {
      command: `npm run build:artifact && node scripts/servi-artifact.mjs ${PORTA_PAGINA_SINGOLA}`,
      port: PORTA_PAGINA_SINGOLA,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
