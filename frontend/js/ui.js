/**
 * ui.js — SHARED UI HELPERS
 *
 * BEGINNER EXPLANATION:
 * This file contains "utility" functions that are used all over the app.
 * Think of them as reusable tools that any other JS file can call.
 *
 * Includes:
 *  - Toast notifications (the little pop-up messages)
 *  - Modal open/close (the pop-up dialog boxes)
 *  - Theme toggle (dark/light mode)
 *  - Emoji picker
 *  - Time formatting helpers
 *  - Avatar URL helper
 */

// ─────────────────────────────────────────────
// TOAST NOTIFICATIONS
// Small floating messages that appear, then disappear
// ─────────────────────────────────────────────

/**
 * Show a toast notification.
 * @param {string} message  - The text to show
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration - How long before it disappears (ms)
 */
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');

  // Choose icon based on type
  const icons = { success: '✔', error: '✕', info: 'ℹ', warning: '⚠' };

  // Create the toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // After `duration` ms, fade it out and remove it
  setTimeout(() => {
    toast.classList.add('removing');
    // Wait for CSS animation to finish, then remove from DOM
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ─────────────────────────────────────────────
// MODAL HELPERS
// Modals are the overlay pop-up boxes
// ─────────────────────────────────────────────

/**
 * Open a modal by its element ID.
 * @param {string} modalId - The HTML id of the modal overlay div
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    // Trap focus inside modal for accessibility
    modal.querySelector('input, button, textarea')?.focus();
  }
}

/**
 * Close a modal by its element ID.
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

// Set up close buttons — any button with class 'modal-close' and data-modal="modalId"
function initModalCloseButtons() {
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.modal-close');
    if (closeBtn) {
      const modalId = closeBtn.dataset.modal;
      if (modalId) closeModal(modalId);
    }

    // Also close when clicking the dark overlay background (not the box itself)
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.add('hidden');
    }
  });
}

// ─────────────────────────────────────────────
// THEME TOGGLE (Dark / Light Mode)
// ─────────────────────────────────────────────

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  const html = document.documentElement;  // The <html> element

  // Restore saved preference
  const saved = localStorage.getItem('cyberchat_theme') || 'dark';
  html.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  btn.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('cyberchat_theme', next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle');
  btn.textContent = theme === 'dark' ? '☀' : '◑';
}

// ─────────────────────────────────────────────
// EMOJI PICKER
// Built from scratch — no external library needed!
// ─────────────────────────────────────────────

// Emoji data organized by category
const EMOJI_DATA = {
  '😀': ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮','🤐','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  '👋': ['👋','🤚','🖐️','✋','🖖','👌','🤌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','🤝','🙏','✍️','💅','🤳','💪','🦾','👂','🦻','👃','🦶','👣','👀','👁️','🫦','💋','👄','🦷','👅'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☯️','🕉️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🈳','🈹'],
  '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊'],
  '🍎': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🌮','🌯','🫔','🧆','🥙','🧀','🍜','🍝','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🥠','🍢'],
  '⚽': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🎿','🛷','🥌','🎯','🪃','🎣','🤿','🎽','🎿','🛷','🥊','🥋','🎖️','🏆','🥇','🥈','🥉','🏅','🎗️','🎫','🎟️','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎻','🎲','🎯','🎮','🎰'],
  '🚀': ['🚀','✈️','🛫','🛬','🛩️','💺','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏎️','🏍️','🛵','🛺','🚲','🛴','🛹','🛼'],
  '💻': ['💻','🖥️','🖨️','⌨️','🖱️','🖲️','💽','💾','💿','📀','📱','☎️','📞','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌚','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🦯','🔧','🔨','⚒️','🛠️','⛏️','🔩','🪛','🔫','🪃','🛡️','🪚','🔪'],
};

// Category display icons
const EMOJI_CATS = {
  '😀': '😀', '👋': '👋', '❤️': '❤️', '🐶': '🐶',
  '🍎': '🍎', '⚽': '⚽', '🚀': '🚀', '💻': '💻',
};

let emojiPickerOpen = false;
let currentEmojiCallback = null;

/**
 * Initialize the emoji picker.
 * @param {Function} onPick - Called with the emoji string when user picks one
 */
function initEmojiPicker(onPick) {
  const picker = document.getElementById('emoji-picker');
  const grid = document.getElementById('emoji-grid');
  const catsEl = document.getElementById('emoji-categories');
  const searchInput = document.getElementById('emoji-search');
  const emojiBtn = document.getElementById('emoji-btn');

  currentEmojiCallback = onPick;

  // Build category buttons
  Object.entries(EMOJI_CATS).forEach(([key, icon], i) => {
    const btn = document.createElement('button');
    btn.className = 'emoji-cat-btn' + (i === 0 ? ' active' : '');
    btn.textContent = icon;
    btn.title = key;
    btn.dataset.cat = key;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.emoji-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEmojis(EMOJI_DATA[key]);
    });
    catsEl.appendChild(btn);
  });

  // Render initial category
  renderEmojis(EMOJI_DATA['😀']);

  // Search emoji
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    if (!q) {
      const activeCat = document.querySelector('.emoji-cat-btn.active')?.dataset.cat || '😀';
      renderEmojis(EMOJI_DATA[activeCat]);
      return;
    }
    // Flatten all emoji and filter
    const all = Object.values(EMOJI_DATA).flat();
    renderEmojis(all.filter(e => e.includes(q)));
  });

  // Toggle picker on emoji button click
  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPickerOpen = !emojiPickerOpen;
    picker.classList.toggle('hidden', !emojiPickerOpen);
    if (emojiPickerOpen) searchInput.focus();
  });

  // Close picker when clicking outside
  document.addEventListener('click', (e) => {
    if (emojiPickerOpen && !picker.contains(e.target) && e.target !== emojiBtn) {
      emojiPickerOpen = false;
      picker.classList.add('hidden');
    }
  });
}

