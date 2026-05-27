# @dlbr/ubl-sdk
![Pipeline CI](https://github.com/dlbr/ubl-sdk/actions/workflows/publish.yml/badge.svg)
![Version](https://img.shields.io/npm/v/@dlbr/ubl-sdk?label=version)
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
import type { Invoice } from '@dlbr/ubl-sdk';

const invoiceData: Invoice = {
  id: "FKT-2026-0001",
  issueDate: "2026-05-27",
  dueDate: "2026-06-27",
  typeCode: "380",
  currency: "RSD",

  seller: {
    pib: "101134702",
    name: "Prodavac d.o.o.",
    address: "Bulevar Mihajla Pupina 6",
    city: "Beograd",
    zip: "11070",
  },

  buyer: {
    pib: "113398540",
    name: "Kupac a.d.",
    address: "Knez Mihailova 10",
    city: "Beograd",
    zip: "11000",
  },

  lines: [
    {
      description: "Konsultantske usluge - maj 2026",
      quantity: 1,
      unitCode: "HUR",
      unitPrice: 50000,
      taxRate: 20,
      taxCategory: "S20",
    },
  ],
};

try {
  // 1. Validacija
  const cleanData = MasterValidator.validate(invoiceData);

  // 2. Generisanje UBL 2.1 XML-a
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



## Razvoj i doprinosi
Ovaj projekat je open-source referentna implementacija. Doprinosi i Pull Request-ovi za nova MFIN pravila su dobrodošli. Pogledajte [CONTRIBUTING.md](CONTRIBUTING.md) za detaljnije informacije.

## 🛠 Proširivost: SchemaProvider

`@dlbr/ubl-sdk` ne pretpostavlja gde čuvate vaše XSD šeme za potrebe MFIN XSD validacije. Kroz `SchemaProvider` interfejs, lako možete implementirati sopstveni sistem skladištenja.

### Kako implementirati sopstveni Provider

Sve što treba da uradite je da implementirate interfejs `SchemaProvider`:

```typescript
import { SchemaProvider } from '@dlbr/ubl-sdk';

export class S3SchemaProvider implements SchemaProvider {
  async getSchema(path: string): Promise<string> {
    // Ovde ide vaša logika za preuzimanje iz AWS S3 bucket-a
    const response = await s3.getObject({ Bucket: 'my-schemas', Key: path }).promise();
    return response.Body.toString();
  }
}
```

### Fleksibilnost u zavisnosti od okruženja

Vaša aplikacija može dinamički da bira provajder u zavisnosti od okruženja (Production vs Local vs Cloud) koristeći **[@dlbr/ubl-sdk-providers](https://github.com/dlbr/ubl-sdk-providers)** paket:

```typescript
import { MasterValidator } from '@dlbr/ubl-sdk';
import { CloudflareKVSchemaProvider, FileSystemSchemaProvider } from '@dlbr/ubl-sdk-providers';

const provider = process.env.IS_CLOUDFLARE 
  ? new CloudflareKVSchemaProvider(env.COMPLIANCE_KV)
  : new FileSystemSchemaProvider('./dist-schemas');

// XSD Validacija (Kritična funkcionalnost za produkciju)
// Preporučujemo validaciju XML-a pre slanja na SEF kako biste sprečili odbijanje faktura.
await MasterValidator.validateAgainstXSD(xml, provider, 'maindoc/UBL-Invoice-2.1.xsd');
```

> **Pro-tip:** Validacijom fakture pre slanja drastično smanjujete broj "Rejected" statusa od strane državnog sistema.


---

## ⚖️ Pravno odricanje odgovornosti (Disclaimer)
Ovaj SDK je alat otvorenog koda namenjen programskom generisanju i lokalnoj proveri UBL XML struktura prema zvaničnim tehničkim specifikacijama Ministarstva finansija Republike Srbije (Sistem za elektronske fakture - SEF).

Biblioteka se isporučuje **„KOD KAKAV JESTE“ (AS IS)**, bez ikakvih garancija o usklađenosti sa važećim zakonima, propisima ili promenama na državnim API platformama. Autor(i) ne snose odgovornost za pravne, finansijske ili tehničke posledice koje mogu proisteći iz upotrebe ili nepravilnog generisanja XML dokumenata. Krajnji korisnik je u potpunosti odgovoran za proveru poreske i zakonske ispravnosti svake fakture pre slanja na državni portal.

