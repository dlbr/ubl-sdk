# SEF Bridge - Steel Fortress

Infrastrukturna komponenta za determinističku sinhronizaciju i validaciju faktura prema UBL 2.1 MFIN profilu.

## 🛡️ Steel Fortress Arhitektura
SEF Bridge nije "samo" generator XML-a. To je sistem projektovan za **poreznu sigurnost i nultu toleranciju na greške**.

### Ključni inženjerski bedemi:
- **Read-Model (Local-First)**: D1 baze i R2 bucket-i osiguravaju brzu dostupnost podataka bez zavisnosti od SEF API latencije.
- **MasterValidator (Digitalni Štit)**: Troslojna validacija (Sintaksna, Poslovna, Poreska) koja blokira neispravne dokumente pre nego što napuste vašu infrastrukturu.
- **FSM (Finite State Machine)**: Determinističko upravljanje životnim ciklusom fakture (`DRAFT` → `ARCHIVED`).
- **Matrix Testing**: `ultimate_gauntlet.test.ts` matrica pokriva 12+ varijanti poreskih scenarija, osiguravajući stabilnost pri svakom `push`-u.
- **Edge-Native**: Sistem je izgrađen za Cloudflare Edge runtime bez Node.js zavisnosti (Zero-Dependency policy).

## 🚀 Compliance Matrix
| Funkcionalnost | Status | Implementacija |
| :--- | :--- | :--- |
| **UBL 2.1 SrbDtExt** | Stable | `SefUblBuilder` |
| **Audit-Ready Persistence** | Active | `R2` + `D1 Ledger` |
| **Circuit Breaker** | Active | `EdgeGuard.ts` |
| **MasterValidator** | Active | `validator.ts` |
| **Matrix Compliance** | Active | `Ultimate Gauntlet` |

## 🛠️ Razvoj
Sve promene prolaze kroz strogi CI/CD pipeline koji uključuje:
1. **Linting & Types check**
2. **Matrix testiranje** (9+ scenarija)
3. **Schematron/XSD validacija** (kroz `xmllint` pipeline)

## 📜 Licenca
MIT.
