-- migrations/0003_add_user_id_to_wallets_and_budgets.sql
-- Migrasi Cloudflare D1: Penambahan Kolom user_id pada Tabel Wallets dan Budgets untuk Isolasi Multi-User

ALTER TABLE wallets ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

ALTER TABLE budgets ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);

