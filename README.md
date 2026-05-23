# SEF UBL Builder 

`SEF UBL Builder` je namenska biblioteka za generisanje UBL 2.1 XML dokumenata usklađenih sa MFIN specifikacijama za Sistem za elektronske fakture (SEF). Dizajniran za `Edge` runtime okruženja.

## Arhitektonska specifikacija

Sistem implementira kaskadnu validaciju i determinističko upravljanje stanjima fakture, osiguravajući tehničku i pravnu usklađenost.

### Ključni moduli
| Modul | Odgovornost | Status |
| :--- | :--- | :--- |
| `SefUblBuilder` | Generisanje UBL 2.1 XML-a (XSD validan) | Stabilno |
| `MasterValidator` | Biznis validacija, normalizacija podataka i sanitacija | Aktivno |
| `EdgeGuard` | Circuit Breaker (zaštita od API degradacije) | Aktivno |
| `FSM Manager` | Determinističko upravljanje životnim ciklusom | Aktivno |

## Infrastruktura
* **Runtime:** Cloudflare Workers (Node.js compatibility mode).
* **Storage:** * **D1 (SQLite):** Transakcioni registar i indeksiranje.
    * **R2 (Object Storage):** Arhiviranje XML-a (10-godišnja retencija).
    * **KV:** Distribuirani keš za šifrarnike (jedinice mere, poreske stope).
* **Integracija:** Vendor-agnostic Dependency Injection (DI) za pristup podacima.

## Implementacija (Primer)
```typescript
import { MasterValidator, SefUblBuilder } from 'sef-ubl-builder';

// 1. Sanitacija i validacija
const cleanData = MasterValidator.validate(rawInput);

// 2. XML Transformacija
const xml = SefUblBuilder.assemble(cleanData);
```

## Samoisceljenje (Autonomous Compliance)

Ovaj paket čini jezgro Edge Gateway infrastrukture koja primenjuje heurističke algoritme za detekciju API anomalija i automatsku normalizaciju šema u realnom vremenu, osiguravajući usklađenost sa SEF protokolima.

Za Enterprise pristup sa ugrađenim **R2 Arhivskim Bedemom** i **Edge AI Circuit Breaker-om**, posetite:
[https://sef.dlbr.cloud/docs](https://sef.dlbr.cloud/docs)

## ⚖️ Licenca

MIT
