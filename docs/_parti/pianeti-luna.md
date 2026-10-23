# Pianeti, Plutone, baricentro Terra-Luna e Luna

Riferimento: `docs/PROGETTO.md` versione 2.0, § 7.1-7.4, 7.8, 8.1-8.4, 12.3 (passi 2-3), 13 (A4, A5, A9), 14.2 (S1). Misure del 18/10/2026 con DE441 (SHA-256 in `scripts/pipeline/raw/manifest-sorgenti.json`).

## 1. Prodotti

| Percorso | Contenuto |
|----------|-----------|
| `scripts/pipeline/planets.py` | campionamento DE441, segmenti E, 13 file `planets/pKK.bin`, validazione A4, fixture, frammento di catalogo |
| `scripts/pipeline/moon.py` | serie di Meeus, catena di riferimento, stima delle correzioni, `moon.bin`, validazione A5, affidabilità, fixture |
| `public/data/v1/planets/p00.bin` … `p12.bin` | 12 file da 1 630 504 byte e `p12.bin` da 181 480 byte; totale 19 747 528 byte |
| `public/data/v1/moon.bin` | 116 632 byte: 1 214 nodi × 6 colonne × (valore, derivata) |
| `scripts/pipeline/out/catalog-planets.json` | `effemeridi`, `soluzione`, `epsModelloCostante` di Sole, pianeti, Plutone, Luna |
| `scripts/pipeline/out/reliability-moon.json` | log10 ε_modello della Luna sui 712 intervalli di `reliability.bin` (§ 8.7) |
| `scripts/pipeline/out/validazione-pianeti.json`, `validazione-luna.json`, `adattamento-luna.json`, `kappa-luna.json` | misure di validazione |
| `scripts/pipeline/raw/planets/eop20c04-estratto-a9.txt` | righe IERS EOP 20 C04 usate per ΔT nei test A9 |
| `src/ephem/planets.ts`, `src/ephem/moon.ts`, `src/data/moonReader.ts` | runtime |
| `tests/fixtures/planets/`, `tests/fixtures/moon/` | fixture binarie Float64 con descrizione JSON |

## 2. Pianeti, Plutone, baricentro Terra-Luna (§ 7.3)

### 2.1 Metodo

- Corpi nei file: ssid 1, 2, 4-8 e 10 = baricentri NAIF 1, 2, 4-9; ssid 200 = baricentro Terra-Luna (NAIF 3). Stati eliocentrici (rispetto a NAIF 10) nell'eclittica J2000 da `common.de441`.
- Per blocco e corpo: un segmento E su griglia allineata a T0, aloni di 4 campioni, elementi da `common.equinoctial`, λ continua, a0 = media di a, λ0 e n da retta ai minimi quadrati, residui Float32 (`common.binio.segmento_e`).
- Continuità ai confini: il nodo t_b è comune ai blocchi k-1 e k. Nel blocco k i riferimenti a0 e λ0 sono spostati di meno di un'unità Float32 del residuo perché il campione in t_b ricostruisca in Float64 i valori a e λ del blocco k-1; h, k, p, q del nodo sono copiati dal blocco k-1. Senza raccordo l'arrotondamento Float32 indipendente di δa e δλ nei due blocchi dà salti misurati fino a 1,49 km (Plutone), 1,24 km (Saturno) e 1,22 km (Nettuno), oltre la soglia di 1 km.

### 2.2 Passi

Scansione densa dei segmenti senza raccordo: 7 punti interni per intervallo in tutti i 13 blocchi.

| Corpo | Passo | Massimo |Δr|/r | |Δr| massimo | Esito |
|-------|-------|-----------------|-------------|-------|
| Mercurio | 32 d | 2,036″ (blocco 11); > 2″ nei blocchi 1, 7, 11; ≥ 1,87″ in tutti | 542 km | tolleranza superata |
| Mercurio | 16 d | 0,614″ | 138 km | adottato |
| EMB | 32 d | 0,459″ | 328 km (288-328 km in ogni blocco) | supera 250 km |
| EMB | 16 d | 0,036″ | 25 km | adottato in tutti i blocchi |

