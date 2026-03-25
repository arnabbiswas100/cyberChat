// =============================================================
// FILE: backend/routes/auth.js
// PURPOSE: Authentication routes.
//
// THEORY (for beginners):
//   A "route" maps a URL + HTTP method to a controller function.
//   router.post('/register') means: when a POST request comes
//   to /api/auth/register (prefix added in server.js),
//   run the validateRequest middleware, then the register controller.
// =============================================================

const express = require('express');
const router  = express.Router();
const { register, login, logout, getMe } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { validateRequest }   = require('../middleware/validate');

// POST /api/auth/register
router.post('/register', validateRequest('register'), register);

// POST /api/auth/login
router.post('/login', validateRequest('login'), login);

// POST /api/auth/logout  (requires login)
router.post('/logout', authenticateToken, logout);

// GET /api/auth/me  (get current user's data — used to restore session)
router.get('/me', authenticateToken, getMe);

module.exports = router;
