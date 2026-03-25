/**
 * app.js — ENTRY POINT
 *
 * BEGINNER EXPLANATION:
 * This is the first file that runs when the page loads.
 * It's like the "main()" function in other programming languages —
 * it coordinates all the other modules and starts everything up.
 *
 * The flow:
 * 1. Page loads → app.js runs
 * 2. Initialize UI helpers (theme, modals, passwords, lightbox)
 * 3. Initialize auth (login/register forms)
 * 4. Check if user already has a valid login session
 *    - YES → skip login screen, go straight to chat
 *    - NO  → show the login/register screen
 * 5. After login: initApp() connects socket, loads conversations, etc.
 */

// ─────────────────────────────────────────────
// WAIT FOR DOM TO LOAD
// We need all HTML to exist before we can grab elements by ID.
// DOMContentLoaded fires as soon as HTML is parsed (before images load).
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] CyberChat starting up...');

  // ── Step 1: Initialize shared UI systems ──
  initPasswordToggles();   // Show/hide password toggle buttons
  initModalCloseButtons(); // Set up all modal close buttons
  initThemeToggle();       // Dark/light mode button
  initLightbox();          // Image preview lightbox

  // ── Step 2: Initialize auth forms ──
  initAuth();

  // ── Step 3: Check for existing login session ──
  // If user already logged in (has a valid JWT), skip auth screen
  const isLoggedIn = await checkExistingSession();

  if (isLoggedIn) {
    console.log('[App] Existing session found, loading app...');
    showScreen('app-screen');
    initApp();
  } else {
    console.log('[App] No session found, showing auth screen...');
    showScreen('auth-screen');
  }
});

// ─────────────────────────────────────────────
// INIT APP
// Called after successful login or when an existing session is detected.
// Sets up all the features that require being logged in.
// ─────────────────────────────────────────────

async function initApp() {
  console.log('[App] Initializing app for user:', window.currentUser?.username);

  // ── Display current user info in the sidebar ──
  updateUserBar();

  // ── Initialize all feature managers ──
  // These are defined in their respective JS files (chat.js, messages.js)
  chatManager.init();
  messagesManager.init();

  // ── Connect to Socket.IO for real-time features ──
  // This opens a WebSocket connection to the server
  socketManager.connect();

  // ── Load the conversation list ──
  // Fetches all conversations from the backend and displays them
  await chatManager.loadConversations();

  console.log('[App] Ready!');
}

// ─────────────────────────────────────────────
// UPDATE USER BAR
// Shows the logged-in user's name, handle, and avatar in the sidebar header
// ─────────────────────────────────────────────

function updateUserBar() {
  const user = window.currentUser;
  if (!user) return;

  document.getElementById('my-display-name').textContent = user.display_name || user.username;
  document.getElementById('my-username').textContent     = '@' + user.username;
  document.getElementById('my-avatar').src               = getAvatarUrl(user);
}

// Export so other files can call it
window.initApp = initApp;
window.updateUserBar = updateUserBar;
