const mongoose = require('mongoose');
require('dotenv').config();
const Student = require('./models/Student');

async function fixStudents() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    
    // Update ALL students without isActive field to set it to true
    const result = await Student.updateMany(
      {isActive: {$exists: false}},  // Find students without isActive field
      {$set: {isActive: true}}
    );
    
    console.log('Updated records (missing isActive):', result.modifiedCount);
    
    // Also update all students in class 9-A to be sure
    const result2 = await Student.updateMany(
      {class: '9', section: 'A'},
      {$set: {isActive: true}}
    );
    console.log('Updated records (Class 9-A):', result2.modifiedCount);
    
    // Verify the fix
    const check = await Student.find({class: '9', section: 'A', isActive: true});
    console.log('Students now found with isActive filter:', check.length);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixStudents();
