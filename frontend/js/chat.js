/**
 * chat.js — CONVERSATION LIST & SIDEBAR LOGIC
 *
 * BEGINNER EXPLANATION:
 * This file manages the LEFT SIDEBAR of the app.
 * The sidebar shows a list of all your conversations (like WhatsApp's chat list).
 *
 * It handles:
 * - Loading and displaying conversations from the backend
 * - Clicking a conversation to open it
 * - Searching for users to start new conversations
 * - Updating the conversation list in real-time when new messages arrive
 * - Showing online/offline status
 *
 * Each "conversation" in our app is a direct message between two users.
 */

class ChatManager {
  constructor() {
    this.conversations = [];  // Array of all conversation objects from the backend
    this.activeConvId  = null; // The ID of the currently open conversation
    this.userSearchTimeout = null; // For debouncing user search
  }

  // ─────────────────────────────────────────────
  // LOAD CONVERSATIONS
  // ─────────────────────────────────────────────

  /**
   * Fetch all conversations from the backend and render them in the sidebar.
   * Called on app startup and after creating new conversations.
   */
  async loadConversations() {
    try {
      const data = await API.chat.getConversations();
      // data = array of conversation objects, each with:
      // { id, other_user: { id, username, display_name, avatar_url, is_online },
      //   last_message: { content, created_at }, unread_count }
      this.conversations = data.conversations || data || [];
      this.renderConversationList();
    } catch (err) {
      console.error('[Chat] Failed to load conversations:', err);
      showToast('Failed to load conversations.', 'error');
    }
  }

  // ─────────────────────────────────────────────
  // RENDER CONVERSATION LIST
  // ─────────────────────────────────────────────

