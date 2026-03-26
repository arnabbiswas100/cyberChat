const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        // Railway / any provider that gives a full connection string
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      }
    : {
        // Local dev fallback — individual env vars
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME     || 'cyberchat',
        user:     process.env.DB_USER     || 'cyberchat_user',
        password: process.env.DB_PASSWORD || '',
        ssl: false,
      }
);

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL error:', err);
  process.exit(-1);
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to PostgreSQL:', err.message);
  } else {
    console.log('✅ PostgreSQL connected!');
    release();
  }
});

const query = (text, params) => pool.query(text, params);
module.exports = { query, pool };
