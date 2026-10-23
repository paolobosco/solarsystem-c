// Configurazione Playwright dedicata alla pagina di prova del rendering (render-lab.html), servita
// dal server di sviluppo di Vite: la pagina non entra nella build di produzione.
// Uso: npx playwright test -c tests/render/playwright.render.config.ts

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const radice = fileURLToPath(new URL('../../', import.meta.url));
const PORTA = 5179;

export default defineConfig({
  testDir: '../../e2e',
  testMatch: 'render-lab.spec.ts',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '../../test-results/render-lab-artefatti',
  use: {
    baseURL: `http://localhost:${PORTA}`,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [{ name: 'render-lab', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `npx vite --port ${PORTA} --strictPort`,
    cwd: radice,
    port: PORTA,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
