// =============================================================
// FILE: backend/middleware/validate.js
// PURPOSE: Input validation and sanitization.
//
// THEORY (for beginners):
//   NEVER trust data coming from users. Always validate and
//   sanitize it before using it.
//
//   Validation = checking that data meets our rules
//     e.g., "email must look like an email address"
//
//   Sanitization = cleaning data to remove dangerous content
//     e.g., removing <script> tags from messages (XSS prevention)
//
//   XSS (Cross-Site Scripting) = an attack where an attacker
//   injects malicious JavaScript into your app. If we store
//   "<script>steal_cookies()</script>" as a message and
//   display it to another user, their browser would run it!
//   Sanitization prevents this.
// =============================================================

const xss = require('xss'); // Library to remove XSS threats

// -------------------------------------------------------
// sanitizeString: Removes HTML/script tags from text.
// Always use this on user-provided text before storing.
// -------------------------------------------------------
const sanitizeString = (str) => {
  if (!str || typeof str !== 'string') return str;
  return xss(str.trim()); // xss() strips dangerous HTML tags
};

// -------------------------------------------------------
// validateRegister: Validates user registration data.
// Returns an array of error strings (empty if valid).
// -------------------------------------------------------
const validateRegister = (data) => {
  const errors = [];
  const { username, email, password, display_name } = data;
  
  // --- Username validation ---
  if (!username) {
    errors.push('Username is required');
  } else if (typeof username !== 'string') {
    errors.push('Username must be a string');
  } else if (username.trim().length < 3) {
    errors.push('Username must be at least 3 characters');
  } else if (username.trim().length > 30) {
    errors.push('Username must be 30 characters or less');
  } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    // Only allow letters, numbers, and underscores
    errors.push('Username can only contain letters, numbers, and underscores');
  }
  
  // --- Email validation ---
  if (!email) {
    errors.push('Email is required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // Simple regex to check email format
    errors.push('Invalid email format');
  } else if (email.length > 255) {
    errors.push('Email is too long');
  }
  
  // --- Password validation ---
  if (!password) {
    errors.push('Password is required');
  } else if (password.length < 6) {
    errors.push('Password must be at least 6 characters');
  } else if (password.length > 128) {
    errors.push('Password is too long');
  }
  
  // --- Display name (optional) ---
  if (display_name && display_name.length > 50) {
    errors.push('Display name must be 50 characters or less');
  }
  
  return errors;
};

// -------------------------------------------------------
// validateLogin: Validates login credentials.
// -------------------------------------------------------
const validateLogin = (data) => {
  const errors = [];
  // FIX: frontend sends { identifier, password } where identifier can be
  // an email address OR a username. Accept either field name.
  const identifier = data.identifier || data.email;
  const { password } = data;

  if (!identifier) errors.push('Email or username is required');
  if (!password) errors.push('Password is required');

  return errors;
};

// -------------------------------------------------------
// validateMessage: Validates a message before sending.
// -------------------------------------------------------
const validateMessage = (data) => {
  const errors = [];
  const { content, message_type } = data;
  
  const validTypes = ['text', 'image', 'video', 'file'];
  
  if (!message_type || !validTypes.includes(message_type)) {
    errors.push(`message_type must be one of: ${validTypes.join(', ')}`);
  }
  
  // Text messages must have content
  if (message_type === 'text') {
    if (!content || !content.trim()) {
      errors.push('Message content cannot be empty');
    } else if (content.length > 10000) {
      errors.push('Message is too long (max 10,000 characters)');
    }
  }
  
  return errors;
};

// -------------------------------------------------------
// Middleware factories that use the above validators
// -------------------------------------------------------

// Use as: router.post('/register', validateRequest('register'), handler)
const validateRequest = (type) => (req, res, next) => {
  let errors = [];
  
  switch (type) {
    case 'register':
      errors = validateRegister(req.body);
      break;
    case 'login':
      errors = validateLogin(req.body);
      break;
    case 'message':
      errors = validateMessage(req.body);
      break;
    default:
      break;
  }
  
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0], errors });
  }
  
  // Sanitize text fields before passing to controller
  if (req.body.content) {
    req.body.content = sanitizeString(req.body.content);
  }
  if (req.body.username) {
    req.body.username = req.body.username.trim().toLowerCase();
  }
  if (req.body.email) {
    req.body.email = req.body.email.trim().toLowerCase();
  }
  // FIX: normalize identifier (used by login) alongside the legacy email field
  if (req.body.identifier) {
    req.body.identifier = req.body.identifier.trim().toLowerCase();
  }

  next();
};

module.exports = { validateRequest, sanitizeString };
