# Aripi

Aripi este un demo web responsive pentru gestionarea flotei de drone, învățare și planificarea unui zbor. Academia, planurile, cererile și statusurile demonstrative sunt gestionate în aplicație. Nicio cerere nu este transmisă către ROMATSA, CAA, MApN sau alte autorități.

## Rulare locală

Necesită Node.js 22 sau mai nou.

```sh
npm install
npm run dev
```

Deschide adresa Vite afișată în terminal (implicit `http://localhost:5173`). Interfața folosește API-ul tRPC de pe portul `3001`.

Pentru producție:

```sh
npm run build
npm start
```

Serverul servește interfața compilată și API-ul tRPC pe portul `3001` (sau pe portul setat prin `PORT`).

## Funcționalități și tehnologie

- React, TypeScript, Vite, TanStack Router, TanStack Query, tRPC și Express.
- SQLite local (`aripi.db`) pentru conturi, sesiuni, drone, progresul Academiei și cereri demo. Calea bazei de date poate fi schimbată cu `ARIPI_DATABASE_PATH`.
- Autentificare cu e-mail și parolă, parole stocate cu salt și scrypt și sesiuni prin cookie HTTP-only.
- Răspunsurile Academiei se salvează pe măsură ce sunt selectate; rezultatul testului rămâne asociat contului. Plannerul și formularul foto se deblochează numai după promovare (minimum 8/10).
- Flotă cu mai multe drone, categorii și parametri de cameră individuali.
- Hartă Leaflet cu dale OpenStreetMap, geolocație la cerere și desenarea zonei de zbor prin tragerea unui dreptunghi.
- Planner cu informații meteo, trafic ADS-B OpenSky și puncte de interes/heliporturi din OpenStreetMap. Noaptea, ceața/vizibilitatea redusă, vremea nefavorabilă sau datele meteo indisponibile blochează cererea demo; în CTR, trafic detectat ori indisponibilitatea verificării blochează planul.
- Checklist și avertizări demonstrative pentru zone CTR, trafic și apropierea de heliporturi.
- Formular pentru activitate foto și istoric de cereri în aplicație. Cererile primesc statusul `DEMO_APPROVED`, stocat în SQLite; acest status este generat automat pentru prezentare, nu reprezintă o aprobare oficială.
- Interfață responsive pentru mobil și desktop, cu temă întunecată și mod luminos.

## Date și limitele demo-ului

- `data/romatsa-uas-zones.json` este un instantaneu static al zonelor UAS, cu marcajul `2026-09-10T13:25:10.963Z`. Nu se actualizează automat și nu include NOTAM-uri curente. Intersecțiile afișate sunt doar orientative.
- OpenSky furnizează poziții ADS-B observate, nu orare sau predicții de zbor pentru curse viitoare. Acoperirea poate fi incompletă, iar absența țintelor nu înseamnă că zona este liberă.
- Prognoza meteo este preluată de la Open-Meteo. Hărțile folosesc dale OpenStreetMap, iar heliporturile/locurile de aterizare sunt căutate în date OSM prin Overpass. Aceste servicii furnizează informații pentru demo; aplicația nu le folosește pentru a depune cereri.
- Nici harta, nici checklistul și nici statusul `DEMO_APPROVED` nu constituie o autorizare de zbor sau aviz foto real. Cererile rămân în baza de date locală Aripi și nu sunt trimise către platforme externe.

## Date și deployment

Baza SQLite conține datele conturilor și flotei. Pentru deployment, protejeaz-o și configurează backup-uri. Servește aplicația prin HTTPS și configurează controlul accesului și retenția datelor pentru mediul ales.
