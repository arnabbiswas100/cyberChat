/**
 * auth.js — LOGIN & REGISTER UI LOGIC
 *
 * BEGINNER EXPLANATION:
 * This file handles everything to do with user authentication (auth).
 * Authentication = proving who you are (logging in).
 *
 * Flow:
 * 1. User fills in username + password and clicks "Login"
 * 2. We send those to the backend via API.auth.login()
 * 3. If correct, the server returns a JWT token + user object
 * 4. We save the token (so future requests know who we are)
 * 5. We switch from the auth screen to the main chat screen
 *
 * Same for Register — but we also validate that passwords match, etc.
 */

// ─────────────────────────────────────────────
// TAB SWITCHING (Login ↔ Register)
// ─────────────────────────────────────────────

function initAuthTabs() {
  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;  // 'login' or 'register'

      // Update tab active states
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show the matching form, hide others
      forms.forEach(form => {
        const isMatch = form.id === `${target}-form`;
        form.classList.toggle('active', isMatch);
      });

      // Clear any errors
      clearAuthErrors();
    });
  });
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

function initLogin() {
  const loginBtn  = document.getElementById('login-btn');
  const passInput = document.getElementById('login-password');

  // Allow pressing Enter to submit
  passInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('login-identifier').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('login-password').focus();
  });

  loginBtn.addEventListener('click', handleLogin);
}

async function handleLogin() {
  const identifier = document.getElementById('login-identifier').value.trim();
  const password   = document.getElementById('login-password').value;

  // Basic validation — make sure fields aren't empty
  if (!identifier || !password) {
    showAuthError('login-error', 'Please fill in all fields.');
    return;
  }

  setLoginLoading(true);
  clearAuthErrors();

  try {
    // Call the backend login endpoint
    const data = await API.auth.login(identifier, password);

    // data = { token: "eyJhb...", user: { id, username, ... } }
    saveToken(data.token);  // Store token for future API calls

    // Store current user info globally so other parts of app can access it
    window.currentUser = data.user;

    // Transition from auth screen to chat app
    showScreen('app-screen');
    showToast('Neural link established ✔', 'success');

    // Initialize the main app now that we're logged in
    if (window.initApp) window.initApp();

  } catch (err) {
    // err.message comes from the server's error response
    showAuthError('login-error', err.message || 'Login failed. Check your credentials.');
  } finally {
    setLoginLoading(false);
  }
}

function setLoginLoading(loading) {
  const btn    = document.getElementById('login-btn');
  const text   = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  text.classList.toggle('hidden', loading);
  loader.classList.toggle('hidden', !loading);
}

// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────

function initRegister() {
  document.getElementById('register-btn').addEventListener('click', handleRegister);

  // Allow Enter on confirm field to submit
  document.getElementById('reg-confirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleRegister();
  });
}

async function handleRegister() {
  const username    = document.getElementById('reg-username').value.trim();
  const displayName = document.getElementById('reg-displayname').value.trim();
  const email       = document.getElementById('reg-email').value.trim();
  const password    = document.getElementById('reg-password').value;
  const confirm     = document.getElementById('reg-confirm').value;

  clearAuthErrors();

  // Validate all fields
  if (!username || !displayName || !email || !password || !confirm) {
    showAuthError('register-error', 'Please fill in all fields.');
    return;
  }

  if (username.length < 3 || username.length > 20) {
    showAuthError('register-error', 'Username must be 3-20 characters.');
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showAuthError('register-error', 'Username can only contain letters, numbers, and underscores.');
    return;
  }

  if (password.length < 8) {
    showAuthError('register-error', 'Password must be at least 8 characters.');
    return;
  }

  if (password !== confirm) {
    showAuthError('register-error', 'Passwords do not match.');
    return;
  }

  setRegisterLoading(true);

  try {
    const data = await API.auth.register(username, displayName, email, password);

    // Registration succeeded — auto-login with the returned token
    saveToken(data.token);
    window.currentUser = data.user;

    showScreen('app-screen');
    showToast('Identity created! Welcome to CyberChat.', 'success');

    if (window.initApp) window.initApp();

  } catch (err) {
    showAuthError('register-error', err.message || 'Registration failed.');
  } finally {
    setRegisterLoading(false);
  }
}

function setRegisterLoading(loading) {
  const btn    = document.getElementById('register-btn');
  const text   = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  text.classList.toggle('hidden', loading);
  loader.classList.toggle('hidden', !loading);
}

// ─────────────────────────────────────────────
// ERROR DISPLAY
// ─────────────────────────────────────────────

function showAuthError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = '⚠ ' + message;
    el.classList.remove('hidden');
  }
}

function clearAuthErrors() {
  document.querySelectorAll('.form-error').forEach(el => {
    el.classList.add('hidden');
    el.textContent = '';
  });
}

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────

async function handleLogout() {
  try {
    await API.auth.logout();
  } catch {
    // Ignore server errors during logout — we log out client-side regardless
  }

  clearToken();
  window.currentUser = null;

  // Disconnect socket
  if (window.socketManager) window.socketManager.disconnect();

  // Go back to auth screen
  showScreen('auth-screen');
  showToast('Disconnected from neural link.', 'info');

  // Reset the app state
  resetAppState();
}

function resetAppState() {
  // Clear conversation list
  const convList = document.getElementById('conversation-list');
  if (convList) convList.innerHTML = `
    <div class="list-placeholder">
      <span class="placeholder-icon">◈</span>
      <p>No active channels</p>
      <small>Start a new conversation</small>
    </div>`;

  // Show empty state
  document.getElementById('chat-window')?.classList.add('hidden');
  document.getElementById('empty-state')?.classList.remove('hidden');

  // Clear message list
  const msgList = document.getElementById('messages-list');
  if (msgList) msgList.innerHTML = '';

  // Clear login fields for next time
  document.getElementById('login-identifier').value = '';
  document.getElementById('login-password').value = '';
}

// ─────────────────────────────────────────────
// CHECK FOR EXISTING SESSION
// If user already logged in (has a token), skip auth screen
// ─────────────────────────────────────────────

async function checkExistingSession() {
  const token = getToken();
  if (!token) return false;  // No token = not logged in

  try {
    // Verify the token is still valid by calling /api/auth/me
    const data = await API.auth.me();
    window.currentUser = data.user || data;
    return true;  // Still logged in
  } catch {
    // Token is expired or invalid
    clearToken();
    return false;
  }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

function initAuth() {
  initAuthTabs();
  initLogin();
  initRegister();

  document.getElementById('logout-btn').addEventListener('click', handleLogout);
}

window.initAuth = initAuth;
window.checkExistingSession = checkExistingSession;
window.handleLogout = handleLogout;
