// Script to update teachers with fullName from their userId
require('dotenv').config();
const mongoose = require('mongoose');
const Teacher = require('./models/Teacher');
const User = require('./models/User');

const updateTeacherFullNames = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB\n');

    // Find all teachers
    const teachers = await Teacher.find().populate('userId', 'fullName');
    console.log(`Found ${teachers.length} teachers\n`);

    let updated = 0;
    let missing = 0;

    for (let teacher of teachers) {
      if (!teacher.fullName && teacher.userId) {
        // Update teacher with fullName from userId
        teacher.fullName = teacher.userId.fullName;
        await teacher.save();
        console.log(`✅ Updated teacher: ${teacher.userId.fullName}`);
        updated++;
      } else if (!teacher.fullName && !teacher.userId) {
        console.log(`⚠️  Teacher without userId reference - cannot update`);
        missing++;
      } else if (teacher.fullName) {
        console.log(`ℹ️  Teacher already has fullName: ${teacher.fullName}`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`Updated: ${updated}`);
    console.log(`Already had fullName: ${teachers.length - updated - missing}`);
    console.log(`Missing userId: ${missing}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

updateTeacherFullNames();