Passi adottati: Mercurio 16 d, Venere 32 d, EMB 16 d, Marte 64 d, Giove e Saturno 256 d, Urano, Nettuno e Plutone 512 d. Scostamento dal § 7.3.3: Mercurio da 32 a 16 d in tutti i blocchi; EMB da 32 a 16 d anche nei blocchi 0-10. Gli altri passi sono quelli del § 7.3.3.

### 2.3 Criterio A4

Seme 20261101 (`planets.py valida`). "Uniformi": 2000 epoche in [T0, T_END). "Confini": 17 istanti equispaziati in [t_b - h, t_b + h] per ogni confine (inclusi T0 e T_END, solo la parte in [T0, T_END)) e l'istante immediatamente precedente t_b; 234 istanti per corpo. "Densa": 7 punti interni per intervallo in tutti i blocchi, poi 63 punti negli intervalli dei 40 campioni peggiori di ogni blocco.

| Corpo | Passo | Uniformi max (rms) | Confini max | Densa max | Densa |Δr| max | Continuità max |
|-------|-------|--------------------|-------------|-----------|----------------|----------------|
| Mercurio | 16 d | 0,471″ (0,085″) | 0,355″ | 0,615″ | 138 km | 4,7e-5 km |
| Venere | 32 d | 0,832″ (0,164″) | 0,500″ | 1,080″ | 565 km | 7,2e-5 km |
| EMB | 16 d | 0,029″ (0,005″) | 0,025″ | 0,036″ | 25 km | 9,8e-5 km |
| Marte | 64 d | 1,299″ (0,196″) | 1,020″ | 1,777″ | 1 787 km | 6,2e-5 km |
| Giove | 256 d | 1,320″ (0,444″) | 1,077″ | 1,520″ | 5 560 km | 1,6e-5 km |
| Saturno | 256 d | 0,787″ (0,168″) | 0,341″ | 1,042″ | 6 666 km | 3,0e-5 km |
| Urano | 512 d | 1,497″ (0,507″) | 1,433″ | 1,741″ | 23 976 km | 2,2e-5 km |
| Nettuno | 512 d | 1,072″ (0,339″) | 0,887″ | 1,178″ | 25 593 km | 0 |
| Plutone | 512 d | 1,421″ (0,291″) | 1,064″ | 1,535″ | 33 745 km | 0 |

EMB in km: uniformi 10,9 km (blocchi 11-12) e 20,8 km (altri); confini 6,9 e 18,3 km; densa 25,4 km. Tutte le soglie del § 7.3.4 sono rispettate. Margine minimo sulla scansione densa: Marte 11 %, Urano 13 %.

### 2.4 Contributo Float32

Confronto tra residui Float32 e Float64 negli stessi segmenti (blocchi 0, 6, 11): differenza massima 0,0065″ (Plutone), 0,0049″ (Mercurio), ≤ 0,0022″ per gli altri. Ai nodi l'errore è solo di arrotondamento: Plutone 136 km, Saturno 13 km, Urano 11 km, gli altri ≤ 6,4 km. L'errore è quindi dominato dall'interpolazione di Lagrange.

### 2.5 Effetto sul budget (§ 8.1)

| Configurazione | p00-p10 | p11 | p12 | Totale |
|----------------|---------|-----|-----|--------|
| Passi del § 7.3.3 | 1 082 152 byte | 1 356 328 byte | 151 360 byte | 13 411 360 byte |
| Passi adottati | 1 630 504 byte | 1 630 504 byte | 181 480 byte | 19 747 528 byte |

Aumento: 6,34 MB rispetto ai passi del § 7.3.3 e 5,15 MB rispetto alla stima di 14,6 MB del § 8.1 (che contava `p12` come blocco intero, mentre copre 40 145 d). Con le altre stime del § 8.1 al loro massimo (0,3 + 0,12 + 5 + 12 + 0,4 + 0,364 + 13 = 31,18 MB) il totale sarebbe 50,9 MB, oltre il limite di 48 MB. Il limite resta rispettato se satelliti, piccoli corpi e texture insieme non superano 27,1 MB (stima del § 8.1: 30 MB). Ogni file resta sotto 4 MB.

