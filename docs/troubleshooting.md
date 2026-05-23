# Troubleshooting

| Kod Greške | Opis | Akcija |
| :--- | :--- | :--- |
| `[Shield-386]` | Neispravan avans (fali datum/PIB) | Proverite `datumUplate` i `ublExtensions`. |
| `[Shield-381]` | Neispravno odobrenje | Proverite `billingReference`. |
| `[MasterValidator]` | FATAL | Faktura neispravna (Schema/Business Rule). |
| `401 Unauthorized` | Sesija istekla | Proverite `__Host-sef_bridge_session` kolačić. |
| `400 SearchDateBiggerThanYesterday` | Date logic error | API zahteva datum od juče za promene. |

## External Validation Strategy
U slučaju nejasnih 400 Bad Request grešaka sa MFIN API-ja, koristite **[Ecosio UBL 2.1 Validator](https://ecosio.com/en/peppol-and-xml-document-validator/)** kao referentnu tačku.

- **Pravilo**: Obavezno odabrati Rule set: **"UBL Invoice 2.1"**.
- **Workflow**: Ako dokument prolazi Ecosio validaciju, a odbija ga MFIN API, problem je u MFIN-ovim specifičnim validacionim pravilima (Schematron), a ne u UBL sintaksi.
