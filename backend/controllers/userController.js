// =============================================================
// FILE: backend/controllers/userController.js
// PURPOSE: Handles user profile CRUD operations.
// =============================================================

const bcrypt  = require('bcryptjs');
const db      = require('../config/database');
const { getAvatarUrl } = require('../middleware/upload');
const { sanitizeString } = require('../middleware/validate');
const fs      = require('fs');
const path    = require('path');

// -------------------------------------------------------
// getProfile: GET /api/users/:username
// Returns a user's public profile.
// -------------------------------------------------------
const getProfile = async (req, res) => {
  try {
    const { username } = req.params;
    
    const result = await db.query(
      `SELECT id, username, display_name, avatar_url, bio, 
              is_online, last_seen, created_at
       FROM users WHERE username = $1`,
      [username.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    res.json({ user: result.rows[0] });
    
  } catch (error) {
    console.error('GetProfile error:', error);
    res.status(500).json({ error: 'Failed to get profile.' });
  }
};

// -------------------------------------------------------
// updateProfile: PUT /api/users/profile
// Updates the logged-in user's own profile.
// -------------------------------------------------------
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { display_name, bio } = req.body;
    
    // Sanitize inputs
    const cleanDisplayName = display_name ? sanitizeString(display_name.trim()) : undefined;
    const cleanBio = bio ? sanitizeString(bio.trim()) : undefined;
    
    // Validate lengths
    if (cleanDisplayName && cleanDisplayName.length > 50) {
      return res.status(400).json({ error: 'Display name must be 50 characters or less.' });
    }
    if (cleanBio && cleanBio.length > 500) {
      return res.status(400).json({ error: 'Bio must be 500 characters or less.' });
    }
    
    // Build dynamic UPDATE query (only update provided fields)
    // This pattern is common: collect fields and their values,
    // then build the SQL string programmatically.
    const updates = [];
    const values  = [];
    let paramCount = 1;
    
    if (cleanDisplayName !== undefined) {
      updates.push(`display_name = $${paramCount++}`);
      values.push(cleanDisplayName);
    }
    if (cleanBio !== undefined) {
      updates.push(`bio = $${paramCount++}`);
      values.push(cleanBio);
    }
    
    updates.push(`updated_at = NOW()`); // Always update timestamp
    
    if (values.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }
    
    values.push(userId); // Add userId as the last parameter for WHERE clause
    
    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} 
       WHERE id = $${paramCount}
       RETURNING id, username, email, display_name, avatar_url, bio`,
      values
    );
    
    res.json({ 
      message: 'Profile updated successfully.',
      user: result.rows[0] 
    });
    
  } catch (error) {
    console.error('UpdateProfile error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
};

// -------------------------------------------------------
// updateAvatar: PUT /api/users/avatar
// Uploads and sets a new profile picture.
// -------------------------------------------------------
const updateAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }
    
    const userId = req.user.id;
    const avatarUrl = getAvatarUrl(req.file);
    
    // Get the old avatar URL to delete the old file
    const oldResult = await db.query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [userId]
    );
    
    // Update the database with new avatar URL
    await db.query(
      'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2',
      [avatarUrl, userId]
    );
    
    // Delete old avatar file to save disk space
    if (oldResult.rows[0]?.avatar_url) {
      const oldFilePath = path.join(__dirname, '../../', oldResult.rows[0].avatar_url);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath); // Delete the file
      }
    }
    
    res.json({ 
      message: 'Avatar updated successfully.',
      avatar_url: avatarUrl 
    });
    
  } catch (error) {
    console.error('UpdateAvatar error:', error);
    res.status(500).json({ error: 'Failed to update avatar.' });
  }
};

// -------------------------------------------------------
// searchUsers: GET /api/users/search?q=username
// Searches for users by username or display name.
// Used for the "Start new chat" feature.
// -------------------------------------------------------
const searchUsers = async (req, res) => {
  try {
    const { q } = req.query; // ?q=searchterm
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
    }
    
    const searchTerm = `%${q.trim().toLowerCase()}%`; // % = wildcard in SQL LIKE
    
    // Search by username or display_name, exclude the current user
    const result = await db.query(
      `SELECT id, username, display_name, avatar_url, is_online, last_seen
       FROM users
       WHERE (LOWER(username) LIKE $1 OR LOWER(display_name) LIKE $1)
         AND id != $2
       ORDER BY is_online DESC, username ASC
       LIMIT 20`,
      [searchTerm, req.user.id]
    );
    
    res.json({ users: result.rows });
    
  } catch (error) {
    console.error('SearchUsers error:', error);
    res.status(500).json({ error: 'Search failed.' });
  }
};

// -------------------------------------------------------
// changePassword: PUT /api/users/password
// Changes the user's password.
// -------------------------------------------------------
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;
    
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Both current and new password are required.' });
    }
    
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    
    // Fetch current password hash
    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    
    const passwordMatch = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    
    // Hash new password and update
    const newHash = await bcrypt.hash(new_password, 10);
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, userId]
    );
    
    res.json({ message: 'Password changed successfully.' });
    
  } catch (error) {
    console.error('ChangePassword error:', error);
    res.status(500).json({ error: 'Failed to change password.' });
  }
};

module.exports = { getProfile, updateProfile, updateAvatar, searchUsers, changePassword };
