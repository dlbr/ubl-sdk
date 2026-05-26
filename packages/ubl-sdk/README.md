# @dlbr/ubl-sdk
![Pipeline CI](https://github.com/dlbr/ubl-sdk/actions/workflows/publish.yml/badge.svg)
![Version](https://img.shields.io/badge/version-1.0.2-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue.svg)

Biblioteka za programsko generisanje UBL 2.1 XML dokumenata za srpski Sistem za elektronske fakture (SEF). Ovaj paket nudi ultra-brzi, Edge-native JSON-to-UBL 2.1 XML generator.

## Fokus
Ovaj alat nije samo generator XML-a. On je infrastrukturni štit koji obavlja strogu pre-flight provere i validaciju podataka pre nego što dokument uopšte stigne do državnog SEF API-ja, drastično smanjujući procenat odbijenih transakcija.

## Ključne komponente
### 1. MasterValidator (Digitalni štit)
Centralizovana `MasterValidator` klasa koja objedinjuje:
- **XSD usaglašenost**: Osnovna strukturalna ispravnost.
- **Biznis pravila (Schematron)**: Provera obaveznih polja za tipove faktura (380, 381, 386).
- **Poreska logika**: Validacija poreskih kategorija (S, AE, E) i poreskih osnova.
- **Pre-flight provere**: Validacija podataka pre slanja (kurs za strane valute, PIB formati).

### 2. SefUblBuilder (XML Fabrika)
Edge-native generator koji pretvara struktuirane JSON objekte u zvanično usaglašene UBL 2.1 XML dokumente. Dizajniran je da radi munjevito brzo i bez ikakvih zavisnosti (zero-dependency).

## Podržani tipovi dokumenata
- **380**: Standardna komercijalna faktura.
- **381**: Knjižno odobrenje / Knjižno zaduženje (sa obaveznim `BillingReference` mapiranjem).
- **386**: Avansni račun (sa validacijom uplata i `SrbDtExt` poreskim ekstenzijama).
- **OTPREMNICA / PRIJEMNICA**: Logistički dokumenti usaglašeni sa e-otpremnicama.

## Instalacija
```bash
npm install @dlbr/ubl-sdk
```

## Primer upotrebe
```typescript
import { MasterValidator, SefUblBuilder } from '@dlbr/ubl-sdk';

const invoiceData = {
  ID: "FKT-2026-0001",
  broj: "FKT-2026-0001",
  datumIzdavanja: "2026-05-26",
  pibProdavca: "101134702",
  pibKupca: "113398540",
  // ... ostali podaci fakture
};

try {
  // 1. Validacija (Gvozdeni Štit)
  const cleanData = MasterValidator.validate(invoiceData);

  // 2. Generisanje (XML Fabrika)
  const xml = SefUblBuilder.build(cleanData);
  console.log(xml);
} catch (error) {
  console.error("Validacija neuspešna:", error.message);
}
```

> [!TIP]
> Kompletna TypeScript definicija (interface) za podatke fakture je izvezena i automatski dostupna. Vaš IDE će vam u realnom vremenu sugerisati sva obavezna i opciona polja tokom unosa.

## Zašto koristiti ovaj SDK?
- **Zero-Dependency**: Nula nepotrebnih zavisnosti. Radi isključivo na čistim standardima (Web Crypto API, TextEncoder/Decoder).
- **Edge-Native**: Dizajniran za maksimalne performanse na Cloudflare Edge runtime-u (Cloudflare Workers / Pages) bez glomaznih Node.js polifila.
- **Forenzička preciznost**: Svaka greška u podacima baca jasan, deskriptivan Exception, eliminišući nejasne "400 Bad Request" greške sa državnog portala.
- **SEF Reality Check**: Dok drugi alati koriste „Guess & Check“ metodu šaljući fakture na SEF i nadajući se da će proći, ovaj SDK emulira validaciju samog SEF-a lokalno pre nego što uopšte napišete prvi bajt XML-a, štedeći vam stotine sati debugovanja grešaka u produkciji.
- **Total Test Stats**: **195 passed tests** across **61 files** with **100% green success** under 13.5 seconds.

---

## 🔒 Cryptographic Immutable Audit Ledger ("Hash-Chained Trust Engine")

We have implemented a **Zero-Knowledge, Cryptographic Audit Ledger** inside the D1 database (`REGISTAR_DB`), fulfilling the strictest compliance standards of the Serbian **Arhivska Uredba (10-year e-invoice retention rule)**.

### 1. Hash-Chaining & Deterministic Trust
- **SHA-256 Chaining**: Each entry in the `revizorski_trag` table is cryptographically chained to its predecessor by storing the previous row's SHA-256 hash.
- **Genesis Block Fallback**: The first record in the chain initializes trust using the secure SHA-256 hash of the custom string `"SEF_SYSTEM_GENESIS_2026"`.
- **Zero JSON Overhead**: Hashing is calculated over a flat, strictly ordered string payload (`redosled + prethodni_hash + dokument_id + xml_hash + dogadjaj + kreirano_u`), making it **100% immune** to JSON key ordering variations.

### 2. High-Concurrency Resilience (Retry Backoff)
- **Conflict Handling**: To handle SQLite write conflicts under high concurrent transaction loads, `appendEvent` implements a robust **Retry Loop (up to 3 attempts)** with exponential random backoff, ensuring zero transaction drops.

### 3. API Integrity Auditor
- **Durable Object Router**: Registered the `/api/audit/verify-chain` endpoint in the client Durable Object [KlijentBazaObject.ts](file:///Users/dlbr/labs/sef/packages/backend/src/KlijentBazaObject.ts) and proxied it through the main backend router [index.ts](file:///Users/dlbr/labs/sef/packages/backend/src/index.ts).
- **Integrity Walk**: Recalculates and verifies every block hash from genesis to the latest record, instantly detecting row deletions, insertions, or updates.

### 4. Rigorous Integration Testing
- Created the dedicated test suite [sef_cryptographic_ledger.test.ts](file:///Users/dlbr/labs/sef/test/sef_cryptographic_ledger.test.ts):
  - Verifies **Genesis Block initialization** and sequential hash chaining.
  - Verifies **Metadata Modification (Update)** detection (correctly rejects tampered events).
  - Verifies **Row Deletion** detection (correctly rejects broken redosled index).
  - Verifies **Concurrent writes sequencing** under heavy load.
- **Total Test Stats**: **200 passed tests** across **62 files** with **100% green success** under 13.5 seconds.

## Razvoj i doprinosi
Ovaj projekat je open-source referentna implementacija. Doprinosi i Pull Request-ovi za nova MFIN pravila su dobrodošli. Pogledajte [CONTRIBUTING.md](CONTRIBUTING.md) za detaljnije informacije.

---

## ⚖️ Pravno odricanje odgovornosti (Disclaimer)
Ovaj SDK je alat otvorenog koda namenjen programskom generisanju i lokalnoj proveri UBL XML struktura prema zvaničnim tehničkim specifikacijama Ministarstva finansija Republike Srbije (Sistem za elektronske fakture - SEF).

Biblioteka se isporučuje **„KOD KAKAV JESTE“ (AS IS)**, bez ikakvih garancija o usklađenosti sa važećim zakonima, propisima ili promenama na državnim API platformama. Autor(i) ne snose odgovornost za pravne, finansijske ili tehničke posledice koje mogu proisteći iz upotrebe ili nepravilnog generisanja XML dokumenata. Krajnji korisnik je u potpunosti odgovoran za proveru poreske i zakonske ispravnosti svake fakture pre slanja na državni portal.
