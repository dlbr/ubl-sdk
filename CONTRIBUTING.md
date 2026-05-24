# Doprinos SEF Bridge projektu

Hvala vam na interesovanju za SEF Bridge! Kako bismo održali integritet našeg "Steel Fortress" sistema, molimo vas da poštujete sledeća pravila prilikom doprinosa.

## 🛡️ Filozofija "Steel Fortress"
Naš sistem se oslanja na:
1. **Determinizam**: Svaki XML mora biti 100% predvidljiv.
2. **Nulta tolerancija na greške**: Svi doprinosi moraju proći kroz stroge validacione testove.
3. **Poreska sigurnost**: Svaka izmena mora biti usklađena sa MFIN tehničkim uputstvima.

## 🚀 Proces doprinosa

### 1. Radni tok (Workflow)
- **Nikada ne vršite push direktno na `main` granu.**
- Kreirajte novu granu (`feature/...` ili `fix/...`) iz `main`-a.
- Radite promene, testirajte ih lokalno, a zatim otvorite **Pull Request (PR)**.

### 2. Obavezni testovi
Vaš doprinos **neće biti prihvaćen** ako ne prolazi kroz "Ultimate Gauntlet":
- Pokrenite lokalne testove pre slanja:
  ```bash
  npm test
  ```
- Ukoliko dodajete novu funkcionalnost (npr. novi tip fakture), obavezno dodajte novi slučaj u `ultimate_gauntlet.test.ts` koristeći matrični pristup (`test.each`).

### 3. Arhitektura koda
- **SDK vs Core**: 
  - `packages/sef-ubl-builder` je javni SDK. Ovde držimo samo `SefUblBuilder` i osnovne tipove.
  - Vlasnička logika validacije (`MasterValidator`, `sbs_rules.sch`) se nalazi u `shared/compliance/` i nije predmet direktnih izmena od strane spoljnih doprinosilaca.
- **Node.js**: Koristimo Node 22+.
- **Zero-Dependency**: Težimo ka minimalnom broju zavisnosti.

## 📝 Konvencije commit-a
Pratite standarde:
- `feat:` za nove funkcionalnosti.
- `fix:` za ispravke bagova.
- `docs:` za ažuriranje dokumentacije.
- `chore:` za održavanje CI/CD pipeline-a.

## 🛡️ Bezbednost
- Nikada ne commit-ujte API ključeve ili bilo kakve osetljive podatke.
- Sve tajne (secrets) moraju biti konfigurisane u GitHub Actions.

Vaš doprinos čini SEF Bridge sigurnijim i efikasnijim za sve. Hvala vam!
