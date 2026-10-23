// Zone coperte dai pannelli (§ 11.3, § 11.5.2): alfa dello sfondo dai colori calcolati del browser.

import { describe, expect, it } from 'vitest';
import { alfaColore } from '../../src/ui/zoneScena';

describe('alfa dello sfondo dei pannelli', () => {
  it('formati di getComputedStyle', () => {
    expect(alfaColore('rgba(0, 0, 0, 0)')).toBe(0);
    expect(alfaColore('transparent')).toBe(0);
    expect(alfaColore('rgba(12, 26, 21, 0.94)')).toBeCloseTo(0.94, 12);
    expect(alfaColore('rgb(19, 40, 31)')).toBe(1);
    expect(alfaColore('rgb(3 8 6 / 0.78)')).toBeCloseTo(0.78, 12);
    expect(alfaColore('color(srgb 0.1 0.2 0.3 / 40%)')).toBeCloseTo(0.4, 12);
    expect(alfaColore('oklch(0.5 0.1 120)')).toBe(1);
  });
});
