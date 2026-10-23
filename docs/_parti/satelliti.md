# Satelliti naturali (Luna esclusa)

Riferimento: `docs/PROGETTO.md` versione 2.0, § 4, 7.3.5, 7.5, 8.5, 9, 12.3 (passo 4), 13 (A6), 14.2 (S3). Misure del 19/10/2026.

## 1. Prodotti

| Percorso | Contenuto |
|----------|-----------|
| `scripts/pipeline/satellites.py`, `scripts/pipeline/sats/` | pipeline: kernel, campioni, sistema F, record, estrapolazione secolare, file, validazione, catalogo, fixture |
| `public/data/v1/sats/s00.bin` … `s12.bin` | record dei 29 satelliti per blocco (§ 8.5) |
| `scripts/pipeline/out/catalog-sats.json` | effemeridi (R_F, ν_k, arco, fonti con salti), soluzione, fisica, orientamento |
| `scripts/pipeline/out/reliability-sats.json` | log10 ε_modello sui 712 intervalli di `reliability.bin` (§ 8.7) |
| `scripts/pipeline/out/spike-sats.json`, `validazione-sats.json` | prova S3 e criterio A6 |
| `scripts/pipeline/raw/sats/` | `aa_summaries.txt`, aree commenti dei kernel, pagine JPL (effemeridi, parametri fisici, scoperte), risposte Horizons |
| `src/data/satsReader.ts`, `src/ephem/satellites.ts` | lettore e runtime |
| `tests/ephem/satellites.test.ts`, `tests/fixtures/sats/` | test Vitest e fixture |
| `scripts/pipeline/tests/test_sat_*.py` | test pytest |

Contratto del catalogo: campo facoltativo `centro` (`pianeta` | `baricentro`) delle effemeridi dei satelliti in `src/data/catalogTypes.ts` e `docs/schema/catalog.schema.json` (Notte e Idra sono modellati rispetto al baricentro Plutone-Caronte).

## 2. Kernel (§ 7.5.1)

Verifica su `aa_summaries.txt` di NAIF (congelato in `raw/sats/`), sulle aree commenti dei kernel (lette con richieste HTTP parziali, `raw/sats/commenti/`) e sulla pagina JPL "Planetary Satellite Ephemerides" (`raw/sats/jpl-sats-ephem.html`). Finestre in TDB dai descrittori dei segmenti.

| Satelliti | Kernel moderno (soluzione; finestra) | Kernel lungo (finestra) | Centro del pianeta |
|-----------|--------------------------------------|--------------------------|--------------------|
| Fobos, Deimos | mar099 (MAR099; 1600-01-01/2600-01-02) | nessuno | 499 da mar099 |
| Io, Europa, Ganimede, Callisto, Amaltea | jup365 (JUP365; 1600-01-10/2200-01-10) | nessuno | 599 da jup365 |
| Imalia | jup347 (JUP347; 1799-12-21/2200-01-10) | nessuno | 599 da jup365 |
| Mimas, Encelado, Teti, Dione, Rea, Titano, Iperione, Giapeto, Febe | sat441 (SAT441; 1749-12-30/2250-01-06) | sat441xl_part-1 (502 a.C.-2014), sat441xl_part-2 (2014-4500) | 699 dagli stessi file |
| Miranda, Ariel, Umbriel, Titania, Oberon | ura184_part-3 (URA182; 1600-01-04/2399-12-17) | ura111xl-701..705 (12001 a.C.-17000) | 799 da ura184_part-3 e da ura111xl-799 |
| Tritone | nep098_part-1 (NEP098; 1800-01-01/2199-12-31) | nep097 (NEP097; 1600-01-10/2399-12-31); nep097xl-801 (12001 a.C.-17000) non adottato | 899 dagli stessi file |
| Proteo | nep098_part-3 (NEP098; 1800-01-01/2199-12-31) | nessuno | 899 da nep098_part-3 |
| Nereide | nep105 (NEP105; 1600-01-04/2400-01-02) | nep101xl-802 (13001 a.C.-17000) | 899 da nep105 e da nep097xl-899 |
| Caronte, Notte, Idra | plu060 (PLU060; 1800-01-02/2199-12-30) | nessuno | 999 da plu060 |
| Disnomia | orbita kepleriana (Holler et al. 2021) | nessuno | Eris |

- Nomi e finestre del § 7.5.1 confermati; il file lungo di Saturno si chiama `sat441xl_part-1.bsp` (trattino basso).
- `ura184_part-3.bsp` contiene i satelliti principali della soluzione URA182 (Jacobson e Park 2025), la stessa usata da Horizons.
- Tritone: la tabella del § 7.5.1 indica nep097, ma `nep098_part-1.bsp` (13/07/2026) contiene una soluzione NEP098 di Tritone e Nereide adattata alle osservazioni e usata da Horizons (`nep098_merged`). Misure: NEP097 - NEP098 fino a 769″ (1 322 km) nel 1800-2199; il modello costruito su NEP097 differiva da Horizons di 20″ nel 2000 e di 384″ nel 1907. Per la regola del § 7.5.1 (in ogni epoca il kernel più recente che la copre) Tritone usa NEP098 nel 1800-2199 e NEP097 nel 1600-1800: scarto da Horizons 2″. Nereide resta su NEP105 come da tabella: scarto da Horizons (NEP098) 138″, sotto il suo ε_adattamento (613″).
- Ogni kernel si scarica in `.cache/sats/` dopo il controllo dello spazio libero (almeno 4 GB residui), si elabora e, se lungo, si elimina; SHA-256, dimensione, URL e data in `raw/manifest-sorgenti.json` (voci `sats/...`). I kernel lunghi adottati sono stati scaricati più volte (campionamento, adattamento dei record, residui), sempre con lo stesso SHA-256.
- Campioni (`.cache/sats/campioni/`): 100 000 istanti casuali per kernel moderno e 200 000 per kernel lungo sulla copertura limitata a [T0 - 1 anno, T_END + 1 anno], più 200 istanti di validazione per kernel; seme 20261019 + 1000·(indice del kernel in `campioni.ORDINE_SEMI`: ordine alfabetico dei primi 20 kernel, poi nep098_part-1) + NAIF. Per i kernel lunghi adottati, 200 istanti di validazione nella zona servita dai loro record (seme + 500).
- GM: tabella "Bodies on the File" delle aree commenti (μ = GM_pianeta + GM_satellite, § 7.1); GM del sistema dei pianeti da DE441 (`common/constants.py`).

## 3. Modello (§ 7.5.2-7.5.4)

### 3.1 Sistema F

