export const passingScore = 8;

export const academyQuestions = [
  {
    id: "q1",
    question: "Ce verifici înainte să alegi o zonă de zbor?",
    options: [
      { id: "a", text: "Sursele oficiale actuale, restricțiile și NOTAM-urile aplicabile" },
      { id: "b", text: "Doar dacă vremea pare bună" },
      { id: "c", text: "Doar dacă harta de bază se încarcă" },
      { id: "d", text: "Nimic, dacă zborul este scurt" }
    ],
    answer: "a"
  },
  {
    id: "q2",
    question: "Harta Aripi nu arată o suprapunere ROMATSA. Ce înseamnă rezultatul?",
    options: [
      { id: "a", text: "Zborul este automat autorizat" },
      { id: "b", text: "Nu s-a găsit o intersecție în snapshot-ul local; trebuie să verifici sursele actuale" },
      { id: "c", text: "Nu există restricții în România" },
      { id: "d", text: "Poți ignora NOTAM-urile" }
    ],
    answer: "b"
  },
  {
    id: "q3",
    question: "Snapshot-ul ROMATSA din aplicație înlocuiește NOTAM-urile curente?",
    options: [
      { id: "a", text: "Da, este actualizat în timp real" },
      { id: "b", text: "Da, dacă nu apare nicio zonă pe hartă" },
      { id: "c", text: "Nu; este orientativ și nu include NOTAM-uri curente" },
      { id: "d", text: "Doar pentru zborurile de agrement" }
    ],
    answer: "c"
  },
  {
    id: "q4",
    question: "Înainte de decolare, observi că vremea sau vântul depășesc limitele dronei. Ce faci?",
    options: [
      { id: "a", text: "Decolezi și compensezi din comenzi" },
      { id: "b", text: "Zbori mai jos, fără alte verificări" },
      { id: "c", text: "Roagă pe cineva să urmărească drona" },
      { id: "d", text: "Amâni zborul și respecți limitele producătorului și condițiile aplicabile" }
    ],
    answer: "d"
  },
  {
    id: "q5",
    question: "Ce faci dacă nu poți confirma că zborul este permis în zona aleasă?",
    options: [
      { id: "a", text: "Nu decolezi până nu clarifici situația cu sursele competente" },
      { id: "b", text: "Decolezi pentru câteva minute" },
      { id: "c", text: "Te bazezi doar pe harta stradală" },
      { id: "d", text: "Zbori la altitudine maximă" }
    ],
    answer: "a"
  },
  {
    id: "q6",
    question: "Apare o intervenție de urgență în apropiere în timp ce te pregătești să zbori. Care este reacția potrivită?",
    options: [
      { id: "a", text: "Filmezi intervenția de la distanță" },
      { id: "b", text: "Eviți să interferezi și nu decolezi în zona operațiunii" },
      { id: "c", text: "Zbori deasupra echipelor ca să le vezi mai bine" },
      { id: "d", text: "Continui dacă drona este silențioasă" }
    ],
    answer: "b"
  },
  {
    id: "q7",
    question: "Cum procedezi pentru a păstra controlul și contactul vizual cu drona?",
    options: [
      { id: "a", text: "Te bazezi pe imaginea transmisă de cameră" },
      { id: "b", text: "Te îndepărtezi până când drona nu se mai vede" },
      { id: "c", text: "Menții contactul vizual direct și respecți condițiile de operare aplicabile" },
      { id: "d", text: "Zbori doar cu telefonul în buzunar" }
    ],
    answer: "c"
  },
  {
    id: "q8",
    question: "Ce faci dacă pierzi legătura cu drona?",
    options: [
      { id: "a", text: "Alergi sub dronă și continui zborul" },
      { id: "b", text: "Încerci să o recuperezi printr-o manevră bruscă, indiferent de împrejurimi" },
      { id: "c", text: "Ignori situația dacă filmarea continuă" },
      { id: "d", text: "Urmezi procedura de siguranță a dronei și protejezi persoanele și bunurile" }
    ],
    answer: "d"
  },
  {
    id: "q9",
    question: "Ce faci dacă sunt persoane neimplicate în zona de operare?",
    options: [
      { id: "a", text: "Evaluezi riscul, păstrezi distanța necesară și respecți regulile categoriei și operațiunii" },
      { id: "b", text: "Zbori deasupra lor dacă nu folosesc umbrele" },
      { id: "c", text: "Le ceri să se uite spre dronă" },
      { id: "d", text: "Continui, dacă nu se aude drona" }
    ],
    answer: "a"
  },
  {
    id: "q10",
    question: "Înainte de zbor, bateria nu permite o rezervă suficientă pentru întoarcere și aterizare sigură. Ce faci?",
    options: [
      { id: "a", text: "Decolezi și urmărești doar procentajul bateriei" },
      { id: "b", text: "Amâni zborul sau schimbi planul până poți păstra o rezervă de siguranță" },
      { id: "c", text: "Dezactivezi avertizările bateriei" },
      { id: "d", text: "Zbori mai departe pentru că bateria se recalibrează" }
    ],
    answer: "b"
  }
] as const;
