# SEF Bridge v4.2.2 - Autonomous Resilience Tvrđava

Ovaj projekat predstavlja **v4.2.2 "Autonomous Resilience"** — najnapredniju managed Edge infrastrukturu u Srbiji za automatizovanu sinhronizaciju B2B faktura sa državnim SEF API-jem (Sistem e-Faktura).

Sistem je dizajniran kao **autonomni, samoizlečivi organizam** koji koristi Edge AI inteligenciju za preživljavanje unutar nestabilnog državnog ekosistema.

## 🚀 Ključni Oklopi v4.2.2

- **Edge AI Circuit Breaker (Llama 3 8B):** Hiper-brza klasifikacija državnih anomalija u realnom vremenu (<50ms). Ako država izbaci neprijavljeni "Hotfix", AI automatski prebacuje fakture u asinhroni Queue štit umesto odbijanja.
- **AI-Driven Self-Healing CI/CD:** Integrisani Gemini 2.5/Claude 3.5 Sonnet pajplajn koji automatski skrapuje državne PDF-ove, piše zakrpe (patching), testira kôd na Sandbox-u i vrši redeploy bez ljudske intervencije.
- **Arhivski Bedem (Cloudflare R2):** Hibridni model čuvanja. Originalni, potpisani UBL XML dokumenti se trajno i nepromenljivo zaključavaju na 10 godina (Uredba Vlade RS), dok SQLite služi za munjevitu analitiku.
- **Master Specifikacija (April 2026):** 100% usklađenost sa najnovijim tehničkim uputstvom (čiste UN/ECE 5305 kategorije, negativne linije za avansno sravnjenje).
- **Immutable Billing Ledger:** Transakcioni registar kredita sa ugrađenom idempotencijom i automatskom refundacijom za Rejected dokumente.

## 🛠️ Tehnički Stack

- **Frontend:** Nuxt 4 (SSR/SPA hibrid), Tailwind CSS.
- **Edge AI:** Workers AI (@cf/meta/llama-3-8b-instruct) na GPU infrastrukturi.
- **Skladište:** 
  - **R2 (Object Storage):** Pravni arhiv (Immutable Cold Storage).
  - **D1 (SQLite):** Centralni registar i indeks klijenata.
  - **Durable Objects (SQLite):** Izolovani transactional ledger za svakog tenanta.
- **Queue:** Cloudflare Queues za asinhroni "Compliance Buffer".
- **Monitoring:** Telegram ChatOps (interaktivno upravljanje sistemom sa telefona).

## 🛡️ Bezbednosni Mandat

- **Zero-Latency Protection:** Svi AI procesi u realnom vremenu su asinhroni (`ctx.waitUntil`) kako bi se zadržala EDGE brzina.
- **Multi-Tenant Isolation:** Svaki PIB poseduje svoj izolovani SQLite fajl i ključeve.
- **Audit Ready:** Instant generisanje masovnih paketa za poresku inspekciju (`GET /api/v1/audit/download`).

## 📦 API Reference (Primeri)

### 1. Slanje Fakture sa AI Zaštitom
```bash
POST /api/fakture/send
X-Klijent-ID: klijent_123456789

{
  "ID": "FKT-2026-001",
  "InvoiceTypeCode": "380",
  "LegalMonetaryTotal": { "PayableAmount": 120000.00 },
  "Lines": [...]
}
```
*Ukoliko SEF vrati nepoznatu grešku, sistem vraća `202 Accepted (QUEUED_FOR_COMPLIANCE)`.*

### 2. Audit Download
```bash
GET /api/audit/download?period=2026-05
```
*Vraća strukturisani JSON manifest sa svim izvornim XML fajlovima iz R2 arhive.*

## 💼 Komercijalna Upotreba

Sistem je optimizovan za velike ERP provajdere i knjigovodstvene agencije. Za pristup master tokensima i Agency Dashboard-u, kontaktirajte tim.

---
*SEF Bridge v4.2.2 - Razvijeno za nultu toleranciju na državne greške.*
