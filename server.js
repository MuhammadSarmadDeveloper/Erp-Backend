require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const app = express();

// Validate required environment variables
if (!process.env.MONGODB_URL) {
  console.error('❌ FATAL: MONGODB_URL environment variable is not set');
  console.error('Please set MONGODB_URL in your environment variables or .env file');
}

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET not set, using default (not secure for production)');
}

// MongoDB connection state
let isConnected = false;

// Global connection promise to prevent multiple simultaneous connection attempts
let connectionPromise = null;

// Serverless MongoDB connection function with retry logic
async function connectToMongoDB(retries = 5, initialDelay = 500) {
  // Check if MONGODB_URL is set
  if (!process.env.MONGODB_URL) {
    console.error('❌ MONGODB_URL not configured');
    return false;
  }

  // Check if already connected
  if (mongoose.connection.readyState === 1) {
    console.log('✅ Using existing MongoDB connection');
    isConnected = true;
    return true;
  }

  // If there's already a connection attempt in progress, wait for it
  if (connectionPromise) {
    console.log('⏳ Connection attempt already in progress, waiting...');
    try {
      return await connectionPromise;
    } catch (error) {
      console.error('❌ Waiting for connection failed:', error.message);
      connectionPromise = null;
    }
  }

  // Check if currently connecting - wait for it
  if (mongoose.connection.readyState === 2) {
    console.log('⏳ MongoDB connection in progress, waiting...');
    // Wait for connection to complete (max 10 seconds)
    for (let i = 0; i < 20; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (mongoose.connection.readyState === 1) {
        console.log('✅ Connection established');
        isConnected = true;
        return true;
      }
      if (mongoose.connection.readyState === 0) {
        console.log('⚠️ Connection failed, will retry');
        break;
      }
    }
  }

  // Create new connection promise
  connectionPromise = (async () => {
    let delay = initialDelay;
    
    // Try to connect with retries
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Connecting to MongoDB (attempt ${attempt}/${retries})...`);
        console.log(`📍 Database: ${process.env.MONGODB_URL.includes('mongodb') ? 'MongoDB Atlas' : 'Unknown'}`);
        
        // Close any existing failed connections
        if (mongoose.connection.readyState === 3) {
          await mongoose.connection.close();
        }
        
        await mongoose.connect(process.env.MONGODB_URL, {
          serverSelectionTimeoutMS: 20000, // Increased for serverless cold starts
          socketTimeoutMS: 45000,
          connectTimeoutMS: 20000,
          family: 4, // Use IPv4, skip trying IPv6
          maxPoolSize: 10,
          minPoolSize: 1,
          retryWrites: true,
          retryReads: true,
        });
        
        isConnected = true;
        console.log('✅ Connected to MongoDB successfully');
        console.log(`📊 Connection state: ${mongoose.connection.readyState}`);
        connectionPromise = null;
        return true;
      } catch (error) {
        console.error(`❌ MongoDB connection attempt ${attempt} failed:`);
        console.error(`   Message: ${error.message}`);
        if (error.name) console.error(`   Error type: ${error.name}`);
        if (error.code) console.error(`   Error code: ${error.code}`);
        isConnected = false;
        
        if (attempt < retries) {
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.5, 3000); // Exponential backoff with max 3s
        }
      }
    }
  
  console.error('❌ All MongoDB connection attempts failed');
  return false;
}

// Initial connection attempt
connectToMongoDB().catch(err => {
  console.error('Initial MongoDB connection failed:', err.message);
});

// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
  console.log('🟢 Mongoose connected to MongoDB');
  isConnected = true;
});

mongoose.connection.on('error', (err) => {
  console.error('🔴 Mongoose connection error:', err.message);
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('🟡 Mongoose disconnected from MongoDB');
  isConnected = false;
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed through app termination');
  process.exit(0);
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// CORS middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', process.env.CLIENT_URL].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['set-cookie']
}));

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Cookie parser middleware
app.use(cookieParser());

// Root route
app.get('/', (req, res) => {
  const dbStates = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  };
  
  res.json({
    success: true,
    message: 'School ERP Backend API Server',
    version: '1.0.0',
    status: 'Running',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStates[mongoose.connection.readyState] || 'Unknown',
      ready: mongoose.connection.readyState === 1
    },
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      students: '/api/students',
      teachers: '/api/teachers',
      admin: '/api/admin'
    }
  });
});

// Database connection middleware for serverless
app.use(async (req, res, next) => {
  // Skip middleware for root and health check routes
  if (req.path === '/' || req.path === '/api/health') {
    return next();
  }
  
  // For all API routes, ensure connection before proceeding
  const currentState = mongoose.connection.readyState;
  
  if (currentState === 0) {
    console.log(`🔄 Database disconnected for ${req.method} ${req.path}, connecting...`);
    
    // Try to connect with retries
    const connected = await connectToMongoDB(5, 500);
    if (!connected) {
      console.error(`❌ Failed to establish database connection for ${req.path}`);
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable. Please try again in a moment.',
        code: 'DB_CONNECTION_FAILED',
        path: req.path
      });
    }
  } else if (currentState === 2) {
    // If connecting, wait for it to complete
    console.log(`⏳ Waiting for connection to establish for ${req.method} ${req.path}...`);
    // Wait up to 15 seconds for connection
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const newState = mongoose.connection.readyState;
      
      if (newState === 1) {
        console.log('✅ Connection established during wait');
        break;
      }
      if (newState === 0) {
        console.error('❌ Connection failed during wait');
        // Try one more time
        const connected = await connectToMongoDB(3, 500);
        if (!connected) {
          return res.status(503).json({
            success: false,
            message: 'Database connection timeout. Please try again.',
            code: 'DB_CONNECTION_TIMEOUT',
            path: req.path
          });
        }
        break;
      }
    }
    // Final check
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database connection timeout. Please try again.',
        code: 'DB_CONNECTION_TIMEOUT',
        path: req.path
      });
    }
  }
  
  // Double check before proceeding
  if (mongoose.connection.readyState !== 1) {
    console.error(`❌ Database not ready (state: ${mongoose.connection.readyState}) for ${req.path}`);
    return res.status(503).json({
      success: false,
      message: 'Database is not ready. Please try again.',
      code: 'DB_NOT_READY',
      path: req.path
    });
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStates = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  };
  
  const dbState = mongoose.connection.readyState;
  
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStates[dbState] || 'Unknown',
      ready: dbState === 1
    }
  });
});

// 404 handler - must be after all routes
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found',
    path: req.path
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Something went wrong!';
  
  res.status(statusCode).json({ 
    success: false, 
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Export for serverless platforms (Vercel, Netlify, etc.)
module.exports = app;

// Start server only if not in serverless environment
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}
