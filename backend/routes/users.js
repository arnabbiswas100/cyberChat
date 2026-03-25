// =============================================================
// FILE: backend/routes/users.js
// =============================================================

const express = require('express');
const router  = express.Router();
const {
  getProfile, updateProfile, updateAvatar,
  searchUsers, changePassword
} = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const { uploadAvatar, handleUploadError } = require('../middleware/upload');

// All user routes require authentication
router.use(authenticateToken);

// GET /api/users/search?q=name
router.get('/search', searchUsers);

// GET /api/users/:username
router.get('/:username', getProfile);

// PUT /api/users/profile
router.put('/profile', updateProfile);

// PUT /api/users/avatar
router.put(
  '/avatar',
  uploadAvatar.single('avatar'), // 'avatar' is the form field name
  handleUploadError,
  updateAvatar
);

// PUT /api/users/password
router.put('/password', changePassword);

module.exports = router;
