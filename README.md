# @dlbr/ubl-sdk
![Builder CI](https://github.com/dlbr/ubl-sdk/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)

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

## Zašto koristiti ovaj SDK?
- **Zero-Dependency**: Nula nepotrebnih zavisnosti. Radi isključivo na čistim standardima (Web Crypto API, TextEncoder/Decoder).
- **Edge-Native**: Dizajniran za maksimalne performanse na Cloudflare Edge runtime-u (Cloudflare Workers / Pages) bez glomaznih Node.js polifila.
- **Forenzička preciznost**: Svaka greška u podacima baca jasan, deskriptivan Exception, eliminišući nejasne "400 Bad Request" greške sa državnog portala.

## Razvoj i doprinosi
Ovaj projekat je open-source referentna implementacija. Doprinosi i Pull Request-ovi za nova MFIN pravila su dobrodošli. Pogledajte [CONTRIBUTING.md](CONTRIBUTING.md) za detaljnije informacije.

---

## ⚖️ Pravno odricanje odgovornosti (Disclaimer)
Ovaj SDK je alat otvorenog koda namenjen programskom generisanju i lokalnoj proveri UBL XML struktura prema zvaničnim tehničkim specifikacijama Ministarstva finansija Republike Srbije (Sistem za elektronske fakture - SEF).

Biblioteka se isporučuje **„KOD KAKAV JESTE“ (AS IS)**, bez ikakvih garancija o usklađenosti sa važećim zakonima, propisima ili promenama na državnim API platformama. Autor(i) ne snose odgovornost za pravne, finansijske ili tehničke posledice koje mogu proisteći iz upotrebe ili nepravilnog generisanja XML dokumenata. Krajnji korisnik je u potpunosti odgovoran za proveru poreske i zakonske ispravnosti svake fakture pre slanja na državni portal.
