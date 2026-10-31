# Aripi

Aplicație web responsive pentru gestionarea flotei de drone, planificarea unei zone de zbor și pregătirea unui draft AEROFOTO.

## Rulare locală

Necesită Node.js 22 sau mai nou.

```sh
npm install
npm run dev
```

Deschide adresa Vite afișată în terminal (implicit `http://localhost:5173`). Serverul tRPC pornește separat pe portul `3001`; Vite trimite automat cererile API către el.

Pentru versiunea de producție:

```sh
npm run build
npm start
```

Serverul servește interfața compilată și API-ul tRPC pe portul `3001` (sau pe portul setat prin `PORT`).

## Tehnologii și funcții

- React + TypeScript + Vite și **TanStack Router** pentru navigare.
- **tRPC** pentru API-ul tipizat de autentificare, flotă, zone ROMATSA, vreme și trafic live.
- SQLite local (`aripi.db`) pentru utilizatori, sesiuni, drone și progresul Academiei; poți schimba calea bazei de date prin `ARIPI_DATABASE_PATH`.
- Parole stocate cu salt și scrypt; sesiunile folosesc cookie HTTP-only.
- Autentificare cu e-mail și parolă. Planificarea hărții și draftul AEROFOTO rămân blocate până când utilizatorul promovează testul Academiei (minimum 8/10); verificarea este făcută și de server înainte de a livra datele ROMATSA.
- Harta Leaflet folosește dale OpenStreetMap și nu are nevoie de cheie API. Butonul „Locația mea” cere acces la locația dispozitivului doar când îl apeși. În producție, geolocația necesită HTTPS.
- Desenează dreptunghiul zonei de zbor prin tragere pe hartă; aplicația compară aria cu instantaneul GeoJSON ROMATSA.
- Plannerul cere o prognoză Open-Meteo pentru centrul zonei selectate și ora aleasă; noaptea, ceața/vizibilitatea redusă, precipitațiile sau vântul puternic blochează recomandarea de planificare. Prognoza este orientativă, nu autorizare meteo.
- Checklist-ul de pre-decolare cere verificări ROMATSA/NOTAM și de echipament; zonele CTR cer bifarea confirmării directe cu ATC. OpenSky afișează pozițiile ADS-B din raza de 15 km, cu refresh la 15 secunde și cache server-side comun; în CTR, planul rămâne blocat dacă sunt detectate aeronave, instantaneul expiră sau serviciul nu răspunde.
- OpenSky nu furnizează orare viitoare Wizz Air sau ale altor curse și nici predicții de aterizare/decolare. Un răspuns fără ținte nu dovedește că zona ori intervalul viitor sunt libere; acoperirea ADS-B poate fi incompletă. În CTR, aplicația avertizează când apare trafic detectat și păstrează confirmarea ATC obligatorie.
- Plannerul caută heliporturi și landing sites mapate în OpenStreetMap. Afișează o alertă de urgență dacă zona desenată este în CTR sau la cel mult 5 km de o locație OSM mapată; această rază este orientativă și datele OSM pot fi incomplete. Dacă serviciul OSM nu răspunde, zona heliporturilor este afișată ca necunoscută, nu ca liberă.
- Cererea de zbor poate primi statusul `APROBATĂ · DEMO`, păstrat în cont, pentru prezentarea hackathonului. Statusul este generat local de aplicație și nu reprezintă o aprobare ROMATSA, CAA, MApN sau o autorizare reală.
- „Dronele mele” permite mai multe drone și categorii (multirotor, aripă fixă, FPV, cinewhoop, alt tip), cu parametrii camerei separați pentru fiecare.
- Dashboard-ul are temă întunecată implicit, comutare la tema luminoasă, navigare fixă pentru mobil și o Academie cu ghid introductiv și test.
- Formularul AEROFOTO poate descărca un draft JSON; nu transmite și nu depune cererea.

## ROMATSA și limite

- `data/romatsa-uas-zones.json` este un instantaneu public al zonelor UAS ROMATSA, cu marcajul `2026-09-10T13:25:10.963Z`. Fișierul nu se actualizează automat și nu include NOTAM-uri curente.
- Rezultatul hărții este orientativ. Lipsa unei intersecții în acest instantaneu nu înseamnă că zborul este permis. Verifică sursele oficiale și aprobările necesare înainte de zbor.
- OpenStreetMap nu solicită o cheie API pentru afișarea hărții; datele și atribuirea OpenStreetMap rămân vizibile pe hartă.
- AEROFOTO MApN este portalul oficial pentru solicitarea avizelor de filmare, fotografiere și cartografiere aeriană. Draftul Aripi nu este depus și nu este un aviz.
- Depunerea și aprobarea reală de către MApN/CAA/ROMATSA necesită API-uri oficiale/documentate și credențiale de server; nu sunt conectate în demo. Traficul OpenSky și locațiile OpenStreetMap sunt informative și nu reprezintă autorizare.

## Date și deployment

Baza SQLite conține datele conturilor și flotei. Protejeaz-o și configurează backup-uri pentru deployment. În producție, servește aplicația exclusiv prin HTTPS, folosește o bază de date și backup-uri administrate pentru mediul ales și configurează restricții de acces și politici de retenție potrivite.
