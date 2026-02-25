require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Student = require('./models/Student');

const removeTestStudent = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');
    
    // Find and remove test student
    const testStudent = await Student.findOne({ rollNumber: '001' }).populate('userId');
    
    if (testStudent) {
      console.log('Found test student:', testStudent.userId.fullName);
      
      // Remove the student record
      await Student.findByIdAndDelete(testStudent._id);
      console.log('✅ Removed test student record');
      
      // Remove the user record  
      await User.findByIdAndDelete(testStudent.userId._id);
      console.log('✅ Removed test user record');
      
      console.log('✅ Test data cleaned up successfully');
    } else {
      console.log('No test student found');
    }
    
    // Verify remaining students
    const remainingStudents = await Student.find({}).populate('userId', 'fullName');
    console.log(`\n📊 Remaining students: ${remainingStudents.length}`);
    remainingStudents.forEach(student => {
      console.log(`  - ${student.userId.fullName} (Class ${student.class}, Section ${student.section})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

removeTestStudent();