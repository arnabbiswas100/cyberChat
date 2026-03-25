// =============================================================
// FILE: backend/sockets/socketManager.js
// PURPOSE: The real-time engine. Handles all WebSocket events.
//
// THEORY (for beginners):
//   WebSockets vs HTTP:
//
//   HTTP is like sending a letter:
//   - Client sends a request
//   - Server sends a response
//   - Connection closes
//
//   WebSockets are like a phone call:
//   - Client connects once
//   - Both sides can send messages any time
//   - Connection stays open
//
//   Socket.IO wraps WebSockets and adds:
//   - Automatic reconnection if connection drops
//   - "Rooms" — groups of sockets that receive the same events
//   - "Events" — named messages (like function calls)
//   - Fallback to HTTP polling if WebSockets aren't available
//
//   HOW OUR CHAT WORKS:
//   1. User logs in → browser connects to Socket.IO server
//   2. User opens a conversation → they "join" a Room for that conversation
//   3. User sends a message → client emits "send_message" to server
//   4. Server saves message to DB, then emits "new_message" to all users
//      in that conversation's room
//   5. Other user's browser receives "new_message" and displays it
//
//   Everything happens in milliseconds — that's real-time!
// =============================================================

const { authenticateSocket } = require('../middleware/auth');
const db = require('../config/database');
const { sanitizeString } = require('../middleware/validate');

// Map to track: userId → socketId (for knowing when users go online/offline)
// When a user connects, we add their entry. When they disconnect, we remove it.
const onlineUsers = new Map();

