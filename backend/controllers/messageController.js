// =============================================================
// FILE: backend/controllers/messageController.js
// PURPOSE: Full CRUD for messages (Create, Read, Update, Delete)
// =============================================================

const db = require('../config/database');
const { sanitizeString } = require('../middleware/validate');
const { getFileUrl, getFileCategory } = require('../middleware/upload');
const fs   = require('fs');
const path = require('path');

// -------------------------------------------------------
// Helper: Check if user is a participant in a conversation
// Returns the conversation, or throws if not authorized.
// -------------------------------------------------------
const getConversationAndVerifyAccess = async (conversationId, userId) => {
  const result = await db.query(
    `SELECT * FROM conversations 
     WHERE id = $1 
       AND (participant_one_id = $2 OR participant_two_id = $2)`,
    [conversationId, userId]
  );
  
  if (result.rows.length === 0) {
    const err = new Error('Conversation not found or access denied.');
    err.status = 403;
    throw err;
  }
  
  return result.rows[0];
};

// -------------------------------------------------------
// getMessages: GET /api/messages/:conversationId
// Returns paginated messages for a conversation.
//
// Pagination: Instead of loading ALL messages (could be
// thousands), we load them in "pages" of 50. The client
// sends a "before" timestamp to get messages older than
// the oldest one currently shown (infinite scroll).
// -------------------------------------------------------
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { before, limit = 50 } = req.query;
    
    // Verify user has access
    await getConversationAndVerifyAccess(conversationId, userId);
    
    const pageLimit = Math.min(parseInt(limit), 100); // Max 100 at once
    
    // Build query — if 'before' timestamp given, get messages before that time
    let sql, params;
    
    if (before) {
      sql = `
        SELECT 
          m.*,
          u.username    AS sender_username,
          u.display_name AS sender_display_name,
          u.avatar_url  AS sender_avatar_url,
          -- Include the replied-to message content (if any)
          rm.content    AS reply_content,
          rm.message_type AS reply_type,
          ru.username   AS reply_sender_username
        FROM messages m
        INNER JOIN users u ON m.sender_id = u.id
        LEFT JOIN messages rm ON m.reply_to_id = rm.id
        LEFT JOIN users ru ON rm.sender_id = ru.id
        WHERE m.conversation_id = $1
          AND m.created_at < $2
          AND m.is_deleted_for_everyone = false
        ORDER BY m.created_at DESC
        LIMIT $3`;
      params = [conversationId, new Date(before), pageLimit];
    } else {
      sql = `
        SELECT 
          m.*,
          u.username    AS sender_username,
          u.display_name AS sender_display_name,
          u.avatar_url  AS sender_avatar_url,
          rm.content    AS reply_content,
          rm.message_type AS reply_type,
          ru.username   AS reply_sender_username
        FROM messages m
        INNER JOIN users u ON m.sender_id = u.id
        LEFT JOIN messages rm ON m.reply_to_id = rm.id
        LEFT JOIN users ru ON rm.sender_id = ru.id
        WHERE m.conversation_id = $1
          AND m.is_deleted_for_everyone = false
        ORDER BY m.created_at DESC
        LIMIT $2`;
      params = [conversationId, pageLimit];
    }
    
    const result = await db.query(sql, params);
    
    // Messages come back newest-first from DB; reverse for display
    const messages = result.rows.reverse();
    
    // Mark messages as read (delivered by the other user)
    await db.query(
      `UPDATE messages 
       SET is_read = true, read_at = NOW()
       WHERE conversation_id = $1 
         AND sender_id != $2
         AND is_read = false`,
      [conversationId, userId]
    );
    
    res.json({
      messages,
      has_more: result.rows.length === pageLimit, // If we got full page, there may be more
    });
    
  } catch (error) {
    console.error('GetMessages error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to get messages.' });
  }
};

