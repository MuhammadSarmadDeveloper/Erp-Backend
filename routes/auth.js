const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const { authMiddleware } = require('../middleware/auth');

// Register (Admin only in production, open for demo)
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, role, rollNumber, class: className, section } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Create user
    const user = await User.create({
      email,
      password,
      fullName,
      role
    });

    // If student, create student profile
    if (role === 'student' && rollNumber) {
      await Student.create({
        userId: user._id,
        rollNumber,
        class: className,
        section
      });
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Check database connection with retry logic
    const mongoose = require('mongoose');
    let dbState = mongoose.connection.readyState;
    
    // If connecting, wait up to 3 seconds for connection to establish
    if (dbState === 2) {
      console.log('Waiting for database connection to establish...');
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        dbState = mongoose.connection.readyState;
        if (dbState === 1) break;
      }
    }
    
    // If still not connected, return error
    if (dbState !== 1) {
      console.error(`Login failed: Database not connected (state: ${dbState})`);
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection not available. Please try again in a moment.'
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if role matches
    if (role && user.role !== role) {
      return res.status(401).json({ success: false, message: `You are not registered as ${role}. Your role is ${user.role}.` });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie (optional - for backward compatibility)
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Changed from 'strict' to 'lax' for better compatibility
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Populate additional user data
    let userData = {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone || '',
      address: user.address || '',
      profileImage: user.profileImage || ''
    };

    // If student, include student details
    if (user.role === 'student') {
      const student = await Student.findOne({ userId: user._id });
      if (student) {
        userData.student = {
          id: student._id,
          rollNumber: student.rollNumber,
          class: student.class,
          section: student.section
        };
      }
    }

    res.json({
      success: true,
      message: 'Login successful',
      user: userData,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    
    // Check if it's a database connection error
    if (error.name === 'MongooseError' || error.message.includes('buffering timed out')) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection error. Please try again.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Login failed. Please try again.' 
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    // Check database connection with retry logic
    const mongoose = require('mongoose');
    let dbState = mongoose.connection.readyState;
    
    // If connecting, wait up to 2 seconds for connection to establish
    if (dbState === 2) {
      console.log('Waiting for database connection to establish...');
      for (let i = 0; i < 4; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        dbState = mongoose.connection.readyState;
        if (dbState === 1) break;
      }
    }
    
    // If still not connected, return error
    if (dbState !== 1) {
      console.error(`Get user failed: Database not connected (state: ${dbState})`);
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection not available. Please try again in a moment.'
      });
    }

    let userData = {
      id: req.user._id,
      email: req.user.email,
      fullName: req.user.fullName,
      role: req.user.role,
      phone: req.user.phone || '',
      address: req.user.address || '',
      profileImage: req.user.profileImage || ''
    };

    // If student, include student details
    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id });
      if (student) {
        userData.student = {
          id: student._id,
          rollNumber: student.rollNumber,
          class: student.class,
          section: student.section
        };
      }
    }

    res.json({ success: true, user: userData });
  } catch (error) {
    console.error('Get current user error:', error);
    
    // Check if it's a database connection error
    if (error.name === 'MongooseError' || error.message.includes('buffering timed out')) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection error. Please try again.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user data.' 
    });
  }
});

// Update Profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { fullName, email, phone, address, profileImage } = req.body;

    // Check if email is already taken by another user
    if (email && email !== req.user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: req.user._id } });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        fullName,
        email,
        phone,
        address,
        ...(profileImage && { profileImage })
      },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Change Password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id);

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Validate new password
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
