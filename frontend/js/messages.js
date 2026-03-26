/**
 * messages.js — FULL MESSAGE SYSTEM
 *
 * BEGINNER EXPLANATION:
 * This is the biggest file — it handles everything that happens in the
 * main chat window (the right side of the screen).
 *
 * Features:
 * - Loading messages from the backend (with pagination — "load more")
 * - Rendering messages with avatars, timestamps, seen ticks
 * - Sending messages (text + files)
 * - Replying to messages (double-click)
 * - Editing and deleting your own messages (right-click menu)
 * - File uploads (images, videos, documents)
 * - Image previews (click to enlarge)
 * - @mention autocomplete
 * - Typing indicator (shows when the other person is typing)
 * - Seen/delivered receipt marks
 * - Infinite scroll pagination (load older messages as you scroll up)
 *
 * HOW PAGINATION WORKS:
 * We don't load ALL messages at once (there could be thousands!).
 * Instead, we load the 50 most recent, and when you scroll to the top,
 * we load the 50 BEFORE those, and so on. This is called "cursor pagination".
 */

class MessagesManager {
  constructor() {
    this.currentConvId   = null;  // Which conversation we're viewing
    this.currentOtherUser = null; // The other person in the conversation
    this.messages        = [];    // Loaded messages (in-memory cache)
    this.isLoading       = false; // Prevent duplicate loads
    this.hasMore         = true;  // Are there older messages to load?
    this.replyToMessage  = null;  // Message we're replying to (if any)
    this.pendingFiles    = [];    // Files selected but not yet sent
    this.typingTimer     = null;  // For debouncing typing events
    this.isTyping        = false;
    this.mentionQuery    = null;  // Current @mention search query
    this.conversationUsers = [];  // Users in the conversation (for @mention)
  }

  // ─────────────────────────────────────────────
  // LOAD MESSAGES
  // ─────────────────────────────────────────────

  /**
   * Load messages for a conversation.
   * Called when opening a conversation for the first time.
   * @param {number} convId - The conversation ID
   * @param {object} otherUser - The other user's data
   */
  async loadMessages(convId, otherUser) {
    // Reset state for the new conversation
    this.currentConvId    = convId;
    this.currentOtherUser = otherUser;
    this.messages         = [];
    this.hasMore          = true;
    this.replyToMessage   = null;
    this.pendingFiles     = [];

    // Clear UI
    document.getElementById('messages-list').innerHTML = '';
    document.getElementById('reply-bar').classList.add('hidden');
    document.getElementById('file-preview-strip').classList.add('hidden');
    document.getElementById('message-input').value = '';
    document.getElementById('load-more-wrap').classList.add('hidden');

    // Build users list for @mention (just the two people)
    this.conversationUsers = [
      otherUser,
      window.currentUser,
    ].filter(Boolean);

    // Show loader
    document.getElementById('messages-loader').classList.remove('hidden');

    await this.fetchMessages(null);  // null = fetch newest messages

    document.getElementById('messages-loader').classList.add('hidden');

    // Scroll to bottom after loading
    this.scrollToBottom(false);

    // Focus the input
    document.getElementById('message-input').focus();
  }

