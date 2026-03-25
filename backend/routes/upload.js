// FILE: backend/routes/upload.js
// PURPOSE: Provides a streaming endpoint for large file downloads.
// For normal downloads, Express static serving handles it.
// This route is for when we need custom streaming logic.

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/upload/stream/:folder/:filename
// Streams a file with Range support (needed for video seeking)
router.get('/stream/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  
  // Security: prevent path traversal attacks like "../../etc/passwd"
  const safeName  = path.basename(filename);
  const safeFolder = ['images', 'videos', 'files', 'avatars'].includes(folder) ? folder : null;
  
  if (!safeFolder) {
    return res.status(400).json({ error: 'Invalid folder.' });
  }
  
  const filePath = path.join(__dirname, '../../uploads', safeFolder, safeName);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }
  
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  
  // HTTP Range requests: The browser can request a specific byte range.
  // This enables video seeking without downloading the whole file.
  const range = req.headers.range;
  
  if (range) {
    // Parse range: "bytes=start-end"
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end   = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = (end - start) + 1;
    
    // 206 Partial Content — we're sending only part of the file
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   'video/mp4', // Adjust based on actual MIME
    });
    
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    // Send the whole file
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type':   'application/octet-stream',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;