// -------------------------------------------------------
// initSocket: Called once from server.js with the io instance.
// Sets up all Socket.IO event listeners.
// -------------------------------------------------------
function initSocket(io) {
  
  // ---- Authentication Middleware for Sockets ----
  // Every socket connection must provide a valid JWT.
  // This runs BEFORE the 'connection' event.
  io.use(authenticateSocket);
  
  // ---- Connection Event ----
  // This fires for every new client that successfully connects.
  io.on('connection', (socket) => {
    const user = socket.user; // Attached by authenticateSocket middleware
    
    console.log(`⚡ Socket connected: ${user.username} (${socket.id})`);
    
    // Track this user as online
    onlineUsers.set(user.id, socket.id);
    
    // Update DB: mark user as online
    db.query(
      'UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1',
      [user.id]
    ).catch(err => console.error('Error updating online status:', err));
    
    // Broadcast to all other users that this person came online
    // socket.broadcast = send to everyone EXCEPT this socket
    socket.broadcast.emit('user_online', { userId: user.id });
    
    // =====================================================
    // EVENT: join_conversation
    // Client emits this when they open a conversation.
    // We add the socket to that conversation's "room".
    // =====================================================
    socket.on('join_conversation', ({ conversationId }) => {
      if (!conversationId) return;
      
      // Verify user is actually a participant before joining
      db.query(
        `SELECT id FROM conversations 
         WHERE id = $1 AND (participant_one_id = $2 OR participant_two_id = $2)`,
        [conversationId, user.id]
      ).then(result => {
        if (result.rows.length > 0) {
          socket.join(`conv:${conversationId}`); // Join the room
          console.log(`📍 ${user.username} joined room conv:${conversationId}`);
        }
      }).catch(err => console.error('join_conversation error:', err));
    });
    
    // =====================================================
    // EVENT: leave_conversation
    // Client emits this when they close a conversation.
    // =====================================================
    socket.on('leave_conversation', ({ conversationId }) => {
      socket.leave(`conv:${conversationId}`);
    });
    
    // =====================================================
    // EVENT: send_message
    // Client emits this to send a new message.
    // (Text messages only via socket — files go through HTTP)
    // =====================================================
    socket.on('send_message', async (data, callback) => {
      try {
        const { conversationId, content, message_type = 'text', reply_to_id } = data;
        
        if (!conversationId || !content) {
          return callback && callback({ error: 'conversationId and content are required.' });
        }
        
        // Verify access
        const convCheck = await db.query(
          `SELECT * FROM conversations 
           WHERE id = $1 AND (participant_one_id = $2 OR participant_two_id = $2)`,
          [conversationId, user.id]
        );
        
        if (convCheck.rows.length === 0) {
          return callback && callback({ error: 'Access denied.' });
        }
        
        const cleanContent = sanitizeString(content);
        
        // Save to database
        const msgResult = await db.query(
          `INSERT INTO messages 
            (conversation_id, sender_id, message_type, content, reply_to_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [conversationId, user.id, message_type, cleanContent, reply_to_id || null]
        );
        
        const message = msgResult.rows[0];
        
        // Update conversation's last message
        await db.query(
          'UPDATE conversations SET last_message_id = $1, updated_at = NOW() WHERE id = $2',
          [message.id, conversationId]
        );
        
        // Process @mentions
        const mentions = cleanContent.match(/@([a-zA-Z0-9_]+)/g);
        if (mentions) {
          for (const mention of mentions) {
            const mentionUsername = mention.slice(1).toLowerCase();
            const mentionedUser = await db.query(
              'SELECT id FROM users WHERE username = $1', [mentionUsername]
            );
            if (mentionedUser.rows.length > 0) {
              await db.query(
                'INSERT INTO message_mentions (message_id, user_id) VALUES ($1, $2)',
                [message.id, mentionedUser.rows[0].id]
              );
            }
          }
        }
        
        // Build the full message object with sender info
        const fullMsg = await db.query(
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
        
        const fullMessage = fullMsg.rows[0];
        
        // Emit the message to ALL users in the conversation's room
        // (including the sender, so they get the DB-confirmed version)
        io.to(`conv:${conversationId}`).emit('new_message', fullMessage);
        
        // Also notify the other user if they're online but not in this room
        // (to update their conversation list / unread count)
        const conv = convCheck.rows[0];
        const otherId = conv.participant_one_id === user.id
          ? conv.participant_two_id
          : conv.participant_one_id;
        
        const otherSocketId = onlineUsers.get(otherId);
        if (otherSocketId) {
          io.to(otherSocketId).emit('conversation_updated', {
            conversationId,
            lastMessage: fullMessage,
          });
        }
        
        // Acknowledge receipt to the sender (callback pattern)
        callback && callback({ success: true, message: fullMessage });
        
      } catch (error) {
        console.error('send_message socket error:', error);
        callback && callback({ error: 'Failed to send message.' });
      }
    });
    
    // =====================================================
    // EVENT: typing_start
    // Client emits when user starts typing.
    // We forward it to the other user in the conversation.
    // =====================================================
    socket.on('typing_start', ({ conversationId }) => {
      // Broadcast to everyone in the room EXCEPT the sender
      socket.to(`conv:${conversationId}`).emit('typing_start', {
        userId:   user.id,
        username: user.username,
        conversationId,
      });
    });
    
    // =====================================================
    // EVENT: typing_stop
    // Client emits when user stops typing.
    // =====================================================
    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing_stop', {
        userId: user.id,
        conversationId,
      });
    });
    
    // =====================================================
    // EVENT: message_read
    // Client emits when they've read messages in a conversation.
    // We notify the sender that their messages were read.
    // =====================================================
    socket.on('message_read', async ({ conversationId }) => {
      try {
        // Mark all unread messages as read
        await db.query(
          `UPDATE messages 
           SET is_read = true, read_at = NOW()
           WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false`,
          [conversationId, user.id]
        );
        
        // Notify others in the room that this user read the messages
        socket.to(`conv:${conversationId}`).emit('messages_read', {
          conversationId,
          read_by: user.id,
          read_at: new Date().toISOString(),
        });
        
      } catch (err) {
        console.error('message_read error:', err);
      }
    });
    
    // =====================================================
    // EVENT: edit_message
    // Real-time message editing via socket.
    // =====================================================
    socket.on('edit_message', async ({ messageId, content }, callback) => {
      try {
        const cleanContent = sanitizeString(content);
        
        const result = await db.query(
          `UPDATE messages 
           SET content = $1, is_edited = true, updated_at = NOW()
           WHERE id = $2 AND sender_id = $3
           RETURNING *`,
          [cleanContent, messageId, user.id]
        );
        
        if (result.rows.length === 0) {
          return callback && callback({ error: 'Message not found or access denied.' });
        }
        
        const updatedMsg = result.rows[0];
        
        // Broadcast the edit to everyone in the conversation
        io.to(`conv:${updatedMsg.conversation_id}`).emit('message_edited', {
          messageId: updatedMsg.id,
          content:   updatedMsg.content,
          conversation_id: updatedMsg.conversation_id,
        });
        
        callback && callback({ success: true });
        
      } catch (err) {
        console.error('edit_message socket error:', err);
        callback && callback({ error: 'Failed to edit message.' });
      }
    });
    
    // =====================================================
    // EVENT: delete_message
    // Real-time message deletion.
    // =====================================================
    socket.on('delete_message', async ({ messageId, delete_for_everyone }, callback) => {
      try {
        const msgCheck = await db.query(
          'SELECT * FROM messages WHERE id = $1',
          [messageId]
        );
        
        if (msgCheck.rows.length === 0) {
          return callback && callback({ error: 'Message not found.' });
        }
        
        const message = msgCheck.rows[0];
        
        if (delete_for_everyone && message.sender_id !== user.id) {
          return callback && callback({ error: 'Only the sender can delete for everyone.' });
        }
        
        if (delete_for_everyone) {
          await db.query(
            `UPDATE messages SET is_deleted_for_everyone = true, 
             content = null, file_url = null, updated_at = NOW()
             WHERE id = $1`,
            [messageId]
          );
          
          io.to(`conv:${message.conversation_id}`).emit('message_deleted', {
            messageId,
            conversation_id: message.conversation_id,
            deleted_for_everyone: true,
          });
        } else {
          // Just for self
          await db.query(
            'UPDATE messages SET is_deleted_for_sender = true WHERE id = $1',
            [messageId]
          );
          socket.emit('message_deleted', { messageId, deleted_for_self: true });
        }
        
        callback && callback({ success: true });
        
      } catch (err) {
        console.error('delete_message socket error:', err);
        callback && callback({ error: 'Failed to delete message.' });
      }
    });
    
    // =====================================================
    // EVENT: disconnect
    // Fires when the user's connection drops (browser closed,
    // internet lost, etc.)
    // =====================================================
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${user.username} (${socket.id})`);
      
      // Remove from online users map
      onlineUsers.delete(user.id);
      
      // Update DB: mark offline
      try {
        await db.query(
          'UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1',
          [user.id]
        );
        
        // Notify all other users this person went offline
        socket.broadcast.emit('user_offline', {
          userId:    user.id,
          last_seen: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Disconnect cleanup error:', err);
      }
    });
  });
  
  console.log('⚡ Socket.IO initialized');
}

module.exports = { initSocket, onlineUsers };
