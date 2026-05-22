# SEF Bridge v4.20.0 - Production Steel Fortress 🛡️

Ovaj projekat predstavlja **v4.20.0 "Steel Fortress"** — najnapredniju managed Edge infrastrukturu u Srbiji za automatizovanu sinhronizaciju B2B faktura sa državnim SEF API-jem (Sistem e-Faktura).

Sistem je dizajniran kao **autonomni, samoizlečivi organizam** koji garantuje 100% pravnu i tehničku usklađenost sa **MFIN 2026 UBL 2.1** standardima (uključujući Hotfix 3.17.1).

## 🚀 Ključni Oklopi v4.20.0

- **Master UBL Builder (v4.12.3):** Centralizovana, kompoziciona arhitektura koja garantuje striktan XSD redosled elemenata. Implementirana podrška za inteligentnu identifikaciju partija (**JBKJS** za javni sektor, **CompanyID** za privatni).
- **Vendor-Agnostic Validation (DI):** Arhitektura zasnovana na **Dependency Injection** principu. Biznis logika validatora je potpuno dekaplovana od Cloudflare-a, omogućavajući rad na bilo kom sistemu (Redis, Local JSON, SQL) kroz `KeyValueStore` interfejs.
- **Circuit Breaker & Error Shield:** Inteligentni sistem za nadzor koji detektuje zastoje na SEF-u (500/503) i automatski otvara štit kako bi zaštitio korisnički nalog od suspenzije.
- **Titanium Session Identity:** Potpuna sinhronizacija identiteta između Dashboard-a i Edge Workera, rešavajući probleme sa izolacijom tenanata i 404/400 API greškama.
- **Arhivski Bedem (Cloudflare R2):** Zakonska obaveza čuvanja originalnih UBL XML dokumenata na 10 godina je rešena kroz R2 storage sa nultim troškovima iznošenja podataka (No Egress Fees).

## 🛠️ Tehnički Stack

- **Frontend:** Nuxt 4 (SSR/SPA hibrid), Tailwind CSS v4.
- **Edge Runtime:** Cloudflare Workers (Node.js compatibility mode).
- **Skladište:** 
  - **R2 (Object Storage):** Pravni arhiv (10-godišnja trajnost).
  - **D1 (SQLite):** Centralni registar i indeks klijenata.
  - **Durable Objects (SQLite):** Izolovani, transakcioni legeri za svakog klijenta.
  - **KV (Key-Value):** Globalni šifrarnici države (Jedinice mera, Poreska pravila).
- **Monitoring:** Telegram ChatOps & Edge Alert (Llama-3 8B analiza grešaka).

## 📐 Vendor-Agnostic Arhitektura (DI)

Sistem više nema "vendor lock-in" za Cloudflare KV. Validator koristi apstrakciju:

```typescript
export interface KeyValueStore {
  get(key: string): Promise<any>;
}

// Upotreba u bilo kom okruženju:
await SefLiveValidator.validateUnitMeasure("H87", mockStore || cfStore || redisStore);
```

## 🛡️ Bezbednosni Mandat

- **Zero-Latency Caching:** Validator koristi 5-minutni in-memory cache za šifrarnike, čime drastično ubrzava procesiranje i smanjuje troškove operacija.
- **Hardened Fallbacks:** U slučaju nedostupnosti eksternih šifrarnika, sistem koristi stroge inženjerske default-ove kako bi osigurao kontinuitet poslovanja.
- **Audit Ready:** Instant generisanje strukturisanih paketa za poresku inspekciju (`GET /api/audit/download`).

## 📦 API Reference (Statusi)

### 1. Provera Zdravlja Sistema
`GET /api/health`
- Vraća status Circuit Breaker-a, verziju sistema i stanje zakonske arhive.

### 2. Dashboard Operacije
- `GET /api/fakture`: Listanje svih dokumenata sa paginacijom.
- `GET /api/dashboard/logs`: Pregled zadnjih API grešaka iz D1 baze.
- `POST /api/fakture/sync`: Manuelna sinhronizacija statusa sa državnim SEF-om.

---
*SEF Bridge v4.20.0 - Razvijeno za nultu toleranciju na greške u kritičnoj infrastrukturi.*
