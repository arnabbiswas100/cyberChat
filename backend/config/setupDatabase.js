// =============================================================
// FILE: backend/config/setupDatabase.js
// PURPOSE: Creates all the tables in our PostgreSQL database.
//
// THEORY (for beginners):
//   SQL (Structured Query Language) is the language used to talk
//   to relational databases like PostgreSQL.
//
//   A "table" is like a spreadsheet tab. Each table stores one
//   type of data (e.g., users, messages, conversations).
//
//   "CREATE TABLE IF NOT EXISTS" means: create the table only if
//   it doesn't already exist (safe to run multiple times).
//
//   Data types in PostgreSQL:
//     UUID        = Universally Unique ID (like a85f3b2c-...)
//     VARCHAR(n)  = Text with a maximum of n characters
//     TEXT        = Unlimited-length text
//     BOOLEAN     = true or false
//     TIMESTAMP   = A date and time
//     BIGINT      = A very large integer (we use it for file sizes)
//
//   PRIMARY KEY = The unique identifier for each row
//   REFERENCES  = A "foreign key" — links one table to another
//   ON DELETE CASCADE = If the referenced row is deleted, delete
//                       these rows too automatically
// =============================================================

require('dotenv').config();
const { pool } = require('./database');

// All our SQL CREATE TABLE statements
const CREATE_TABLES_SQL = `

  -- -------------------------------------------------------
  -- TABLE: users
  -- Stores all registered user accounts.
  -- -------------------------------------------------------
  CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique ID auto-generated
    username      VARCHAR(30)  UNIQUE NOT NULL,               -- Must be unique, max 30 chars
    email         VARCHAR(255) UNIQUE NOT NULL,               -- Must be unique
    password_hash TEXT NOT NULL,                              -- Bcrypt hash, never store plain text!
    display_name  VARCHAR(50),                                -- Optional display name
    avatar_url    TEXT,                                       -- Path to profile picture file
    bio           TEXT,                                       -- Short user bio
    is_online     BOOLEAN DEFAULT false,                      -- Online/offline status
    last_seen     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),     -- Last activity time
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),     -- Account creation time
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()      -- Last profile update
  );

  -- -------------------------------------------------------
  -- TABLE: conversations
  -- A conversation is a chat session between 2 users.
  -- -------------------------------------------------------
  CREATE TABLE IF NOT EXISTS conversations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The two participants. We always store them so that
    -- participant_one_id < participant_two_id (alphabetically by UUID).
    -- This prevents creating duplicate conversations for the same pair.
    participant_one_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant_two_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_id     UUID,                                -- Points to the most recent message
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ensure we never create two conversations for the same pair of users
    UNIQUE(participant_one_id, participant_two_id)
  );

  -- -------------------------------------------------------
  -- TABLE: messages
  -- Every single chat message sent in the application.
  -- -------------------------------------------------------
  CREATE TABLE IF NOT EXISTS messages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Content types: 'text', 'image', 'video', 'file'
    message_type      VARCHAR(20) NOT NULL DEFAULT 'text',
    
    content           TEXT,              -- The text content of the message
    
    -- For file/image/video messages:
    file_url          TEXT,              -- Path to the uploaded file
    file_name         TEXT,              -- Original filename
    file_size         BIGINT,            -- File size in bytes
    file_mime_type    TEXT,              -- e.g., 'image/jpeg', 'video/mp4'
    thumbnail_url     TEXT,              -- For videos/images: a preview thumbnail
    
    -- Reply system: if this message is a reply, store what it replies to
    reply_to_id       UUID REFERENCES messages(id) ON DELETE SET NULL,
    
    -- Delivery/read status
    is_delivered      BOOLEAN DEFAULT false,
    is_read           BOOLEAN DEFAULT false,
    read_at           TIMESTAMP WITH TIME ZONE,
    
    -- Edit/delete tracking
    is_edited         BOOLEAN DEFAULT false,
    is_deleted_for_sender     BOOLEAN DEFAULT false,  -- Sender deleted for themselves only
    is_deleted_for_everyone   BOOLEAN DEFAULT false,  -- Deleted for all participants
    
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- -------------------------------------------------------
  -- TABLE: message_mentions
  -- Stores @username mentions within messages.
  -- -------------------------------------------------------
  CREATE TABLE IF NOT EXISTS message_mentions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- -------------------------------------------------------
  -- INDEXES
  -- Indexes speed up database lookups (like a book's index).
  -- Without them, PostgreSQL reads every row to find matches.
  -- -------------------------------------------------------
  
  -- Speed up finding all messages in a conversation
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
    ON messages(conversation_id);
  
  -- Speed up finding all conversations for a user
  CREATE INDEX IF NOT EXISTS idx_conversations_participant_one 
    ON conversations(participant_one_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_participant_two 
    ON conversations(participant_two_id);
  
  -- Speed up finding messages by sender
  CREATE INDEX IF NOT EXISTS idx_messages_sender_id 
    ON messages(sender_id);

  -- Speed up sorting messages by time (DESC = newest first)
  CREATE INDEX IF NOT EXISTS idx_messages_created_at 
    ON messages(created_at DESC);

  -- Speed up mention lookups
  CREATE INDEX IF NOT EXISTS idx_mentions_message_id
    ON message_mentions(message_id);
  CREATE INDEX IF NOT EXISTS idx_mentions_user_id
    ON message_mentions(user_id);
`;

// Function to run the setup
async function setupDatabase() {
  const client = await pool.connect(); // Get a direct client for transactions
  
  try {
    console.log('🚀 Setting up CyberChat database...\n');
    
    // Execute all CREATE TABLE statements at once
    await client.query(CREATE_TABLES_SQL);
    
    console.log('✅ Tables created successfully:');
    console.log('   - users');
    console.log('   - conversations');
    console.log('   - messages');
    console.log('   - message_mentions');
    console.log('   - (all indexes created)');
    console.log('\n🎉 Database setup complete! You can now start the server.\n');
    
  } catch (err) {
    console.error('❌ Database setup failed:', err.message);
    console.error('\nCommon fixes:');
    console.error('  1. Make sure PostgreSQL is running: sudo systemctl status postgresql');
    console.error('  2. Check your .env file has the correct DB credentials');
    console.error('  3. Make sure the database exists: sudo -u postgres psql -c "\\l"');
    process.exit(1);
  } finally {
    client.release(); // Always release the client back to the pool
    pool.end();       // Close the pool (we're done with setup)
  }
}

// Run the setup function
setupDatabase();