  /**
   * Fetch a batch of messages from the backend.
   * @param {number|null} before - Load messages before this message ID (for pagination)
   */
  async fetchMessages(before) {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const data = await API.messages.getMessages(this.currentConvId, before, 50);
      const msgs = data.messages || data || [];

      if (msgs.length < 50) {
        this.hasMore = false;
        document.getElementById('load-more-wrap').classList.add('hidden');
      } else {
        document.getElementById('load-more-wrap').classList.remove('hidden');
      }

      if (before) {
        // Prepend older messages to the top
        this.messages = [...msgs, ...this.messages];
        this.renderMessages(msgs, 'prepend');
      } else {
        // Initial load — replace all messages
        this.messages = msgs;
        this.renderMessages(msgs, 'replace');
      }

    } catch (err) {
      console.error('[Messages] Load failed:', err);
      showToast('Failed to load messages.', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  // ─────────────────────────────────────────────
  // RENDER MESSAGES
  // ─────────────────────────────────────────────

  /**
   * Render an array of messages into the DOM.
   * @param {object[]} messages - Message objects from backend
   * @param {'replace'|'prepend'|'append'} mode
   */
  renderMessages(messages, mode = 'append') {
    const list = document.getElementById('messages-list');

    if (mode === 'replace') {
      list.innerHTML = '';
    }

    // Group messages by day to show date dividers
    const grouped = this.groupByDay(messages);

    const fragment = document.createDocumentFragment();

    grouped.forEach(group => {
      // Date divider
      const divider = document.createElement('div');
      divider.className = 'date-divider';
      divider.textContent = formatDateDivider(group.date);
      fragment.appendChild(divider);

      // Messages for this day
      group.messages.forEach(msg => {
        const el = this.createMessageElement(msg);
        fragment.appendChild(el);
      });
    });

    if (mode === 'prepend') {
      // Save scroll position so prepending doesn't jump
      const scrollBottom = list.scrollHeight - list.parentElement.scrollTop;
      list.parentElement.insertBefore(fragment, list.firstChild);
      list.parentElement.scrollTop = list.scrollHeight - scrollBottom;
    } else {
      list.appendChild(fragment);
    }
  }

  /**
   * Group messages by day (for date dividers).
   * @param {object[]} messages
   * @returns {Array<{date: string, messages: object[]}>}
   */
  groupByDay(messages) {
    const groups = [];
    let currentDay = null;
    let currentGroup = null;

    messages.forEach(msg => {
      const day = new Date(msg.created_at).toDateString();
      if (day !== currentDay) {
        currentDay = day;
        currentGroup = { date: msg.created_at, messages: [] };
        groups.push(currentGroup);
      }
      currentGroup.messages.push(msg);
    });

    return groups;
  }

  /**
   * Create the HTML element for a single message.
   * @param {object} msg - The message object from backend
   * @returns {HTMLElement}
   */
  createMessageElement(msg) {
    const isMine = msg.sender_id === window.currentUser?.id;
    const sender = isMine ? window.currentUser : this.currentOtherUser;

    const el = document.createElement('div');
    el.className = `message ${isMine ? 'mine' : ''}`;
    el.dataset.msgId = msg.id;
    el.dataset.convId = msg.conversation_id;

    // Build message content
    let contentHtml = '';

    // Reply quote (if this message is replying to another)
    if (msg.reply_to) {
      const replyAuthor = msg.reply_to.sender?.display_name || msg.reply_to.sender?.username || 'Unknown';
      const replyText = msg.reply_to.is_deleted
        ? '⊗ Deleted message'
        : (msg.reply_to.content || 'Attachment').slice(0, 80);
      contentHtml += `
        <div class="msg-reply-quote">
          <div class="quote-author">${escapeHtml(replyAuthor)}</div>
          <div class="quote-text">${escapeHtml(replyText)}</div>
        </div>`;
    }

    // Message text
    if (msg.is_deleted) {
      contentHtml += `<span class="msg-deleted">⊗ This message was deleted</span>`;
    } else if (msg.content) {
      const escaped  = escapeHtml(msg.content);
      const withMentions = escaped.replace(/@(\w+)/g, '<span class="at-mention">@$1</span>');
      contentHtml += `<div class="msg-text">${withMentions}</div>`;
    }

    // Attachments
    if (msg.attachments && msg.attachments.length > 0) {
      contentHtml += this.renderAttachments(msg.attachments);
    }

    // Assemble full message HTML
    el.innerHTML = `
      <div class="msg-avatar">
        <img src="${getAvatarUrl(sender)}" alt="${escapeHtml(sender?.display_name || sender?.username || '')}" class="avatar" />
      </div>
      <div class="msg-body">
        ${!isMine ? `<span class="msg-sender">${escapeHtml(sender?.display_name || sender?.username || '')}</span>` : ''}
        <div class="msg-bubble${msg.is_deleted ? ' deleted' : ''}">${contentHtml}</div>
        <div class="msg-meta">
          <span class="msg-time">${formatTime(msg.created_at)}</span>
          ${msg.is_edited ? '<span class="msg-edited">(edited)</span>' : ''}
          ${isMine ? `<span class="msg-status ${msg.read_at ? 'seen' : ''}" title="${msg.read_at ? 'Seen' : 'Sent'}">
            ${msg.read_at ? '✓✓' : '✓'}
          </span>` : ''}
        </div>
      </div>
    `;

    // ── EVENT LISTENERS on this message ──────
    const bubble = el.querySelector('.msg-bubble');

    // Double-click to reply
    bubble.addEventListener('dblclick', () => {
      if (!msg.is_deleted) this.startReply(msg);
    });

    // Right-click for context menu
    bubble.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, msg, isMine);
    });

