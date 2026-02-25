// Script to check admin user in database
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const checkAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB\n');

    const admin = await User.findOne({ email: 'admin@school.com' });
    
    if (!admin) {
      console.log('❌ Admin user not found!');
      console.log('Run: node createAdmin.js');
      process.exit(1);
    }

    console.log('✅ Admin user found in database:');
    console.log('Email:', admin.email);
    console.log('Full Name:', admin.fullName);
    console.log('Role:', admin.role);
    console.log('Is Active:', admin.isActive);
    console.log('Password Hash:', admin.password.substring(0, 30) + '...');
    
    // Test password comparison
    const bcrypt = require('bcryptjs');
    const testPassword = 'admin123';
    const isMatch = await admin.comparePassword(testPassword);
    
    console.log('\n🔐 Password Test:');
    console.log('Testing password "admin123":', isMatch ? '✅ Correct' : '❌ Incorrect');
    
    if (!isMatch) {
      console.log('\n⚠️  Password doesn\'t match! You may need to recreate the admin user.');
      console.log('To fix: Delete the user in MongoDB Compass and run: node createAdmin.js');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

checkAdmin();
