// =============================================================
// FILE: backend/middleware/upload.js
// PURPOSE: Handles file uploads using the 'multer' library.
//
// THEORY (for beginners):
//   When users send files (images, videos, etc.) through a web
//   form or fetch request, the browser encodes them in a special
//   format called "multipart/form-data".
//
//   Multer is a Node.js middleware that:
//   1. Reads this multipart data from the request
//   2. Saves the files to the specified destination folder
//   3. Attaches file info to req.file or req.files
//
//   We configure multer to:
//   - Rename files to unique names (prevents collisions)
//   - Sort files into subfolders by type (images/, videos/, etc.)
//   - Reject files that are too large or wrong type
//   - Stream large files so we don't run out of RAM
// =============================================================

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid'); // For generating unique filenames
const mime   = require('mime-types');

// -------------------------------------------------------
// Ensure upload directories exist
// -------------------------------------------------------
const UPLOAD_BASE = path.join(__dirname, '../../uploads');
const UPLOAD_DIRS = {
  image:  path.join(UPLOAD_BASE, 'images'),
  video:  path.join(UPLOAD_BASE, 'videos'),
  file:   path.join(UPLOAD_BASE, 'files'),
  avatar: path.join(UPLOAD_BASE, 'avatars'),
};

// Create directories if they don't exist
Object.values(UPLOAD_DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created upload directory: ${dir}`);
  }
});

// -------------------------------------------------------
// Determine file type from MIME type
// -------------------------------------------------------
const getFileCategory = (mimeType) => {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
};

// -------------------------------------------------------
// Multer Storage Configuration (Disk Storage)
//
// diskStorage lets us control:
//   - destination: where to save the file
//   - filename: what to name the file
//
// We use this instead of "memory storage" because
// memory storage loads the whole file into RAM, which
// would crash the server for large files.
// -------------------------------------------------------
const storage = multer.diskStorage({
  // Choose destination folder based on file type
  destination: (req, file, callback) => {
    const category = getFileCategory(file.mimetype);
    const dest = UPLOAD_DIRS[category] || UPLOAD_DIRS.file;
    
    // callback(error, destination)
    // null = no error
    callback(null, dest);
  },
  
  // Generate a unique filename to prevent overwriting files
  filename: (req, file, callback) => {
    const uniqueId = uuidv4();                               // e.g., "550e8400-e29b-41d4-..."
    const ext = path.extname(file.originalname).toLowerCase(); // e.g., ".jpg"
    const safeName = `${uniqueId}${ext}`;                   // e.g., "550e8400.jpg"
    
    callback(null, safeName);
  },
});

// -------------------------------------------------------
// File Filter: Reject disallowed file types
// -------------------------------------------------------
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
  'image/webp', 'image/svg+xml', 'image/bmp',
  // Videos
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'video/x-msvideo', 'video/mpeg',
  // Documents & Files
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
  'text/plain', 'text/csv',
  'application/json',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
];

const fileFilter = (req, file, callback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    callback(null, true);  // Accept the file
  } else {
    // Reject the file with an error
    callback(
      new Error(`File type "${file.mimetype}" is not allowed.`),
      false
    );
  }
};

// -------------------------------------------------------
// Create the multer upload instances
// -------------------------------------------------------

// MAX_FILE_SIZE comes from .env (default: 2GB in bytes)
const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 2 * 1024 * 1024 * 1024;

// General file upload (up to 2GB)
const uploadFile = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_SIZE,
    files: 1, // One file per request
  },
});

// Avatar upload (stricter: only images, max 5MB)
const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIRS.avatar),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for avatars'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max for avatars
});

// -------------------------------------------------------
// Helper: Get the public URL path for a saved file
// -------------------------------------------------------
const getFileUrl = (file) => {
  if (!file) return null;
  
  const category = getFileCategory(file.mimetype);
  const folder = category === 'image' ? 'images' 
               : category === 'video' ? 'videos'
               : 'files';
  
  // Return the web-accessible URL path
  return `/uploads/${folder}/${file.filename}`;
};

const getAvatarUrl = (file) => {
  if (!file) return null;
  return `/uploads/avatars/${file.filename}`;
};

// -------------------------------------------------------
// Error handler middleware for multer errors
// -------------------------------------------------------
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // MulterError types: LIMIT_FILE_SIZE, LIMIT_FILE_COUNT, etc.
    if (err.code === 'LIMIT_FILE_SIZE') {
      const maxMB = Math.round(MAX_SIZE / (1024 * 1024));
      return res.status(413).json({ 
        error: `File too large. Maximum allowed size is ${maxMB}MB.` 
      });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  
  next();
};

module.exports = {
  uploadFile,
  uploadAvatar,
  getFileUrl,
  getAvatarUrl,
  getFileCategory,
  handleUploadError,
  UPLOAD_DIRS,
};
