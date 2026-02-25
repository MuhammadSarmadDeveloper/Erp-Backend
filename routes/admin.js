const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Fee = require('../models/Fee');
const Result = require('../models/Result');
const Subject = require('../models/Subject');
const Class = require('../models/Class');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const Settings = require('../models/Settings');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Get all teachers
router.get('/teachers', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const teachers = await Teacher.find()
      .populate('userId', 'fullName email isActive')
      .populate('assignedClasses.subjects', 'name code')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, teachers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all students
router.get('/students', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const students = await Student.find()
      .populate('userId', 'fullName email isActive')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all parents (extracted from students)
router.get('/parents', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const students = await Student.find()
      .populate('userId', 'fullName email isActive')
      .sort({ createdAt: -1 });
    
    // Group students by parent info
    const parentMap = new Map();
    
    students.forEach(student => {
      if (student.parentName || student.parentPhone) {
        const key = `${student.parentName || ''}-${student.parentPhone || ''}`;
        if (!parentMap.has(key)) {
          parentMap.set(key, {
            parentName: student.parentName || '',
            parentPhone: student.parentPhone || '',
            address: student.address || '',
            students: []
          });
        }
        parentMap.get(key).students.push({
          _id: student._id,
          studentName: student.userId?.fullName || 'Unknown',
          class: student.class,
          section: student.section,
          rollNumber: student.rollNumber
        });
      }
    });
    
    const parents = Array.from(parentMap.values());
    res.json({ success: true, parents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all results
router.get('/results', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const results = await Result.find()
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'fullName' }
      })
      .populate('subjectId', 'name code maxMarks')
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all fees
router.get('/fees', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const fees = await Fee.find()
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'fullName' }
      })
      .sort({ createdAt: -1 });
    
    res.json({ success: true, fees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get dashboard statistics
router.get('/statistics', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const totalTeachers = await Teacher.countDocuments();
    const totalUsers = await User.countDocuments();
    
    // Get monthly student registration data
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyStudents = await Student.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get weekly student data (last 8 weeks)
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
    
    const weeklyStudents = await Student.aggregate([
      { $match: { createdAt: { $gte: eightWeeksAgo } } },
      {
        $group: {
          _id: {
            week: { $week: '$createdAt' },
            year: { $year: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } }
    ]);

    // Fee statistics
    const totalFeesPending = await Fee.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalFeesPaid = await Fee.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Monthly fee collection
    const monthlyFees = await Fee.aggregate([
      { $match: { status: 'paid', paidDate: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$paidDate' },
            month: { $month: '$paidDate' }
          },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Results statistics
    const averageGrades = await Result.aggregate([
      {
        $group: {
          _id: '$subjectId',
          avgMarks: { $avg: '$marks' }
        }
      }
    ]);

    res.json({
      success: true,
      statistics: {
        totalStudents,
        totalTeachers,
        totalUsers,
        monthlyStudents,
        weeklyStudents,
        fees: {
          pending: totalFeesPending[0]?.total || 0,
          paid: totalFeesPaid[0]?.total || 0,
          monthlyCollection: monthlyFees
        },
        averageGrades
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new user (teacher or student) - Admin only
router.post('/create-user', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { 
      email, 
      password, 
      fullName, 
      role, 
      // Student fields
      rollNumber, 
      class: className, 
      section, 
      parentName,
      parentPhone,
      // Teacher fields
      employeeId, 
      assignedClasses,
      assignedClass,
      assignedSection,
      phone,
      qualification,
      // Common fields
      profileImage,
      dateOfBirth,
      address
    } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    // Create user
    const user = await User.create({
      email,
      password,
      fullName,
      role,
      isActive: true
    });

    // Create role-specific profile
    if (role === 'student') {
      await Student.create({
        userId: user._id,
        rollNumber,
        class: className,
        section,
        profileImage: profileImage || null,
        dateOfBirth: dateOfBirth || null,
        address: address || null,
        parentName: parentName || null,
        parentPhone: parentPhone || null
      });
    } else if (role === 'teacher') {
      // Build assigned classes array
      let classesArray = assignedClasses || [];
      if (assignedClass && assignedSection) {
        classesArray = [{
          class: assignedClass,
          section: assignedSection,
          subjects: []
        }];
      }

      await Teacher.create({
        userId: user._id,
        employeeId,
        assignedClasses: classesArray,
        profileImage: profileImage || null,
        dateOfBirth: dateOfBirth || null,
        address: address || null,
        phone: phone || null,
        qualification: qualification || null
      });
    }

    res.status(201).json({
      success: true,
      message: `${role} created successfully`,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update user status
router.patch('/users/:userId/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'User status updated', user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add fee record
router.post('/fees', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { studentId, amount, dueDate, month, year, description } = req.body;

    const fee = await Fee.create({
      studentId,
      amount,
      dueDate,
      month,
      year,
      description,
      status: 'pending'
    });

    res.status(201).json({ success: true, message: 'Fee record created', fee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update fee status
router.patch('/fees/:feeId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { feeId } = req.params;
    const { status, paidDate } = req.body;

    const fee = await Fee.findByIdAndUpdate(
      feeId,
      { status, paidDate: status === 'paid' ? paidDate || new Date() : null },
      { new: true }
    );

    if (!fee) {
      return res.status(404).json({ success: false, message: 'Fee record not found' });
    }

    res.json({ success: true, message: 'Fee status updated', fee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all subjects
router.get('/subjects', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const subjects = await Subject.find()
      .populate({
        path: 'teacherId',
        populate: { path: 'userId', select: 'fullName email' }
      })
      .sort({ createdAt: -1 });
    res.json({ success: true, subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create subject
router.post('/subjects', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, code, maxMarks, teacherId, class: className, section } = req.body;

    const existingSubject = await Subject.findOne({ code });
    if (existingSubject) {
      return res.status(400).json({ success: false, message: 'Subject code already exists' });
    }

    const subject = await Subject.create({ 
      name, 
      code, 
      maxMarks,
      teacherId: teacherId || null,
      class: className || null,
      section: section || null
    });

    // If teacher is assigned, update teacher's assigned classes
    if (teacherId && className && section) {
      const teacher = await Teacher.findById(teacherId);
      if (teacher) {
        const classIndex = teacher.assignedClasses.findIndex(
          c => c.class === className && c.section === section
        );
        if (classIndex > -1) {
          if (!teacher.assignedClasses[classIndex].subjects.includes(subject._id)) {
            teacher.assignedClasses[classIndex].subjects.push(subject._id);
          }
        } else {
          teacher.assignedClasses.push({
            class: className,
            section: section,
            subjects: [subject._id]
          });
        }
        await teacher.save();
      }
    }

    const populatedSubject = await Subject.findById(subject._id)
      .populate({
        path: 'teacherId',
        populate: { path: 'userId', select: 'fullName email' }
      });

    res.status(201).json({ success: true, message: 'Subject created successfully', subject: populatedSubject });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update subject
router.put('/subjects/:subjectId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { name, code, maxMarks, teacherId, class: className, section } = req.body;

    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    // Check if code is being changed and if it already exists
    if (code !== subject.code) {
      const existingSubject = await Subject.findOne({ code, _id: { $ne: subjectId } });
      if (existingSubject) {
        return res.status(400).json({ success: false, message: 'Subject code already exists' });
      }
    }

    // Update subject fields
    subject.name = name;
    subject.code = code;
    subject.maxMarks = maxMarks;
    subject.teacherId = teacherId || null;
    subject.class = className || null;
    subject.section = section || null;

    await subject.save();

    // If teacher is assigned, update teacher's assigned classes
    if (teacherId && className && section) {
      const teacher = await Teacher.findById(teacherId);
      if (teacher) {
        const classIndex = teacher.assignedClasses.findIndex(
          c => c.class === className && c.section === section
        );
        if (classIndex > -1) {
          if (!teacher.assignedClasses[classIndex].subjects.includes(subject._id)) {
            teacher.assignedClasses[classIndex].subjects.push(subject._id);
          }
        } else {
          teacher.assignedClasses.push({
            class: className,
            section: section,
            subjects: [subject._id]
          });
        }
        await teacher.save();
      }
    }

    const populatedSubject = await Subject.findById(subjectId)
      .populate({
        path: 'teacherId',
        populate: { path: 'userId', select: 'fullName email' }
      });

    res.json({ success: true, message: 'Subject updated successfully', subject: populatedSubject });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete subject
router.delete('/subjects/:subjectId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { subjectId } = req.params;
    await Subject.findByIdAndDelete(subjectId);
    res.json({ success: true, message: 'Subject deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Assign subjects to teacher
router.patch('/teachers/:teacherId/assign-subjects', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { classData } = req.body; // { class: '10', section: 'A', subjects: ['subjectId1', 'subjectId2'] }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Check if class already assigned
    const classIndex = teacher.assignedClasses.findIndex(
      c => c.class === classData.class && c.section === classData.section
    );

    if (classIndex > -1) {
      // Update existing class
      teacher.assignedClasses[classIndex].subjects = classData.subjects;
    } else {
      // Add new class
      teacher.assignedClasses.push(classData);
    }

    await teacher.save();

    res.json({ success: true, message: 'Subjects assigned successfully', teacher });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update student profile
router.put('/students/:studentId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { fullName, email, password, rollNumber, class: studentClass, section, profileImage, dateOfBirth, address, parentName, parentPhone } = req.body;

    const student = await Student.findById(studentId).populate('userId');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Update user details
    if (fullName) student.userId.fullName = fullName;
    if (email) student.userId.email = email;
    if (password) student.userId.password = password;
    await student.userId.save();

    // Update student details
    if (rollNumber) student.rollNumber = rollNumber;
    if (studentClass) student.class = studentClass;
    if (section) student.section = section;
    if (profileImage !== undefined) student.profileImage = profileImage;
    if (dateOfBirth !== undefined) student.dateOfBirth = dateOfBirth;
    if (address !== undefined) student.address = address;
    if (parentName !== undefined) student.parentName = parentName;
    if (parentPhone !== undefined) student.parentPhone = parentPhone;

    await student.save();

    const updatedStudent = await Student.findById(studentId).populate('userId', 'fullName email isActive');
    res.json({ success: true, message: 'Student updated successfully', student: updatedStudent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update teacher profile
router.put('/teachers/:teacherId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { fullName, email, password, employeeId, profileImage, dateOfBirth, address, phone, qualification, assignedClass, assignedSection } = req.body;

    const teacher = await Teacher.findById(teacherId).populate('userId');
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Update user details
    if (fullName) teacher.userId.fullName = fullName;
    if (email) teacher.userId.email = email;
    if (password) teacher.userId.password = password;
    await teacher.userId.save();

    // Update teacher details
    if (employeeId) teacher.employeeId = employeeId;
    if (profileImage !== undefined) teacher.profileImage = profileImage;
    if (dateOfBirth !== undefined) teacher.dateOfBirth = dateOfBirth;
    if (address !== undefined) teacher.address = address;
    if (phone !== undefined) teacher.phone = phone;
    if (qualification !== undefined) teacher.qualification = qualification;

    // Update assigned class if provided
    if (assignedClass && assignedSection) {
      // Check if this class already exists
      const existingClassIndex = teacher.assignedClasses.findIndex(
        c => c.class === assignedClass && c.section === assignedSection
      );
      
      if (existingClassIndex === -1) {
        // Add new class assignment
        teacher.assignedClasses = [{
          class: assignedClass,
          section: assignedSection,
          subjects: []
        }];
      }
    }

    await teacher.save();

    const updatedTeacher = await Teacher.findById(teacherId).populate('userId', 'fullName email isActive');
    res.json({ success: true, message: 'Teacher updated successfully', teacher: updatedTeacher });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete student
router.delete('/students/:studentId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const userId = student.userId;

    // Delete student record
    await Student.findByIdAndDelete(studentId);

    // Delete associated user account
    await User.findByIdAndDelete(userId);

    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete teacher
router.delete('/teachers/:teacherId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { teacherId } = req.params;

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const userId = teacher.userId;

    // Delete teacher record
    await Teacher.findByIdAndDelete(teacherId);

    // Delete associated user account
    await User.findByIdAndDelete(userId);

    res.json({ success: true, message: 'Teacher deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== CLASS ROUTES ====================

// Get all classes
router.get('/classes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const classes = await Class.find()
      .populate({
        path: 'classTeacher',
        populate: { path: 'userId', select: 'fullName email' }
      })
      .sort({ name: 1, section: 1 });
    
    // Get student count for each class
    const classesWithCount = await Promise.all(
      classes.map(async (cls) => {
        const studentCount = await Student.countDocuments({
          class: cls.name,
          section: cls.section
        });
        return {
          ...cls.toObject(),
          studentCount
        };
      })
    );
    
    res.json({ success: true, classes: classesWithCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single class by ID
router.get('/classes/:classId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { classId } = req.params;
    
    const classData = await Class.findById(classId)
      .populate({
        path: 'classTeacher',
        populate: { path: 'userId', select: 'fullName email' }
      });
    
    if (!classData) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    // Get students in this class
    const students = await Student.find({
      class: classData.name,
      section: classData.section
    }).populate('userId', 'fullName email');
    
    // Get subjects for this class
    const subjects = await Subject.find({
      class: classData.name,
      section: classData.section
    }).populate({
      path: 'teacherId',
      populate: { path: 'userId', select: 'fullName' }
    });
    
    res.json({
      success: true,
      class: {
        ...classData.toObject(),
        studentCount: students.length,
        students,
        subjects
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new class
router.post('/classes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, section, capacity, classTeacher, room, schedule, academicYear, description } = req.body;
    
    // Check if class already exists
    const existingClass = await Class.findOne({ name, section });
    if (existingClass) {
      return res.status(400).json({ 
        success: false, 
        message: `Class ${name} Section ${section} already exists` 
      });
    }
    
    const newClass = new Class({
      name,
      section,
      capacity: capacity || 40,
      classTeacher: classTeacher || null,
      room: room || null,
      schedule: schedule || { startTime: '08:00', endTime: '14:00' },
      academicYear: academicYear || undefined,
      description: description || null
    });
    
    await newClass.save();
    
    const populatedClass = await Class.findById(newClass._id)
      .populate({
        path: 'classTeacher',
        populate: { path: 'userId', select: 'fullName email' }
      });
    
    res.status(201).json({ 
      success: true, 
      message: 'Class created successfully', 
      class: { ...populatedClass.toObject(), studentCount: 0 }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Class with this name and section already exists' 
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update class
router.put('/classes/:classId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { classId } = req.params;
    const { name, section, capacity, classTeacher, room, schedule, academicYear, description, isActive } = req.body;
    
    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    // Check if new name/section combination already exists (excluding current class)
    if (name && section && (name !== classData.name || section !== classData.section)) {
      const existingClass = await Class.findOne({ name, section, _id: { $ne: classId } });
      if (existingClass) {
        return res.status(400).json({ 
          success: false, 
          message: `Class ${name} Section ${section} already exists` 
        });
      }
    }
    
    // Update students if class name or section changed
    const oldName = classData.name;
    const oldSection = classData.section;
    
    if (name !== undefined) classData.name = name;
    if (section !== undefined) classData.section = section;
    if (capacity !== undefined) classData.capacity = capacity;
    if (classTeacher !== undefined) classData.classTeacher = classTeacher || null;
    if (room !== undefined) classData.room = room;
    if (schedule !== undefined) classData.schedule = schedule;
    if (academicYear !== undefined) classData.academicYear = academicYear;
    if (description !== undefined) classData.description = description;
    if (isActive !== undefined) classData.isActive = isActive;
    
    await classData.save();
    
    // Update students' class info if name or section changed
    if ((name && name !== oldName) || (section && section !== oldSection)) {
      await Student.updateMany(
        { class: oldName, section: oldSection },
        { class: classData.name, section: classData.section }
      );
      
      // Update subjects' class info
      await Subject.updateMany(
        { class: oldName, section: oldSection },
        { class: classData.name, section: classData.section }
      );
    }
    
    const updatedClass = await Class.findById(classId)
      .populate({
        path: 'classTeacher',
        populate: { path: 'userId', select: 'fullName email' }
      });
    
    const studentCount = await Student.countDocuments({
      class: updatedClass.name,
      section: updatedClass.section
    });
    
    res.json({ 
      success: true, 
      message: 'Class updated successfully', 
      class: { ...updatedClass.toObject(), studentCount }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete class
router.delete('/classes/:classId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { classId } = req.params;
    
    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    
    // Check if there are students in this class
    const studentCount = await Student.countDocuments({
      class: classData.name,
      section: classData.section
    });
    
    if (studentCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete class with ${studentCount} enrolled students. Please reassign or remove students first.` 
      });
    }
    
    // Delete associated subjects
    await Subject.deleteMany({
      class: classData.name,
      section: classData.section
    });
    
    await Class.findByIdAndDelete(classId);
    
    res.json({ success: true, message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== SCHEDULE ROUTES ====================

// Get all schedules (with optional filters)
router.get('/schedules', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { class: className, section, dayOfWeek, teacher } = req.query;
    
    const filter = { isActive: true };
    if (className) filter.class = className;
    if (section) filter.section = section;
    if (dayOfWeek) filter.dayOfWeek = dayOfWeek;
    if (teacher) filter.teacher = teacher;
    
    const schedules = await Schedule.find(filter)
      .populate({
        path: 'subject',
        select: 'name code'
      })
      .populate({
        path: 'teacher',
        populate: { path: 'userId', select: 'fullName email' }
      })
      .sort({ dayOfWeek: 1, startTime: 1 });
    
    res.json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get today's schedule
router.get('/schedules/today', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = daysOfWeek[new Date().getDay()];
    
    const schedules = await Schedule.find({ 
      dayOfWeek: today,
      isActive: true 
    })
      .populate({
        path: 'subject',
        select: 'name code'
      })
      .populate({
        path: 'teacher',
        populate: { path: 'userId', select: 'fullName email' }
      })
      .sort({ startTime: 1 });
    
    res.json({ success: true, schedules, today });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get teacher's schedule
router.get('/schedules/teacher/:teacherId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    const schedules = await Schedule.find({ 
      teacher: teacherId,
      isActive: true 
    })
      .populate({
        path: 'subject',
        select: 'name code'
      })
      .sort({ dayOfWeek: 1, startTime: 1 });
    
    res.json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create schedule
router.post('/schedules', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { class: className, section, dayOfWeek, subject, teacher, startTime, endTime, room, academicYear } = req.body;
    
    // Check for time conflicts for the same class/section
    const conflictSchedule = await Schedule.findOne({
      class: className,
      section,
      dayOfWeek,
      $or: [
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime }
        }
      ]
    });
    
    if (conflictSchedule) {
      return res.status(400).json({
        success: false,
        message: 'Time conflict: This class already has a schedule during this time'
      });
    }
    
    // Check for teacher conflicts
    const teacherConflict = await Schedule.findOne({
      teacher,
      dayOfWeek,
      $or: [
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime }
        }
      ]
    });
    
    if (teacherConflict) {
      return res.status(400).json({
        success: false,
        message: 'Teacher conflict: This teacher has another class during this time'
      });
    }
    
    const newSchedule = new Schedule({
      class: className,
      section,
      dayOfWeek,
      subject,
      teacher,
      startTime,
      endTime,
      room: room || null,
      academicYear: academicYear || undefined
    });
    
    await newSchedule.save();
    
    const populatedSchedule = await Schedule.findById(newSchedule._id)
      .populate({
        path: 'subject',
        select: 'name code'
      })
      .populate({
        path: 'teacher',
        populate: { path: 'userId', select: 'fullName email' }
      });
    
    res.status(201).json({
      success: true,
      message: 'Schedule created successfully',
      schedule: populatedSchedule
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update schedule
router.put('/schedules/:scheduleId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { class: className, section, dayOfWeek, subject, teacher, startTime, endTime, room, academicYear, isActive } = req.body;
    
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }
    
    // Check for time conflicts (excluding current schedule)
    if (startTime && endTime && dayOfWeek) {
      const conflictSchedule = await Schedule.findOne({
        _id: { $ne: scheduleId },
        class: className || schedule.class,
        section: section || schedule.section,
        dayOfWeek: dayOfWeek || schedule.dayOfWeek,
        $or: [
          {
            startTime: { $lt: endTime },
            endTime: { $gt: startTime }
          }
        ]
      });
      
      if (conflictSchedule) {
        return res.status(400).json({
          success: false,
          message: 'Time conflict: This class already has a schedule during this time'
        });
      }
    }
    
    // Update fields
    if (className !== undefined) schedule.class = className;
    if (section !== undefined) schedule.section = section;
    if (dayOfWeek !== undefined) schedule.dayOfWeek = dayOfWeek;
    if (subject !== undefined) schedule.subject = subject;
    if (teacher !== undefined) schedule.teacher = teacher;
    if (startTime !== undefined) schedule.startTime = startTime;
    if (endTime !== undefined) schedule.endTime = endTime;
    if (room !== undefined) schedule.room = room;
    if (academicYear !== undefined) schedule.academicYear = academicYear;
    if (isActive !== undefined) schedule.isActive = isActive;
    
    await schedule.save();
    
    const updatedSchedule = await Schedule.findById(scheduleId)
      .populate({
        path: 'subject',
        select: 'name code'
      })
      .populate({
        path: 'teacher',
        populate: { path: 'userId', select: 'fullName email' }
      });
    
    res.json({
      success: true,
      message: 'Schedule updated successfully',
      schedule: updatedSchedule
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete schedule
router.delete('/schedules/:scheduleId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { scheduleId } = req.params;
    
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }
    
    await Schedule.findByIdAndDelete(scheduleId);
    
    res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== EXAM ROUTES ====================

// Get all exams (with optional filters)
router.get('/exams', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { class: className, section, subject, status, startDate, endDate } = req.query;
    
    const filter = {};
    if (className) filter.class = className;
    if (section) filter.section = section;
    if (subject) filter.subject = subject;
    if (status) filter.status = status;
    
    // Date range filter
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    
    const exams = await Exam.find(filter)
      .populate('subject', 'name code')
      .sort({ date: 1, startTime: 1 });
    
    res.json({ success: true, exams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get upcoming exams
router.get('/exams/upcoming', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const exams = await Exam.find({
      date: { $gte: today },
      status: { $in: ['Scheduled', 'Ongoing'] }
    })
      .populate('subject', 'name code')
      .sort({ date: 1, startTime: 1 })
      .limit(20);
    
    res.json({ success: true, exams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get exam by ID
router.get('/exams/:examId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { examId } = req.params;
    
    const exam = await Exam.findById(examId)
      .populate('subject', 'name code')
      .populate('createdBy', 'fullName email');
    
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    
    res.json({ success: true, exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create exam
router.post('/exams', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      name,
      type,
      class: className,
      section,
      subject,
      date,
      startTime,
      endTime,
      duration,
      totalMarks,
      passingMarks,
      room,
      instructions,
      academicYear
    } = req.body;
    
    // Check for exam conflicts (same class, section, and overlapping time)
    const examDate = new Date(date);
    const conflictExam = await Exam.findOne({
      class: className,
      section,
      date: examDate,
      $or: [
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime }
        }
      ],
      status: { $ne: 'Cancelled' }
    });
    
    if (conflictExam) {
      return res.status(400).json({
        success: false,
        message: 'Time conflict: This class already has an exam during this time'
      });
    }
    
    const newExam = new Exam({
      name,
      type,
      class: className,
      section,
      subject,
      date: examDate,
      startTime,
      endTime,
      duration,
      totalMarks,
      passingMarks,
      room: room || null,
      instructions: instructions || null,
      academicYear: academicYear || undefined,
      createdBy: req.user.id
    });
    
    await newExam.save();
    
    const populatedExam = await Exam.findById(newExam._id)
      .populate('subject', 'name code');
    
    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      exam: populatedExam
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update exam
router.put('/exams/:examId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { examId } = req.params;
    const {
      name,
      type,
      class: className,
      section,
      subject,
      date,
      startTime,
      endTime,
      duration,
      totalMarks,
      passingMarks,
      room,
      instructions,
      academicYear,
      status
    } = req.body;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    
    // Check for conflicts if date or time changed
    if (date || startTime || endTime) {
      const examDate = date ? new Date(date) : exam.date;
      const conflictExam = await Exam.findOne({
        _id: { $ne: examId },
        class: className || exam.class,
        section: section || exam.section,
        date: examDate,
        $or: [
          {
            startTime: { $lt: endTime || exam.endTime },
            endTime: { $gt: startTime || exam.startTime }
          }
        ],
        status: { $ne: 'Cancelled' }
      });
      
      if (conflictExam) {
        return res.status(400).json({
          success: false,
          message: 'Time conflict: This class already has an exam during this time'
        });
      }
    }
    
    // Update fields
    if (name !== undefined) exam.name = name;
    if (type !== undefined) exam.type = type;
    if (className !== undefined) exam.class = className;
    if (section !== undefined) exam.section = section;
    if (subject !== undefined) exam.subject = subject;
    if (date !== undefined) exam.date = new Date(date);
    if (startTime !== undefined) exam.startTime = startTime;
    if (endTime !== undefined) exam.endTime = endTime;
    if (duration !== undefined) exam.duration = duration;
    if (totalMarks !== undefined) exam.totalMarks = totalMarks;
    if (passingMarks !== undefined) exam.passingMarks = passingMarks;
    if (room !== undefined) exam.room = room;
    if (instructions !== undefined) exam.instructions = instructions;
    if (academicYear !== undefined) exam.academicYear = academicYear;
    if (status !== undefined) exam.status = status;
    
    await exam.save();
    
    const updatedExam = await Exam.findById(examId)
      .populate('subject', 'name code');
    
    res.json({
      success: true,
      message: 'Exam updated successfully',
      exam: updatedExam
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete exam
router.delete('/exams/:examId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { examId } = req.params;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    
    await Exam.findByIdAndDelete(examId);
    
    res.json({ success: true, message: 'Exam deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get exam statistics
router.get('/exams/stats/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [total, upcoming, completed, ongoing] = await Promise.all([
      Exam.countDocuments(),
      Exam.countDocuments({ date: { $gte: today }, status: 'Scheduled' }),
      Exam.countDocuments({ status: 'Completed' }),
      Exam.countDocuments({ status: 'Ongoing' })
    ]);
    
    res.json({
      success: true,
      stats: {
        total,
        upcoming,
        completed,
        ongoing
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Assign classes to teacher
router.post('/teachers/:teacherId/assign-classes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { assignedClasses } = req.body; // Array of { class, section, subjects }
    
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Validate and auto-create classes if they don't exist
    for (const assignment of assignedClasses) {
      let classExists = await Class.findOne({
        name: assignment.class,
        section: assignment.section
      });

      // Auto-create class if it doesn't exist
      if (!classExists) {
        classExists = await Class.create({
          name: assignment.class,
          section: assignment.section,
          capacity: 40,
          isActive: true
        });
        console.log(`Auto-created class: ${assignment.class}-${assignment.section}`);
      }

      // Validate subjects
      if (assignment.subjects && assignment.subjects.length > 0) {
        const subjectsExist = await Subject.find({
          _id: { $in: assignment.subjects }
        });

        if (subjectsExist.length !== assignment.subjects.length) {
          return res.status(400).json({
            success: false,
            message: 'One or more subjects not found'
          });
        }
      }
    }

    teacher.assignedClasses = assignedClasses;
    await teacher.save();

    const updatedTeacher = await Teacher.findById(teacherId)
      .populate('userId', 'fullName email')
      .populate('assignedClasses.subjects', 'name code');

    res.json({
      success: true,
      message: 'Classes assigned successfully',
      teacher: updatedTeacher
    });
  } catch (error) {
    console.error('Error assigning classes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get teacher's assigned classes
router.get('/teachers/:teacherId/assigned-classes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    const teacher = await Teacher.findById(teacherId)
      .populate('assignedClasses.subjects', 'name code');
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    res.json({
      success: true,
      assignedClasses: teacher.assignedClasses
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get system settings
router.get('/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { key } = req.query;
    
    if (key) {
      // Get specific setting
      const setting = await Settings.findOne({ key });
      if (!setting) {
        return res.status(404).json({ success: false, message: 'Setting not found' });
      }
      res.json({ success: true, setting });
    } else {
      // Get all settings
      const settings = await Settings.find();
      res.json({ success: true, settings });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update or create system setting
router.post('/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ success: false, message: 'Key and value are required' });
    }
    
    const setting = await Settings.findOneAndUpdate(
      { key },
      { 
        value,
        updatedBy: req.user.userId
      },
      { 
        new: true,
        upsert: true,
        runValidators: true
      }
    );
    
    res.json({ success: true, setting });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
