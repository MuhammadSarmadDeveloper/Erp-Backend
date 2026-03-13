const mongoose = require('mongoose');

let cachedConnection = null;

async function connectDB() {
  // Reuse existing connection in serverless environment
  if (cachedConnection && cachedConnection.readyState === 1) {
    console.log('✅ Using cached MongoDB connection');
    return cachedConnection;
  }

  try {
    console.log('🔄 Connecting to MongoDB...');
    
    const connection = await mongoose.connect(process.env.MONGODB_URL, {
      maxPoolSize: 5,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      connectTimeoutMS: 10000,
    });

    cachedConnection = connection;
    console.log('✅ Connected to MongoDB');
    return connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    throw error;
  }
}

// Graceful disconnect
process.on('SIGINT', async () => {
  if (cachedConnection) {
    await cachedConnection.disconnect();
    console.log('MongoDB connection closed');
  }
});

module.exports = { connectDB };
