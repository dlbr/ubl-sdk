# @dlbr/sef-ubl-builder (v3.0.0)

Ultra-brzi, Edge-native TypeScript engine za generisanje UBL 2.1 XML specifikacija i zakonskih poreskih evidencija (EEO/EPP) za Ministarstvo finansija Republike Srbije.

## 🚀 Karakteristike

- **100% UBL 2.1 kompatibilan**: Pokriva svih 16 zvaničnih primera (Konačne, avansne, storno, javne nabavke JBKJS/CRF, stranu valutu).
- **Poreski Vladar 2026**: Ugrađeni moduli za Zbirnu Evidenciju Obračuna (EEO - Član 4) i Evidenciju Prethodnog Poreza (EPP) prema najnovijim izmenama iz aprila 2026.
- **Zero-Node Dependencies**: Dizajniran za Cloudflare Workers i V8 izolacije (izvršavanje <1ms, nula troškova CPU kredita).
- **Defanzivna normalizacija**: Otporan na prljave podatke iz starih ERP sistema (automatsko peglanje `undefined` vrednosti).

## 📦 Instalacija

```bash
npm install @dlbr/sef-ubl-builder
```

## 💼 Komercijalni Managed API (Ključ u ruke)

Ukoliko ne želite da sami održavate infrastrukturu, brinete o čuvanju klijentskih API ključeva, hvatate državne webhook-ove sa ugrađenom idempotencijom i koristite **Poreski Grace Period do 10. u mesecu** koji štiti klijente od kazni, integrišite naš managed Edge Gateway za 5 minuta:

👉 [https://sef.dlbr.cloud/docs](https://sef.dlbr.cloud/docs)

## 🛠️ Primer korišćenja

```typescript
import { SefUblBuilder } from '@dlbr/sef-ubl-builder';

// Generisanje standardne fakture (Tip 380)
const xml = SefUblBuilder.buildStandardna({
  broj: 'F-2026-001',
  pibProdavca: '100000001',
  pibKupca: '200000002',
  osnovica: 1000.00,
  pdv: 200.00
});

// Generisanje Zbirne Evidencije Obračuna (EEO)
const eeoXml = SefUblBuilder.buildZbirniEeo({
  poreskiPeriod: '2026-05',
  osnovica20: 100000.00,
  pdv20: 20000.00,
  osnovica10: 0,
  pdv10: 0
});
```

## ⚖️ Licenca

MIT
