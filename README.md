# SEF Bridge - Cloudflare Edge Micro-SaaS

Ovaj projekat predstavlja ultra-skalabilnu, multi-tenant backend infrastrukturu za automatizovanu sinhronizaciju B2B faktura sa državnim SEF API-jem (Sistem e-Faktura Republike Srbije).

## Arhitektura

Sistem koristi **Database-per-tenant** pristup na samom Edge-u:

1.  **Centralni Registar (Cloudflare D1):** Čuva spisak klijenata i optimizovanu zastavicu `ima_aktivne_fakture` koja omogućava da Cron job budi samo one klijente koji zaista imaju dokumente na čekanju.
2.  **Klijentska Baza (Durable Objects + Native SQLite):** Svaki klijent (firma) ima svoju izolovanu SQLite bazu podataka unutar Durable Object instance. Ovde se čuvaju API ključevi, webhook konfiguracije i statusi faktura.
3.  **Pico Ruter:** Naš ultra-lagani, custom ruter upravlja HTTP zahtevima i obezbeđuje sigurnosnu izolaciju klijenata.

## Tehnički Stack

- **Ruter:** Custom Edge Router (0 dependencies)
- **Runtime:** Cloudflare Workers
- **Skladište:** 
  - Centralno: Cloudflare D1 (SQLite)
  - Tenant-level: Durable Objects with native SQLite storage
- **Jezik:** TypeScript (Stroga tipizacija)

## Autentifikacija i Sigurnost

Sistem podržava dva načina identifikacije:
1.  **Browser Sesije:** Preko kriptografski potpisanih `__Host-sef_bridge_session` kolačića.
2.  **API Pristup:** Preko `X-Klijent-ID` zaglavlja (za ERP integracije i testiranje).

### 1. Konfiguracija Klijenta
Postavlja API ključ za SEF i opcioni webhook za notifikacije.
```bash
POST /api/config
Content-Type: application/json
X-Klijent-ID: klijent_001

{
  "sef_api_key": "vaš_privatni_sef_ključ",
  "webhook_url": "https://vaš-sistem.rs/callback"
}
```

### 2. Unos Nove Fakture
Dodaje fakturu u red za čekanje. Automatski aktivira klijenta u centralnom registru.
```bash
POST /api/fakture
Content-Type: application/json
X-Klijent-ID: klijent_001

{
  "sef_id": "123456",
  "broj_fakture": "2026-0001",
  "iznos": 15000.50,
  "poziv_na_broj": "97-12345",
  "naziv_firme": "Test DOO"
}
```

### 3. Ručna Sinhronizacija
Trigeruje proveru statusa faktura za određenog klijenta odmah.
```bash
POST /api/fakture/sync
X-Klijent-ID: klijent_001
```

## Automatizacija (Cron)

Sistem je dizajniran da se pokreće automatski (npr. svakih 30 minuta) putem Cloudflare Triggers. Cron proces vrši:
1.  Batch selekciju aktivnih klijenata iz D1.
2.  Paralelno pozivanje `/sync-sef` rute unutar Durable Objects.
3.  Automatsko gašenje zastavice u D1 ako klijent više nema `Pending` faktura.

## Deployment

Projekat se postavlja koristeći Wrangler CLI:

```bash
# 1. Instalacija zavisnosti
npm install

# 2. Kreiranje D1 baze
npx wrangler d1 create sef_centralni_registar

# 3. Izvršavanje migracija
npx wrangler d1 execute sef_centralni_registar --remote --file=./schema.sql

# 4. Deploy na Cloudflare
npx wrangler deploy
```

## Bezbednost

- **Podaci:** Podaci klijenata su fizički izolovani u zasebnim SQLite fajlovima.
- **API Ključevi:** Čuvaju se isključivo unutar Durable Object-a klijenta, nisu dostupni globalno.
- **Mreža:** Komunikacija sa SEF-om se vrši direktno sa Cloudflare Edge infrastrukture.
