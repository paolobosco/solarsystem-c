// Frammenti GLSL comuni. Tutti gli shader lavorano in spazio vista (R3) e includono i chunk
// logdepthbuf_* di three (R4); chi calcola la profondità per frammento usa scriviProfondita(),
// con la stessa formula di logdepthbuf_fragment: log2(1 + w)·logDepthBufFC/2, w = -z vista.

/** Conversione da sRGB lineare a sRGB codificato (IEC 61966-2-1). */
export const GLSL_SRGB = /* glsl */ `
vec3 ssLineareASrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 bassi = c * 12.92;
  vec3 alti = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(alti, bassi, vec3(lessThanEqual(c, vec3(0.0031308))));
}
vec3 ssSrgbALineare(vec3 c) {
  vec3 bassi = c / 12.92;
  vec3 alti = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(alti, bassi, vec3(lessThanEqual(c, vec3(0.04045))));
}
`;

/** Profondità logaritmica per un punto a distanza w = -z (spazio vista). */
export const GLSL_PROFONDITA = /* glsl */ `
void ssScriviProfondita(float w) {
#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
  gl_FragDepth = log2(1.0 + max(w, 0.0)) * logDepthBufFC * 0.5;
#endif
}
`;

/** Colore esadecimale "#RRGGBB" in componenti sRGB 0..1 (senza conversioni di spazio colore). */
export function rgbDaHex(hex: string, out: number[] = [0, 0, 0]): number[] {
  const v = Number.parseInt(hex.replace('#', ''), 16);
  out[0] = ((v >> 16) & 255) / 255;
  out[1] = ((v >> 8) & 255) / 255;
  out[2] = (v & 255) / 255;
  return out;
}

/** Componente sRGB codificata → lineare. */
export function srgbALineare(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
