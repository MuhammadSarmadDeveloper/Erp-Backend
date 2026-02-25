const mongoose = require('mongoose');
require('dotenv').config();
const Student = require('./models/Student');

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    
    console.log('\n=== TESTING DIFFERENT QUERY VARIATIONS ===\n');
    
    const q1 = await Student.find({class: '9', section: 'A'});
    console.log('Query 1 (no isActive filter):', q1.length, 'students');
    
    const q2 = await Student.find({class: '9', section: 'A', isActive: true});
    console.log('Query 2 (isActive: true):', q2.length, 'students');
    
    const q3 = await Student.find({class: '9', section: 'A', isActive: {$eq: true}});
    console.log('Query 3 (isActive: {$eq: true}):', q3.length, 'students');
    
    const q4 = await Student.find({class: '9', section: 'A', isActive: false});
    console.log('Query 4 (isActive: false):', q4.length, 'students');
    
    const q5 = await Student.find({class: '9', section: 'A'}).lean();
    console.log('\nQuery 5 (lean(), no filter):', q5.length, 'students');
    if (q5.length > 0) {
      console.log('First student isActive value:', q5[0].isActive);
      console.log('Type:', typeof q5[0].isActive);
    }
    
    // Check all fields in the database
    const allStudents = await Student.collection.find({class: '9', section: 'A'}).toArray();
    console.log('\nDirect collection query:', allStudents.length, 'students');
    if (allStudents.length > 0) {
      console.log('First student from collection:');
      console.log('  isActive:', allStudents[0].isActive);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
