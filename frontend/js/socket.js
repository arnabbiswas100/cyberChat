/**
 * socket.js — SOCKET.IO CLIENT WRAPPER
 *
 * BEGINNER EXPLANATION:
 * Normal HTTP requests (like our API calls) are "one-way" — you ask, server responds.
 * WebSockets are DIFFERENT: they keep a permanent two-way connection open.
 * Both the client AND the server can send messages at any time!
 *
 * Socket.IO is a library built on WebSockets that makes them easier to use.
 * It adds features like:
 *   - Automatic reconnection if connection drops
 *   - "Events" — named messages (like 'new_message', 'user_online')
 *   - Rooms — groups of connections (our conversations)
 *
 * HOW IT WORKS:
 * 1. We connect to the server with our JWT token (to prove who we are)
 * 2. Server puts us in a "room" for each conversation we're in
 * 3. When someone sends a message, server emits 'new_message' to everyone in that room
 * 4. We listen for that event and update the UI instantly
 *
 * The socket.io.js script is served automatically by the backend at /socket.io/socket.io.js
 */

class SocketManager {
  constructor() {
    this.socket = null;        // The Socket.IO connection
    this.connected = false;
    this.currentConvId = null; // The conversation room we're currently in
  }

  /**
   * Connect to the Socket.IO server.
   * Must be called after login (we need the token).
   */
  connect() {
    const token = getToken();

    // io() is provided by the Socket.IO client script loaded in index.html
    // We pass our JWT token so the server can authenticate us
    this.socket = io({
      auth: { token },           // Sends token during handshake
      reconnection: true,        // Auto-reconnect if connection drops
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    // ── CONNECTION EVENTS ──────────────────────
    this.socket.on('connect', () => {
      this.connected = true;
      console.log('[Socket] Connected, id:', this.socket.id);
      this.updateStatusIndicator('connected');

      // If we were in a conversation before reconnecting, rejoin it
      if (this.currentConvId) {
        this.joinConversation(this.currentConvId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      console.log('[Socket] Disconnected:', reason);
      this.updateStatusIndicator('disconnected');
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      this.updateStatusIndicator('error');
    });

    this.socket.on('reconnecting', (attempt) => {
      this.updateStatusIndicator('reconnecting', attempt);
    });

    // ── MESSAGE EVENTS ─────────────────────────

    /**
     * new_message: Someone sent a message in a conversation we're in.
     * The server emits this to everyone in the conversation room.
     */
    this.socket.on('new_message', (message) => {
      console.log('[Socket] new_message:', message);
      if (window.messagesManager) {
        window.messagesManager.onNewMessage(message);
      }
      // Also update the conversation list preview
      if (window.chatManager) {
        window.chatManager.onNewMessage(message);
      }
    });

    /**
     * message_edited: Someone edited a message.
     */
    this.socket.on('message_edited', (data) => {
      console.log('[Socket] message_edited:', data);
      if (window.messagesManager) {
        window.messagesManager.onMessageEdited(data);
      }
    });

    /**
     * message_deleted: A message was deleted.
     * data = { messageId, conversationId, deleteForEveryone }
     */
    this.socket.on('message_deleted', (data) => {
      console.log('[Socket] message_deleted:', data);
      if (window.messagesManager) {
        window.messagesManager.onMessageDeleted(data);
      }
    });

    /**
     * messages_read: The other person read our messages.
     * data = { conversationId, readBy, readAt }
     */
    this.socket.on('messages_read', (data) => {
      console.log('[Socket] messages_read:', data);
      if (window.messagesManager) {
        window.messagesManager.onMessagesRead(data);
      }
    });

    // ── TYPING EVENTS ──────────────────────────

    /**
     * typing_start: Someone started typing in a conversation.
     * data = { conversationId, userId, username }
     */
    this.socket.on('typing_start', (data) => {
      if (window.messagesManager) {
        window.messagesManager.onTypingStart(data);
      }
    });

    /**
     * typing_stop: Someone stopped typing.
     */
    this.socket.on('typing_stop', (data) => {
      if (window.messagesManager) {
        window.messagesManager.onTypingStop(data);
      }
    });

    // ── PRESENCE EVENTS (online/offline) ───────

    /**
     * user_online: A user came online.
     * data = { userId, username }
     */
    this.socket.on('user_online', (data) => {
      console.log('[Socket] user online:', data.username);
      if (window.chatManager) {
        window.chatManager.onUserOnline(data.userId);
      }
    });

    /**
     * user_offline: A user went offline.
     * data = { userId, username }
     */
    this.socket.on('user_offline', (data) => {
      console.log('[Socket] user offline:', data.username);
      if (window.chatManager) {
        window.chatManager.onUserOffline(data.userId);
      }
    });

    /**
     * conversation_updated: A conversation's metadata changed
     * (e.g. new message preview, unread count).
     */
    this.socket.on('conversation_updated', (data) => {
      if (window.chatManager) {
        window.chatManager.onConversationUpdated(data);
      }
    });
  }

  /**
   * Join a conversation's "room" on the server.
   * The server puts this socket in a room named after the conversationId.
   * All messages in that conversation are broadcast to the room.
   */
  joinConversation(conversationId) {
    this.currentConvId = conversationId;
    if (this.socket && this.connected) {
      this.socket.emit('join_conversation', { conversationId });
    }
  }

  /**
   * Leave the current conversation room.
   * Call this when switching to a different conversation.
   */
  leaveConversation(conversationId) {
    if (this.socket && this.connected && conversationId) {
      this.socket.emit('leave_conversation', { conversationId });
    }
  }

  /**
   * Notify the server (and other participants) that we're typing.
   * The server forwards this to everyone else in the room.
   */
  sendTypingStart(conversationId) {
    if (this.socket && this.connected) {
      this.socket.emit('typing_start', { conversationId });
    }
  }

  sendTypingStop(conversationId) {
    if (this.socket && this.connected) {
      this.socket.emit('typing_stop', { conversationId });
    }
  }

  /**
   * Tell the server we've read messages in a conversation.
   * The server updates the read receipt and notifies the sender.
   */
  markRead(conversationId) {
    if (this.socket && this.connected) {
      this.socket.emit('message_read', { conversationId });
    }
  }

  /**
   * Emit a message edit event (in addition to the REST API call).
   */
  emitMessageEdit(messageId, conversationId, content) {
    if (this.socket && this.connected) {
      this.socket.emit('edit_message', { messageId, conversationId, content });
    }
  }

  /**
   * Emit a message delete event.
   */
  emitMessageDelete(messageId, conversationId, deleteForEveryone) {
    if (this.socket && this.connected) {
      this.socket.emit('delete_message', { messageId, conversationId, delete_for_everyone: deleteForEveryone });
    }
  }

  /** Update the connection status indicator in the sidebar footer */
  updateStatusIndicator(status, attempt = null) {
    const el = document.getElementById('connection-status');
    if (!el) return;

    const states = {
      connected:    { text: '● LINK ACTIVE',     cls: 'connected' },
      disconnected: { text: '○ LINK INACTIVE',   cls: '' },
      error:        { text: '✕ LINK ERROR',       cls: 'error' },
      reconnecting: { text: `⟳ RECONNECTING...`, cls: '' },
    };

    const state = states[status] || states.disconnected;
    el.textContent = state.text + (attempt ? ` (${attempt})` : '');
    el.className = `status-text ${state.cls}`;
  }

  /** Cleanly disconnect the socket */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }
}

// Create a single global instance
window.socketManager = new SocketManager();