- Polo di F: normale al piano che meglio approssima i versori del momento angolare osculante (il polo dell'orbita precessa su un cono attorno al polo di Laplace); verso dalla parte del momento angolare di rotazione del pianeta (Archinal et al. 2018; per Urano, rotazione retrograda, opposto al polo nord IAU). Ne risultano I = -1 per Tritone e Febe, I = +1 per gli altri. Asse x: nodo ascendente del piano F sull'equatore ICRF.
- Finestra di stima: 1900-2020 (inizio non anteriore all'anno di scoperta) ± 50 anni se il cono vi è percorso quasi per intero (rapporto tra i due autovalori maggiori della dispersione ≥ 0,5); altrimenti copertura del kernel moderno (stessa condizione); altrimenti tutte le fonti adottate (rapporto ≥ 0,05); altrimenti direzione media del momento angolare. Esito: arco per 18 satelliti, kernel moderno per Callisto e Imalia, tutte le fonti per Titano, Giapeto, Febe, Oberon, Tritone, Proteo, Nereide e Caronte.
- Motivo: il piano di Laplace dei satelliti interni segue l'equatore del pianeta, che precessa. Con un polo fisso lo scarto tra il polo di F e il piano di Laplace locale resta nei record come errore fuori dal piano (il modello ha tan(i/2) costante e Ω lineare: un cerchio centrato nell'origine nel piano (q, p)). Prova su Mimas (L = 2 anni, K = 6, 1997-2003): errore massimo 175″ con il polo stimato su tutta la copertura, 69″ con il polo stimato sull'arco. Scarto tra la normale media su 40 anni e il polo di F sull'arco, per Mimas: 0,168° nel 100, 0,069° nel 1100, 0,019° nel 1900.
- Piano secolare (`pianoSegueEquatore`, `anagrafica.SEGUE_EQUATORE`): per i 22 satelliti regolari il cui piano di Laplace segue l'equatore del primario (Tremaine, Touma e Namouni 2009) negli intervalli dei record secolari F ruota con il polo WGCCRE del primario: F(t) = Q(t)·R_F, Q(t) rotazione minima dal polo all'epoca di giunzione con i record da SPK al polo all'istante t (Rodrigues; Q = I alla giunzione, velocità senza dQ/dt: errore relativo ≤ 3·10⁻⁸, Callisto). Esclusi Imalia, Febe e Nereide (polo di F a 3,1°, 26,7° e 25,6° dal polo del pianeta: piano di Laplace vicino all'orbita del pianeta), Giapeto (15,1°), Tritone e Proteo (il polo di Nettuno ha solo il termine periodico dovuto a Tritone, Jacobson 2009; con la rotazione lo scarto massimo dal polo di Nettuno crescerebbe, per Proteo da 1,05° a 1,52°) e Disnomia (Eris senza polo).
- Angolo tra polo di F e polo del primario alla giunzione, costante nei record secolari: Fobos 0,33°, Deimos 0,94° (inclinazione del piano di Laplace), Io, Europa e Amaltea ≤ 0,015°, Ganimede 0,064°, Callisto 0,44°, Mimas 0,070°, Encelado 0,084°, Teti 0,098°, Dione 0,017°, Rea 0,040°, Titano 0,64°, Iperione 0,51°; satelliti di Urano e di Plutone: polo del primario costante in `pck00011.tpc`, Q = I. Con F fisso lo scarto arrivava nel 10000 a.C. a 10,6° (Fobos), 10,5° (Deimos), 0,44° (Io) e 0,67° (satelliti interni di Saturno). Polo dell'orbita osculante rispetto al polo del primario nel 10000 a.C. (JD -1 931 000): Fobos 1,20° (10,7° con F fisso), Deimos 1,31° (9,0°), Encelado 0,08° (0,67°), Dione 0,03° (0,66°); massimo su 300 epoche nei record secolari non oltre il massimo nella finestra 1600-2121 più 0,15° per tutti i 22 satelliti.
- Confronto con il kernel lungo non adottato (§ 7): con la rotazione il modello secolare si avvicina a sat441xl_part-1 (Dione da 0,34° a 0,30°, Rea da 0,37° a 0,30°).

### 3.2 Record

- Parametri per record: a, e, ϖ0, ϖ̇, tan(i/2), Ω0, Ω̇, λ0, n, c2, c3, S_k, C_k (§ 8.5); t_ref al centro del record.
- Adattamento: Levenberg-Marquardt (Levenberg 1944; Marquardt 1963) sulle posizioni planetocentriche in F (km), con jacobiano analitico (verificato con differenze finite), colonne normalizzate e smorzamento di Nielsen (1999). Campioni SPK a passo P/N con N = 20·max(1, (1 + e)²/(1 - e²)^1,5) (almeno 20 per periodo; 212 per Nereide); intervallo [t_inizio - L/4, t_fine + L/4] limitato alla copertura della fonte.
- Stima iniziale: elementi osculanti; λ e n da retta su λ continua; e, ϖ0, ϖ̇ e tan^I(i/2), Ω0, Ω̇ dal picco del periodogramma (FFT) delle serie k + i·h e q + i·p; per i record successivi, se il risultato è peggiore di 1,5 volte il precedente, si riprova dal record precedente traslato.
- Frequenze ν_k: CLEAN (Roberts, Lehár e Dreher 1987: picco, sottrazione, ripetizione) sui residui lungo la traccia di record con K = 0 su 100 anni attorno al 2000; esclusi i periodi oltre metà della finestra di adattamento (li assorbe il polinomio) e le bande ±2·2π/(1,5·L) attorno a 1, 2 e 3 volte la frequenza anomalistica n - ϖ̇ (degeneri con e e ϖ); fino a 6 picchi di ampiezza ≥ 1″.
- Tassellazione: zona del kernel moderno con record di durata L_moderno; zone dei kernel lunghi adottati con L_lunghi, solo dove ε_estrapolazione < 90° (oltre, il satellite è comunque "non determinabile"); record secolari ai lati. Ogni zona inizia 0,1·L prima della copertura del suo kernel, così che il raccordo con la zona vicina cada fuori dalla finestra del kernel; confini interni sulla griglia J2000 + m·L.
- Suddivisione: un record il cui errore sul nucleo supera 0,8 volte la tolleranza angolare o 0,8 % di a si divide a metà, fino a 0,25 anni.
- Raccordo (§ 7.5.3): L_b = 0,1·min(L_prec, L_succ); r = (1 - w)·r_prec + w·r_succ, w = 3x² - 2x³; velocità con il termine dw/dt·(r_succ - r_prec). Ogni file di blocco contiene i record il cui intervallo esteso [t_inizio - L_b, t_fine + L_b] interseca il nucleo.

### 3.3 Estrapolazione secolare (§ 7.5.4)

