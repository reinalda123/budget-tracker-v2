-- migrations/0002_add_auth_users.sql
-- Migrasi Cloudflare D1: Penambahan Tabel Users & Kolom user_id pada Transaksi

-- 1. Buat Tabel Users jika belum ada
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Tambahkan kolom user_id pada tabel transactions
ALTER TABLE transactions ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);

