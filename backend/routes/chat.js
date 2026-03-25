// FILE: backend/routes/chat.js

const express = require('express');
const router  = express.Router();
const { getConversations, getOrCreateConversation } = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/chat/conversations
router.get('/conversations', getConversations);

// POST /api/chat/conversations
router.post('/conversations', getOrCreateConversation);

module.exports = router;
