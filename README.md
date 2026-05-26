# SEF Bridge - Steel Fortress

[![Monorepo Deploy](https://github.com/dlbr/sef/actions/workflows/pipeline.yml/badge.svg)](https://github.com/dlbr/sef/actions/workflows/pipeline.yml)

**Produkcija**: [sef.dlbr.cloud](https://sef.dlbr.cloud)

Infrastrukturna platforma za automatizovanu obradu eFaktura, otpremnica i poreske usklađenosti prema srpskom zakonodavstvu (SEF/MFIN).

---

## Arhitektura

```
Browser
  └─ Nuxt 4 Worker (sef-bridge-frontend)    ← sef.dlbr.cloud
       ├─ Edge Auth (AES-256-GCM session)
       ├─ Nuxt server/api/ handlers
       └─ Catch-all proxy → Backend Worker (INTERNAL_API_KEY)
            └─ Backend Worker (sef-bridge-backend)
                 ├─ KlijentBazaObject (Durable Object / per-client SQLite)
                 ├─ REGISTAR_DB (D1 / centralni registar + FTS5)
                 ├─ PORESKI_KV (KV / kursna lista cache)
                 ├─ SEF_UBL_ARHIVA (R2 / XML arhiva 10 godina)
                 ├─ SEF_QUEUE (Queue / compliance pipeline)
                 └─ OTPREMNICA_QUEUE (Queue / eOtpremnice reconciliation)
```

## Paketi

| Paket | Opis |
|---|---|
| `packages/backend` | Cloudflare Worker — API, Durable Objects, Queue consumers |
| `packages/frontend` | Nuxt 4 app deployovana kao Cloudflare Worker |
| `packages/shared` | Zajednički servisi, šeme, validatori |
| `packages/ubl-sdk` | UBL 2.1 MFIN XML generator i validator |

## CI/CD

```
push/PR → main
  ├─ changes   (dorny/paths-filter)
  ├─ validate  (ubuntu-latest / vitest / workerd)
  ├─ deploy-backend  (needs: validate + changes.backend)
  └─ deploy-frontend (needs: validate + changes.frontend)
```

`workflow_dispatch` podržava `force_backend` i `force_frontend` za ručni deploy bez path filtera.

## Secrets (Cloudflare Workers)

| Secret | Worker | Opis |
|---|---|---|
| `SESSION_SECRET` | frontend | AES-256-GCM ključ za session seal/unseal |
| `INTERNAL_API_KEY` | frontend + backend | Shared Bearer token za service binding auth |
| `CLOUDFLARE_API_TOKEN` | CI/CD | Wrangler deploy token |
| `ADMIN_API_KEY` | backend | Admin endpoint zaštita |
| `SEF_API_URL` | backend | `https://efaktura.mfin.gov.rs` |
| `NBS_USERNAME/PASSWORD/LICENCE_ID` | backend | NBS SOAP kursna lista |

## Lokalni razvoj

```bash
pnpm install
pnpm dev           # Nuxt frontend na :3000
pnpm test          # Vitest + workerd (svi paketi)
```

Backend lokalno:
```bash
cd packages/backend
npx wrangler dev   # :8787
```

## Licenca
MIT
