require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Student = require('./models/Student');

const createTestStudent = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');
    
    console.log('Creating test student for Class 9, Section A...');
    
    // Create user first (without bcrypt, using plain password for now)
    const user = new User({
      fullName: 'Test Student One',
      email: 'teststudent1@school.com',
      password: 'student123', // This will be hashed by the User model pre-save hook
      role: 'student'
    });
    
    await user.save();
    console.log('✅ User created:', user.fullName);
    
    // Create student record
    const student = new Student({
      userId: user._id,
      rollNumber: '001',
      class: '9',        // Exactly matching teacher's assigned class
      section: 'A',      // Exactly matching teacher's assigned section  
      isActive: true,    // Important: set to true
      parentName: 'Test Parent One',
      parentPhone: '1234567890',
      address: 'Test Address One'
    });
    
    await student.save();
    console.log('✅ Student created successfully:');
    console.log('   Class:', student.class);
    console.log('   Section:', student.section);
    console.log('   Roll Number:', student.rollNumber);
    console.log('   Is Active:', student.isActive);
    
    // Verify by finding the student
    const foundStudent = await Student.findOne({
      class: '9',
      section: 'A',
      isActive: true
    }).populate('userId', 'fullName email');
    
    if (foundStudent) {
      console.log('✅ Verification successful - student found:');
      console.log('   Name:', foundStudent.userId.fullName);
      console.log('   Email:', foundStudent.userId.email);
    } else {
      console.log('❌ Verification failed - student not found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test student:', error);
    process.exit(1);
  }
};

createTestStudent();