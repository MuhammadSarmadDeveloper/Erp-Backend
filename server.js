require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://erp-school-vercel.app', 'https://www.erp-school-vercel.app'] // Add your frontend production URLs here
    : ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['set-cookie']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// Database connection with retry logic
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    });
    isConnected = true;
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    isConnected = false;
    // Retry after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

// Connect to database
connectDB();

// Middleware to ensure DB connection before processing requests
app.use(async (req, res, next) => {
  if (!isConnected) {
    try {
      await connectDB();
    } catch (error) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection failed. Please try again.' 
      });
    }
  }
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/results', require('./routes/results'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/fees', require('./routes/fees'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/teacher-attendance', require('./routes/teacherAttendance'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/salary', require('./routes/salary'));
app.use('/api/events', require('./routes/events'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/complaints', require('./routes/complaints'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running', dbConnected: isConnected });
});

// Log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({ success: false, message: err.message || 'Something went wrong!' });
});

// Export app for Vercel serverless
module.exports = app;

// Local development server
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}
