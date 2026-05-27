# SEF Bridge

[![Pipeline](https://github.com/dlbr/sef/actions/workflows/pipeline.yml/badge.svg)](https://github.com/dlbr/sef/actions/workflows/pipeline.yml)

**Produkcija**: [sef.dlbr.cloud](https://sef.dlbr.cloud)

Platforma za automatizovanu fiskalizaciju, UBL 2.1 validaciju i kriptografsko revizorsko arhiviranje (Compliance-as-a-Service).

## Paketi

| Paket | Opis |
|---|---|
| `packages/backend` | Cloudflare Worker — API, Durable Objects, Audit Ledger |
| `packages/frontend` | Nuxt 4 aplikacija sa real-time NBS kursnom listom |
| `packages/ubl-sdk` | Core UBL 2.1 generator i validacioni motor (platform-agnostic) |
| `packages/ubl-sdk-providers` | Adapteri za validaciju (Cloudflare KV, AWS S3, Vercel Blob) |
| `packages/render-service` | Mikroservis za rendering grafike i PDF sertifikata |

## Karakteristike

- **Compliance-as-a-Service (CaaS)**: Kompletan workflow od JSON-a do "Zlatnog ZIP-a" koji sadrži XML, revizorski trag i PDF sertifikat integriteta.
- **Audit Ledger**: Kriptografski uvezan lanac revizorskih zapisa (SHA-256) koji garantuje da faktura nije menjana nakon slanja.
- **NBS API Gateway**: Programerski pristup zvaničnim NBS kursnim listama sa 10-godišnjom arhivom.
- **Zero-IO Validation**: UBL šeme su lokalno dostupne i optimizovane za ultra-brzu validaciju.
- **Automated CI/CD**: Potpuna automatizacija objavljivanja SDK paketa uz rigorozno testiranje i pokrivenost.

## NBS API (Kursna Lista)

- `GET /api/public/v1/kursna-lista` - Trenutni tiker (EUR, USD, CHF)
- `GET /api/public/v1/kursna-lista/historical?date=YYYY-MM-DD` - Arhivski podaci
- `dlbr.cloud/verify/<HASH>` - Javna verifikacija integriteta fakture

## Lokalni razvoj

```bash
pnpm install
pnpm dev           # Nuxt frontend na :3000
pnpm test          # Vitest + workerd
```

## Licenca
MIT
