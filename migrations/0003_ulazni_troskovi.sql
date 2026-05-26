-- Migration: Kreiranje tabele za ulazne troškove (Email-to-UBL/OCR)
CREATE TABLE IF NOT EXISTS ulazni_troskovi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    broj_racuna TEXT NOT NULL,
    pib_prodavca TEXT NOT NULL,
    naziv_prodavca TEXT,
    pib_kupca TEXT NOT NULL,
    iznos REAL NOT NULL,
    valuta TEXT DEFAULT 'RSD',
    tip_unosa TEXT CHECK(tip_unosa IN ('UBL_XML', 'AI_OCR')) NOT NULL,
    status TEXT CHECK(status IN ('POTREBNA_POTVRDA', 'POTVRDJENO', 'ODBACENO')) DEFAULT 'POTREBNA_POTVRDA',
    kreirano_u TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    azurirano_u TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ulazni_troskovi_pib_kupca ON ulazni_troskovi(pib_kupca);