## 3. Luna (§ 7.4, spike S1)

### 3.1 Serie

- Tabelle 47.A e 47.B (60 + 60 termini), argomenti 47.1-47.6 e termini additivi di Meeus (1998, cap. 47) in `moon.py` e `moon.ts`.
- Verifica sull'esempio 47.a (1992-04-12 0h TD): argomenti L′ = 134,290182°, D = 113,842304°, M = 97,643514°, M′ = 5,150833°, F = 219,889721°, E = 1,000194; Σl = -1 127 527, Σb = -3 229 126, Σr = -16 590 875; λ = 133,162655°, β = -3,229126°, Δ = 368 409,7 km, uguali ai valori del libro alla precisione pubblicata.
- Confronto termine per termine con una trascrizione indipendente (PyMeeus 0.5.12): nessuna differenza nei 120 termini.
- Derivate analitiche di λ, β, Δ (per la velocità) verificate con differenze centrali.

### 3.2 Catena di riferimento

(λ, β, Δ) nell'eclittica e nell'equinozio medi della data → vettore → M(t) = R_x(ε0)·LTECM(t)ᵀ con `erfa.ltecm` (pipeline) e `ltecm` di `src/time/precession.ts` (runtime); matrice vettorializzata uguale bit per bit a `precession_ref.eclittica_data_a_j2000`. La velocità trascura dM/dt (circa 3 mm/s).

Senza correzioni, contro DE441 su 10 anni: 14,3″ e 11 km dal 2000, 66″ dall'anno 0, 341″ dal -2000, 1 660″ dal -5000, 7 788″ e 767 km dal -9999.

### 3.3 Correzioni degli argomenti

