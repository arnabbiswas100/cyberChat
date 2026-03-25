// =============================================================
// FILE: backend/config/database.js
// PURPOSE: Connects our Node.js app to the PostgreSQL database.
//
// THEORY (for beginners):
//   A "database" is like a giant spreadsheet where we store all
//   our data permanently (users, messages, etc.).
//
//   PostgreSQL is a popular, powerful, open-source database.
//   It stores data in "tables" with rows and columns, just like
//   a spreadsheet.
//
//   To talk to PostgreSQL from Node.js, we use the "pg" library.
//   Instead of opening and closing one connection for every request
//   (which is slow), we use a "connection pool" — a set of
//   pre-opened connections that are reused. Think of it like a
//   taxi stand vs calling a taxi company each time.
// =============================================================

// Load the pg library's Pool class.
// Pool manages multiple database connections automatically.
const { Pool } = require('pg');

// Load environment variables from our .env file.
// process.env gives us access to those variables.
require('dotenv').config();

// Create a new connection pool using the settings from .env
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost', // Where PostgreSQL is running
  port:     parseInt(process.env.DB_PORT) || 5432,  // Default PostgreSQL port
  database: process.env.DB_NAME     || 'cyberchat', // Name of our database
  user:     process.env.DB_USER     || 'cyberchat_user', // DB username
  password: process.env.DB_PASSWORD || '',           // DB password
  
  // Pool settings:
  max: 20,              // Maximum 20 simultaneous connections
  idleTimeoutMillis: 30000,  // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Fail if can't connect in 2 seconds
});

// Listen for errors on idle clients (connections sitting in the pool)
// This prevents crashes from unexpected disconnects
pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle PostgreSQL client:', err);
  process.exit(-1); // Exit the app if the DB connection breaks badly
});

// Test the connection when this module is first loaded
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to PostgreSQL:', err.message);
    console.error('   Make sure PostgreSQL is running and your .env settings are correct.');
  } else {
    console.log('✅ PostgreSQL connected successfully!');
    release(); // Return this test connection back to the pool
  }
});

// Export a helper function `query` that runs SQL commands.
// Usage: const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
// The $1, $2, etc. are "parameterized queries" — they prevent SQL injection attacks.
const query = (text, params) => pool.query(text, params);

// Export the pool itself, in case we need direct access (e.g., transactions)
module.exports = { query, pool };
