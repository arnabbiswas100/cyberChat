/**
 * api.js — ALL REST API CALLS TO THE BACKEND
 *
 * BEGINNER EXPLANATION:
 * The backend has a REST API — a set of URLs ("endpoints") that our
 * frontend can call to get or send data. For example:
 *   POST /api/auth/login  → send username + password, get back a token
 *   GET  /api/users/search?q=alice  → search for users
 *
 * We use the browser's built-in `fetch()` function to make these calls.
 * Every call returns a Promise — meaning the result arrives *later* (async).
 * We use `async/await` to wait for the result cleanly.
 *
 * JWT TOKEN: After login, the server gives us a "JSON Web Token" (JWT).
 * We store it in localStorage and send it with every request in a header:
 *   Authorization: Bearer <token>
 * The server uses this to know who we are. Without it, it returns 401.
 */

// ─────────────────────────────────────────────
// BASE URL — points to our Express backend
// In development, it's on the same server (relative URL).
// ─────────────────────────────────────────────
const API_BASE = '';  // Empty = same origin (port 6767)

// ─────────────────────────────────────────────
// TOKEN HELPERS — save/get/remove the JWT
// ─────────────────────────────────────────────

/** Save JWT token to localStorage (persists across page reloads) */
function saveToken(token) {
  localStorage.setItem('cyberchat_token', token);
}

/** Read the saved JWT token */
function getToken() {
  return localStorage.getItem('cyberchat_token');
}

/** Remove the token (on logout) */
function clearToken() {
  localStorage.removeItem('cyberchat_token');
}

// ─────────────────────────────────────────────
// CORE REQUEST HELPER
// All our API calls go through this one function.
// ─────────────────────────────────────────────

/**
 * Makes an HTTP request to the backend.
 * @param {string} path   - API path, e.g. '/api/auth/login'
 * @param {string} method - HTTP verb: 'GET', 'POST', 'PUT', 'DELETE'
 * @param {object} body   - Data to send (for POST/PUT), or null
 * @returns {Promise<object>} - The JSON response from the server
 */
async function apiRequest(path, method = 'GET', body = null) {
  // Build the request options
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',  // Tell server we're sending JSON
    },
  };

  // If we have a token, attach it so the server knows who we are
  const token = getToken();
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  // Attach the body data (for POST/PUT requests)
  if (body) {
    options.body = JSON.stringify(body);  // Convert JS object → JSON string
  }

  // Actually make the HTTP request
  const response = await fetch(API_BASE + path, options);

  // Parse the JSON response body
  const data = await response.json();

  // If the server returned an error status (4xx, 5xx), throw it
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'Request failed');
    error.status = response.status;
    throw error;
  }

  return data;
}

/**
 * Uploads a file using multipart/form-data.
 * This is different from regular JSON requests — files need special encoding.
 * @param {string} path      - API path
 * @param {FormData} formData - The file(s) wrapped in a FormData object
 */
async function apiUpload(path, formData) {
  const token = getToken();
  const options = {
    method: 'POST',
    headers: {},  // NOTE: Do NOT set Content-Type — browser sets it automatically for FormData
    body: formData,
  };
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(API_BASE + path, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Upload failed');
  }
  return data;
}

// ─────────────────────────────────────────────
// AUTH ENDPOINTS
// ─────────────────────────────────────────────

const API = {
  auth: {
    /** Register a new user account */
    register(username, displayName, email, password) {
      return apiRequest('/api/auth/register', 'POST', { username, display_name: displayName, email, password });
    },

    /** Log in — returns { token, user } on success */
    login(identifier, password) {
      return apiRequest('/api/auth/login', 'POST', { identifier, password });
    },

    /** Log out (server invalidates token) */
    logout() {
      return apiRequest('/api/auth/logout', 'POST');
    },

    /** Get the currently logged-in user's info */
    me() {
      return apiRequest('/api/auth/me', 'GET');
    },
  },

  // ─────────────────────────────────────────────
  // USER ENDPOINTS
  // ─────────────────────────────────────────────
  users: {
    /** Search for users by username or display name */
    search(query) {
      return apiRequest(`/api/users/search?q=${encodeURIComponent(query)}`, 'GET');
    },

    /** Get a user's public profile by their username */
    getByUsername(username) {
      return apiRequest(`/api/users/${encodeURIComponent(username)}`, 'GET');
    },

    /** Update the current user's profile (displayName, bio) */
    updateProfile(displayName, bio) {
      return apiRequest('/api/users/profile', 'PUT', { display_name: displayName, bio });
    },

    /** Upload a new avatar image */
    uploadAvatar(file) {
      const formData = new FormData();
      formData.append('avatar', file);
      return apiUpload('/api/users/avatar', formData);
    },

    /** Change the user's password */
    changePassword(currentPassword, newPassword) {
      return apiRequest('/api/users/password', 'PUT', { current_password: currentPassword, new_password: newPassword });
    },
  },

  // ─────────────────────────────────────────────
  // CONVERSATION ENDPOINTS
  // ─────────────────────────────────────────────
  chat: {
    /** Get all conversations for the current user */
    getConversations() {
      return apiRequest('/api/chat/conversations', 'GET');
    },

    /** Start a new conversation with another user by their userId */
    createConversation(otherUserId) {
      return apiRequest('/api/chat/conversations', 'POST', { other_user_id: otherUserId });
    },
  },

  // ─────────────────────────────────────────────
  // MESSAGE ENDPOINTS
  // ─────────────────────────────────────────────
  messages: {
    /**
     * Get messages for a conversation.
     * `before` is a message ID for pagination (load older messages).
     * `limit` is how many messages to fetch at once (max 50).
     */
    getMessages(conversationId, before = null, limit = 50) {
      let url = `/api/messages/${conversationId}?limit=${limit}`;
      if (before) url += `&before=${before}`;
      return apiRequest(url, 'GET');
    },

    /**
     * Send a message.
     * @param {number} conversationId
     * @param {string} content      - The message text
     * @param {number|null} replyToId - If replying to another message
     * @param {File[]|null} files   - Optional file attachments
     */
    async sendMessage(conversationId, content, replyToId = null, files = null) {
      // If there are files, we must use multipart/form-data upload
      if (files && files.length > 0) {
        const formData = new FormData();
        formData.append('content', content || '');
        if (replyToId) formData.append('reply_to_id', replyToId);
        files.forEach(file => formData.append('files', file));
        return apiUpload(`/api/messages/${conversationId}`, formData);
      }
      // Otherwise send as normal JSON
      return apiRequest(`/api/messages/${conversationId}`, 'POST', {
        content,
        reply_to_id: replyToId || undefined,
      });
    },

    /** Edit an existing message's content */
    editMessage(messageId, content) {
      return apiRequest(`/api/messages/${messageId}`, 'PUT', { content });
    },

    /** Delete a message (deleteForEveryone=true removes it for all users) */
    deleteMessage(messageId, deleteForEveryone = false) {
      return apiRequest(`/api/messages/${messageId}?everyone=${deleteForEveryone}`, 'DELETE');
    },
  },
};

// Make API available globally
window.API = API;
window.saveToken = saveToken;
window.getToken = getToken;
window.clearToken = clearToken;