/** Render a list of emoji into the emoji grid */
function renderEmojis(emojiList) {
  const grid = document.getElementById('emoji-grid');
  grid.innerHTML = '';
  emojiList.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.title = emoji;
    btn.addEventListener('click', () => {
      if (currentEmojiCallback) currentEmojiCallback(emoji);
      // Close picker after picking
      emojiPickerOpen = false;
      document.getElementById('emoji-picker').classList.add('hidden');
    });
    grid.appendChild(btn);
  });
}

// ─────────────────────────────────────────────
// TIME FORMATTING
// ─────────────────────────────────────────────

/**
 * Format a timestamp into a human-readable time string.
 * Shows "HH:MM" for today, "Mon HH:MM" for this week, "DD/MM" for older.
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 0) {
    return timeStr;  // Today → just show time
  } else if (diffDays < 7) {
    const day = date.toLocaleDateString([], { weekday: 'short' });
    return `${day} ${timeStr}`;  // This week → "Mon 14:30"
  } else {
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });  // Older → "25/12"
  }
}

/**
 * Format a date for the date divider between messages.
 * E.g. "Today", "Yesterday", "Monday", or "25 Dec 2024"
 */
function formatDateDivider(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now - date) / 86400000);

  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'long' }).toUpperCase();
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
}

// ─────────────────────────────────────────────
// AVATAR URL HELPER
// ─────────────────────────────────────────────

/**
 * Build the URL for a user avatar.
 * If the user has a custom avatar, use it. Otherwise use a generated placeholder.
 */
function getAvatarUrl(user) {
  if (user?.avatar_url) {
    // If it's a relative path (/uploads/...), prepend the server origin
    if (user.avatar_url.startsWith('/uploads')) {
      return user.avatar_url;
    }
    return user.avatar_url;
  }
  // Fallback: generate a simple avatar from the username's first letter
  return generateAvatar(user?.display_name || user?.username || '?');
}

/**
 * Generate a simple SVG avatar with a letter and color.
 * Returns a data: URL we can use directly in <img src="...">
 */
function generateAvatar(name) {
  const letter = (name[0] || '?').toUpperCase();
  // Pick a color based on the first letter's char code
  const colors = ['#00ffff','#ff00ff','#00ff41','#ff6b00','#ffea00'];
  const color = colors[letter.charCodeAt(0) % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
    <rect width="40" height="40" fill="#0a1530" rx="20"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle"
      font-family="Orbitron, monospace" font-size="16" font-weight="700"
      fill="${color}">${letter}</text>
  </svg>`;

  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// ─────────────────────────────────────────────
// AUTO-RESIZE TEXTAREA
// Makes the message input grow as user types
// ─────────────────────────────────────────────

function initAutoResizeTextarea(textarea) {
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';  // Reset height
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';  // Grow up to 150px
  });
}

// ─────────────────────────────────────────────
// PASSWORD VISIBILITY TOGGLE
// ─────────────────────────────────────────────

function initPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (input && (input.type === 'password' || input.type === 'text')) {
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '👁‍🗨';
      }
    });
  });
}

// ─────────────────────────────────────────────
// SCREENS (Auth vs App)
// ─────────────────────────────────────────────

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId)?.classList.add('active');
}

// ─────────────────────────────────────────────
// LIGHTBOX (image preview)
// ─────────────────────────────────────────────

function openLightbox(src, filename) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const dl = document.getElementById('lightbox-download');

  img.src = src;
  dl.href = src;
  if (filename) dl.download = filename;

  lb.classList.remove('hidden');
}

function initLightbox() {
  document.getElementById('lightbox-close').addEventListener('click', () => {
    document.getElementById('lightbox').classList.add('hidden');
  });
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden');
    }
  });
}

// ─────────────────────────────────────────────
// FILE SIZE FORMATTER
// ─────────────────────────────────────────────

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ─────────────────────────────────────────────
// HIGHLIGHT @MENTIONS in message text
// ─────────────────────────────────────────────

function highlightMentions(text) {
  // Replace @username with a styled span
  return text.replace(/@(\w+)/g, '<span class="at-mention">@$1</span>');
}

// ─────────────────────────────────────────────
// ESCAPE HTML to prevent XSS attacks
// (Never render raw user text as HTML without escaping!)
// ─────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;  // textContent escapes HTML automatically
  return div.innerHTML;
}

// Export everything to window (global scope) so other files can use these
Object.assign(window, {
  showToast,
  openModal,
  closeModal,
  initModalCloseButtons,
  initThemeToggle,
  initEmojiPicker,
  formatTime,
  formatDateDivider,
  getAvatarUrl,
  generateAvatar,
  initAutoResizeTextarea,
  initPasswordToggles,
  showScreen,
  openLightbox,
  initLightbox,
  formatFileSize,
  highlightMentions,
  escapeHtml,
});
