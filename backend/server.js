// =============================================================
// FILE: backend/server.js
// PURPOSE: The main entry point of our application.
//          This file starts the HTTP server, sets up Express,
//          attaches Socket.IO, and registers all routes.
//
// THEORY (for beginners):
//   When you run `node backend/server.js`, Node.js executes
//   this file from top to bottom.
//
//   Express.js is a "web framework" — it makes it easy to
//   handle HTTP requests (GET, POST, etc.) with clean code.
//
//   HTTP is the protocol your browser uses to talk to servers.
//   When you visit http://localhost:6767, your browser sends
//   an HTTP GET request to our server.
//
//   Socket.IO adds real-time, two-way communication on top of
//   HTTP. Regular HTTP is "request-response" (like email),
//   but Socket.IO keeps a persistent connection open (like a
//   phone call) so the server can push data to clients instantly.
// =============================================================

// Load environment variables FIRST, before anything else
require('dotenv').config();

const express    = require('express');
const http       = require('http');         // Node's built-in HTTP module
const { Server } = require('socket.io');   // Socket.IO server class
const path       = require('path');         // Node's built-in path utility
const cors       = require('cors');         // Cross-Origin Resource Sharing
const helmet     = require('helmet');       // Security HTTP headers
const rateLimit  = require('express-rate-limit'); // Rate limiting

// Import our custom modules
const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/users');
const chatRoutes    = require('./routes/chat');
const messageRoutes = require('./routes/messages');
const uploadRoutes  = require('./routes/upload');
const { initSocket } = require('./sockets/socketManager');

// -------------------------------------------------------
// 1. Create the Express app
// -------------------------------------------------------
// express() returns an "app" object with methods like
// app.get(), app.post(), app.use() to handle requests.
const app = express();

// -------------------------------------------------------
// 2. Create the HTTP server
// -------------------------------------------------------
// We wrap Express in a raw HTTP server because Socket.IO
// needs to attach to the same server (not just Express).
const httpServer = http.createServer(app);

// -------------------------------------------------------
// 3. Configure Socket.IO
// -------------------------------------------------------
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:6767',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Increase max size for large messages with file metadata
  maxHttpBufferSize: 1e8, // 100 MB for socket messages
});

// -------------------------------------------------------
// 4. Security Middleware
// -------------------------------------------------------
// Middleware = functions that run on EVERY request before
// your route handlers. They're like security checkpoints.

// Helmet adds secure HTTP headers automatically
// It prevents many common web attacks
app.use(helmet({
  contentSecurityPolicy: false, // We'll handle this ourselves
  crossOriginEmbedderPolicy: false,
}));

// CORS (Cross-Origin Resource Sharing):
// Browsers block requests from one "origin" (domain) to another
// by default. We allow our own frontend to talk to the backend.
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:6767',
  credentials: true, // Allow cookies/auth headers
}));

// Rate Limiting: Prevents abuse by limiting requests per IP.
// This stops bots from hammering our API.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 200,                  // Max 200 requests per window per IP
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter); // Apply only to /api routes

// Stricter rate limit for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // Only 20 login attempts per window
  message: { error: 'Too many authentication attempts. Try again in 15 minutes.' },
});
app.use('/api/auth', authLimiter);

// -------------------------------------------------------
// 5. Body Parsing Middleware
// -------------------------------------------------------
// These allow Express to read the body of incoming requests.

// Parse JSON bodies (e.g., { "username": "neo", "password": "..." })
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies (from HTML forms)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// -------------------------------------------------------
// 6. Static File Serving
// -------------------------------------------------------
// "Static files" are files we serve directly without processing:
// our HTML, CSS, JavaScript frontend files, and uploaded media.

// Serve uploaded files (avatars, images, videos, etc.)
// When a browser requests /uploads/images/cat.jpg,
// Express looks in the ./uploads/images/ folder.
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '7d', // Tell browsers to cache files for 7 days
}));

// Serve the frontend (HTML, CSS, JS files)
// The '../frontend' folder contains our entire UI.
app.use(express.static(path.join(__dirname, '../frontend')));

// -------------------------------------------------------
// 7. API Routes
// -------------------------------------------------------
// Routes define what happens when a specific URL is requested.
// We split them into separate files for organization.

app.use('/api/auth',     authRoutes);    // /api/auth/register, /api/auth/login
app.use('/api/users',    userRoutes);    // /api/users/profile, /api/users/search
app.use('/api/chat',     chatRoutes);    // /api/chat/conversations
app.use('/api/messages', messageRoutes); // /api/messages/:conversationId
app.use('/api/upload',   uploadRoutes);  // /api/upload/file

// -------------------------------------------------------
// 8. Catch-All Route (SPA Support)
// -------------------------------------------------------
// For any other URL (like /chat, /profile), serve the main
// HTML file. The frontend JavaScript handles the routing.
app.get('*', (req, res) => {
  // Don't catch API routes with this handler
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// -------------------------------------------------------
// 9. Global Error Handler
// -------------------------------------------------------
// If any route throws an error, this catches it.
// Express knows it's an error handler because it has 4 params.
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  
  // Don't leak internal error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An internal server error occurred'
    : err.message;
    
  res.status(err.status || 500).json({ error: message });
});

// -------------------------------------------------------
// 10. Initialize Socket.IO
// -------------------------------------------------------
// Pass our `io` instance to the socket manager module,
// which sets up all real-time event handlers.
initSocket(io);

// -------------------------------------------------------
// 11. Start the Server
// -------------------------------------------------------
const PORT = parseInt(process.env.PORT) || 6767;

httpServer.listen(PORT, () => {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         CYBERCHAT SERVER ONLINE              ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  URL:  http://localhost:${PORT}               ║`);
  console.log(`║  Mode: ${process.env.NODE_ENV || 'development'}                         ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('\n');
});

// Handle graceful shutdown (Ctrl+C)
// This ensures all connections are properly closed
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down CyberChat server...');
  httpServer.close(() => {
    console.log('✅ Server closed gracefully.');
    process.exit(0);
  });
});