- Nodi t_i = T0 + i·3 652,5 d, i = 0..1213 (l'ultimo oltre T_END).
- Per ogni nodo: residui (Δλ·cos β, Δβ, ΔΔ/Δ) contro DE441 (301 rispetto a 399, trasformato nell'eclittica della data con M(t)ᵀ) su 7 305 campioni a passo 1 d in t_i ± 3 652,5 d (sfasati di 0,25 d); 12 incognite (valore e pendenza di ΔL′, ΔD, ΔM, ΔM′, ΔF, κ); Gauss-Newton con jacobiano numerico (perturbazione 1e-7), partenza dal nodo vicino, dal nodo più vicino a J2000 verso gli estremi.
- `moon.bin` memorizza valore e pendenza in ogni nodo; tra i nodi Hermite cubica (C1), con le stesse operazioni di `common.interp.hermite_cubica`.
- Residui delle finestre (`adattamento-luna.json`): massimo 20,6″ (nodo 24, anno -9759), distanza 16,4 km.
- Correzioni stimate: massimi assoluti 6 813″ (ΔL′), 7 273″ (ΔD), 1 200″ (ΔM), 4 271″ (ΔM′), 10 401″ (ΔF), tutti al -9999; κ tra 0,9834 e 1,0003.
- Intestazione di `moon.bin`: tipo 4, blocco -1, numero di voci = numero di nodi, offset delle voci = 64 (inizio del blocco t_nodo0, passo, nodi, colonne); dati dall'offset 88.

### 3.4 Fattore κ

Residui delle finestre su un nodo ogni 25 (49 nodi), senza e con κ (`kappa-luna.json`):

| Epoca | Senza κ: max (rms) | Con κ: max (rms) |
|-------|--------------------|------------------|
| -9999 | 37,8″ (12,1″) | 17,4″ (6,2″) |
| -7999 | 24,2″ (7,9″) | 14,8″ (4,9″) |
| -4999 | 16,3″ (4,1″) | 14,5″ (3,4″) |
| -1999 | 13,0″ (2,9″) | 13,0″ (2,9″) |
| 2001 | 14,6″ (2,8″) | 14,6″ (2,8″) |

Massimo sui 49 nodi: 37,8″ senza κ, 20,4″ con κ; distanza 21,7 km e 14,6 km. κ è adottato.

### 3.5 Criterio A5

Griglia completa di 0,5 d da T0 a T_END (8 853 922 istanti, nodi inclusi), `moon.py valida`:

- errore angolare geocentrico massimo 20,56″ (anno -9760), rms 3,91″;
- errore massimo sulla distanza 16,29 km (anno -5797); |Δr| massimo 35,8 km;
- velocità: scarto massimo 0,21 m/s;
- massimo per intervallo tra nodi: da 5,99″ a 20,56″, mediana 13,9″.

| Millennio (anni) | Max | rms | Distanza max |
|------------------|-----|-----|--------------|
| -10000 / -9001 | 20,6″ | 6,22″ | 15,4 km |
| -6000 / -5001 | 18,1″ | 3,70″ | 16,3 km |
| -3000 / -2001 | 17,7″ | 2,97″ | 14,0 km |
| 0 / 999 | 15,8″ | 2,78″ | 13,7 km |
| 2000 / 2121 | 12,6″ | 2,70″ | 12,9 km |

Soglie: 60″ e 50 km, rispettate. Tempo di calcolo 165 s.

### 3.6 Terra (§ 7.3.5)

r_Terra = r_EMB - r_Luna,geo/(1 + EMRAT), EMRAT di DE441. Su 20 000 epoche (seme 20261104) contro DE441 (399): 0,033″; 21,6 km nei blocchi 11-12 e 23,5 km negli altri; il contributo dell'errore lunare è al massimo 0,33 km.

### 3.7 Orientamento

Leggi di Cassini: R = M(t)·R_z(Ω + π)·R_x(I)·R_z(F), Ω = L′ - F con argomenti corretti, I = 1,543°. Colonne di R: asse x verso la Terra media (longitudine L′ + π), polo. Verifiche: ortonormalità entro 1e-13 (il bias ICRS di `ltecm` è al primo ordine), polo a 1,543° dal polo dell'eclittica della data, asse x entro 11° dalla direzione della Terra (librazione ottica, Meeus 1998, cap. 53).

## 4. Affidabilità della Luna (§ 7.8.1, I11)

ε_modello = 60″ ⊕ ½·σ_ṅ·τ², σ_ṅ = 0,2″/cy², τ in secoli giuliani da J2000; in ogni intervallo di `reliability.bin` il massimo è all'estremo più lontano da J2000. Valori: 60″ vicino a J2000 (60,0000000000002″ nell'intervallo 1999,45-2000,7; 60,0000228″ dopo il Float32 per eccesso di `reliability.bin`, negli intervalli dal 1940,7 al 2071,9), 0,400° a T0. Il valore di ogni intervallo supera 1′: la Luna non è mai "precisa".

Confronto dell'ipotesi I11:

- Williams e Boggs (2016), sommario: dn/dt = -25,97 ± 0,05″/cy² da LLR; differenza tra modelli geofisici della dissipazione e risultati LLR ≤ 1 % (circa 0,26″/cy²).
- Park et al. (2021): nessun valore esplicito di ṅ (accelerazione mareale implicita nel modello, § 3.3); DE441 senza smorzamento tra nucleo liquido e mantello, differenze lunari da DE440 inferiori a 2 m nell'arco LLR e crescenti fuori, soprattutto lungo la traccia.
- σ_ṅ = 0,2″/cy² è 4 volte l'incertezza formale e dello stesso ordine della differenza tra modelli. Con 0,26″/cy² l'errore a T0 sarebbe 0,52° invece di 0,40°: il livello resta "buona" (≤ 1°). Ipotesi mantenuta. Nessuna delle due fonti quantifica la variabilità della dissipazione mareale nell'Olocene, che resta non modellata.

Frammento: `out/reliability-moon.json` (712 intervalli; forma determinata e dati presenti ovunque).

## 5. Eventi noti (A9, parte)

Calcolati nei test Vitest con il runtime; ΔT dalla serie IERS EOP 20 C04 (TAI - UTC = 37 s): 69,362 s il 21/12/2020 (UT1 - UTC = -0,1783 s), 69,20 s l'08/04/2024 (UT1 - UTC = -0,0166 s alle 18 UT).

| Evento | Atteso | Runtime e pipeline | DE441 diretto |
|--------|--------|--------------------|---------------|
| Giove-Saturno, 21/12/2020 | 6,1′ ± 0,5′ tra 12 e 24 UT | 6,105′ alle 18:11 UT (passo 1 min) | 6,105′ alle 18:11 UT |
| Novilunio, 08/04/2024 | 18:21 UT ± 3 min | 18:21:25 UT | 18:21:25 UT |

Posizioni geometriche (I6), senza tempo luce e aberrazione.

## 6. Runtime

- `EffemeridiPianeti` (`src/ephem/planets.ts`): `carica(buf)`, `aggiungi`, `rimuovi`, `serie(k)`, `pronto(jd)`, `stato(ssidFile, jdTT, out)` con esiti `fuori-copertura` (fuori da [T0, T_END)), `caricamento` (blocco assente), `non-determinabile` (corpo assente).
- `leggiLuna(buf)` e `correzioniLuna(d, t, out, derivate)` (`src/data/moonReader.ts`); `EffemeridiLuna` (`src/ephem/moon.ts`): `statoGeocentrico(jdTT, out)`, `orientamento(jdTT, out9)`; funzioni `serieLuna`, `statoGeocentricoDaCorrezioni`, `orientamentoDaCorrezioni`, `statoTerra`.
- Nessuna allocazione nella valutazione. Tempi in Node 22: pianeta 0,34-0,41 µs, Luna geocentrica 5,9 µs, orientamento 0,47 µs.
- Runtime contro pipeline sulle fixture: pianeti ≤ 1e-12 relativo; Luna ≤ 1e-6 km e ≤ 1e-9 km/s; orientamento ≤ 1e-12.

## 7. Comandi

Da `scripts/pipeline/`:

```sh
.venv/bin/python planets.py genera     # 4 s
.venv/bin/python planets.py valida     # 18 s, out/validazione-pianeti.json
.venv/bin/python planets.py fixture
.venv/bin/python planets.py catalogo
.venv/bin/python moon.py genera        # circa 17 min, out/adattamento-luna.json
.venv/bin/python moon.py valida        # 165 s, out/validazione-luna.json
.venv/bin/python moon.py kappa
.venv/bin/python moon.py affidabilita
.venv/bin/python moon.py fixture
```

Semi: validazione dei pianeti 20261101; fixture dei pianeti 20261102; fixture della Luna 20261102 (epoche) e 20261103 (orientamenti). La rigenerazione di `planets/` e di `moon.bin` produce file identici (SHA-256).

## 8. Fonti

- Park, R. S., Folkner, W. M., Williams, J. G., Boggs, D. H. (2021), AJ 161:105, doi:10.3847/1538-3881/abd414; area commenti di `de441_part-1.bsp` (integrazione del 25/06/2020, GM, EMRAT).
- Meeus, J. (1998), Astronomical Algorithms, 2ª ed., Willmann-Bell, cap. 47 (serie lunari, esempio 47.a) e cap. 53 (librazione ottica, legge di Cassini).
- Chapront-Touzé, M., Chapront, J. (1983), A&A 124, 50; (1988), A&A 190, 342 (ELP 2000).
- Vondrák, J., Capitaine, N., Wallace, P. (2011), A&A 534, A22; corrigendum A&A 541, C1 (2012); ERFA `eraLtecm`.
- Williams, J. G., Boggs, D. H. (2016), Secular tidal changes in lunar orbit and Earth rotation, Celest. Mech. Dyn. Astr. 126, 89-129, doi:10.1007/s10569-016-9702-3.
- Broucke, R. A., Cefola, P. J. (1972), Celestial Mechanics 5, 303, doi:10.1007/BF01228432.
- IERS, EOP 20 C04, https://datacenter.iers.org/data/latestVersion/EOP_20_C04_one_file_1962-now.txt; IERS Bulletin C (TAI - UTC = 37 s dal 01/01/2017).
