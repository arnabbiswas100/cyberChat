require('dotenv').config();
const { pool } = require('./database');

const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(30)  UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  VARCHAR(50),
    avatar_url    TEXT,
    bio           TEXT,
    is_online     BOOLEAN DEFAULT false,
    last_seen     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_one_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant_two_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_id     UUID,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(participant_one_id, participant_two_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_type      VARCHAR(20) NOT NULL DEFAULT 'text',
    content           TEXT,
    file_url          TEXT,
    file_name         TEXT,
    file_size         BIGINT,
    file_mime_type    TEXT,
    thumbnail_url     TEXT,
    reply_to_id       UUID REFERENCES messages(id) ON DELETE SET NULL,
    is_delivered      BOOLEAN DEFAULT false,
    is_read           BOOLEAN DEFAULT false,
    read_at           TIMESTAMP WITH TIME ZONE,
    is_edited         BOOLEAN DEFAULT false,
    is_deleted_for_sender   BOOLEAN DEFAULT false,
    is_deleted_for_everyone BOOLEAN DEFAULT false,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS message_mentions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_participant_one ON conversations(participant_one_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_participant_two ON conversations(participant_two_id);
  CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_mentions_message_id ON message_mentions(message_id);
  CREATE INDEX IF NOT EXISTS idx_mentions_user_id ON message_mentions(user_id);
`;

// Exported as a function so server.js can call it on startup.
// Does NOT call pool.end() — that would kill the shared connection pool.
async function setupDatabase() {
  const client = await pool.connect();
  try {
    console.log('🚀 Running database setup...');
    await client.query(CREATE_TABLES_SQL);
    console.log('✅ Database tables ready.');
  } catch (err) {
    console.error('❌ Database setup failed:', err.message);
    throw err; // Let the caller (server.js) decide whether to crash
  } finally {
    client.release();
  }
}

// Allow standalone execution: `node backend/config/setupDatabase.js`
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('🎉 Setup complete.');
      pool.end();
      process.exit(0);
    })
    .catch(() => process.exit(1));
}

module.exports = { setupDatabase };
