# Troubleshooting

| Kod Greške | Opis | Akcija |
| :--- | :--- | :--- |
| `[Shield-386]` | Neispravan avans (fali datum/PIB) | Proverite `datumUplate` i `ublExtensions`. |
| `[Shield-381]` | Neispravno odobrenje | Proverite `billingReference`. |
| `[MasterValidator]` | FATAL | Faktura neispravna (Schema/Business Rule). |
| `401 Unauthorized` | Sesija istekla | Proverite `__Host-sef_bridge_session` kolačić. |
| `400 SearchDateBiggerThanYesterday` | Date logic error | API zahteva datum od juče za promene. |
