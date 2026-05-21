# @dlbr/sef-ubl-builder (v4.0.0) 🚧 (WIP)

Ultra-brzi, Edge-native TypeScript engine za generisanje UBL 2.1 XML dokumenata usklađenih sa **Master Specifikacijom Ministarstva finansija Republike Srbije (April 2026)**.

## 🚀 Ključne Karakteristike

- **100% Master Compliance**: Usklađen sa najnovijim tehničkim priručnikom od 30. aprila 2026.
- **Pure UN/ECE 5305 Codes**: Koristi čiste kategorije (S, AE, E, Z, R, O, N) u `<cbc:ID>` uz numeričke procente u `<cbc:Percent>` (EN 16931-1 standard).
- **Advance Liquidation Logic**: Automatsko generisanje negativnih stavki (`InvoiceLine`) za sravnjenje avansa, osiguravajući matematički integritet osnovice na SEF-u.
- **EEO/EPP Poreski JSON**: Ugrađeni builderi za Zbirnu i Pojedinačnu evidenciju PDV-a prema Pravilniku 30/2026.
- **Zero-Node Dependencies**: Dizajniran za Cloudflare Workers i V8 izolacije. Izvršavanje <1ms.

## 📦 Instalacija

```bash
npm install @dlbr/sef-ubl-builder
```

## 🛠️ Primer korišćenja

```typescript
import { SefUblBuilder } from '@dlbr/sef-ubl-builder';

// Generisanje standardne fakture (Tip 380) prema specifikaciji iz 2026.
const xml = SefUblBuilder.buildStandardna({
  broj: 'F-2026-001',
  pibProdavca: '100000001',
  pibKupca: '200000002',
  osnovica: 1000.00,
  pdv: 200.00,
  poreskaKategorija: 'S', // Čista oznaka
  pdvStopa: 20.00         // Stopa se iskazuje odvojeno
});
```

## 🛡️ Samoisceljenje (Autonomous Compliance)

Ovaj paket je jezgro našeg managed **Edge Gateway** rešenja koji koristi AI za detekciju državnih anomalija i automatsko krpljenje validacionih šema u realnom vremenu.

Za Enterprise pristup sa ugrađenim **R2 Arhivskim Bedemom** i **Edge AI Circuit Breaker-om**, posetite:
👉 [https://sef.dlbr.cloud/docs](https://sef.dlbr.cloud/docs)

## ⚖️ Licenca

MIT
