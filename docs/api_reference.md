# API Reference

## Sync Engine
### POST /api/fakture/sync
- **Opis**: Pokreće sinhronizaciju (v1/v3 izvor -> D1).
- **Tranzicija**: `DRAFT` -> `VALIDATED`.
- **Response**: `{ "success": boolean, "message": string }`

## Invoice Management
### GET /api/fakture?page=1
- **Opis**: Povlači fakture iz lokalnog read-modela.
- **Parametri**: `page` (integer, default 1).
- **Response**: `{ "success": boolean, "fakture": [], "total": number }`

### POST /api/fakture/batch
- **Opis**: Batch slanje faktura.
- **Pipeline**: `Normalizer` -> `MasterValidator` -> `SefUblBuilder` -> `SefClient`.
- **Response**: `{ "success": boolean, "processed": number }`

## Audit
### GET /api/audit/download?period=2026-05
- **Opis**: Generiše JSON manifest sa XML sadržajima za poreski audit.
