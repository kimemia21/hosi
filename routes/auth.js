// Authentication API for Hospital Management System
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();


// Create connection pool
const pool = require("../db")
// Environment variables (use dotenv in production)
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';
const SALT_ROUNDS = 10;

// Middleware to validate JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ success: false, message: 'Access token required' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if session exists in database
    const [sessions] = await pool.query(
      'SELECT * FROM sessions WHERE session_id = ? AND expires_at > NOW()',
      [decoded.sessionId]
    );
    
    if (sessions.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session' });
    }
    
    // Attach user info to request
    req.user = decoded;
    
    // Update last_activity
    await pool.query(
      'UPDATE sessions SET last_activity = NOW() WHERE session_id = ?',
      [decoded.sessionId]
    );
    
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
};


// Register new user (staff member must exist first)
router.post('/register', async (req, res) => {
  const { staffId, username, password, defaultRoleId } = req.body;
  
  if (!staffId || !username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Staff ID, username and password are required' 
    });
  }
  
  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Check if staff exists
      const [staff] = await connection.query(
        'SELECT * FROM staff WHERE staff_id = ?', 
        [staffId]
      );
      
      if (staff.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          success: false, 
          message: 'Staff ID does not exist. User must be a staff member.' 
        });
      }
      
      // Check if username already exists
      const [existingUser] = await connection.query(
        'SELECT * FROM users WHERE username = ?', 
        [username]
      );
      
      if (existingUser.length > 0) {
        await connection.rollback();
        return res.status(409).json({ 
          success: false, 
          message: 'Username already exists. Please choose another.' 
        });
      }
      
      // Check if staff already has a user account
      const [existingStaffUser] = await connection.query(
        'SELECT * FROM users WHERE staff_id = ?', 
        [staffId]
      );
      
      if (existingStaffUser.length > 0) {
        await connection.rollback();
        return res.status(409).json({ 
          success: false, 
          message: 'This staff member already has a user account.' 
        });
      }
      
      // Hash password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      const passwordHash = await bcrypt.hash(password, salt);
      
      // Insert new user
      const [result] = await connection.query(
        `INSERT INTO users 
         (staff_id, username, password_hash, salt, is_active) 
         VALUES (?, ?, ?, ?, TRUE)`,
        [staffId, username, passwordHash, salt]
      );
      
      const userId = result.insertId;
      
      // Assign default role if provided
      if (defaultRoleId) {
        await connection.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
          [userId, defaultRoleId]
        );
      }
      
      // Create audit log entry
      await connection.query(
        `INSERT INTO audit_logs 
         (user_id, action_type, table_name, record_id, new_value) 
         VALUES (?, 'Create', 'users', ?, ?)`,
        [userId, userId, JSON.stringify({ username })]
      );
      
      await connection.commit();
      
      return res.status(201).json({ 
        success: true, 
        message: 'User registered successfully',
        userId
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error during registration' 
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Username and password are required' 
    });
  }
  
  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get user information
      const [users] = await connection.query(
        `SELECT u.*, s.first_name, s.last_name, s.role 
         FROM users u
         JOIN staff s ON u.staff_id = s.staff_id
         WHERE u.username = ?`,
        [username]
      );
      
      if (users.length === 0) {
        await connection.query(
          `INSERT INTO audit_logs 
           (action_type, table_name, record_id, old_value) 
           VALUES ('Failed Login', 'users', 0, ?)`,
          [JSON.stringify({ username, ipAddress })]
        );
        
        await connection.commit();
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid username or password' 
        });
      }
      
      const user = users[0];
      
      // Check if account is active
      if (!user.is_active) {
        await connection.commit();
        return res.status(403).json({ 
          success: false, 
          message: 'Account is deactivated. Please contact administrator.' 
        });
      }
      
      // Check if account is locked
      if (user.account_locked && new Date(user.account_locked_until) > new Date()) {
        await connection.commit();
        return res.status(403).json({ 
          success: false, 
          message: `Account is locked. Try again after ${new Date(user.account_locked_until).toLocaleString()}` 
        });
      }
      
      // Verify password
      const passwordValid = await bcrypt.compare(password, user.password_hash);
      
      if (!passwordValid) {
        // Increment failed login attempts
        const failedAttempts = user.failed_login_attempts + 1;
        let accountLocked = user.account_locked;
        let accountLockedUntil = user.account_locked_until;
        
        // Lock account after 5 failed attempts
        if (failedAttempts >= 5) {
          accountLocked = true;
          // Lock for 30 minutes
          accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
        }
        
        await connection.query(
          `UPDATE users SET 
           failed_login_attempts = ?, 
           account_locked = ?, 
           account_locked_until = ? 
           WHERE user_id = ?`,
          [failedAttempts, accountLocked, accountLockedUntil, user.user_id]
        );
        
        await connection.query(
          `INSERT INTO audit_logs 
           (user_id, action_type, table_name, record_id, old_value) 
           VALUES (?, 'Failed Login', 'users', ?, ?)`,
          [user.user_id, user.user_id, JSON.stringify({ ipAddress })]
        );
        
        await connection.commit();
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid username or password' 
        });
      }
      
      // Reset failed login attempts
      await connection.query(
        'UPDATE users SET failed_login_attempts = 0, last_login = NOW() WHERE user_id = ?',
        [user.user_id]
      );
      
      // Create new session
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      await connection.query(
        `INSERT INTO sessions 
         (session_id, user_id, ip_address, user_agent, expires_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, user.user_id, ipAddress, userAgent, expiresAt]
      );
      
      // Get user roles
      const [roles] = await connection.query(
        `SELECT r.role_name 
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.role_id
         WHERE ur.user_id = ?`,
        [user.user_id]
      );
      
      const userRoles = roles.map(role => role.role_name);
      
      // Create JWT token
      const token = jwt.sign(
        { 
          userId: user.user_id,
          staffId: user.staff_id,
          username: user.username,
          fullName: `${user.first_name} ${user.last_name}`,
          staffRole: user.role,
          userRoles,
          sessionId
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      // Create audit log entry
      await connection.query(
        `INSERT INTO audit_logs 
         (user_id, action_type, table_name, record_id, new_value) 
         VALUES (?, 'Login', 'sessions', ?, ?)`,
        [user.user_id, user.user_id, JSON.stringify({ sessionId, ipAddress })]
      );
      
      await connection.commit();
      
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          userId: user.user_id,
          staffId: user.staff_id,
          username: user.username,
          fullName: `${user.first_name} ${user.last_name}`,
          staffRole: user.role,
          roles: userRoles
        }
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error during login' 
    });
  }
});

// Logout user
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Delete session
    await pool.query(
      'DELETE FROM sessions WHERE session_id = ?',
      [req.user.sessionId]
    );
    
    // Create audit log entry
    await pool.query(
      `INSERT INTO audit_logs 
       (user_id, action_type, table_name, record_id, new_value) 
       VALUES (?, 'Logout', 'sessions', ?, ?)`,
      [req.user.userId, req.user.userId, JSON.stringify({ sessionId: req.user.sessionId })]
    );
    
    return res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error during logout' 
    });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.user_id, u.staff_id, u.username, u.is_active, u.last_login,
              s.first_name, s.last_name, s.role, s.department_id, s.email, s.phone
       FROM users u
       JOIN staff s ON u.staff_id = s.staff_id
       WHERE u.user_id = ?`,
      [req.user.userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = users[0];
    
    // Get user roles
    const [roles] = await pool.query(
      `SELECT r.role_id, r.role_name 
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.role_id
       WHERE ur.user_id = ?`,
      [req.user.userId]
    );
    
    // Get department info if applicable
    let department = null;
    if (user.department_id) {
      const [departments] = await pool.query(
        'SELECT * FROM departments WHERE department_id = ?',
        [user.department_id]
      );
      if (departments.length > 0) {
        department = departments[0];
      }
    }
    
    return res.status(200).json({
      success: true,
      user: {
        userId: user.user_id,
        staffId: user.staff_id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`,
        email: user.email,
        phone: user.phone,
        staffRole: user.role,
        isActive: user.is_active === 1,
        lastLogin: user.last_login,
        roles: roles.map(r => ({ id: r.role_id, name: r.role_name })),
        department
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Change password
router.post('/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ 
      success: false, 
      message: 'Current password and new password are required' 
    });
  }
  
  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get user information
      const [users] = await connection.query(
        'SELECT * FROM users WHERE user_id = ?',
        [req.user.userId]
      );
      
      if (users.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      const user = users[0];
      
      // Verify current password
      const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);
      
      if (!passwordValid) {
        await connection.rollback();
        return res.status(401).json({ 
          success: false, 
          message: 'Current password is incorrect' 
        });
      }
      
      // Hash new password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      const passwordHash = await bcrypt.hash(newPassword, salt);
      
      // Update password
      await connection.query(
        'UPDATE users SET password_hash = ?, salt = ? WHERE user_id = ?',
        [passwordHash, salt, req.user.userId]
      );
      
      // Create audit log entry
      await connection.query(
        `INSERT INTO audit_logs 
         (user_id, action_type, table_name, record_id, new_value) 
         VALUES (?, 'Update', 'users', ?, ?)`,
        [req.user.userId, req.user.userId, JSON.stringify({ action: 'password_change' })]
      );
      
      await connection.commit();
      
      return res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Request password reset (for forgotten passwords)
router.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  
  if (!username) {
    return res.status(400).json({ 
      success: false, 
      message: 'Username is required' 
    });
  }
  
  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get user information
      const [users] = await connection.query(
        `SELECT u.*, s.email 
         FROM users u
         JOIN staff s ON u.staff_id = s.staff_id
         WHERE u.username = ?`,
        [username]
      );
      
      if (users.length === 0) {
        // Don't reveal if user exists or not for security
        await connection.commit();
        return res.status(200).json({ 
          success: true, 
          message: 'If your account exists, a password reset link will be sent to your email' 
        });
      }
      
      const user = users[0];
      
      // Generate reset token
      const resetToken = uuidv4();
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      
      // Save reset token
      await connection.query(
        'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE user_id = ?',
        [resetToken, resetExpires, user.user_id]
      );
      
      // Create audit log entry
      await connection.query(
        `INSERT INTO audit_logs 
         (user_id, action_type, table_name, record_id, new_value) 
         VALUES (?, 'Password Reset', 'users', ?, ?)`,
        [user.user_id, user.user_id, JSON.stringify({ action: 'reset_requested' })]
      );
      
      await connection.commit();
      
      // In a real application, you would send an email with the reset token
      console.log(`Reset token for ${username}: ${resetToken}`);
      console.log(`Would send email to: ${user.email}`);
      
      return res.status(200).json({
        success: true,
        message: 'If your account exists, a password reset link will be sent to your email',
        // Only for development, remove in production
        debug: {
          resetToken,
          email: user.email
        }
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ 
      success: false, 
      message: 'Token and new password are required' 
    });
  }
  
  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Find user with this reset token
      const [users] = await connection.query(
        'SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires > NOW()',
        [token]
      );
      
      if (users.length === 0) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid or expired password reset token' 
        });
      }
      
      const user = users[0];
      
      // Hash new password
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      const passwordHash = await bcrypt.hash(newPassword, salt);
      
      // Update password and clear reset token
      await connection.query(
        `UPDATE users 
         SET password_hash = ?, 
             salt = ?,
             password_reset_token = NULL,
             password_reset_expires = NULL,
             failed_login_attempts = 0,
             account_locked = FALSE,
             account_locked_until = NULL
         WHERE user_id = ?`,
        [passwordHash, salt, user.user_id]
      );
      
      // Create audit log entry
      await connection.query(
        `INSERT INTO audit_logs 
         (user_id, action_type, table_name, record_id, new_value) 
         VALUES (?, 'Password Reset', 'users', ?, ?)`,
        [user.user_id, user.user_id, JSON.stringify({ action: 'reset_completed' })]
      );
      
      // Invalidate all existing sessions for this user
      await connection.query(
        'DELETE FROM sessions WHERE user_id = ?',
        [user.user_id]
      );
      
      await connection.commit();
      
      return res.status(200).json({
        success: true,
        message: 'Password has been reset successfully'
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

module.exports = router;