// -------------------------------------------------------
// sendMessage: POST /api/messages/:conversationId
// Saves a new message to the database and emits a
// real-time socket event to all conversation participants.
// -------------------------------------------------------
const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { content, message_type = 'text', reply_to_id } = req.body;
    
    // Verify access
    const conversation = await getConversationAndVerifyAccess(conversationId, userId);
    
    // For text messages, sanitize content
    const cleanContent = content ? sanitizeString(content) : null;
    
    // Handle file upload if present
    let fileUrl = null, fileName = null, fileSize = null, fileMimeType = null;
    
    if (req.file) {
      fileUrl      = getFileUrl(req.file);
      fileName     = req.file.originalname;
      fileSize     = req.file.size;
      fileMimeType = req.file.mimetype;
    }
    
    // Validate that message has content
    if (message_type === 'text' && !cleanContent) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }
    if (message_type !== 'text' && !fileUrl) {
      return res.status(400).json({ error: 'File upload required for this message type.' });
    }
    
    // Validate reply_to_id if provided
    if (reply_to_id) {
      const replyCheck = await db.query(
        'SELECT id FROM messages WHERE id = $1 AND conversation_id = $2',
        [reply_to_id, conversationId]
      );
      if (replyCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Reply target message not found.' });
      }
    }
    
    // Insert the message
    const msgResult = await db.query(
      `INSERT INTO messages 
        (conversation_id, sender_id, message_type, content, 
         file_url, file_name, file_size, file_mime_type, reply_to_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        conversationId, userId, message_type, cleanContent,
        fileUrl, fileName, fileSize, fileMimeType,
        reply_to_id || null,
      ]
    );
    
    const message = msgResult.rows[0];
    
    // Update the conversation's last_message_id and updated_at
    await db.query(
      'UPDATE conversations SET last_message_id = $1, updated_at = NOW() WHERE id = $2',
      [message.id, conversationId]
    );
    
    // Process @mentions if any
    if (cleanContent) {
      const mentions = cleanContent.match(/@([a-zA-Z0-9_]+)/g);
      if (mentions) {
        for (const mention of mentions) {
          const mentionedUsername = mention.slice(1); // Remove the @
          const mentionedUser = await db.query(
            'SELECT id FROM users WHERE username = $1',
            [mentionedUsername.toLowerCase()]
          );
          if (mentionedUser.rows.length > 0) {
            await db.query(
              'INSERT INTO message_mentions (message_id, user_id) VALUES ($1, $2)',
              [message.id, mentionedUser.rows[0].id]
            );
          }
        }
      }
    }
    
    // Fetch the full message with sender info for the response
    const fullMsgResult = await db.query(
      `SELECT m.*, 
              u.username AS sender_username,
              u.display_name AS sender_display_name,
              u.avatar_url AS sender_avatar_url,
              rm.content AS reply_content,
              rm.message_type AS reply_type,
              ru.username AS reply_sender_username
       FROM messages m
       INNER JOIN users u ON m.sender_id = u.id
       LEFT JOIN messages rm ON m.reply_to_id = rm.id
       LEFT JOIN users ru ON rm.sender_id = ru.id
       WHERE m.id = $1`,
      [message.id]
    );

    const fullMessage = fullMsgResult.rows[0];

    // FIX: Emit the new_message socket event to everyone in the conversation room.
    // The REST endpoint never did this before — meaning the sender's UI never updated
    // and the other user never got a real-time notification.
    const io = req.app.get('io');
    if (io) {
      io.to(`conv:${conversationId}`).emit('new_message', fullMessage);

      // Also ping the other participant if they're online but not in the room,
      // so their conversation list preview updates.
      const otherId = conversation.participant_one_id === userId
        ? conversation.participant_two_id
        : conversation.participant_one_id;

      const { onlineUsers } = require('../sockets/socketManager');
      const otherSocketId = onlineUsers.get(otherId);
      if (otherSocketId) {
        io.to(otherSocketId).emit('conversation_updated', {
          conversationId,
          lastMessage: fullMessage,
        });
      }
    }

    res.status(201).json({ message: fullMessage });
    
  } catch (error) {
    console.error('SendMessage error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to send message.' });
  }
};

// -------------------------------------------------------
// editMessage: PUT /api/messages/:messageId
// Edits the content of a sent message.
// -------------------------------------------------------
const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'New content is required.' });
    }
    
    const cleanContent = sanitizeString(content.trim());
    
    // Only the sender can edit their message
    const msgCheck = await db.query(
      'SELECT * FROM messages WHERE id = $1 AND sender_id = $2',
      [messageId, userId]
    );
    
    if (msgCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Message not found or you are not the sender.' });
    }
    
    const originalMessage = msgCheck.rows[0];
    
    if (originalMessage.message_type !== 'text') {
      return res.status(400).json({ error: 'Only text messages can be edited.' });
    }
    
    if (originalMessage.is_deleted_for_everyone) {
      return res.status(400).json({ error: 'Cannot edit a deleted message.' });
    }
    
    const result = await db.query(
      `UPDATE messages 
       SET content = $1, is_edited = true, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [cleanContent, messageId]
    );
    
    res.json({ message: result.rows[0] });
    
  } catch (error) {
    console.error('EditMessage error:', error);
    res.status(500).json({ error: 'Failed to edit message.' });
  }
};

// -------------------------------------------------------
// deleteMessage: DELETE /api/messages/:messageId
// Deletes a message — either "for self" or "for everyone"
// -------------------------------------------------------
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    // FIX: frontend sends ?everyone=true as query param, not request body
    const delete_for_everyone = req.query.everyone === 'true' || req.body.delete_for_everyone === true;
    const userId = req.user.id;
    
    const msgCheck = await db.query(
      'SELECT * FROM messages WHERE id = $1',
      [messageId]
    );
    
    if (msgCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }
    
    const message = msgCheck.rows[0];
    
    // "Delete for everyone" — only the sender can do this
    if (delete_for_everyone) {
      if (message.sender_id !== userId) {
        return res.status(403).json({ error: 'Only the sender can delete a message for everyone.' });
      }
      
      const result = await db.query(
        `UPDATE messages 
         SET is_deleted_for_everyone = true, content = null, 
             file_url = null, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [messageId]
      );
      
      // If there was a file, delete it from disk too
      if (message.file_url) {
        const filePath = path.join(__dirname, '../../', message.file_url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      
      return res.json({ message: result.rows[0], deleted_for_everyone: true });
    }
    
    // "Delete for self" — any participant can do this
    // Verify user is in the conversation
    const convCheck = await db.query(
      `SELECT id FROM conversations 
       WHERE id = $1 AND (participant_one_id = $2 OR participant_two_id = $2)`,
      [message.conversation_id, userId]
    );
    
    if (convCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    
    await db.query(
      `UPDATE messages SET is_deleted_for_sender = true, updated_at = NOW() 
       WHERE id = $1`,
      [messageId]
    );
    
    res.json({ deleted_for_self: true, message_id: messageId });
    
  } catch (error) {
    console.error('DeleteMessage error:', error);
    res.status(500).json({ error: 'Failed to delete message.' });
  }
};

module.exports = { getMessages, sendMessage, editMessage, deleteMessage };
