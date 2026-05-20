# SEF Bridge v2.0 - Cloudflare Edge Micro-SaaS

Ovaj projekat predstavlja ultra-skalabilnu, **Unified Edge** infrastrukturu za automatizovanu sinhronizaciju B2B faktura sa državnim SEF API-jem (Sistem e-Faktura Republike Srbije). 

Sistem objedinjuje **Nuxt 3 frontend** i **Durable Object backend** u jedan jedinstveni Cloudflare Worker, eliminišući mrežne latencije i kompleksnost višestrukih servisa.

## Ključne Karakteristike v2.0

- **Unified Worker Architecture:** Frontend (Nuxt/Nitro) i Backend (Durable Objects) dele isti proces i memorijski prostor na ivici.
- **Database-per-tenant Ledger:** Svaki klijent poseduje izolovanu SQLite bazu podataka unutar Durable Object instance.
- **Forensic UBL Validation:** Strogo tipizirano parsiranje UBL 2.1 XML-a sa automatskim ispravljanjem anomalija državnog API-ja.
- **Smart Retry Engine:** Diferencijalno rukovanje greškama (503 Service Unavailable se tretira kao prolazna greška sa automatskim re-sinhronizacijom).
- **Hardened Auth Armor:** Kriptografski potpisane sesije sa punom UTF-8 podrškom i `__Host-` bezbednosnim oklopom.

## Tehnički Stack

- **Frontend:** Nuxt 3 (SSR/SPA hibrid), Tailwind CSS, Lucide Icons.
- **Ruter:** Custom ultra-lagani `Router` (0 dependencies) za API rute.
- **Skladište:** 
  - **D1 (SQLite):** Centralni registar kompanija (FTS5 pretraga) i indeks klijenata.
  - **Durable Objects (SQLite):** Izolovani ledger za svakog tenanta.
- **Runtime:** Cloudflare Workers (zadržana Node.js kompatibilnost za Buffer podršku).

## Autentifikacija i Sigurnost

1.  **Dashboard Pristup:** Isključivo preko `__Host-sef_bridge_session` kolačića.
2.  **API/ERP Integracija:** Preko `X-Klijent-ID` zaglavlja.
3.  **Admin Pristup:** Zaštićen `ADMIN_API_KEY` tajnom (Bearer Auth).

## API Reference (Primeri)

### 1. Onboarding Pretraga
Munjevita pretraga zvaničnog SEF registra (podržava PIB ili naziv firme).
```bash
GET /api/onboarding/search?q=naziv_ili_pib
```

### 2. Slanje Batch Faktura (ERP)
Asinhrono slanje velikog broja faktura. Sistem odmah vraća `202 Accepted` i nastavlja procesiranje u pozadini.
```bash
POST /api/fakture/batch
X-Klijent-ID: klijent_123456789

{
  "fakture": [
    { "ID": "INV-001", "broj_fakture": "F-01", "iznos": 1500.00 },
    ...
  ]
}
```

### 3. Populacija Registra (Admin)
Masovni uvoz svih kompanija registrovanih na SEF portalu u centralnu D1 bazu.
```bash
POST /api/admin/populate-companies
Authorization: Bearer <ADMIN_API_KEY>

{ "sef_api_key": "<VAŠ_SEF_PORTAL_KLJUČ>" }
```

## Deployment & Održavanje

### Produkciona lansiranje:

```bash
# 1. Postavljanje produkcionih tajni
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_API_KEY

# 2. Build i Deploy (Unified Worker)
npm run build && npx wrangler deploy
```

### Automatizacija:
Sistem koristi Cloudflare **Alarms** unutar Durable Object-a za garantovano procesiranje redova čekanja i **Cron Triggers** za masovnu sinhronizaciju (default: svaku noć u 02h).

## Bezbednosni Mandat

- **Izolacija:** Podaci klijenata su fizički razdvojeni. Greška na jednom klijentu ne može uticati na integritet podataka drugog klijenta.
- **Credential Protection:** SEF API ključevi nikada ne napuštaju enkriptovani storage klijenta.
- **Compliance:** Sistem je usklađen sa UBL 2.1 standardom i specifikacijama Ministarstva finansija RS.

---
*SEF Bridge v2.0 - Razvijeno za maksimalnu otpornost na Edge-u.*
