// =============================================================
// FILE: backend/controllers/authController.js
// PURPOSE: Handles user registration and login logic.
//
// THEORY (for beginners):
//   MVC Pattern: Model-View-Controller
//   Our app loosely follows MVC:
//     - Model:      Database (our SQL tables)
//     - View:       Frontend HTML/CSS/JS
//     - Controller: THIS FILE — the logic between them
//
//   Routes call controller functions.
//   Controllers talk to the database and return responses.
//
//   bcrypt: A one-way hashing function for passwords.
//   It converts "mypassword123" into something like:
//   "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHG"
//
//   One-way means: you CAN'T reverse it back to "mypassword123".
//   To verify a login, we hash the entered password again and
//   compare the two hashes. We NEVER store plain-text passwords!
//
//   The "10" in bcrypt is the "cost factor" — higher = slower
//   (but safer). 10 is the standard recommended value.
// =============================================================

const bcrypt = require('bcryptjs');
const db     = require('../config/database');
const { generateToken } = require('../middleware/auth');

// -------------------------------------------------------
// register: POST /api/auth/register
// Creates a new user account.
// -------------------------------------------------------
const register = async (req, res) => {
  try {
    // req.body is the JSON data sent by the client
    // The validate middleware already cleaned and validated it
    const { username, email, password, display_name } = req.body;
    
    // ---- Step 1: Check if username/email already taken ----
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUser.rows.length > 0) {
      // Determine if it's the email or username that's taken
      const existing = await db.query(
        'SELECT email, username FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );
      
      const row = existing.rows[0];
      if (row.email === email) {
        return res.status(409).json({ error: 'This email is already registered.' });
      }
      return res.status(409).json({ error: 'This username is already taken.' });
    }
    
    // ---- Step 2: Hash the password ----
    // bcrypt.hash(plainText, saltRounds)
    // "salt" is random data added before hashing to prevent
    // "rainbow table attacks" (precomputed hash lookups)
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    // ---- Step 3: Insert user into database ----
    const result = await db.query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, display_name, avatar_url, created_at`,
      [
        username,
        email,
        password_hash,
        display_name || username, // Default display name to username
      ]
    );
    
    const newUser = result.rows[0];
    
    // ---- Step 4: Generate a JWT for immediate login ----
    const token = generateToken(newUser.id, newUser.username);
    
    // ---- Step 5: Send success response ----
    // HTTP 201 = "Created" (standard for successful resource creation)
    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: {
        id:           newUser.id,
        username:     newUser.username,
        email:        newUser.email,
        display_name: newUser.display_name,
        avatar_url:   newUser.avatar_url,
      },
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

// -------------------------------------------------------
// login: POST /api/auth/login
// Authenticates a user and returns a JWT.
// -------------------------------------------------------
const login = async (req, res) => {
  try {
    // FIX: the frontend sends { identifier, password } where identifier can be
    // either an email address or a username. Support both.
    const identifier = req.body.identifier || req.body.email;
    const { password } = req.body;

    // ---- Step 1: Find the user by email OR username ----
    const isEmail = identifier && identifier.includes('@');
    const result = await db.query(
      `SELECT id, username, email, password_hash, display_name, 
              avatar_url, bio, is_online
       FROM users WHERE ${isEmail ? 'email' : 'username'} = $1`,
      [identifier]
    );
    
    if (result.rows.length === 0) {
      // Use a generic error message — don't reveal whether
      // the email/username exists (security best practice)
      return res.status(401).json({ 
        error: 'Invalid email or password.' 
      });
    }
    
    const user = result.rows[0];
    
    // ---- Step 2: Compare password with stored hash ----
    // bcrypt.compare() hashes the input and compares with stored hash
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    
    // ---- Step 3: Update online status ----
    await db.query(
      'UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1',
      [user.id]
    );
    
    // ---- Step 4: Generate JWT ----
    const token = generateToken(user.id, user.username);
    
    // ---- Step 5: Return token and user data ----
    // Never return password_hash to the client!
    res.json({
      message: 'Login successful!',
      token,
      user: {
        id:           user.id,
        username:     user.username,
        email:        user.email,
        display_name: user.display_name,
        avatar_url:   user.avatar_url,
        bio:          user.bio,
      },
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

// -------------------------------------------------------
// logout: POST /api/auth/logout
// Marks the user as offline. With JWTs, "logout" on the
// server side just means updating our database status.
// The client should delete the token from localStorage.
// -------------------------------------------------------
const logout = async (req, res) => {
  try {
    // req.user is set by authenticateToken middleware
    await db.query(
      'UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1',
      [req.user.id]
    );
    
    res.json({ message: 'Logged out successfully.' });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed.' });
  }
};

// -------------------------------------------------------
// getMe: GET /api/auth/me
// Returns the currently logged-in user's profile.
// Used by the frontend to restore session on page refresh.
// -------------------------------------------------------
const getMe = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, email, display_name, avatar_url, bio, 
              is_online, last_seen, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    res.json({ user: result.rows[0] });
    
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({ error: 'Failed to get user data.' });
  }
};

module.exports = { register, login, logout, getMe };
