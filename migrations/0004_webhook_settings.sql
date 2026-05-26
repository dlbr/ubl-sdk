-- Migration: Webhook podešavanja za klijente
CREATE TABLE IF NOT EXISTS klijentska_podesavanja (
    pib TEXT PRIMARY KEY,
    webhook_url TEXT,
    webhook_secret TEXT,
    azurirano_u TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inicijalni podaci za testiranje ako je potrebno
INSERT OR IGNORE INTO klijentska_podesavanja (pib, webhook_url, webhook_secret)
VALUES ('100000001', 'http://localhost:8080/webhook', 'super_tajni_kljuc_123');
