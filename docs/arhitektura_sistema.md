# SEF Bridge - Tehnička dokumentacija (v4.21.0)

## 1. Arhitektura (ADR)
### ADR 001: Read-Model (Local-First) Storage
- **Odluka**: Korišćenje D1 baze i R2 bucketa kao primarnog izvora istine.
- **Kontekst**: Eksterni SEF API ima visoku latenciju i ograničenu istoriju.
- **Posledica**: Dashboard učitava podatke iz lokalne D1 baze (<50ms), nezavisno od dostupnosti MFIN servera.

### ADR 002: Data Governance
- **Logical Partitioning**: Multi-tenant izolacija podataka putem Durable Object klasa.
- **Audit-Ready Persistence**: Fakture se arhiviraju kao Immutable Ledger (R2) nakon validacije.

## 2. Digitalni Štit (Validation Pipeline)
Sistem koristi troslojnu odbranu za osiguranje kvaliteta XML-a:

1. **MasterValidator (Business Layer)**: Normalizacija podataka i provera poslovnih pravila (tip 386/381, PIB, valute, porezi).
2. **SefUblBuilder (Transformation Layer)**: Deterministička konverzija u UBL 2.1 standard.
3. **xmllint (Structural Layer)**: XSD validacija u CI/CD pipeline-u za potvrdu sintaksne ispravnosti XML-a.

## 3. Finite State Machine (FSM)
Fakture prolaze kroz strogo definisane tranzicije:
`DRAFT` -> `VALIDATED` -> `SUBMITTED` -> `CONFIRMED` -> `ARCHIVED` -> `FAILED`.

## 4. CI/CD Compliance Matrix
| Faza | Tip | Implementacija |
| :--- | :--- | :--- |
| **Logic Check** | MasterValidator | `npm test` (vitest) |
| **Schema Check** | Structural | `xmllint` |
| **Sanity Check** | Network | `state-sandbox-ping` (non-blocking) |
| **Artifact Sync** | Compliance | `Wrangler Deploy` |

## 5. Troubleshooting
| Kod Greške | Opis | Akcija |
| :--- | :--- | :--- |
| `[Shield-386]` | Neispravan avans | Proverite `datumUplate` i `ublExtensions`. |
| `[Shield-381]` | Neispravno odobrenje | Proverite `billingReference`. |
| `[MasterValidator]` | FATAL | XML neispravan (Schema/Business Rule). |
| `401 Unauthorized` | Sesija istekla | Proverite `__Host-sef_bridge_session`. |

## 6. Changelog
- **v4.21.0**: Integracija `xmllint` u CI/CD i finalizacija MasterValidator-a.
- **v4.20.0**: Implementacija FSM modela i Data Governance terminologije.
- **v4.19.0**: Implementacija Normalizer pattern-a.
- **v4.15.0**: Migracija na Read-Model arhitekturu (D1/R2).
