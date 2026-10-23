// Porte e server delle prove end-to-end (playwright.config.ts): le prove provano sempre la build corrente, su
// porte dedicate diverse da quelle predefinite di "npm run preview" (4173) e di scripts/servi-artifact.mjs (4174)
// e da quelle dei laboratori. Nessun server già attivo è riusato: con la porta occupata da un server estraneo o
// rimasto da una sessione precedente l'avvio fallisce subito, invece di provare una build superata.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlaywrightTestConfig } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import configUiLab from '../../e2e/ui-lab.config';
import config from '../../playwright.config';
import configRenderLab from '../render/playwright.render.config';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));
/** Porte predefinite di "npm run preview" (vite preview) e di scripts/servi-artifact.mjs. */
const PORTE_PREDEFINITE = [4173, 4174];

const porta = (url: string | undefined): number => Number(new URL(url ?? '').port);
type ServerProva = Extract<NonNullable<PlaywrightTestConfig['webServer']>, { command: string }>;
const server = (c: PlaywrightTestConfig): ServerProva[] => {
  const w = c.webServer;
  return w === undefined ? [] : Array.isArray(w) ? w : [w];
};
const progetto = (nome: string): NonNullable<PlaywrightTestConfig['projects']>[number] => {
  const p = config.projects?.find((x) => x.name === nome);
  expect(p, `progetto ${nome}`).toBeDefined();
  return p!;
};

const [serverSito, serverPagina] = server(config);

describe('porte delle prove end-to-end', () => {
  it('due server dedicati, ciascuno con la propria build eseguita a ogni avvio', () => {
    expect(server(config)).toHaveLength(2);
    expect(serverSito?.command).toMatch(/^npm run build:test && npx vite preview --outDir dist-test /);
    expect(serverSito?.command).toContain(`--port ${serverSito?.port} --strictPort`);
    expect(serverPagina?.command).toMatch(/^npm run build:artifact && node scripts\/servi-artifact\.mjs /);
    expect(serverPagina?.command).toMatch(new RegExp(`servi-artifact\\.mjs ${serverPagina?.port}$`));
  });

  it('nessun server già attivo è riusato (reuseExistingServer: false)', () => {
    for (const s of server(config)) expect(s.reuseExistingServer).toBe(false);
  });

  it('porte diverse tra loro, da quelle predefinite e da quelle dei laboratori', () => {
    const porte = server(config).map((s) => s.port);
    expect(porte.every((p) => Number.isInteger(p))).toBe(true);
    expect(new Set(porte).size).toBe(2);
    const laboratori = [configUiLab, configRenderLab].map((c) => porta(c.use?.baseURL));
    for (const p of porte) {
      expect(PORTE_PREDEFINITE).not.toContain(p);
      expect(laboratori).not.toContain(p);
    }
  });

  it('i progetti provano il server della propria build', () => {
    expect(porta(config.use?.baseURL)).toBe(serverSito?.port);
    expect(progetto('desktop').use?.baseURL).toBeUndefined();
    expect(progetto('mobile').use?.baseURL).toBeUndefined();
    expect(porta(progetto('pagina-singola').use?.baseURL)).toBe(serverPagina?.port);
  });

  it('nessuna prova cita le porte predefinite', () => {
    const citazioni = readdirSync(join(RADICE, 'e2e'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('ui-lab.config.ts'))
      .filter((f) => /(localhost|127\.0\.0\.1):417[34]\b/.test(readFileSync(join(RADICE, 'e2e', f), 'utf-8')));
    expect(citazioni).toEqual([]);
  });

  it('il README riporta le porte delle prove', () => {
    const readme = readFileSync(join(RADICE, 'README.md'), 'utf-8');
    for (const s of server(config)) expect(readme).toContain(String(s.port));
  });
});
