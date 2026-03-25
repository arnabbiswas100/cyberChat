// =============================================================
// FILE: backend/controllers/chatController.js
// PURPOSE: Handles conversations (chat sessions between users).
// =============================================================

const db = require('../config/database');

// -------------------------------------------------------
// getConversations: GET /api/chat/conversations
// Returns all conversations for the logged-in user,
// including the last message and the other user's info.
// This populates the sidebar in the chat UI.
// -------------------------------------------------------
const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // This SQL query joins multiple tables to get everything
    // needed to render the conversation list in one query.
    //
    // INNER JOIN: Only returns rows where the join condition matches
    // LEFT JOIN: Returns all rows from left table, even if no match on right
    // CASE WHEN: Like an if/else in SQL
    // COALESCE: Returns first non-null value from a list
    const result = await db.query(
      `SELECT 
        c.id,
        c.created_at,
        c.updated_at,
        -- Get the OTHER participant's info (not the current user)
        CASE 
          WHEN c.participant_one_id = $1 THEN u2.id
          ELSE u1.id
        END AS other_user_id,
        CASE 
          WHEN c.participant_one_id = $1 THEN u2.username
          ELSE u1.username
        END AS other_username,
        CASE 
          WHEN c.participant_one_id = $1 THEN u2.display_name
          ELSE u1.display_name
        END AS other_display_name,
        CASE 
          WHEN c.participant_one_id = $1 THEN u2.avatar_url
          ELSE u1.avatar_url
        END AS other_avatar_url,
        CASE 
          WHEN c.participant_one_id = $1 THEN u2.is_online
          ELSE u1.is_online
        END AS other_is_online,
        CASE 
          WHEN c.participant_one_id = $1 THEN u2.last_seen
          ELSE u1.last_seen
        END AS other_last_seen,
        -- Last message details
        m.content        AS last_message_content,
        m.message_type   AS last_message_type,
        m.created_at     AS last_message_at,
        m.sender_id      AS last_message_sender_id,
        m.is_deleted_for_everyone AS last_message_deleted,
        -- Count of unread messages (sent by other user, not yet read by us)
        (
          SELECT COUNT(*) 
          FROM messages unread
          WHERE unread.conversation_id = c.id
            AND unread.sender_id != $1
            AND unread.is_read = false
            AND unread.is_deleted_for_everyone = false
        ) AS unread_count
      FROM conversations c
      -- Join to get both participants' user info
      INNER JOIN users u1 ON c.participant_one_id = u1.id
      INNER JOIN users u2 ON c.participant_two_id = u2.id
      -- Join to get the last message (left join in case no messages yet)
      LEFT JOIN messages m ON c.last_message_id = m.id
      -- Only show conversations this user is part of
      WHERE c.participant_one_id = $1 OR c.participant_two_id = $1
      ORDER BY COALESCE(m.created_at, c.created_at) DESC`,
      [userId]
    );
    
    res.json({ conversations: result.rows });
    
  } catch (error) {
    console.error('GetConversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations.' });
  }
};

// -------------------------------------------------------
// getOrCreateConversation: POST /api/chat/conversations
// Finds an existing conversation between two users,
// or creates a new one if it doesn't exist.
// -------------------------------------------------------
const getOrCreateConversation = async (req, res) => {
  try {
    const { other_user_id } = req.body;
    const userId = req.user.id;
    
    if (!other_user_id) {
      return res.status(400).json({ error: 'other_user_id is required.' });
    }
    
    if (other_user_id === userId) {
      return res.status(400).json({ error: 'You cannot start a conversation with yourself.' });
    }
    
    // Check the other user exists
    const otherUser = await db.query(
      'SELECT id, username, display_name, avatar_url, is_online FROM users WHERE id = $1',
      [other_user_id]
    );
    
    if (otherUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    // We store participants sorted (smaller UUID first) to prevent
    // creating two conversations for the same pair of users.
    // In PostgreSQL, UUID comparison is alphabetical.
    const [p1, p2] = [userId, other_user_id].sort();
    
    // Try to find existing conversation
    let convResult = await db.query(
      `SELECT id FROM conversations 
       WHERE participant_one_id = $1 AND participant_two_id = $2`,
      [p1, p2]
    );
    
    let conversationId;
    let isNew = false;
    
    if (convResult.rows.length === 0) {
      // Create new conversation
      const newConv = await db.query(
        `INSERT INTO conversations (participant_one_id, participant_two_id)
         VALUES ($1, $2)
         RETURNING id`,
        [p1, p2]
      );
      conversationId = newConv.rows[0].id;
      isNew = true;
    } else {
      conversationId = convResult.rows[0].id;
    }
    
    res.json({
      conversation_id: conversationId,
      other_user: otherUser.rows[0],
      is_new: isNew,
    });
    
  } catch (error) {
    console.error('GetOrCreateConversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation.' });
  }
};

module.exports = { getConversations, getOrCreateConversation };