- Un record secolare per lato (stessi parametri, K = 0, c3 = 0), adattato sulle posizioni dei campioni casuali dell'intera copertura delle fonti adottate.
- Convergenza per continuazione: finestra iniziale ±5 anni attorno al centro della copertura moderna, allargata del 50 % a ogni passo (con librazioni ampie, come i 44° di Mimas in 70 anni, l'errore di λ ai nuovi estremi resta molto minore di π).
- Piano: nei record secolari dei satelliti regolari F segue il polo del primario (§ 3.1); il record resta adattato nel sistema F fisso.
- σ_n: validazione incrociata sulle due metà della copertura, con c2 e c3 fissati ai valori dell'adattamento completo; per ciascuna direzione, pendenza ai minimi quadrati dell'errore lungo la traccia (non ridotto) nella metà prevista; σ_n = massimo dei due valori.

### 3.4 Disnomia

Orbita kepleriana di Holler et al. (2021), tabella 2 (adattamento combinato, epoca JD 2453979,0, equatore J2000): P = 15,785899 ± 0,000050 d, a = 37 273 ± 64 km, e = 0,0062 ± 0,0010, i = 45,49° ± 0,15°, Ω = 126,17° ± 0,26°, ϖ = 307° ± 12°, longitudine media 125,78° ± 0,32°. Sistema F: piano dell'orbita, asse x sul nodo ascendente sull'equatore ICRF; un record secolare con ϖ̇ = Ω̇ = c2 = 0 su [T0, T_END + 1 anno]. Errori: ε_adattamento = √(0,32² + (2σ_e in gradi)² + 0,26²)° = 0,43°; σ_n = n·σ_P/P; arco 2005,92-2018,09.

## 4. Prova S3 (§ 14.2)

Comando `satellites.py scelte` per i 28 satelliti con kernel (risultati in `out/spike-sats.json`). Per ogni satellite: analisi in frequenza su 100 anni attorno al 2000; record con raccordo su 40 anni attorno al 2000 (finestra spostata dentro la copertura) per ogni durata L di prova, con K = 0 e con le frequenze trovate; errore massimo angolare visto dal pianeta e radiale contro il kernel moderno, su una griglia sfasata rispetto a quella di adattamento.

### 4.1 Sei casi del § 14.2

Errore angolare massimo con K termini (tra parentesi con K = 0) / errore radiale massimo in frazione di a.

| Satellite | P (d) | K | L = 2 anni | L = 5 anni | L = 10 anni | L = 20 anni | L = 50 anni |
|-----------|-------|---|------------|------------|-------------|-------------|-------------|
| Io | 1,771 | 6 | 24″ (95″) / 0,01 % | 34″ (95″) / 0,01 % | 48″ (104″) / 0,01 % | - | - |
| Mimas | 0,947 | 6 | 69″ (782″) / 0,03 % | 97″ (749″) / 0,03 % | 194″ (918″) / 0,03 % | - | - |
| Iperione | 21,293 | 6 | 3 255″ (43 633″) / 1,58 % | 4 243″ (50 425″) / 2,65 % | 4 263″ (50 863″) / 3,29 % | - | 5 010″ (54 848″) / 3,31 % |
| Tritone | 5,877 | 0 | 0,5″ / 0,00 % | 1,2″ / 0,00 % | 2,2″ / 0,00 % | 3,5″ / 0,00 % | - |
| Nereide | 360,21 | 6 | 175″ (468″) / 0,04 % | 613″ (995″) / 0,09 % | 1 811″ (1 590″) / 0,17 % | - | 8 773″ (8 825″) / 0,58 % |
| Caronte | 6,387 | 0 | 0,5″ / 0,00 % | 1,1″ / 0,00 % | 2,3″ / 0,00 % | 4,7″ / 0,00 % | - |

Prove aggiuntive con record più brevi: Iperione 924″ / 0,58 % (L = 0,25 anni), 1 357″ / 0,85 % (0,5), 1 527″ / 1,14 % (1); Imalia 974″ / 0,70 % (0,5), 1 228″ / 1,14 % (1).

Frequenze principali dei residui (periodo, ampiezza lungo la traccia con K = 0):

- Io: 462,5 d (36″), 482,4 d (20″), 1,769 d (15″), 2 059 d (13″), 3,525 d (13″, periodo sinodico Io-Europa), 487,3 d (8″).
- Mimas: 225,1 d (481″), 223,1 d (212″), 227,1 d (205″), 2 570 d (70″), 0,941 d (62″), 225,3 d (58″); le bande laterali a ±2 d da 225 d corrispondono alla modulazione con la librazione di 70 anni della risonanza Mimas-Teti.
- Iperione: 640,5 d (32 941″, librazione della risonanza 4:3 con Titano), 21,28 d (10 004″), 21,94 d, 20,53 d, 10,62 d, 31,82 d.
- Nereide: 370,5 d (402″), 182,6 d (308″), 121,2 d (251″), 377,9 d, 374,0 d, 184,4 d.
- Tritone, Caronte: tutti i picchi sotto 1″, quindi K = 0.

### 4.2 Scelta di L e K per tutti i satelliti

Regola (`produzione.scegli_durata`): tra le durate di prova entro le tolleranze del § 7.5.6 con margine 0,8, la più lunga con errore ≤ 30″ (metà della soglia "precisa"; per Iperione e gli irregolari un quarto della tolleranza); altrimenti la più lunga ≤ 1′; altrimenti la più lunga entro 1,5 volte il minimo. Nelle zone dei kernel lunghi, lontano dall'arco osservativo, la più lunga entro le tolleranze. K: frequenze trovate dall'analisi (fino a 6).

| Satellite | P (d) | K | L (moderno / lunghi, anni) | Errore massimo per L di prova (con K termini) | Radiale a L adottata |
|-----------|-------|---|----------------------------|------------------------------------------------|----------------------|
| Fobos | 0,319 | 6 | 10 / 10 | 2: 240″ · 5: 211″ · 10: 220″ | 0,01 % |
| Deimos | 1,263 | 6 | 10 / 10 | 2: 98″ · 5: 113″ · 10: 126″ | 0,01 % |
| Io | 1,771 | 6 | 2 / 10 | 2: 24″ · 5: 34″ · 10: 48″ | 0,01 % |
| Europa | 3,553 | 6 | 2 / 20 | 2: 50″ · 5: 64″ · 10: 96″ · 20: 114″ | 0,06 % |
| Ganimede | 7,157 | 6 | 5 / 20 | 2: 31″ · 5: 45″ · 10: 73″ · 20: 123″ | 0,09 % |
| Callisto | 16,696 | 6 | 5 / 20 | 2: 18″ · 5: 24″ · 10: 32″ · 20: 45″ | 0,02 % |
| Amaltea | 0,502 | 2 | 10 / 10 | 2: 9,2″ · 5: 9,0″ · 10: 9,7″ | 0,00 % |
| Imalia | 249,982 | 6 | 2 / 2 | 2: 2 043″ · 5: 3 335″ · 10: 4 264″ · 50: 17 140″ | 2,20 % |
| Mimas | 0,947 | 6 | 5 / 10 | 2: 69″ · 5: 97″ · 10: 194″ | 0,03 % |
| Encelado | 1,375 | 6 | 2 / 10 | 2: 48″ · 5: 63″ · 10: 88″ | 0,01 % |
| Teti | 1,892 | 6 | 5 / 10 | 2: 28″ · 5: 29″ · 10: 37″ | 0,01 % |
| Dione | 2,740 | 6 | 2 / 10 | 2: 36″ · 5: 62″ · 10: 127″ | 0,02 % |
| Rea | 4,520 | 6 | 10 / 20 | 2: 15″ · 5: 24″ · 10: 27″ · 20: 69″ | 0,02 % |
| Titano | 15,948 | 6 | 2 / 20 | 2: 22″ · 5: 36″ · 10: 64″ · 20: 72″ | 0,00 % |
| Iperione | 21,293 | 6 | 2 / 2 | 2: 3 255″ · 5: 4 243″ · 10: 4 263″ · 50: 5 010″ | 1,58 % |
| Giapeto | 79,371 | 6 | 2 / 50 | 2: 61″ · 5: 138″ · 10: 172″ · 50: 196″ | 0,03 % |
| Febe | 549,101 | 6 | 2 / 2 | 2: 179″ · 5: 676″ · 10: 792″ · 50: 1 165″ | 0,55 % |
| Miranda | 1,414 | 6 | 10 / 10 | 2: 87″ · 5: 96″ · 10: 103″ | 0,02 % |
| Ariel | 2,521 | 6 | 5 / 10 | 2: 39″ · 5: 58″ · 10: 117″ | 0,03 % |
| Umbriel | 4,145 | 6 | 20 / 20 | 2: 38″ · 5: 37″ · 10: 50″ · 20: 59″ | 0,07 % |
| Titania | 8,706 | 6 | 10 / 20 | 2: 35″ · 5: 41″ · 10: 50″ · 20: 73″ | 0,11 % |
| Oberon | 13,466 | 6 | 20 / 20 | 2: 64″ · 5: 62″ · 10: 63″ · 20: 93″ | 0,11 % |
| Tritone | 5,877 | 0 | 20 / 20 | 2: 0,5″ · 5: 1,2″ · 10: 2,2″ · 20: 3,5″ | 0,00 % |
| Proteo | 1,123 | 6 | 2 / 10 | 2: 50″ · 5: 116″ · 10: 145″ | 0,00 % |
| Nereide | 360,213 | 6 | 5 / 10 | 2: 175″ · 5: 613″ · 10: 1 811″ · 50: 8 773″ | 0,09 % |
| Caronte | 6,387 | 0 | 20 / 20 | 2: 0,5″ · 5: 1,1″ · 10: 2,3″ · 20: 4,7″ | 0,00 % |
| Notte | 25,530 | 6 | 50 / 50 | 2: 294″ · 5: 296″ · 10: 296″ · 50: 303″ | 0,31 % |
| Idra | 38,756 | 6 | 50 / 50 | 2: 65″ · 5: 67″ · 10: 69″ · 50: 69″ | 0,06 % |

Conclusioni:

- K: il beneficio è grande dove esistono termini periodici di periodo inferiore alla durata del record (Mimas da 782″ a 69″, Iperione da 43 633″ a 3 255″ con L = 2 anni).
- L: le durate iniziali del § 7.5.2 (10/20/50 anni) rispettano le tolleranze dei satelliti regolari ma non portano gli errori sotto 1′; le durate adottate vanno da 2 a 50 anni.
- Limite del modello: con polo di F fisso, tan(i/2) costante e Ω lineare, restano errori fuori dal piano indipendenti da L e K (Fobos 211-240″, Deimos 98-126″).
- Iperione, Imalia e Febe: nessuna durata di prova rispetta sempre l'1 % radiale; in produzione i record che superano 0,8 volte le tolleranze si dividono a metà fino a 0,25 anni (§ 3.2), e l'1 % è rispettato (§ 5).

### 4.3 Kernel lunghi contro estrapolazione secolare dal kernel moderno

Per ogni satellite con kernel lungo: record secolare adattato sui soli campioni del kernel moderno, σ_n per validazione incrociata, confronto con i campioni del kernel lungo fuori dalla copertura moderna (comando `lunghi`). Criterio: il kernel lungo si omette se, dove il satellite è determinabile (ε_estrapolazione < 90°), la differenza d resta sotto un quarto di ε_estrapolazione (ε ⊕ d ≤ 1,03·ε: il livello di affidabilità non cambia).

| Satellite | Residuo secolare | σ_n (rad/anno) | Differenza massima dove determinabile | Rapporto massimo d/ε_estr | Livello cambiato | Kernel lungo |
|-----------|------------------|----------------|----------------------------------------|---------------------------|------------------|--------------|
| Mimas | 48,213° | 8,19·10⁻⁵ | 51,95° | 20,117 | 22,1 % | adottato |
| Encelado | 0,471° | 2,56·10⁻⁷ | 0,82° | 0,345 | 0,0 % | adottato |
| Teti | 2,242° | 8,50·10⁻⁷ | 6,67° | 2,614 | 1,6 % | adottato |
| Dione | 0,066° | 3,94·10⁻⁸ | 0,34° | 0,113 | 0,0 % | omesso |
| Rea | 0,060° | 5,93·10⁻⁹ | 0,37° | 0,171 | 0,0 % | omesso |
| Titano | 0,082° | 9,20·10⁻⁸ | 1,29° | 0,668 | 0,1 % | adottato |
| Iperione | 15,321° | 2,01·10⁻⁶ | 15,90° | 159,972 | 32,8 % | adottato |
| Giapeto | 0,229° | 9,63·10⁻⁷ | 115,53° | 23,551 | 81,7 % | adottato |
| Febe | 2,668° | 1,94·10⁻⁶ | 14,18° | 129,250 | 80,4 % | adottato |
| Miranda | 1,594° | 5,13·10⁻⁶ | 65,78° | 1,170 | 19,3 % | adottato |
| Ariel | 0,242° | 3,36·10⁻⁷ | 113,90° | 2,175 | 37,8 % | adottato |
| Umbriel | 0,183° | 1,07·10⁻⁷ | 12,53° | 0,264 | 0,6 % | adottato |
| Titania | 0,322° | 4,62·10⁻⁸ | 4,12° | 1,188 | 1,5 % | adottato |
| Oberon | 0,235° | 1,02·10⁻⁷ | 1,67° | 0,922 | 0,2 % | adottato |
| Tritone | 0,004° | 1,79·10⁻⁸ | 0,41° | 1,892 | 5,8 % | adottato |
| Nereide | 11,062° | 1,41·10⁻⁵ | 179,77° | 31,234 | 24,8 % | adottato |

Tritone: riga calcolata con NEP098 come kernel moderno e NEP097 come kernel precedente (1600-1800). Con NEP097 come kernel moderno il confronto con nep097xl-801 aveva dato residuo secolare 0,008°, σ_n 2,14·10⁻⁷ rad/anno, differenza massima 17,82°, rapporto 0,198, livello cambiato 1,2 %: nep097xl-801 non è adottato.

Esito: kernel lunghi omessi per Dione, Rea (rapporto 0,113 e 0,171) e Tritone (nep097xl-801); adottati per gli altri satelliti, solo dove ε_estrapolazione < 90°. Il confronto tra i kernel lunghi omessi e il modello prodotto è al § 7.

## 5. Produzione dei record

Comandi `record` (zona del kernel moderno e record secolare) e `record-lunghi` (zone dei kernel lunghi: ogni kernel si scarica, si usa per tutti i suoi satelliti e si elimina). Residui (`residui`) su una griglia sfasata rispetto a quella di adattamento, con raccordo, contro la fonte di ciascun record; esclusi i tratti di raccordo con record di fonte diversa (giunzioni tra sorgenti, dove si assorbe il salto, § 7.5.1). ε_sorgente: differenza massima tra kernel moderno e kernel lunghi adottati sui campioni della sovrapposizione.

| Satellite | Record (moderno / lunghi; suddivisi) | ε_ad. max moderno | Radiale max moderno | ε_ad. max lunghi | ε_sorgente | Residuo secolare | σ_n (rad/anno) |
|-----------|---------------------------------------|-------------------|---------------------|------------------|------------|------------------|----------------|
| Fobos | 52 / 0; 0 | 1 246″ | 1,4 km (0,015 %) | - | - | 0,330° | 6,34·10⁻⁹ |
| Deimos | 52 / 0; 0 | 492″ | 2,9 km (0,012 %) | - | - | 0,443° | 4,81·10⁻⁷ |
| Io | 261 / 0; 0 | 47″ | 40,3 km (0,010 %) | - | - | 0,032° | 7,63·10⁻⁹ |
| Europa | 261 / 0; 0 | 56″ | 446,7 km (0,067 %) | - | - | 0,143° | 2,30·10⁻⁸ |
| Ganimede | 105 / 0; 0 | 50″ | 927,1 km (0,087 %) | - | - | 0,229° | 1,54·10⁻⁸ |
| Callisto | 105 / 0; 0 | 25″ | 420,3 km (0,022 %) | - | - | 0,073° | 2,70·10⁻⁷ |
| Amaltea | 52 / 0; 0 | 52″ | 5,9 km (0,003 %) | - | - | 0,014° | 3,46·10⁻⁹ |
| Imalia | 430 / 0; 420 | 1 781″ | 92 195,8 km (0,805 %) | - | - | 7,591° | 1,18·10⁻⁵ |
| Mimas | 75 / 97; 0 | 97″ | 48,9 km (0,026 %) | 415″ | 1″ | 49,984° | 4,15·10⁻⁵ |
| Encelado | 186 / 122; 0 | 56″ | 25,7 km (0,011 %) | 99″ | 0″ | 0,544° | 6,14·10⁻⁸ |
| Teti | 75 / 146; 0 | 83″ | 37,7 km (0,013 %) | 602″ | 0″ | 2,310° | 1,75·10⁻⁶ |
| Dione | 186 / 0; 0 | 45″ | 68,4 km (0,018 %) | - | - | 0,066° | 3,94·10⁻⁸ |
| Rea | 37 / 0; 0 | 121″ | 133,3 km (0,025 %) | - | - | 0,060° | 5,93·10⁻⁹ |
| Titano | 186 / 112; 0 | 25″ | 39,9 km (0,003 %) | 91″ | 0″ | 0,202° | 8,63·10⁻⁷ |
| Iperione | 599 / 3602; 4201 | 1 575″ | 11 796,9 km (0,797 %) | 1 660″ | 0″ | 15,268° | 9,24·10⁻⁸ |
| Giapeto | 186 / 45; 0 | 72″ | 935,6 km (0,026 %) | 259″ | 0″ | 4,198° | 6,39·10⁻⁵ |
| Febe | 186 / 1133; 16 | 196″ | 95 311,4 km (0,736 %) | 215″ | 0″ | 2,886° | 3,71·10⁻⁷ |
| Miranda | 52 / 105; 0 | 299″ | 36,4 km (0,028 %) | 126″ | 20 520″ | 5,730° | 1,53·10⁻⁷ |
| Ariel | 105 / 156; 0 | 74″ | 57,6 km (0,030 %) | 141″ | 17 674″ | 4,158° | 3,42·10⁻⁷ |
| Umbriel | 26 / 105; 0 | 106″ | 207,3 km (0,078 %) | 134″ | 682″ | 0,294° | 1,31·10⁻⁸ |
| Titania | 52 / 158; 0 | 397″ | 549,0 km (0,126 %) | 448″ | 1 927″ | 0,666° | 2,78·10⁻⁸ |
| Oberon | 26 / 200; 0 | 132″ | 713,8 km (0,122 %) | 123″ | 718″ | 0,348° | 6,70·10⁻⁹ |
| Tritone | 16 / 10; 0 | 5″ | 0,3 km (0,000 %) | 2″ | 769″ | 0,141° | 2,26·10⁻⁶ |
| Proteo | 161 / 0; 0 | 77″ | 2,2 km (0,002 %) | - | - | 0,039° | 7,14·10⁻¹⁰ |
| Nereide | 105 / 1160; 0 | 613″ | 4 866,3 km (0,088 %) | 1 995″ | 6 200″ | 15,682° | 3,27·10⁻⁶ |
| Caronte | 16 / 0; 0 | 4″ | 0,0 km (0,000 %) | - | - | 0,005° | 8,55·10⁻⁸ |
| Notte | 7 / 0; 0 | 303″ | 152,3 km (0,313 %) | - | - | 0,153° | 5,84·10⁻⁸ |
| Idra | 7 / 0; 0 | 73″ | 36,6 km (0,057 %) | - | - | 0,050° | 9,18·10⁻⁷ |

- Suddivisione dei record (fino a 0,25 anni): Imalia da 161 a 430 record; Iperione da 186 a 599 record nella zona moderna e da 1 125 a 3 602 nella zona lunga; Febe 8 record della zona lunga divisi in due. Con la suddivisione l'errore radiale scende sotto l'1 % di a anche per Iperione (0,80 %), Imalia (0,81 %) e Febe (0,74 %).
- Tutti i residui rispettano le tolleranze del § 7.5.6 (0,5°; Iperione 3°; Imalia, Febe, Nereide 1°; radiale 1 % di a).
- ε_sorgente dei kernel di Urano (URA111 contro URA182): 682″-20 520″ (Miranda); per Miranda la differenza cresce all'indietro da 101 km (2000) a 12 849 km (1600), come una differenza di moto medio. Saturno: SAT441 e SAT441XL sono la stessa soluzione (≤ 0,7″).
- Residui secolari ampi dove esistono librazioni non rappresentabili con λ quadratico: Mimas 50,0° (risonanza Mimas-Teti), Iperione 15,3° (risonanza 4:3 con Titano), Nereide 15,7°, Imalia 7,6°.

## 6. Errori e affidabilità (§ 7.5.6, § 7.8)

- ε_modello(t) = ε_adattamento ⊕ ε_sorgente ⊕ ε_estrapolazione(τ). ε_adattamento: residuo massimo del record che contiene t (nel raccordo, il massimo dei due record); per i record secolari, il residuo massimo dell'adattamento secolare. ε_sorgente: solo per i record dei kernel lunghi e per i record secolari dei satelliti con kernel lunghi adottati.
- Errore radiale (§ 7.5.6): non entra in ε_modello, che è angolare e dà il livello. Per ogni intervallo di fonte del catalogo, `erroreRadialeKm` = massimo errore radiale dei suoi record contro la fonte (colonna "Radiale max" del § 5; per l'intervallo secolare il residuo radiale dell'adattamento secolare: Febe 238 953 km, Imalia 578 030 km, Iperione 77 600 km); Disnomia `null`. L'interfaccia lo somma in quadratura a ε·d nell'errore delle distanze (`erroreRadialeSatellite` in `src/ui/datiScheda.ts`).
- ε_estrapolazione(τ) = |τ|·σ_n + ½·τ²·σ_ṅ con σ_ṅ = 1·10⁻⁹·n anno⁻¹ (I12), τ dall'arco osservativo. Fobos: accelerazione mareale misurata e modellata in MAR099, λ = λ₀ + n·t + ½·ṅ·t² con ½·ṅ = (1,258 ± 0,058)·10⁻³ °/anno² (Brozović, Jacobson e Park 2025, sommario e § 4.5), quindi σ_ṅ = 1,16·10⁻⁴ °/anno² (I12 darebbe 4,12·10⁻⁴); Deimos: accelerazione non rilevabile dai dati (stessa fonte), I12. Arco: 1900-2020, con inizio non anteriore all'anno di scoperta (JPL "Planetary Satellite Discovery Circumstances", `raw/sats/jpl-sats-discovery.html`): Miranda 1948-2020, Nereide 1949-2020, Caronte 1978-2020, Proteo 1989-2020, Notte e Idra 2005-2020; Fobos e Deimos 1877-2019, arco astrometrico di MAR099 (stessa fonte, § 3); Disnomia 2005,92-2018,09 (Holler et al. 2021). Costanti `ARCO_NOTO` e `SIGMA_NDOT_GRADI` in `sats/anagrafica.py`; la finestra di stima di F (§ 3.1) resta sull'arco predefinito.
- Centri dei pianeti (§ 7.3.5): "precisi" se tutti i satelliti rilevanti per il centro hanno ε_modello ≤ 1′; rilevante = contributo GM_i·a_i/GM_sistema ≥ 0,5 km (un decimo della soglia di 5 km). I satelliti esclusi spostano il centro al più di 2·GM_i·a_i/GM_sistema (in totale 1,2 km per Saturno, il caso peggiore).

ε_modello dal frammento `reliability-sats.json` (valore dell'intervallo che contiene il 1° gennaio dell'anno; oltre 90° il satellite è "non determinabile"):

| Satellite | -9000 | -5000 | -2000 | 0 | 1000 | 1500 | 1700 | 1950 | 2010 | 2100 |
|-----------|---|---|---|---|---|---|---|---|---|---|
| Fobos | > 90° | > 90° | > 90° | > 90° | 46,6° | 9,1° | 2,3° | 2,0′ | 3,7′ | 24,8′ |
| Deimos | > 90° | > 90° | > 90° | > 90° | 41,9° | 8,2° | 2,0° | 1,6′ | 2,1′ | 21,4′ |
| Io | > 90° | > 90° | > 90° | > 90° | 31,4° | 6,5° | 1,8° | 20″ | 18″ | 14,5′ |
| Europa | > 90° | > 90° | > 90° | 68,2° | 15,6° | 3,3° | 53,4′ | 42″ | 50″ | 7,3′ |
| Ganimede | > 90° | > 90° | > 90° | 33,9° | 7,8° | 1,6° | 26,5′ | 39″ | 37″ | 3,6′ |
| Callisto | > 90° | > 90° | 60,6° | 14,5° | 3,3° | 42,2′ | 11,6′ | 24″ | 24″ | 1,7′ |
| Amaltea | > 90° | > 90° | > 90° | > 90° | > 90° | 23,2° | 6,3° | 7″ | 10″ | 51,6′ |
| Imalia | 39,4° | 18,8° | 10,1° | 7,9° | 7,6° | 7,6° | 7,6° | 27,4′ | 8,1′ | 15,8′ |
| Mimas | > 90° | > 90° | > 90° | > 90° | 61,1° | 13,3° | 3,9° | 1,5′ | 1,6′ | 38,8′ |
| Encelado | > 90° | > 90° | > 90° | > 90° | 40,6° | 8,4° | 2,3° | 54″ | 46″ | 18,8′ |
| Teti | > 90° | > 90° | > 90° | > 90° | 29,5° | 6,2° | 1,7° | 31″ | 26″ | 14,1′ |
| Dione | > 90° | > 90° | > 90° | 88,5° | 20,3° | 4,2° | 1,2° | 36″ | 35″ | 9,4′ |
| Rea | > 90° | > 90° | > 90° | 53,6° | 12,3° | 2,6° | 42,2′ | 33″ | 26″ | 5,8′ |
| Titano | > 90° | > 90° | 63,5° | 15,3° | 3,5° | 44,8′ | 12,6′ | 21″ | 14″ | 1,9′ |
| Iperione | > 90° | > 90° | 49,9° | 11,4° | 2,6° | 41,5′ | 26,0′ | 24,9′ | 21,7′ | 22,3′ |
| Giapeto | > 90° | 65,1° | 27,4° | 10,1° | 4,1° | 1,7° | 50,7′ | 1,1′ | 52″ | 18,1′ |
| Febe | 14,8° | 6,5° | 3,5° | 29,0′ | 7,8′ | 4,0′ | 2,6′ | 3,0′ | 2,4′ | 2,2′ |
| Miranda | > 90° | > 90° | > 90° | > 90° | 43,9° | 11,7° | 3,3° | 1,9′ | 1,6′ | 18,4′ |
| Ariel | > 90° | > 90° | > 90° | > 90° | 22,6° | 6,7° | 1,3° | 1,0′ | 55″ | 10,3′ |
| Umbriel | > 90° | > 90° | > 90° | 58,4° | 13,4° | 2,8° | 45,8′ | 1,8′ | 58″ | 6,3′ |
| Titania | > 90° | > 90° | > 90° | 27,8° | 6,4° | 1,4° | 22,8′ | 52″ | 50″ | 3,3′ |
| Oberon | > 90° | > 90° | 75,0° | 18,0° | 4,1° | 52,9′ | 14,2′ | 1,3′ | 1,5′ | 2,8′ |
| Tritone | > 90° | > 90° | > 90° | 41,5° | 9,6° | 2,0° | 36,3′ | 3″ | 3″ | 5,0′ |
| Proteo | > 90° | > 90° | > 90° | > 90° | 59,6° | 15,1° | 5,6° | 8,2′ | 44″ | 22,9′ |
| Nereide | 24,1° | 10,3° | 4,0° | 2,1° | 1,8° | 1,8° | 10,0′ | 7,3′ | 7,4′ | 2,7′ |
| Caronte | > 90° | > 90° | > 90° | 41,1° | 10,2° | 2,5° | 54,7′ | 52″ | 4″ | 4,0′ |
| Notte | > 90° | > 90° | 42,9° | 10,8° | 2,8° | 44,7′ | 19,1′ | 5,1′ | 4,9′ | 5,0′ |
| Idra | > 90° | 85,3° | 28,1° | 7,2° | 1,9° | 30,2′ | 12,3′ | 1,4′ | 1,2′ | 1,5′ |
| Disnomia | > 90° | > 90° | > 90° | 70,5° | 31,4° | 15,0° | 9,0° | 1,8° | 25,7′ | 2,2° |

## 7. Validazione A6 (§ 13)

Comando `valida --offline`; risultati in `out/validazione-sats.json`. Contro i kernel: 200 epoche per kernel adottato (seme del § 2), nella finestra servita dai suoi record, fuori dalle giunzioni tra sorgenti; per i kernel lunghi le epoche sono estratte nella zona usata (dove il satellite è determinabile). Errore angolare visto dal pianeta; errore radiale in frazione di a (mediana dei record).

| Satellite | Kernel | Epoche | Angolo max | Angolo medio | Radiale max | Tolleranza | Esito |
|-----------|--------|--------|------------|--------------|-------------|------------|-------|
| Fobos | mar099 | 200 | 1 117″ | 354,4″ | 1,2 km (0,012 %) | 0,5° | superato |
| Deimos | mar099 | 200 | 342″ | 69,0″ | 2,2 km (0,009 %) | 0,5° | superato |
| Io | jup365 | 200 | 29″ | 8,4″ | 33,6 km (0,008 %) | 0,5° | superato |
| Europa | jup365 | 200 | 43″ | 13,9″ | 358,5 km (0,053 %) | 0,5° | superato |
| Ganimede | jup365 | 200 | 37″ | 11,2″ | 881,5 km (0,082 %) | 0,5° | superato |
| Callisto | jup365 | 200 | 21″ | 10,2″ | 336,5 km (0,018 %) | 0,5° | superato |
| Amaltea | jup365 | 200 | 48″ | 12,3″ | 5,4 km (0,003 %) | 0,5° | superato |
| Imalia | jup347 | 200 | 1 342″ | 290,4″ | 88 948,6 km (0,777 %) | 1,0° | superato |
| Mimas | sat441 | 200 | 81″ | 30,4″ | 46,1 km (0,025 %) | 0,5° | superato |
| Mimas | sat441xl_part-1 | 200 | 384″ | 153,5″ | 46,5 km (0,025 %) | 0,5° | superato |
| Encelado | sat441 | 200 | 44″ | 17,4″ | 19,8 km (0,008 %) | 0,5° | superato |
| Encelado | sat441xl_part-1 | 200 | 80″ | 36,4″ | 41,1 km (0,017 %) | 0,5° | superato |
| Teti | sat441 | 200 | 76″ | 20,6″ | 32,0 km (0,011 %) | 0,5° | superato |
| Teti | sat441xl_part-1 | 200 | 530″ | 195,1″ | 35,5 km (0,012 %) | 0,5° | superato |
| Dione | sat441 | 200 | 32″ | 9,9″ | 55,3 km (0,015 %) | 0,5° | superato |
| Rea | sat441 | 200 | 72″ | 19,1″ | 87,7 km (0,017 %) | 0,5° | superato |
| Titano | sat441 | 200 | 14″ | 4,1″ | 34,7 km (0,003 %) | 0,5° | superato |
| Titano | sat441xl_part-1 | 200 | 85″ | 32,8″ | 117,7 km (0,010 %) | 0,5° | superato |
| Iperione | sat441 | 200 | 1 286″ | 349,8″ | 10 889,2 km (0,735 %) | 3,0° | superato |
| Iperione | sat441xl_part-1 | 200 | 1 371″ | 382,0″ | 11 314,5 km (0,764 %) | 3,0° | superato |
| Giapeto | sat441 | 200 | 49″ | 18,8″ | 737,6 km (0,021 %) | 0,5° | superato |
| Giapeto | sat441xl_part-1 | 200 | 254″ | 89,9″ | 2 123,8 km (0,060 %) | 0,5° | superato |
| Febe | sat441 | 200 | 174″ | 61,4″ | 87 879,0 km (0,679 %) | 1,0° | superato |
| Febe | sat441xl_part-1 | 200 | 207″ | 56,4″ | 79 005,3 km (0,610 %) | 1,0° | superato |
| Miranda | ura184_part-3 | 200 | 143″ | 43,9″ | 30,8 km (0,024 %) | 0,5° | superato |
| Miranda | ura111xl-705 | 200 | 104″ | 42,9″ | 32,4 km (0,025 %) | 0,5° | superato |
| Ariel | ura184_part-3 | 200 | 58″ | 14,9″ | 49,2 km (0,026 %) | 0,5° | superato |
| Ariel | ura111xl-701 | 200 | 110″ | 33,7″ | 60,6 km (0,032 %) | 0,5° | superato |
| Umbriel | ura184_part-3 | 200 | 83″ | 23,4″ | 170,8 km (0,064 %) | 0,5° | superato |
| Umbriel | ura111xl-702 | 200 | 68″ | 25,6″ | 196,9 km (0,074 %) | 0,5° | superato |
| Titania | ura184_part-3 | 199 | 234″ | 23,9″ | 447,2 km (0,102 %) | 0,5° | superato |
| Titania | ura111xl-703 | 200 | 371″ | 43,9″ | 471,8 km (0,108 %) | 0,5° | superato |
| Oberon | ura184_part-3 | 200 | 110″ | 34,0″ | 588,1 km (0,101 %) | 0,5° | superato |
| Oberon | ura111xl-704 | 200 | 101″ | 32,8″ | 651,6 km (0,112 %) | 0,5° | superato |
| Tritone | nep098_part-1 | 200 | 3″ | 0,7″ | 0,3 km (0,000 %) | 0,5° | superato |
| Tritone | nep097 | 200 | 2″ | 0,4″ | 0,4 km (0,000 %) | 0,5° | superato |
| Proteo | nep098_part-3 | 200 | 42″ | 11,8″ | 2,0 km (0,002 %) | 0,5° | superato |
| Nereide | nep105 | 200 | 378″ | 39,0″ | 4 457,8 km (0,081 %) | 1,0° | superato |
| Nereide | nep101xl-802 | 200 | 1 815″ | 125,9″ | 8 784,4 km (0,159 %) | 1,0° | superato |
| Caronte | plu060 | 200 | 4″ | 0,5″ | 0,0 km (0,000 %) | 0,5° | superato |
| Notte | plu060 | 198 | 290″ | 166,2″ | 151,4 km (0,311 %) | 0,5° | superato |
| Idra | plu060 | 200 | 62″ | 28,3″ | 34,8 km (0,054 %) | 0,5° | superato |

Kernel lunghi non adottati, contro il modello prodotto sui campioni casuali del kernel dove il modello usa l'estrapolazione secolare e il satellite è determinabile (20/10/2026, con il piano secolare del § 3.1):

- Dione, sat441xl_part-1: 141 825 campioni, differenza massima 0,30°, rapporto massimo differenza/ε_modello 0,112.
- Rea, sat441xl_part-1: 178 880 campioni, differenza massima 0,30°, rapporto massimo differenza/ε_modello 0,168.
- Tritone, nep097xl-801: 41 673 campioni, differenza massima 2,64°, rapporto massimo differenza/ε_modello 0,062.
- sat441xl_part-2 per Dione e Rea: nessun campione fuori dalla copertura di sat441 entro l'intervallo del progetto.

Contro JPL Horizons (VECTORS geometrici, eclittica J2000, centro 500@499 … 500@999; Disnomia rispetto a 500@920136199): 20 epoche casuali per satellite (seme 20261020 + ssid) nel 1900-2100; Disnomia nel 2000-2030, l'intervallo servito da Horizons (soluzione JPL `tnosat_v001_20136199_jpl`). Horizons usa le stesse soluzioni dei kernel adottati (mar099, jup365, jup347, sat441, ura184 per URA182, nep098, plu060), tranne Nereide (NEP098 in Horizons, NEP105 nel modello).

| Satellite | Angolo max | Radiale max | Esito |
|-----------|------------|-------------|-------|
| Fobos | 313″ | 1,1 km (0,012 %) | superato |
| Deimos | 137″ | 1,7 km (0,007 %) | superato |
| Io | 14″ | 26,2 km (0,006 %) | superato |
| Europa | 49″ | 322,1 km (0,048 %) | superato |
| Ganimede | 28″ | 839,4 km (0,078 %) | superato |
| Callisto | 19″ | 293,8 km (0,016 %) | superato |
| Amaltea | 13″ | 4,3 km (0,002 %) | superato |
| Imalia | 926″ | 81 679,2 km (0,660 %) | superato |
| Mimas | 57″ | 42,8 km (0,023 %) | superato |
| Encelado | 28″ | 10,3 km (0,004 %) | superato |
| Teti | 26″ | 17,1 km (0,006 %) | superato |
| Dione | 18″ | 33,1 km (0,009 %) | superato |
| Rea | 21″ | 86,7 km (0,016 %) | superato |
| Titano | 16″ | 15,6 km (0,001 %) | superato |
| Iperione | 1 191″ | 10 584,7 km (0,706 %) | superato |
| Giapeto | 31″ | 633,4 km (0,018 %) | superato |
| Febe | 132″ | 66 342,7 km (0,505 %) | superato |
| Miranda | 75″ | 20,7 km (0,016 %) | superato |
| Ariel | 53″ | 37,5 km (0,020 %) | superato |
| Umbriel | 100″ | 157,6 km (0,059 %) | superato |
| Titania | 66″ | 406,8 km (0,093 %) | superato |
| Oberon | 67″ | 525,3 km (0,090 %) | superato |
| Tritone | 2″ | 0,3 km (0,000 %) | superato |
| Proteo | 43″ | 1,5 km (0,001 %) | superato |
| Nereide | 138″ | 2 174,9 km (0,025 %) | superato |
| Caronte | 2″ | 0,0 km (0,000 %) | superato |
| Notte | 259″ | 140,5 km (0,286 %) | superato |
| Idra | 45″ | 30,3 km (0,047 %) | superato |
| Disnomia | 324″ | 15,7 km (0,042 %) | superato |

Centri dei pianeti: scarto del centro dal baricentro con la formula del § 7.3.5 contro i segmenti SPK dei centri (499, 599, 699, 799, 899, 999) alle epoche di validazione dei kernel moderni.

| Pianeta | Satelliti rilevanti | Epoche (precise) | Scarto tipico | Errore max | Errore max dove precisi | Esito |
|---------|---------------------|------------------|---------------|------------|-------------------------|-------|
| Marte | nessuno | 400 (400) | 0,0 km | 0,000 km | 0,000 km | superato |
| Giove | Callisto, Europa, Ganimede, Io | 1200 (422) | 128,8 km | 0,085 km | 0,079 km | superato |
| Saturno | Dione, Giapeto, Rea, Titano | 1800 (563) | 289,5 km | 0,029 km | 0,029 km | superato |
| Urano | Ariel, Oberon, Titania, Umbriel | 1000 (0) | 27,2 km | 0,048 km | - km | superato |
| Nettuno | Tritone | 600 (305) | 74,1 km | 0,430 km | 0,337 km | superato |
| Plutone | Caronte | 600 (238) | 2 131,5 km | 0,160 km | 0,160 km | superato |

- Urano: nessuna epoca "precisa" (Oberon ha ε_adattamento ≤ 1′ solo in 2 record su 226); l'errore massimo su tutte le 1 000 epoche è 0,048 km.
- Esito complessivo A6: superato.

Disnomia: gli elementi di Holler et al. (2021) riproducono gli offset della tabella 1 dell'articolo con le posizioni all'istante di emissione (tempo luce 0,556 d): scarto quadratico medio 1,9σ, massimo 16,0 mas (27,3σ senza tempo luce; verifica in `test_sat_dati.py`, con la posizione astrometrica di Eris da Horizons congelata in `raw/sats/horizons/eris-osservazioni-tabella1.txt`).

## 8. File `sats/sKK.bin` (§ 8.5)

| Blocco | Byte | Record |
|--------|------|--------|
| 0-6 (ciascuno) | 25 472 | 129 |
| 7 | 30 008 | 150 |
| 8 | 42 632 | 208 |
| 9 | 294 152 | 1 372 |
| 10 | 592 064 | 2 749 |
| 11 | 1 018 136 | 4 746 |
| 12 | 216 504 | 1 010 |
| Totale | 2 371 800 | |

Budget del § 8.1 rispettato: totale 2,26 MiB ≤ 5 MB, file massimo 0,97 MiB ≤ 4 MB. Ogni file contiene i record il cui intervallo esteso dal raccordo interseca il nucleo; Disnomia ha un solo record kepleriano [T0, T_END + 1 anno).

## 9. Catalogo (§ 8.10, § 9) e rotazione (§ 7.5.5)

Frammento `scripts/pipeline/out/catalog-sats.json`, 29 satelliti:

- `effemeridi`: `modello` = satellite, `rF` (9 numeri per righe, F → eclittica J2000), `frequenze` ν_k (rad/d), `arcoOsservativo` (anni), `fonti` (intervalli secolare / spk-satellitare / kepleriana, con `saltoGiunzioneKm` misurato al confine ed `erroreRadialeKm`, errore radiale massimo dei record dell'intervallo, § 6), `centro` (`pianeta`, oppure `baricentro` per Notte e Idra), `pianoSegueEquatore` (vero per i 22 satelliti del § 3.1).
- `soluzione`: soluzioni dei kernel adottati (ad esempio "NEP098 (nep098_part-1.bsp) + NEP097 (nep097.bsp)" per Tritone), data del file NAIF del kernel moderno, data di estrazione dal manifest.
- `fisica.raggi_km`: raggio medio della pagina JPL "Planetary Satellite Physical Parameters" (`raw/sats/jpl-sats-phys_par.html`, congelata) con la fonte primaria citata dalla pagina e il suo anno; Disnomia: Brown e Butler (2023), diametro 615 +60/-50 km (raggio 307,5 km, incertezza 30 km, la maggiore), che supera i 700 ± 115 km degli stessi autori del 2018.
- `fisica.gm_km3s2`: costante GM del kernel moderno (la stessa usata per μ e per i centri dei pianeti); incertezza della pagina JPL se la pagina cita la stessa soluzione o se il valore pubblicato coincide, arrotondato o troncato alle sue cifre, con quello del kernel (Fobos e Deimos, MAR097; Imalia, JUP344; Tritone e Proteo, NEP097: la fonte lo dichiara); nessuna incertezza per i satelliti di Urano (URA111 diversa da URA182). Nereide: GM nullo nel kernel NEP105 e non determinato nella pagina JPL: `null`. Disnomia: `null` (μ = 1 099 km³/s² è del sistema).
- `fisica.rotazione`: periodo siderale (ore) pari al periodo orbitale medio del record secolare per i satelliti sincroni del § 7.5.5 (fonte "rotazione sincrona: periodo orbitale siderale medio del modello"); Febe 360°/Ẇ del modello WGCCRE di `pck00011.tpc` (Archinal et al. 2018), 9,27398 h, senza rotazione rappresentata, con inclinazione dell'asse di 156,1° sull'orbita planetocentrica del modello a J2000 (rotazione retrograda); periodi pubblicati, senza rotazione rappresentata, per Imalia (7,7819 ± 0,0005 h, sinodico; Pilcher, Mottola, Denk 2012), Nereide (11,594 ± 0,017 h; Kiss et al. 2016), Notte (1,829 ± 0,009 d) e Idra (0,4295 ± 0,0008 d; Weaver et al. 2016); `null` per Iperione e Disnomia. `fisica.albedo`: `null` (§ 9).
- Fonte del GM: "costante GM del kernel ... (soluzione ..., riferimento)"; per NEP098, senza riferimento bibliografico nella pagina JPL, il riferimento è "JPL SSD (2026)".
- `orientamento`: sincroni `sincrono` con `convenzionePolo` = momento-angolare (asse x verso il pianeta lungo la direzione media, polo lungo il polo dell'orbita media); Iperione `fisso`, `indicativo` = true (rotazione caotica: Wisdom, Peale e Mignard 1984; Thomas et al. 2007); Imalia, Febe, Nereide, Notte, Idra, Disnomia `fisso` senza rotazione rappresentata.
- `epsModelloCostante` = null: la serie è in `reliability-sats.json`.

Frammento `scripts/pipeline/out/reliability-sats.json`: 712 intervalli da T0, di 7 305 d fino al 12/9/1980 e di 456,5625 d (1,25 anni) dopo (`common/affidabilita.py`); per intervallo, log10 del massimo di ε_modello in [nodo, nodo successivo): massimo di ε_adattamento ⊕ ε_sorgente sui record (con raccordo) che intersecano l'intervallo, combinato con ε_estrapolazione all'estremo più lontano dall'arco. `formaDeterminata` e `datiPresenti` veri ovunque (record presenti su tutto l'intervallo, forma dell'orbita sempre nota).

## 10. Runtime

- `leggiSatelliti(buf)` (`src/data/satsReader.ts`): verifica di intestazione (magic `SSSATS01`, versione, tipo 2, dimensione), voci ordinate, record nel file e disgiunti, K ≤ 6, riservati nulli, valori finiti, e ∈ [0, 1), tan(i/2) > 0, record contigui che coprono il nucleo del blocco. Valori dei record come viste sul buffer.
- `FileSatelliti.valutaF(ssid, frequenze, t, out)`: stato nel sistema F con raccordo; esiti `fuori-copertura` fuori dal nucleo, `non-determinabile` per satellite assente; `out` non modificato se l'esito non è `ok`.
- `EffemeridiSatelliti` (`src/ephem/satellites.ts`), costruita con `configDaCatalogo(catalogo)` (R_F, ν_k, GM, primario, `centro`; `pianoSecolare` con i coefficienti WGCCRE del primario e gli intervalli delle fonti `secolare` se `pianoSegueEquatore`): `carica(buf)`, `aggiungi`, `rimuovi`, `pronto(jd)`, `statoPlanetocentrico(ssid, jd, out)` (eclittica J2000, km e km/s, rispetto al centro del primario), `planetCenterOffset(ssidPianeta, jd, out)` (r_centro - r_bar, § 7.3.5), `orbitAt(ssid, jd, out)` (ellisse del record nell'eclittica J2000: q, e, i, nodo, argomento del pericentro, anomalia vera), `matriceF(ssid, jd, out)` (F alla data → eclittica J2000: Q(t)·R_F nei record secolari dei satelliti regolari, R_F altrove; usata anche per l'orientamento dei satelliti sincroni e per gli elementi della scheda). Riferimento Python con le stesse regole: `sats/riferimento.py` (`PianoSecolare`, `rotazione_minima`).
- Centro del pianeta: r_centro - r_bar = -(Σ_p GM·ρ + Σ_b GM·ρ_b)/(GM_sistema - Σ_b GM), con ρ planetocentriche dei satelliti modellati rispetto al centro, ρ_b dei satelliti modellati rispetto al baricentro (Notte, Idra) e GM_sistema di DE441. Eris: scarto nullo (GM del sistema non in DE441; il rapporto di massa con Disnomia non è noto).
- Composizione per il servizio delle effemeridi: r_centro = r_bar + scarto (r_bar da `planets.ts`); r_satellite = r_centro + ρ. Disnomia: Eris dai piccoli corpi.
- Nessuna allocazione nella valutazione (memoria di lavoro di modulo); mai estrapolazione: fuori dai record del file caricato l'esito non è `ok`.
- Tempo misurato (Node 22, 13 file caricati, 20 000 frame consecutivi a passo 0,37 d): 29 stati planetocentrici e 6 centri dei pianeti in 37-38 µs per frame attorno al 2000, 31-33 µs attorno al 1600, 21 µs attorno al -1975 (record secolari; due esecuzioni).

## 11. Riproducibilità

Da `scripts/pipeline/` con `.venv/bin/python satellites.py <comando>`, nell'ordine: `campiona`, `sistemi`, `scelte`, `lunghi`, `spike`, `record`, `record-lunghi`, `residui`, `genera`, `valida`, `catalogo`, `fixture` (`--offline` per `valida` e `catalogo`: solo risposte congelate e cache). `ricalcola-lunghi` ripete i residui e le epoche di validazione delle zone lunghe scaricando di nuovo i kernel.

- Risultati intermedi in `.cache/sats/`: `campioni/` (npz), `sistemi.json`, `scelte/<slug>.json`, `confronto-lunghi.json`, `record/<slug>.json` (record, diagnostica, residui, secolare, ε_sorgente; scrittura atomica, ripresa per satellite).
- Semi: campioni 20261019 (§ 2); epoche Horizons 20261020 + ssid; fixture 20261021.
- Un thread per processo (`OMP_NUM_THREADS=1`).
- Test: `scripts/pipeline/tests/test_sat_modello.py`, `test_sat_formato.py`, `test_sat_dati.py`, `test_sat_uscite.py` (pytest); `tests/ephem/satellites.test.ts`, `tests/ui/schedaPianoF.test.ts` (Vitest).

## 12. Limiti noti

- Polo di F fisso per satellite nei record da SPK: tan(i/2) costante e Ω lineare non rappresentano più componenti di precessione del piano né la deriva del piano di Laplace con l'equatore del pianeta. L'errore fuori dal piano cresce allontanandosi dall'arco su cui è stimato F (Fobos: 1 246″ nel primo record della finestra, 1599-1609; 211-240″ attorno al 2000). Fobos, Deimos, Mimas e altri restano "buona" anche nell'arco osservativo. Rimedio possibile in una versione futura del formato: correzione (δp, δq) per record.
- Nei record secolari dei satelliti regolari F segue il polo WGCCRE del primario (§ 3.1): lo scarto tra il polo di F e il polo resta quello alla giunzione (fino a 0,94°, Deimos). Fuori dal 1600-2121 il polo del primario è estrapolato e indicativo (§ 7.7): il piano dell'orbita è coerente con l'equatore disegnato, con la stessa incertezza. La rotazione minima conserva la direzione dello scarto, mentre il piano di Laplace di Deimos, Callisto, Titano e Iperione è inclinato verso l'orbita del pianeta. Tritone, Proteo, Giapeto e gli irregolari mantengono F fisso: per Proteo lo scarto massimo tra il polo dell'orbita osculante e il polo di Nettuno è 1,05° nei record secolari, 0,57° nella finestra 1600-2121.
- ε_estrapolazione segue I12 (σ_ṅ = 1·10⁻⁹·n anno⁻¹, Fobos escluso) con τ dall'arco osservativo anche dentro le finestre dei kernel: per i satelliti interni il termine quadratico domina già a pochi secoli dall'arco (Io: 3,3° nel 1601). Fobos, con σ_ṅ di MAR099, è "approssimata" dal 1600 al 1760 (fino a 5,1°) e "buona" dal 1760 al 2120.
- I kernel lunghi di Urano (URA111) differiscono dalla soluzione moderna URA182 fino a 16 344 km (Ariel) nella sovrapposizione 1600-2399: il salto al 1600 è assorbito dal raccordo e ε_sorgente lo riporta su tutta la zona lunga.
- Nereide usa NEP105 come da tabella del § 7.5.1, mentre Horizons usa NEP098 (differenza misurata 138″ nel 1900-2100).
- Disnomia: lo scarto del centro di Eris dal baricentro non è modellato (rapporto di massa non noto).

## 13. Fonti

- NAIF, SPK dei satelliti: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/ (`aa_summaries.txt` e aree commenti congelati in `raw/sats/`); JPL SSD, "Planetary Satellite Ephemerides" (https://ssd.jpl.nasa.gov/sats/ephem/) e "Planetary Satellite Physical Parameters" (https://ssd.jpl.nasa.gov/sats/phys_par/), pagine congelate in `raw/sats/`.
- Soluzioni: Jacobson, R. A. (2022), AJ 164:199 (SAT441); Jacobson, R. A., Park, R. S. (2025), AJ 169:65 (URA182); Brozović, M., Jacobson, R. A. (2024), AJ 167:256 (PLU060); Jacobson, R. A. (2009), AJ 137:4322 (Nettuno); Brozović, M., Jacobson, R. A., Park, R. S. (2025), "Revised Ephemerides of the Martian Satellites, Phobos and Deimos", AJ (MAR099); JUP365, JUP347, NEP105 (Jacobson 2021, 2025, 2024) e NEP097, NEP098 (JPL SSD 2020, 2026): comunicazioni a Horizons/NAIF citate dalla pagina JPL e dalle aree commenti dei kernel.
- Park, R. S. et al. (2021), AJ 161:105 (DE440/DE441: GM dei sistemi).
- Holler, B. J., Grundy, W. M., Buie, M. W., Noll, K. S. (2021), Icarus 355, 114130, doi:10.1016/j.icarus.2020.114130 (Disnomia).
- Brown, M. E., Butler, B. J. (2023), The Planetary Science Journal 4:193, doi:10.3847/PSJ/ace52a (raggio di Disnomia, § 2.3).
- Broucke, R. A., Cefola, P. J. (1972), Celestial Mechanics 5, 303 (elementi equinoziali).
- Archinal, B. A. et al. (2018), Celest. Mech. Dyn. Astr. 130:22 (poli di rotazione dei pianeti).
- Levenberg, K. (1944), Q. Appl. Math. 2, 164; Marquardt, D. W. (1963), J. SIAM 11, 431; Nielsen, H. B. (1999), IMM-REP-1999-05, DTU (smorzamento).
- Roberts, D. H., Lehár, J., Dreher, J. W. (1987), AJ 93, 968 (CLEAN).
- Wisdom, J., Peale, S. J., Mignard, F. (1984), Icarus 58, 137; Thomas, P. C. et al. (2007), Nature 448, 50 (Iperione).
- Tremaine, S., Touma, J., Namouni, F. (2009), AJ 137, 3706, doi:10.1088/0004-6256/137/3/3706 (piano di Laplace); Jacobson, R. A. (2009), AJ 137, 4322, doi:10.1088/0004-6256/137/5/4322 (polo di Nettuno).
- JPL Horizons API (https://ssd-api.jpl.nasa.gov/doc/horizons.html), risposte congelate in `raw/sats/horizons/`.
