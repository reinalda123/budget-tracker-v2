-- migrations/0004_add_type_to_wallets.sql
-- Penambahan kolom type pada tabel wallets untuk tipe rekening kustom / dinamis
ALTER TABLE wallets ADD COLUMN type TEXT DEFAULT 'Bank';
