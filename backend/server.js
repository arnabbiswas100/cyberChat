require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/users');
const chatRoutes    = require('./routes/chat');
const messageRoutes = require('./routes/messages');
const uploadRoutes  = require('./routes/upload');
const { initSocket }    = require('./sockets/socketManager');
const { setupDatabase } = require('./config/setupDatabase');

const app        = express();
const httpServer = http.createServer(app);

// ---------------------------------------------------------------------------
// CORS origin helper
// In production, FRONTEND_URL should be set to your Railway app URL.
// We accept either an exact origin string OR '*' for open access.
// ---------------------------------------------------------------------------
const allowedOrigin = process.env.FRONTEND_URL || '*';

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
    credentials: allowedOrigin !== '*',
  },
  maxHttpBufferSize: 1e8,
});

// Expose io to controllers via req.app.get('io')
app.set('io', io);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: allowedOrigin,
  credentials: allowedOrigin !== '*',
}));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20 });
app.use('/api/auth', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/chat',     chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload',   uploadRoutes);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API endpoint not found' });
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  const message = process.env.NODE_ENV === 'production' ? 'An internal server error occurred' : err.message;
  res.status(err.status || 500).json({ error: message });
});

initSocket(io);

// ---------------------------------------------------------------------------
// Start — run DB setup first, then listen
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT) || 6767;

setupDatabase()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`\n✅ CyberChat running on port ${PORT}\n`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to start — database setup error:', err.message);
    process.exit(1);
  });

process.on('SIGINT', () => {
  httpServer.close(() => { console.log('Server closed.'); process.exit(0); });
});
