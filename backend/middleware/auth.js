// =============================================================
// FILE: backend/middleware/auth.js
// PURPOSE: Middleware to protect routes that require login.
//
// THEORY (for beginners):
//   JWT = JSON Web Token
//
//   After a user logs in, our server creates a JWT — a small,
//   self-contained token that proves who the user is.
//
//   A JWT looks like: xxxxx.yyyyy.zzzzz
//   It has 3 parts separated by dots:
//     1. Header:  Describes the token type and algorithm
//     2. Payload: The actual data (user ID, username, expiry)
//     3. Signature: Proves the token wasn't tampered with
//
//   The client (browser) stores this token and sends it with
//   every request in the "Authorization" HTTP header, like:
//     Authorization: Bearer xxxxx.yyyyy.zzzzz
//
//   Our middleware reads this header, verifies the signature
//   using our JWT_SECRET, and extracts the user's info.
//   If the token is invalid or expired, we return a 401 error.
//
//   This way, we never need to store sessions on the server —
//   the token itself IS the session. This is called "stateless auth".
// =============================================================

const jwt = require('jsonwebtoken');
const db  = require('../config/database');

// -------------------------------------------------------
// authenticateToken: Middleware for protected routes.
// Usage: router.get('/profile', authenticateToken, handler)
// -------------------------------------------------------
const authenticateToken = async (req, res, next) => {
  try {
    // Read the Authorization header
    // Format: "Bearer <token>"
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Get part after "Bearer "
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.' 
      });
    }
    
    // Verify and decode the token
    // jwt.verify() throws an error if the token is invalid or expired
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired. Please log in again.' });
      }
      return res.status(403).json({ error: 'Invalid token.' });
    }
    
    // Fetch the user from the database to make sure they still exist
    // (the account might have been deleted after the token was issued)
    const result = await db.query(
      'SELECT id, username, email, display_name, avatar_url, is_online FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }
    
    // Attach the user's info to the request object.
    // Route handlers can now access req.user to know who's calling.
    req.user = result.rows[0];
    
    // Call next() to move to the actual route handler
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error.' });
  }
};

// -------------------------------------------------------
// generateToken: Creates a JWT for a user after login.
// -------------------------------------------------------
const generateToken = (userId, username) => {
  // jwt.sign(payload, secret, options)
  // The payload is what's encoded inside the token.
  return jwt.sign(
    { userId, username },          // What we store in the token
    process.env.JWT_SECRET,        // Our secret key (keep this safe!)
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } // Token expires in 7 days
  );
};

// -------------------------------------------------------
// authenticateSocket: Same as above but for Socket.IO.
// WebSockets don't use HTTP headers, so tokens come in
// the connection "handshake" query or auth object.
// -------------------------------------------------------
const authenticateSocket = async (socket, next) => {
  try {
    // Socket.IO sends auth data in socket.handshake.auth
    const token = socket.handshake.auth?.token || 
                  socket.handshake.query?.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await db.query(
      'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return next(new Error('User not found'));
    }
    
    // Attach user info to the socket object
    // Socket handlers can access socket.user
    socket.user = result.rows[0];
    next(); // Allow the connection
    
  } catch (error) {
    next(new Error('Invalid or expired token'));
  }
};

module.exports = { authenticateToken, generateToken, authenticateSocket };
