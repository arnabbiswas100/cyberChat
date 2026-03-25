// FILE: backend/routes/messages.js

const express = require('express');
const router  = express.Router();
const { getMessages, sendMessage, editMessage, deleteMessage } = require('../controllers/messageController');
const { authenticateToken } = require('../middleware/auth');
const { uploadFile, handleUploadError } = require('../middleware/upload');

router.use(authenticateToken);

// GET /api/messages/:conversationId?before=<timestamp>&limit=50
router.get('/:conversationId', getMessages);

// POST /api/messages/:conversationId  (with optional file)
router.post(
  '/:conversationId',
  uploadFile.single('file'),
  handleUploadError,
  sendMessage
);

// PUT /api/messages/:messageId
router.put('/:messageId', editMessage);

// DELETE /api/messages/:messageId
router.delete('/:messageId', deleteMessage);

module.exports = router;
