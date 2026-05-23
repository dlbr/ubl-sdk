# SEF Bridge - Tehnička dokumentacija (v4.20.1)

## 1. Arhitektura (ADR)
### ADR 001: Read-Model (Local-First) Storage
- **Odluka**: Korišćenje D1 baze (SQLite unutar DO) i R2 bucketa kao primarnog izvora istine.
- **Kontekst**: Eksterni SEF API ima visoku latenciju i ograničenu istoriju.
- **Posledica**: Dashboard učitava podatke iz lokalne D1 baze (<50ms), nezavisno od dostupnosti MFIN servera.

### ADR 002: Data Governance
- **Logical Partitioning**: Sistem koristi Durable Objecte za potpunu izolaciju podataka između klijenata (Multi-tenancy).
- **Audit-Ready Persistence**: Svaka faktura se nakon validacije arhivira kao Immutable Ledger (R2), osiguravajući poresku verodostojnost.

## 2. Finite State Machine (FSM)
Sistem koristi determinističke tranzicije za upravljanje životnim ciklusom fakture:

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> VALIDATED: MasterValidator
    VALIDATED --> SUBMITTED: SefClient (POST)
    SUBMITTED --> CONFIRMED: SEF API 200 OK
    CONFIRMED --> ARCHIVED: R2 Storage
    SUBMITTED --> FAILED: SEF API Error
    FAILED --> DRAFT: Retry
    ARCHIVED --> [*]
```

## 3. Compliance Matrix
| Funkcionalnost | Status | Implementacija |
| :--- | :--- | :--- |
| UBL 2.1 SrbDtExt | Stable | `SefUblBuilder` |
| Audit-Ready Persistence | Active | `R2` + `D1 Ledger` |
| Circuit Breaker | Active | `EdgeGuard.ts` |
| Normalizacija podataka | Active | `Normalizer.ts` |

## 4. Troubleshooting
| Kod Greške | Opis | Akcija |
| :--- | :--- | :--- |
| `[Shield-386]` | Neispravan avans (fali datum/PIB) | Proverite `datumUplate` i `ublExtensions`. |
| `[Shield-381]` | Neispravno odobrenje | Proverite `billingReference`. |
| `[MasterValidator]` | FATAL | Faktura neispravna (Schema/Business Rule). |

## 5. Changelog
- **v4.20.1**: Prelazak na Data Governance terminologiju.
- **v4.20.0**: Implementacija FSM modela i MasterValidator-a.
- **v4.19.0**: Implementacija Normalizer pattern-a.
- **v4.16.0**: Agresivno v1/v3 otkrivanje faktura.
- **v4.15.0**: Migracija na Read-Model arhitekturu (D1/R2).
