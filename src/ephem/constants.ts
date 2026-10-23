// Costanti condivise con la pipeline (scripts/pipeline/common/constants.py): stessi nomi e
// valori delle chiavi di constants.json. JD_MIN_UT e JD_MAX_UT_EXCL sono in src/time/calendar.ts.

/** 1 UA in km: IAU 2012, Risoluzione B2; coincide con la costante AU di DE441. */
export const UA_KM = 149_597_870.7;

/** Secondi per giorno (giorno di 86 400 s SI, scala TDB). */
export const GIORNO_S = 86_400;

/** Epoca J2000.0 (JD TDB). */
export const J2000 = 2_451_545.0;

/** Velocità della luce in km/s: definizione SI (17a CGPM, 1983); coincide con CLIGHT di DE441. */
export const C_KM_S = 299_792.458;

export const GIORNI_ANNO_GIULIANO = 365.25;
export const GIORNI_SECOLO_GIULIANO = 36_525;
export const ARCSEC_RAD = Math.PI / 648_000;

/**
 * Obliquità per la rotazione ICRF → eclittica J2000 (I4): 84 381,448″, valore IAU 1976
 * (Lieske et al. 1977, A&A 58, 1) adottato da JPL Horizons per l'eclittica J2000.
 */
export const OBLIQUITA_J2000_ARCSEC = 84_381.448;
export const OBLIQUITA_J2000_RAD = (OBLIQUITA_J2000_ARCSEC * Math.PI) / 648_000;

/**
 * GM di DE441 in UA³/d²: costanti dell'area commenti di de441_part-1.bsp e de441_part-2.bsp
 * e del file header.441 (gruppo 1041); Park, Folkner, Williams, Boggs (2021), AJ 161:105,
 * doi:10.3847/1538-3881/abd414. GM1..GM9: sistemi planetari (baricentri); GMB: Terra-Luna; GMS: Sole.
 */
export const DE441_GM_UA3_D2 = {
  GM1: 4.9125001948893182e-11,
  GM2: 7.2434523326441187e-10,
  GMB: 8.9970113929473466e-10,
  GM4: 9.5495488297258119e-11,
  GM5: 2.8253458252257917e-7,
  GM6: 8.4597059933762903e-8,
  GM7: 1.2920265649682399e-8,
  GM8: 1.5243573478851939e-8,
  GM9: 2.1750964648933581e-12,
  GMS: 2.9591220828411956e-4,
} as const;

/** Rapporto delle masse Terra/Luna (costante EMRAT di DE441). */
export const EMRAT = 81.300568221497215;

/** Conversione UA³/d² → km³/s². */
const CONV_GM = UA_KM ** 3 / GIORNO_S ** 2;

export const GM_SOLE = DE441_GM_UA3_D2.GMS * CONV_GM;

/** GM dei sistemi planetari (baricentri NAIF 1..9) in km³/s²; il 3 è il baricentro Terra-Luna. */
export const GM_BARICENTRI: Readonly<Record<number, number>> = {
  1: DE441_GM_UA3_D2.GM1 * CONV_GM,
  2: DE441_GM_UA3_D2.GM2 * CONV_GM,
  3: DE441_GM_UA3_D2.GMB * CONV_GM,
  4: DE441_GM_UA3_D2.GM4 * CONV_GM,
  5: DE441_GM_UA3_D2.GM5 * CONV_GM,
  6: DE441_GM_UA3_D2.GM6 * CONV_GM,
  7: DE441_GM_UA3_D2.GM7 * CONV_GM,
  8: DE441_GM_UA3_D2.GM8 * CONV_GM,
  9: DE441_GM_UA3_D2.GM9 * CONV_GM,
};

const GM_TERRA_LUNA = DE441_GM_UA3_D2.GMB * CONV_GM;

/** GM_Terra = GMB·EMRAT/(1 + EMRAT); GM_Luna = GMB/(1 + EMRAT). */
export const GM_TERRA = (GM_TERRA_LUNA * EMRAT) / (1 + EMRAT);
export const GM_LUNA = GM_TERRA_LUNA / (1 + EMRAT);

/** GM per codice NAIF in km³/s²: 10 Sole, 1-9 sistemi planetari, 399 Terra, 301 Luna. */
export const GM_KM3_S2: Readonly<Record<number, number>> = {
  10: GM_SOLE,
  ...GM_BARICENTRI,
  399: GM_TERRA,
  301: GM_LUNA,
};

/** μ degli elementi eliocentrici dei pianeti (§ 7.1): GM_Sole + GM del sistema (NAIF 1..9). */
export const MU_ELIO_KM3_S2: Readonly<Record<number, number>> = Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [i, GM_SOLE + (GM_BARICENTRI[i] ?? Number.NaN)]),
);

/** μ dei piccoli corpi (§ 7.1). */
export const MU_PICCOLI_CORPI_KM3_S2 = GM_SOLE;

/** Codici NAIF dei baricentri tabulati in DE441 (§ 7.3.2). */
export const NAIF_BARICENTRI = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Pseudo-ssid del baricentro Terra-Luna nei file dei pianeti (scripts/pipeline/bodies.json). */
export const SSID_BARICENTRO_TERRA_LUNA = 200;

/** Blocchi temporali dei dati (§ 8.1), JD TDB: inizio, ampiezza (714 · 512 d), numero, fine. */
export const T0 = -1_931_200.5;
export const B = 365_568;
export const K = 13;
export const T_END = 2_495_760.5;

/** Scelta del file DE441 per campione (§ 7.3.1): JD < JD_CAMBIO_DE441 → part-1, altrimenti part-2. */
export const JD_CAMBIO_DE441 = 2_440_416.5;
