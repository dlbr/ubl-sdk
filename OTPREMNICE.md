Kreiraj kompletan frontend UI modul za upravljanje eOtpremnicama i ePrijemnicama (UI Logistički Štit) koji se povezuje sa postojećim Cloudflare Workers + D1 + Durable Objects backendom (v4.49.0). UI mora biti ultra-brz, optimizovan za skladišne radnike i revizore, i podeljen na 4 ključna ekrana.

Tehnološki stek na frontendu:  Nuxt 4 , Tailwind CSS.

Logika aplikacije se oslanja na backend specifikaciju gde svaki dokument prolazi kroz asinhroni statusni krug (SENT, PENDING_PROCESSING, ACCEPTED, DISCREPANCY, CONFIRMED).

Generiši čist, modularan i produkcioni kôd za sledeće UI komponente i ekrane:

### 1. Ekran: "Izlazne otpremnice" (Prodajni logistički tok)
- Tabela sa serverskom paginacijom i filterima (Period, PIB kupca, Status).
- Statusne značke (Badges): 
  - `PENDING_PROCESSING` (Svetlo plavo sa spinovanjem - označava da je u Queue redu na backendu).
  - `SENT` (Zeleno - uspešno ispaljeno na SEF).
  - `DISCREPANCY` (Narandžasto - kupac je vratio prijemnicu sa manjkom).
- Dugme "Nova Otpremnica" koje otvara višestepenu formu (Multi-step form) sa stavkama artikala, jedinicama mere, i namenskim poljima za akciznu robu (npr. polje `exciseCategory` i unutrašnji metapodaci `itemProperties.GUSTINA`).

### 2. Ekran: "Izlazne prijemnice" (Nabavni logistički tok - Potvrda prijema)
- Pregled svih prijemnica koje je naša firma poslala dobavljačima.
- Forma za kreiranje nove Prijemnice koja se vezuje za originalni ID/broj dolazne otpremnice. 
- Polja za unos unutar stavki: `Received Quantity`, `Short Quantity` (Manjak), `Rejected Quantity` (Odbijeno), i `Reject Reason` (Razlog odbijanja). Forma mora automatski da kalkuliše razliku i vizuelno markira redove ako postoji neslaganje pre slanja na `/api/prijemnice/receive`.

### 3. Ekran: "Duboka SQL Forenzika & Dashboard" (`/api/otpremnice/reconciliation/:id`)
- Dashboard za pojedinačni logistički lanac. Na vrhu prikazati krupni "Security Badge" na osnovu backend odgovora (`statusZastite`): `SECURE 🟢`, `QUANTITY_DISCREPANCY 🟡`, ili `EXCISE_BREACH 🔴`.
- Uporedna tabela stavki (Otpremljeno vs Primljeno):
  - Kolone: Naziv artikla, Poslata količina, Primljena količina, Kvantitativni manjak.
  - Akcizni blok: Prikazati `Gustina Otprema`, `Gustina Prijem` i izračunatu `Devijacija Gustine`. Ako je devijacija veća od 0.0001, obojiti ceo red u svetlo crvenu boju (indikator razblaživanja goriva/akciznog prekršaja).

### 4. Ekran: "Lančana Verifikacija — Poreski Audit" (`/api/dokumenti/chain/:id`)
- Vizuelni hronološki grafikon (Timeline) koji rekonstruiše poreski lanac povezanih dokumenata koristeći podatke iz Recursive CTE upita baze.
- Prikazati kartice u nizu: [Izvorna Otpremnica (Status)] ---> [Prijemnica (Status)] ---> [Vezana eFaktura Tip 380 (parent_id veza)].
- Svaka kartica mora imati dugme za brzi pregled XML bloba (`xml_blob`) u formatiranom kôd-prozoru sa opcijom "Preuzmi originalni UBL XML" (u skladu sa Uredbom o čuvanju e-faktura).

Obezbedi punu TypeScript tipizaciju za sve API odgovore, Axios/Fetch klijent rute mapirane na naše backend endpointove, i implementiraj Tailwind animacije za asinhrona stanja (loading, polling). Kôd mora biti spreman za direktno ubacivanje u projekat.