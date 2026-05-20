-- Glavna tabela za klijente micro-SaaS-a
CREATE TABLE IF NOT EXISTS klijenti (
  klijent_id TEXT PRIMARY KEY,
  naziv TEXT NOT NULL,
  ima_aktivne_fakture INTEGER DEFAULT 0,
  poslednji_sync DATETIME DEFAULT '1970-01-01 00:00:00',
  kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_aktivne_fakture_sync ON klijenti(ima_aktivne_fakture, poslednji_sync);

-- SEF Registar svih kompanija
CREATE TABLE IF NOT EXISTS sef_kompanije (
    pib TEXT PRIMARY KEY,
    maticni_broj TEXT,
    naziv_firme TEXT NOT NULL,
    status TEXT,
    azurirano_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- FTS5 za munjevitu pretragu (trigram omogućava parcijalne mečeve)
CREATE VIRTUAL TABLE IF NOT EXISTS sef_kompanije_fts USING fts5(
    pib,
    naziv_firme,
    content='sef_kompanije',
    tokenize='trigram'
);

-- Sinhronizacija FTS5 indeksa preko triggera
CREATE TRIGGER IF NOT EXISTS sef_kompanije_ai AFTER INSERT ON sef_kompanije BEGIN
    INSERT INTO sef_kompanije_fts(rowid, pib, naziv_firme) VALUES (new.rowid, new.pib, new.naziv_firme);
END;

CREATE TRIGGER IF NOT EXISTS sef_kompanije_ad AFTER DELETE ON sef_kompanije BEGIN
    INSERT INTO sef_kompanije_fts(sef_kompanije_fts, rowid, pib, naziv_firme) VALUES('delete', old.rowid, old.pib, old.naziv_firme);
END;

CREATE TRIGGER IF NOT EXISTS sef_kompanije_au AFTER UPDATE ON sef_kompanije BEGIN
    INSERT INTO sef_kompanije_fts(sef_kompanije_fts, rowid, pib, naziv_firme) VALUES('delete', old.rowid, old.pib, old.naziv_firme);
    INSERT INTO sef_kompanije_fts(rowid, pib, naziv_firme) VALUES (new.rowid, new.pib, new.naziv_firme);
END;
