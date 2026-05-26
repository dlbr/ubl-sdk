# Doprinos @dlbr/ubl-sdk projektu

Hvala vam na interesovanju za doprinos `@dlbr/ubl-sdk` biblioteci! Molimo vas da poštujete sledeća pravila prilikom otvaranja Pull Request-ova kako bismo održali maksimalnu stabilnost i pouzdanost generatora.

## 🛡️ Filozofija "Čelične Validacije"
Naša biblioteka se oslanja na:
1. **Determinizam**: Svaki XML mora biti 100% predvidljiv i ponovljiv.
2. **Nulta tolerancija na greške**: Svi doprinosi moraju proći kroz stroge validacione testove pre nego što uđu u produkciju.
3. **Poreska usklađenost**: Svaka izmena šeme i validacije mora biti strogo usklađena sa zvaničnim tehničkim uputstvima Ministarstva finansija Republike Srbije.

## 🚀 Proces doprinosa

### 1. Radni tok (Workflow)
- **Nikada ne vršite push direktno na `main` granu.**
- Kreirajte novu granu (`feature/...` ili `fix/...`) iz `main` grane.
- Implementirajte promene, testirajte ih lokalno, a zatim otvorite **Pull Request (PR)**.

### 2. Obavezni testovi
Vaš Pull Request neće biti spojen ukoliko svi testovi ne prolaze uspešno:
- Pokrenite lokalne testove pre slanja:
  ```bash
  npm test
  ```
- Ukoliko dodajete novu funkcionalnost (npr. podršku za novi element u UBL-u ili specifično poresko izuzeće), obavezno dodajte prateće test scenarije u `test/` folderu.

### 3. Arhitektura koda
- **Zero-Dependency**: Težimo ka tome da biblioteka nema eksterne zavisnosti (osim `valibot` za JSON validaciju). Nemojte dodavati nove pakete u `dependencies` bez prethodne rasprave u Issues.
- **MasterValidator**: Izmene u validacionoj logici (`validator.ts`) moraju pratiti zvanične specifikacije e-faktura i biti potkrepljene primerima iz prakse.
- **Edge-Native**: Kod mora ostati kompatibilan sa V8 / Cloudflare Workers runtime-om. Izbegavajte korišćenje Node.js specifičnih biblioteka (poput `fs` ili `path`) unutar `src/`.

## 📝 Konvencije commit-a
Pratite standardne konvencije za naslove commit poruka:
- `feat:` za nove funkcionalnosti.
- `fix:` za ispravke bagova.
- `docs:` za ažuriranje dokumentacije.
- `chore:` za izmene build alata, TS konfiguracija ili test runner-a.

## 🛡️ Bezbednost
- Nikada ne commit-ujte API ključeve, lozinke ili osetljive lične podatke (npr. stvarne ugovore ili fakture iz produkcije). Koristite isključivo lažne generisane podatke u testovima.
- Ako uočite bezbednosni propust, molimo vas da ga prijavite direktno održavaocima projekta umesto otvaranja javnog issue-a.

Vaš doprinos čini e-fakturisanje u Srbiji bržim i sigurnijim za sve nas. Hvala vam na trudu!
