-- migrations/0005_add_chat_messages.sql
-- Penambahan tabel chat_messages untuk riwayat percakapan dan kartu draft AI

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'draft_card')),
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages (user_id);

