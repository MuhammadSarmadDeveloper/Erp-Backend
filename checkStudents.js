require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Student = require('./models/Student');
const Teacher = require('./models/Teacher');
const Subject = require('./models/Subject');

const checkDatabaseStudents = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');
    
    // Get all actual students
    const students = await Student.find({}).populate('userId', 'fullName email');
    console.log('\n📊 ACTUAL STUDENTS IN DATABASE:');
    console.log('Total students found:', students.length);
    
    if (students.length === 0) {
      console.log('❌ No students found in database');
      console.log('💡 You need to create students through Admin -> Students page');
    } else {
      console.log('\n📋 Student Details:');
      students.forEach((student, index) => {
        console.log(`${index + 1}. ${student.userId?.fullName || 'No name'}`);
        console.log(`   Class: "${student.class}"`);
        console.log(`   Section: "${student.section}"`);
        console.log(`   Roll Number: ${student.rollNumber}`);
        console.log(`   Is Active: ${student.isActive}`);
        console.log(`   Email: ${student.userId?.email || 'No email'}`);
        console.log('   ---');
      });
      
      // Group by class and section
      const classGroups = {};
      students.forEach(student => {
        const key = `${student.class}-${student.section}`;
        if (!classGroups[key]) {
          classGroups[key] = [];
        }
        classGroups[key].push(student.userId?.fullName || 'No name');
      });
      
      console.log('\n🏫 STUDENTS GROUPED BY CLASS:');
      Object.keys(classGroups).forEach(key => {
        const [className, section] = key.split('-');
        console.log(`Class ${className}, Section ${section}: ${classGroups[key].length} students`);
        classGroups[key].forEach(name => console.log(`  - ${name}`));
      });
    }
    
    // Get all teachers and their assignments
    const teachers = await Teacher.find({}).populate('assignedClasses.subjects', 'name code').populate('userId', 'fullName');
    console.log('\n👨‍🏫 TEACHER ASSIGNMENTS:');
    
    teachers.forEach((teacher, index) => {
      console.log(`${index + 1}. ${teacher.userId?.fullName || 'No name'} (${teacher.employeeId})`);
      if (teacher.assignedClasses.length === 0) {
        console.log('   No classes assigned');
      } else {
        teacher.assignedClasses.forEach(assignment => {
          console.log(`   Assigned to: Class "${assignment.class}", Section "${assignment.section}"`);
          console.log(`   Subjects: ${assignment.subjects.map(s => s.name).join(', ')}`);
        });
      }
      console.log('   ---');
    });
    
    // Check for mismatches
    console.log('\n🔍 CHECKING FOR MISMATCHES:');
    let foundMismatch = false;
    
    teachers.forEach(teacher => {
      teacher.assignedClasses.forEach(assignment => {
        const matchingStudents = students.filter(student => 
          student.class === assignment.class && 
          student.section === assignment.section &&
          student.isActive === true
        );
        
        if (matchingStudents.length === 0) {
          console.log(`❌ MISMATCH: Teacher assigned to Class "${assignment.class}", Section "${assignment.section}" but no students found`);
          foundMismatch = true;
        } else {
          console.log(`✅ MATCH: Class "${assignment.class}", Section "${assignment.section}" has ${matchingStudents.length} students`);
        }
      });
    });
    
    if (!foundMismatch && students.length > 0 && teachers.some(t => t.assignedClasses.length > 0)) {
      console.log('✅ All teacher assignments match existing students!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkDatabaseStudents();