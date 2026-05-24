# UBL SDK
![Builder CI](https://github.com/dlbr/sef-ubl-builder/actions/workflows/ci.yml/badge.svg)

Biblioteka za programsko generisanje UBL 2.1 XML dokumenata za srpski Sistem za elektronske fakture (SEF). Kao `@dlbr/ubl-sdk`, ovaj paket nudi ultra-brzi, Edge-native JSON-to-UBL 2.1 XML generator.

## Fokus
Ovaj alat nije "samo" generator XML-a. On je infrastrukturni štit koji sprečava generisanje poreski neispravnih dokumenata pre nego što stignu do MFIN API-ja.

## Ključne komponente
### 1. MasterValidator (Digitalni štit)
Centralizovana `MasterValidator` klasa koja objedinjuje:
- **XSD usaglašenost**: Osnovna sintaksna validacija.
- **Biznis pravila (Schematron)**: Provera obaveznih polja za tipove faktura (380, 381, 386).
- **Poreska logika**: Validacija poreskih kategorija (S, AE, E) i poreskih osnova.
- **Pre-flight provere**: Validacija podataka pre slanja (kurs za strane valute, PIB formati).

### 2. FSM (Finite State Machine)
Podržava deterministički ciklus fakture:
`DRAFT` → `VALIDATED` → `SUBMITTED` → `CONFIRMED` → `ARCHIVED` → `FAILED`.
Sistem garantuje integritet dokumenta i sprečava zaglavljivanje u "nepoznatim" stanjima.

## Podržani tipovi dokumenata
- **380**: Standardna faktura.
- **381**: Knjižno odobrenje (sa obaveznom BillingReference logikom).
- **386**: Avansni račun (sa validacijom PaymentDueDate i SrbDtExt ekstenzije).

## Instalacija
```bash
npm install sef-ubl-builder
```

## Primer upotrebe
```typescript
import { MasterValidator, SefUblBuilder } from 'sef-ubl-builder';

const invoiceData = { /* ... */ };

// 1. Validacija (Štit)
MasterValidator.validate(invoiceData);

// 2. Generisanje (Fabrika)
const xml = SefUblBuilder.build(invoiceData);
```

## Zašto koristiti ovaj Builder?
- **Zero-Bullshit**: Nema nepotrebnih zavisnosti. Radi na čistim Web standardima (Web Crypto API, TextEncoder/Decoder).
- **Produkciono spreman**: Testiran protiv MFIN Demo okruženja kroz `shield.stress.test.ts`.
- **Edge-Native**: Dizajniran za maksimalne performanse na Cloudflare Edge runtime-u (bez Node.js polifila).
- **Forenzička preciznost**: Svaka greška u podacima baca jasan Exception, eliminisajući 400 Bad Request nejasnoće sa SEF-a.

## Razvoj
Ovaj projekat je open source referentna implementacija. Pull Request-ovi za nova MFIN pravila su dobrodošli, pod uslovom da dolaze sa pratećim testom u `test/shield.stress.test.ts`.