  renderConversationList(filterText = '') {
    const container = document.getElementById('conversation-list');
    container.innerHTML = '';

    // Filter conversations if user is searching
    const filtered = filterText
      ? this.conversations.filter(conv => {
          const name = conv.other_user?.display_name || conv.other_user?.username || '';
          return name.toLowerCase().includes(filterText.toLowerCase());
        })
      : this.conversations;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="list-placeholder">
          <span class="placeholder-icon">◈</span>
          <p>${filterText ? 'No matching chats' : 'No active channels'}</p>
          <small>${filterText ? 'Try a different search' : 'Start a new conversation'}</small>
        </div>`;
      return;
    }

    filtered.forEach(conv => {
      const item = this.createConversationItem(conv);
      container.appendChild(item);
    });
  }

  /**
   * Build a single conversation list item element.
   * @param {object} conv - Conversation data from backend
   * @returns {HTMLElement}
   */
  createConversationItem(conv) {
    const other = conv.other_user;
    const lastMsg = conv.last_message;
    const unread  = conv.unread_count || 0;

    const item = document.createElement('div');
    item.className = `conv-item${this.activeConvId === conv.id ? ' active' : ''}`;
    item.dataset.convId = conv.id;

    // Format the last message preview
    let previewText = 'No messages yet';
    if (lastMsg) {
      if (lastMsg.is_deleted) {
        previewText = '⊗ Message deleted';
      } else if (lastMsg.content) {
        // Truncate long messages for preview
        previewText = lastMsg.content.length > 40
          ? lastMsg.content.slice(0, 40) + '...'
          : lastMsg.content;
      } else {
        previewText = '📎 Attachment';
      }
    }

    item.innerHTML = `
      <div class="avatar-wrap">
        <img src="${getAvatarUrl(other)}" alt="${escapeHtml(other.display_name || other.username)}" class="avatar" />
        <span class="status-dot ${other.is_online ? 'online' : ''}" id="status-${other.id}"></span>
      </div>
      <div class="conv-info">
        <span class="conv-name">${escapeHtml(other.display_name || other.username)}</span>
        <span class="conv-last">${escapeHtml(previewText)}</span>
      </div>
      <div class="conv-meta">
        <span class="conv-time">${lastMsg ? formatTime(lastMsg.created_at) : ''}</span>
        ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
      </div>
    `;

    // Click to open this conversation
    item.addEventListener('click', () => this.openConversation(conv));

    return item;
  }

  // ─────────────────────────────────────────────
  // OPEN A CONVERSATION
  // ─────────────────────────────────────────────

  /**
   * Open a conversation and load its messages.
   * @param {object} conv - The conversation to open
   */
  openConversation(conv) {
    const prevConvId = this.activeConvId;

    // Leave the old conversation's socket room
    if (prevConvId && prevConvId !== conv.id) {
      socketManager.leaveConversation(prevConvId);
    }

    this.activeConvId = conv.id;

    // Update active state in sidebar
    document.querySelectorAll('.conv-item').forEach(item => {
      item.classList.toggle('active', item.dataset.convId == conv.id);
    });

    // Update chat header with the other user's info
    const other = conv.other_user;
    document.getElementById('chat-name').textContent = other.display_name || other.username;
    document.getElementById('chat-status-text').textContent = other.is_online ? 'online' : 'offline';
    document.getElementById('chat-avatar').src = getAvatarUrl(other);

    const statusDot = document.getElementById('chat-status-dot');
    statusDot.className = `status-dot ${other.is_online ? 'online' : ''}`;

    // Show the chat window, hide empty state
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('chat-window').classList.remove('hidden');

    // On mobile: hide sidebar
    document.getElementById('sidebar').classList.add('hidden-mobile');

    // Clear unread badge for this conversation
    this.clearUnreadBadge(conv.id);

    // Join the socket room for this conversation
    socketManager.joinConversation(conv.id);

    // Tell the socket we've read all messages
    socketManager.markRead(conv.id);

    // Load messages
    if (window.messagesManager) {
      window.messagesManager.loadMessages(conv.id, other);
    }
  }

  // ─────────────────────────────────────────────
  // NEW CHAT (User Search Modal)
  // ─────────────────────────────────────────────

  initNewChatButton() {
    const openModal = () => {
      window.openModal('new-chat-modal');
      document.getElementById('user-search-input').value = '';
      document.getElementById('user-search-results').innerHTML = '';
      setTimeout(() => document.getElementById('user-search-input').focus(), 100);
    };

    document.getElementById('new-chat-btn').addEventListener('click', openModal);
    document.getElementById('empty-new-chat').addEventListener('click', openModal);
  }

  initUserSearch() {
    const input = document.getElementById('user-search-input');

    input.addEventListener('input', () => {
      const q = input.value.trim();

      // Debounce: don't search on every keystroke, wait 300ms
      clearTimeout(this.userSearchTimeout);

      if (q.length < 2) {
        document.getElementById('user-search-results').innerHTML =
          '<p style="text-align:center;color:var(--text-muted);font-size:.8rem;padding:1rem">Type at least 2 characters</p>';
        return;
      }

      this.userSearchTimeout = setTimeout(() => this.searchUsers(q), 300);
    });
  }

  async searchUsers(query) {
    const resultsEl = document.getElementById('user-search-results');
    resultsEl.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-muted)"><span class="loader-ring"></span></div>';

    try {
      const data = await API.users.search(query);
      const users = data.users || data || [];

      resultsEl.innerHTML = '';

      if (users.length === 0) {
        resultsEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:.8rem;padding:1rem">No users found</p>';
        return;
      }

      users.forEach(user => {
        // Don't show the current user in search results
        if (user.id === window.currentUser?.id) return;

        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
          <img src="${getAvatarUrl(user)}" alt="" class="avatar" />
          <div class="result-info">
            <div class="result-name">${escapeHtml(user.display_name || user.username)}</div>
            <div class="result-handle">@${escapeHtml(user.username)}</div>
          </div>
          <button class="cyber-btn primary small">LINK</button>
        `;

        item.addEventListener('click', () => this.startConversation(user));
        resultsEl.appendChild(item);
      });

    } catch (err) {
      resultsEl.innerHTML = '<p style="text-align:center;color:var(--magenta);font-size:.8rem;padding:1rem">Search failed</p>';
    }
  }

  /**
   * Start a new conversation with a user.
   * If a conversation already exists, just open it.
   */
  async startConversation(user) {
    try {
      const data = await API.chat.createConversation(user.id);
      // FIX: backend returns { conversation_id, other_user, is_new } — reshape to expected conv shape
      const conv = {
        id: data.conversation_id,
        other_user: data.other_user,
        last_message: null,
        unread_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Add to conversations list (or update if exists)
      const existingIdx = this.conversations.findIndex(c => c.id === conv.id);
      if (existingIdx >= 0) {
        this.conversations[existingIdx] = conv;
      } else {
        this.conversations.unshift(conv); // Add to top of list
      }

      this.renderConversationList();

      // Close modal and open the conversation
      closeModal('new-chat-modal');
      this.openConversation(conv);

    } catch (err) {
      showToast('Failed to create conversation: ' + err.message, 'error');
    }
  }

  // ─────────────────────────────────────────────
  // REAL-TIME UPDATES (called by socket.js)
  // ─────────────────────────────────────────────

  /**
   * Called when a new message arrives in any conversation.
   * Update the preview text and unread count.
   */
  onNewMessage(message) {
    const convId = message.conversation_id;
    const conv = this.conversations.find(c => c.id === convId);

    if (conv) {
      // Update last message preview
      conv.last_message = message;

      // If this isn't the active conversation, increment unread count
      if (convId !== this.activeConvId) {
        conv.unread_count = (conv.unread_count || 0) + 1;
      }

      // Move this conversation to the top of the list
      this.conversations = [conv, ...this.conversations.filter(c => c.id !== convId)];
      this.renderConversationList();
    } else {
      // Unknown conversation — reload the full list
      this.loadConversations();
    }
  }

  onConversationUpdated(data) {
    const conv = this.conversations.find(c => c.id === data.conversationId);
    if (conv) {
      Object.assign(conv, data);
      this.renderConversationList();
    }
  }

  onUserOnline(userId) {
    // Update status dots in the sidebar
    const dot = document.getElementById(`status-${userId}`);
    if (dot) dot.className = 'status-dot online';

    // Update the conversation list
    const conv = this.conversations.find(c => c.other_user?.id === userId);
    if (conv) {
      conv.other_user.is_online = true;
      this.renderConversationList();
    }

    // Update header if this is the active chat
    if (conv && conv.id === this.activeConvId) {
      document.getElementById('chat-status-text').textContent = 'online';
      document.getElementById('chat-status-dot').className = 'status-dot online';
    }
  }

  onUserOffline(userId) {
    const dot = document.getElementById(`status-${userId}`);
    if (dot) dot.className = 'status-dot';

    const conv = this.conversations.find(c => c.other_user?.id === userId);
    if (conv) {
      conv.other_user.is_online = false;
      this.renderConversationList();
    }

    if (conv && conv.id === this.activeConvId) {
      document.getElementById('chat-status-text').textContent = 'offline';
      document.getElementById('chat-status-dot').className = 'status-dot';
    }
  }

  /** Clear the unread badge for a conversation */
  clearUnreadBadge(convId) {
    const conv = this.conversations.find(c => c.id === convId);
    if (conv) {
      conv.unread_count = 0;
      // Just update the specific item's badge without full re-render
      const item = document.querySelector(`.conv-item[data-conv-id="${convId}"]`);
      if (item) {
        const badge = item.querySelector('.unread-badge');
        if (badge) badge.remove();
      }
    }
  }

  // ─────────────────────────────────────────────
  // CONVERSATION SEARCH (sidebar search input)
  // ─────────────────────────────────────────────

  initConversationSearch() {
    const input = document.getElementById('conversation-search');
    input.addEventListener('input', () => {
      this.renderConversationList(input.value.trim());
    });
  }

  // ─────────────────────────────────────────────
  // PROFILE MODAL
  // ─────────────────────────────────────────────

  initProfileModal() {
    document.getElementById('profile-btn').addEventListener('click', () => {
      // Pre-fill with current user data
      const user = window.currentUser;
      if (user) {
        document.getElementById('profile-displayname').value = user.display_name || '';
        document.getElementById('profile-bio').value = user.bio || '';
        document.getElementById('profile-avatar-preview').src = getAvatarUrl(user);
      }
      openModal('profile-modal');
    });

    // Save profile
    document.getElementById('save-profile-btn').addEventListener('click', async () => {
      const displayName = document.getElementById('profile-displayname').value.trim();
      const bio = document.getElementById('profile-bio').value.trim();

      try {
        const data = await API.users.updateProfile(displayName, bio);
        window.currentUser = { ...window.currentUser, display_name: displayName, bio };
        // Update sidebar display name
        document.getElementById('my-display-name').textContent = displayName;
        showToast('Profile updated.', 'success');
      } catch (err) {
        showToast('Failed to update profile: ' + err.message, 'error');
      }
    });

    // Avatar change
    document.getElementById('avatar-change-btn').addEventListener('click', () => {
      document.getElementById('avatar-input').click();
    });

    document.getElementById('avatar-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Preview immediately
      const reader = new FileReader();
      reader.onload = (ev) => {
        document.getElementById('profile-avatar-preview').src = ev.target.result;
      };
      reader.readAsDataURL(file);

      try {
        const data = await API.users.uploadAvatar(file);
        window.currentUser.avatar_url = data.avatar_url;
        document.getElementById('my-avatar').src = getAvatarUrl(window.currentUser);
        showToast('Avatar updated!', 'success');
      } catch (err) {
        showToast('Avatar upload failed: ' + err.message, 'error');
      }
    });

    // Change password
    document.getElementById('change-password-btn').addEventListener('click', async () => {
      const current = document.getElementById('current-password').value;
      const next    = document.getElementById('new-password').value;

      if (!current || !next) { showToast('Fill in both password fields.', 'warning'); return; }
      if (next.length < 8)   { showToast('New password must be at least 8 characters.', 'warning'); return; }

      try {
        await API.users.changePassword(current, next);
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        showToast('Password updated.', 'success');
      } catch (err) {
        showToast('Password change failed: ' + err.message, 'error');
      }
    });
  }

  // ─────────────────────────────────────────────
  // BACK BUTTON (Mobile)
  // ─────────────────────────────────────────────

  initBackButton() {
    document.getElementById('back-btn').addEventListener('click', () => {
      // On mobile, show sidebar and hide chat window
      document.getElementById('sidebar').classList.remove('hidden-mobile');
      document.getElementById('chat-window').classList.add('hidden');
      document.getElementById('empty-state').classList.remove('hidden');
    });
  }

  // ─────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────

  init() {
    this.initNewChatButton();
    this.initUserSearch();
    this.initConversationSearch();
    this.initProfileModal();
    this.initBackButton();
  }
}

window.chatManager = new ChatManager();