    // Long-press for mobile context menu (500ms hold)
    let longPressTimer;
    bubble.addEventListener('touchstart', () => {
      longPressTimer = setTimeout(() => this.showContextMenu(null, msg, isMine, bubble), 500);
    });
    bubble.addEventListener('touchend', () => clearTimeout(longPressTimer));
    bubble.addEventListener('touchmove', () => clearTimeout(longPressTimer));

    // Click image attachments to open lightbox
    el.querySelectorAll('.msg-image').forEach(img => {
      img.addEventListener('click', () => {
        openLightbox(img.src, img.dataset.filename);
      });
    });

    return el;
  }

  /**
   * Render file attachments within a message.
   * @param {object[]} attachments - Array of attachment objects
   * @returns {string} HTML string
   */
  renderAttachments(attachments) {
    return attachments.map(att => {
      const url = att.url || `/uploads/${att.file_path}`;
      const name = att.original_name || att.filename || 'file';
      const size = att.file_size ? formatFileSize(att.file_size) : '';

      if (att.file_type?.startsWith('image/')) {
        return `<img class="msg-image" src="${url}" alt="${escapeHtml(name)}" loading="lazy"
                     data-filename="${escapeHtml(name)}" />`;
      }
      if (att.file_type?.startsWith('video/')) {
        return `<video class="msg-video" controls preload="metadata">
                  <source src="${url}" type="${att.file_type}" />
                </video>`;
      }
      // Generic file download link
      return `<a class="msg-file" href="${url}" target="_blank" download="${escapeHtml(name)}">
                <span class="file-icon">📎</span>
                <div class="file-info">
                  <span class="file-name">${escapeHtml(name)}</span>
                  ${size ? `<span class="file-size">${size}</span>` : ''}
                </div>
                <span>↓</span>
              </a>`;
    }).join('');
  }

  // ─────────────────────────────────────────────
  // SEND MESSAGE
  // ─────────────────────────────────────────────

  async sendMessage() {
    const input    = document.getElementById('message-input');
    const content  = input.value.trim();
    const files    = this.pendingFiles;

    // Don't send empty messages
    if (!content && files.length === 0) return;
    if (!this.currentConvId) return;

    // Stop typing indicator
    this.stopTyping();

    const replyToId = this.replyToMessage?.id || null;

    // Clear the input immediately (optimistic UX)
    input.value = '';
    input.style.height = 'auto';
    this.clearReply();
    this.clearPendingFiles();

    try {
      // Send via REST API. The server also emits a socket new_message event,
      // but we render from the REST response directly so the sender sees their
      // message immediately without waiting for the socket echo.
      const result = await API.messages.sendMessage(
        this.currentConvId,
        content,
        replyToId,
        files.length > 0 ? files : null
      );
      // Render the confirmed message returned by the server
      if (result && result.message) {
        this.onNewMessage(result.message);
      }
    } catch (err) {
      showToast('Failed to send: ' + err.message, 'error');
      // Restore the input content on failure
      input.value = content;
    }
  }

  // ─────────────────────────────────────────────
  // REAL-TIME SOCKET EVENT HANDLERS
  // ─────────────────────────────────────────────

  /**
   * Called by socket.js when a new message arrives.
   * Only show if it's for the currently open conversation.
   */
  onNewMessage(message) {
    if (message.conversation_id !== this.currentConvId) return;
    // FIX: deduplicate — REST response already rendered this message for the sender,
    // so when the socket echo arrives we skip it to avoid rendering twice.
    if (this.messages.some(m => m.id === message.id)) return;

    // Add to our in-memory list
    this.messages.push(message);

    // Render the new message
    const list = document.getElementById('messages-list');
    const el   = this.createMessageElement(message);

    // FIX: typing-indicator is a sibling of messages-list, not a child.
    // insertBefore(el, typingEl) threw a DOM error and silently dropped the message.
    list.appendChild(el);

    // Scroll to bottom to show the new message
    this.scrollToBottom(true);

    // Tell server we've seen the message
    if (message.sender_id !== window.currentUser?.id) {
      socketManager.markRead(this.currentConvId);
    }
  }

  /** Called when a message is edited (by socket event) */
  onMessageEdited(data) {
    if (data.conversation_id !== this.currentConvId) return;

    // Update our in-memory list
    const msg = this.messages.find(m => m.id === data.message_id || m.id === data.id);
    if (msg) {
      msg.content    = data.content;
      msg.is_edited  = true;
    }

    // Update the DOM element
    const el = document.querySelector(`[data-msg-id="${data.message_id || data.id}"]`);
    if (el) {
      const textEl = el.querySelector('.msg-text');
      if (textEl) {
        const escaped = escapeHtml(data.content);
        textEl.innerHTML = escaped.replace(/@(\w+)/g, '<span class="at-mention">@$1</span>');
      }
      // Add "edited" marker
      const metaEl = el.querySelector('.msg-meta');
      if (metaEl && !metaEl.querySelector('.msg-edited')) {
        const editedSpan = document.createElement('span');
        editedSpan.className = 'msg-edited';
        editedSpan.textContent = '(edited)';
        metaEl.insertBefore(editedSpan, metaEl.querySelector('.msg-status'));
      }
    }
  }

  /** Called when a message is deleted (by socket event) */
  onMessageDeleted(data) {
    if (data.conversation_id !== this.currentConvId) return;

    const el = document.querySelector(`[data-msg-id="${data.message_id}"]`);
    if (el) {
      if (data.delete_for_everyone) {
        // Replace bubble content with "deleted" notice
        const bubble = el.querySelector('.msg-bubble');
        if (bubble) {
          bubble.innerHTML = '<span class="msg-deleted">⊗ This message was deleted</span>';
          bubble.classList.add('deleted');
        }
      } else {
        // Just remove the element (deleted for me only)
        el.remove();
      }
    }
  }

  /** Called when the other user reads our messages */
  onMessagesRead(data) {
    if (data.conversation_id !== this.currentConvId) return;

    // Update all our sent messages to show double tick (seen)
    document.querySelectorAll('.message.mine .msg-status').forEach(el => {
      el.textContent = '✓✓';
      el.classList.add('seen');
      el.title = 'Seen';
    });
  }

  // ─────────────────────────────────────────────
  // TYPING INDICATOR
  // ─────────────────────────────────────────────

  /** Called by socket.js when the other person starts typing */
  onTypingStart(data) {
    if (data.conversation_id !== this.currentConvId) return;
    if (data.userId === window.currentUser?.id) return;  // Don't show our own typing

    const indicator = document.getElementById('typing-indicator');
    document.getElementById('typing-name').textContent =
      (data.username || 'Someone') + ' is transmitting...';
    indicator.classList.remove('hidden');
    this.scrollToBottom(true);
  }

  onTypingStop(data) {
    if (data.conversation_id !== this.currentConvId) return;
    document.getElementById('typing-indicator').classList.add('hidden');
  }

  /** Emit typing start when user types — debounced so we don't spam */
  startTyping() {
    if (!this.isTyping) {
      this.isTyping = true;
      socketManager.sendTypingStart(this.currentConvId);
    }
    // Reset the stop timer
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(), 2500);
  }

  stopTyping() {
    if (this.isTyping) {
      this.isTyping = false;
      socketManager.sendTypingStop(this.currentConvId);
    }
    clearTimeout(this.typingTimer);
  }

  // ─────────────────────────────────────────────
  // REPLY TO MESSAGE
  // ─────────────────────────────────────────────

  startReply(msg) {
    this.replyToMessage = msg;
    const bar = document.getElementById('reply-bar');
    const authorEl  = document.getElementById('reply-author');
    const previewEl = document.getElementById('reply-preview');

    const isMine = msg.sender_id === window.currentUser?.id;
    authorEl.textContent  = isMine ? 'You' : (this.currentOtherUser?.display_name || this.currentOtherUser?.username || 'User');
    previewEl.textContent = (msg.content || 'Attachment').slice(0, 60);

    bar.classList.remove('hidden');
    document.getElementById('message-input').focus();
  }

  clearReply() {
    this.replyToMessage = null;
    document.getElementById('reply-bar').classList.add('hidden');
  }

  // ─────────────────────────────────────────────
  // CONTEXT MENU (right-click / long-press)
  // ─────────────────────────────────────────────

  showContextMenu(event, msg, isMine, anchorEl = null) {
    const menu = document.getElementById('context-menu');

    // Position the menu at the click coordinates
    let x, y;
    if (event) {
      x = event.clientX;
      y = event.clientY;
    } else if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom;
    }

    // Show/hide options based on ownership
    document.getElementById('ctx-edit').style.display    = isMine && !msg.is_deleted ? '' : 'none';
    document.getElementById('ctx-delete-me').style.display  = !msg.is_deleted ? '' : 'none';
    document.getElementById('ctx-delete-all').style.display = isMine && !msg.is_deleted ? '' : 'none';

    // Position and show
    menu.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
    menu.style.top  = `${Math.min(y, window.innerHeight - 200)}px`;
    menu.classList.remove('hidden');

    // Store which message this menu is for
    menu.dataset.msgId   = msg.id;
    menu.dataset.convId  = msg.conversation_id;
    menu.dataset.content = msg.content || '';
    menu.dataset.isMine  = isMine;
  }

  hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
  }

  initContextMenu() {
    const menu = document.getElementById('context-menu');

    // Reply
    document.getElementById('ctx-reply').addEventListener('click', () => {
      const msgId = menu.dataset.msgId;
      const msg = this.messages.find(m => m.id === msgId);
      if (msg) this.startReply(msg);
      this.hideContextMenu();
    });

    // Copy
    document.getElementById('ctx-copy').addEventListener('click', () => {
      const text = menu.dataset.content;
      navigator.clipboard.writeText(text)
        .then(() => showToast('Copied to clipboard.', 'info'))
        .catch(() => showToast('Copy failed.', 'error'));
      this.hideContextMenu();
    });

    // Edit
    document.getElementById('ctx-edit').addEventListener('click', () => {
      const msgId   = menu.dataset.msgId;
      const content = menu.dataset.content;
      this.startEdit(msgId, content);
      this.hideContextMenu();
    });

    // Delete for me
    document.getElementById('ctx-delete-me').addEventListener('click', async () => {
      const msgId  = menu.dataset.msgId;
      const convId = menu.dataset.convId;
      this.hideContextMenu();
      await this.deleteMessage(msgId, convId, false);
    });

    // Delete for everyone
    document.getElementById('ctx-delete-all').addEventListener('click', async () => {
      const msgId  = menu.dataset.msgId;
      const convId = menu.dataset.convId;
      this.hideContextMenu();
      await this.deleteMessage(msgId, convId, true);
    });

    // Close menu when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) this.hideContextMenu();
    });
  }

  // ─────────────────────────────────────────────
  // EDIT MESSAGE
  // ─────────────────────────────────────────────

  startEdit(msgId, currentContent) {
    const input = document.getElementById('message-input');
    input.value = currentContent;
    input.dataset.editingId = msgId;
    input.focus();

    // Change send button to show we're editing
    document.getElementById('send-btn').textContent = '✎';
    showToast('Editing message... (Press Enter to save, Esc to cancel)', 'info', 4000);
  }

  async submitEdit() {
    const input   = document.getElementById('message-input');
    const msgId   = input.dataset.editingId;
    const content = input.value.trim();

    if (!content) { showToast('Message cannot be empty.', 'warning'); return; }

    try {
      await API.messages.editMessage(msgId, content);
      socketManager.emitMessageEdit(msgId, this.currentConvId, content);
    } catch (err) {
      showToast('Edit failed: ' + err.message, 'error');
    } finally {
      this.cancelEdit();
    }
  }

  cancelEdit() {
    const input = document.getElementById('message-input');
    input.value = '';
    delete input.dataset.editingId;
    document.getElementById('send-btn').textContent = '▶';
  }

  isEditing() {
    return !!document.getElementById('message-input').dataset.editingId;
  }

  // ─────────────────────────────────────────────
  // DELETE MESSAGE
  // ─────────────────────────────────────────────

  async deleteMessage(msgId, convId, forEveryone) {
    try {
      await API.messages.deleteMessage(msgId, forEveryone);
      socketManager.emitMessageDelete(msgId, convId, forEveryone);

      if (!forEveryone) {
        // Remove from DOM immediately for "delete for me"
        document.querySelector(`[data-msg-id="${msgId}"]`)?.remove();
      }
      showToast(forEveryone ? 'Message deleted for everyone.' : 'Message deleted for you.', 'info');
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  }

  // ─────────────────────────────────────────────
  // FILE UPLOADS
  // ─────────────────────────────────────────────

  initFileUpload() {
    const attachBtn = document.getElementById('attach-btn');
    const fileInput = document.getElementById('file-input');

    attachBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      this.addPendingFiles(files);
      fileInput.value = '';  // Reset so user can select same file again
    });

    // Drag & drop on the messages area
    const area = document.getElementById('messages-area');
    area.addEventListener('dragover', (e) => {
      e.preventDefault();
      area.style.outline = '2px dashed var(--cyan)';
    });
    area.addEventListener('dragleave', () => {
      area.style.outline = '';
    });
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.style.outline = '';
      const files = Array.from(e.dataTransfer.files);
      this.addPendingFiles(files);
    });

    document.getElementById('clear-files').addEventListener('click', () => {
      this.clearPendingFiles();
    });
  }

  addPendingFiles(files) {
    this.pendingFiles = [...this.pendingFiles, ...files];
    this.renderFilePreview();
  }

  clearPendingFiles() {
    this.pendingFiles = [];
    document.getElementById('file-preview-strip').classList.add('hidden');
    document.getElementById('file-preview-list').innerHTML = '';
  }

  renderFilePreview() {
    const strip = document.getElementById('file-preview-strip');
    const list  = document.getElementById('file-preview-list');
    list.innerHTML = '';

    this.pendingFiles.forEach(file => {
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.className = 'file-thumb';
        img.alt = file.name;
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; };
        reader.readAsDataURL(file);
        list.appendChild(img);
      } else {
        const thumb = document.createElement('div');
        thumb.className = 'file-thumb-generic';
        thumb.title = file.name;
        const ext = file.name.split('.').pop().toUpperCase();
        thumb.innerHTML = `<span style="font-size:.55rem;font-family:var(--font-mono);color:var(--cyan)">${ext}</span>`;
        list.appendChild(thumb);
      }
    });

    strip.classList.remove('hidden');
  }

  // ─────────────────────────────────────────────
  // @MENTION AUTOCOMPLETE
  // ─────────────────────────────────────────────

  initMentionAutocomplete() {
    const input = document.getElementById('message-input');
    const popup = document.getElementById('mention-popup');

    input.addEventListener('input', () => {
      const text   = input.value;
      const cursor = input.selectionStart;

      // Check if we're typing an @mention
      // Find the @ before the cursor with no space between it and cursor
      const before  = text.slice(0, cursor);
      const match   = before.match(/@(\w*)$/);

      if (match) {
        this.mentionQuery = match[1].toLowerCase();
        this.showMentionPopup(match[1]);
      } else {
        this.hideMentionPopup();
      }
    });
  }

  showMentionPopup(query) {
    const popup = document.getElementById('mention-popup');
    const results = this.conversationUsers.filter(u => {
      const username = u.username?.toLowerCase() || '';
      const name     = u.display_name?.toLowerCase() || '';
      return username.includes(query.toLowerCase()) || name.includes(query.toLowerCase());
    });

    if (results.length === 0) {
      this.hideMentionPopup();
      return;
    }

    popup.innerHTML = '';
    results.forEach((user, i) => {
      const item = document.createElement('div');
      item.className = `mention-item${i === 0 ? ' active' : ''}`;
      item.innerHTML = `
        <img src="${getAvatarUrl(user)}" class="avatar" style="width:28px;height:28px" alt="" />
        <span class="mention-name">${escapeHtml(user.display_name || user.username)}</span>
        <span class="mention-handle">@${escapeHtml(user.username)}</span>
      `;
      item.addEventListener('click', () => this.insertMention(user.username));
      popup.appendChild(item);
    });

    popup.classList.remove('hidden');
  }

  hideMentionPopup() {
    document.getElementById('mention-popup').classList.add('hidden');
    this.mentionQuery = null;
  }

  /** Replace the partial @query with the full @username */
  insertMention(username) {
    const input  = document.getElementById('message-input');
    const cursor = input.selectionStart;
    const text   = input.value;
    const before = text.slice(0, cursor);
    const after  = text.slice(cursor);

    // Replace @partial with @username
    const newBefore = before.replace(/@\w*$/, `@${username} `);
    input.value     = newBefore + after;

    // Move cursor after the inserted mention
    const newPos = newBefore.length;
    input.setSelectionRange(newPos, newPos);

    this.hideMentionPopup();
    input.focus();
  }

  // ─────────────────────────────────────────────
  // SCROLL HELPERS
  // ─────────────────────────────────────────────

  scrollToBottom(smooth = false) {
    const area = document.getElementById('messages-area');
    area.scrollTo({
      top: area.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  initInfiniteScroll() {
    const area = document.getElementById('messages-area');

    // When user scrolls near the top, load older messages
    area.addEventListener('scroll', () => {
      if (area.scrollTop < 100 && this.hasMore && !this.isLoading) {
        const oldest = this.messages[0];
        if (oldest) this.fetchMessages(oldest.created_at);
      }
    });

    // Also handle the "Load Older" button
    document.getElementById('load-more-btn').addEventListener('click', () => {
      const oldest = this.messages[0];
      if (oldest) this.fetchMessages(oldest.created_at);
    });
  }

  // ─────────────────────────────────────────────
  // INPUT EVENT HANDLERS
  // ─────────────────────────────────────────────

  initInput() {
    const input   = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    // Auto-resize textarea as user types
    initAutoResizeTextarea(input);

    input.addEventListener('input', () => {
      if (this.currentConvId) this.startTyping();
    });

    // Send on Enter (Shift+Enter = newline, Enter = send)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isEditing()) {
        this.cancelEdit();
        return;
      }

      // Close mention popup on Escape
      if (e.key === 'Escape') {
        this.hideMentionPopup();
        this.clearReply();
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();  // Don't add a newline
        if (this.isEditing()) {
          this.submitEdit();
        } else {
          this.sendMessage();
        }
      }
    });

    sendBtn.addEventListener('click', () => {
      if (this.isEditing()) {
        this.submitEdit();
      } else {
        this.sendMessage();
      }
    });

    // Reply cancel
    document.getElementById('reply-cancel').addEventListener('click', () => this.clearReply());

    // Emoji picker callback
    initEmojiPicker((emoji) => {
      const pos = input.selectionStart;
      input.value = input.value.slice(0, pos) + emoji + input.value.slice(pos);
      input.focus();
      input.setSelectionRange(pos + emoji.length, pos + emoji.length);
    });
  }

  // ─────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────

  init() {
    this.initInput();
    this.initContextMenu();
    this.initFileUpload();
    this.initMentionAutocomplete();
    this.initInfiniteScroll();
  }
}

window.messagesManager = new MessagesManager();
