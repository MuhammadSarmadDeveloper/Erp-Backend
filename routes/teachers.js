const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Attendance = require('../models/Attendance');
const Result = require('../models/Result');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// Get teacher by user ID
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.params.userId })
      .populate('userId', 'fullName email')
      .populate('assignedClasses.subjects', 'name code');
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('Error fetching teacher:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get teacher's assigned classes with students
router.get('/assigned-classes', authMiddleware, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user._id })
      .populate('assignedClasses.subjects', 'name code');
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Get students for each assigned class
    const classesWithStudents = await Promise.all(
      teacher.assignedClasses.map(async (assignedClass) => {
        const students = await Student.find({
          class: assignedClass.class,
          section: assignedClass.section,
          isActive: true
        })
          .populate('userId', 'fullName email')
          .sort({ rollNumber: 1 });

        // Get class details
        const classInfo = await Class.findOne({
          name: assignedClass.class,
          section: assignedClass.section
        });

        return {
          class: assignedClass.class,
          section: assignedClass.section,
          subjects: assignedClass.subjects,
          students: students.map(student => {
            // Debug: check if userId is properly populated
            if (!student.userId) {
              console.log('⚠️  Warning: Student has no populated userId:', student.rollNumber);
              return null;
            }
            
            return {
              _id: student._id,
              rollNumber: student.rollNumber,
              fullName: student.userId.fullName,
              email: student.userId.email,
              admissionNumber: student.rollNumber,
              dateOfBirth: student.dateOfBirth,
              fatherName: student.parentName,
              motherName: null,
              phone: student.parentPhone,
              address: student.address,
              profileImage: student.profileImage
            };
          }).filter(s => s !== null), // Remove null entries
          classInfo: classInfo ? {
            capacity: classInfo.capacity,
            room: classInfo.room,
            schedule: classInfo.schedule,
            academicYear: classInfo.academicYear
          } : null
        };
      })
    );

    res.json({
      success: true,
      assignedClasses: classesWithStudents,
      teacherInfo: {
        employeeId: teacher.employeeId,
        qualification: teacher.qualification
      }
    });
  } catch (error) {
    console.error('Error fetching assigned classes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get teacher profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user._id })
      .populate('userId', 'fullName email')
      .populate('assignedClasses.subjects', 'name code');
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    res.json({ success: true, teacher });
  } catch (error) {
    console.error('Error fetching teacher profile:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get teacher dashboard stats
router.get('/dashboard-stats', authMiddleware, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user._id })
      .populate('assignedClasses.subjects', 'name code');
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Get total classes count
    const totalClasses = teacher.assignedClasses.length;

    // Get all unique subjects taught
    const subjectIds = new Set();
    teacher.assignedClasses.forEach((ac) => {
      if (ac.subjects && Array.isArray(ac.subjects)) {
        ac.subjects.forEach((subject) => {
          subjectIds.add(subject._id.toString());
        });
      }
    });
    const totalSubjects = subjectIds.size;

    // Get total students across all assigned classes
    const classQueries = teacher.assignedClasses.map(ac => ({
      class: ac.class,
      section: ac.section,
      isActive: true
    }));
    
    const totalStudents = await Student.countDocuments({
      $or: classQueries.length > 0 ? classQueries : [{ _id: null }]
    });

    // Get assignments to grade (submitted but not graded)
    const teacherAssignments = await Assignment.find({
      teacher: teacher._id
    }).select('_id');

    const assignmentIds = teacherAssignments.map(a => a._id);
    const assignmentsToGrade = await AssignmentSubmission.countDocuments({
      assignment: { $in: assignmentIds },
      status: 'submitted'
    });

    // Get upcoming exams (next 30 days)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const upcomingExams = await Exam.find({
      subject: { $in: Array.from(subjectIds) },
      date: { $gte: today, $lte: thirtyDaysLater },
      status: { $ne: 'Cancelled' }
    })
      .populate('subject', 'name code')
      .sort({ date: 1, startTime: 1 })
      .limit(10);

    // Get today's schedule
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
    const todaySchedule = await Schedule.find({ 
      teacher: teacher._id,
      dayOfWeek: dayOfWeek
    })
      .populate('subject', 'name code')
      .sort({ startTime: 1 });

    // Get recent assignments (last 5 created by this teacher)
    const recentAssignments = await Assignment.find({
      teacher: teacher._id
    })
      .populate('subject', 'name code')
      .sort({ createdAt: -1 })
      .limit(5);

    // Calculate weekly schedule distribution by day
    const weeklySchedule = await Schedule.aggregate([
      { $match: { teacher: teacher._id } },
      { $group: { 
          _id: '$dayOfWeek', 
          count: { $sum: 1 } 
        } 
      }
    ]);

    const scheduleData = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => ({
      day: day.substring(0, 3),
      classes: weeklySchedule.find(s => s._id === day)?.count || 0
    }));

    // Get class performance (average results for each class)
    const classPerformance = [];
    for (const assignedClass of teacher.assignedClasses) {
      const students = await Student.find({
        class: assignedClass.class,
        section: assignedClass.section,
        isActive: true
      });

      const studentIds = students.map(s => s._id);
      
      // Get average performance for this class
      const results = await Result.find({
        studentId: { $in: studentIds }
      });

      const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + (r.marks || 0), 0) / results.length
        : 0;

      classPerformance.push({
        class: `${assignedClass.class}-${assignedClass.section}`,
        performance: Math.round(avgScore)
      });
    }

    // Get attendance marking status for today
    const attendanceMarked = await Attendance.countDocuments({
      teacher: teacher._id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      success: true,
      stats: {
        totalClasses,
        totalStudents,
        totalSubjects,
        assignmentsToGrade,
        upcomingExamsCount: upcomingExams.length,
        attendanceMarked,
        averageClassPerformance: classPerformance.length > 0
          ? Math.round(classPerformance.reduce((sum, c) => sum + c.performance, 0) / classPerformance.length)
          : 0
      },
      upcomingExams,
      todaySchedule,
      recentAssignments,
      scheduleData,
      classPerformance
    });
  } catch (error) {
    console.error('Error fetching teacher dashboard stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get students in a specific class
router.get('/class/:className/section/:section/students', authMiddleware, async (req, res) => {
  try {
    const { className, section } = req.params;
    
    // Verify teacher has access to this class
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const hasAccess = teacher.assignedClasses.some(
      ac => ac.class === className && ac.section === section
    );

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Access denied to this class' });
    }

    const students = await Student.find({
      class: className,
      section: section,
      isActive: true
    })
      .populate('userId', 'fullName email')
      .sort({ rollNumber: 1 });

    res.json({
      success: true,
      students: students.map(student => ({
        _id: student._id,
        rollNumber: student.rollNumber,
        fullName: student.userId.fullName,
        email: student.userId.email,
        admissionNumber: student.admissionNumber,
        dateOfBirth: student.dateOfBirth,
        fatherName: student.fatherName,
        motherName: student.motherName,
        phone: student.phone,
        address: student.address,
        profileImage: student.profileImage
      }))
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all teachers (for admin)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can view all teachers' });
    }

    const teachers = await Teacher.find({ isActive: true })
      .populate('userId', 'fullName email')
      .sort({ fullName: 1 });

    const teacherData = teachers.map(teacher => ({
      _id: teacher._id,
      fullName: teacher.fullName || (teacher.userId && teacher.userId.fullName) || 'N/A',
      employeeId: teacher.employeeId,
      email: teacher.userId && teacher.userId.email,
      phone: teacher.phone,
      qualifications: teacher.qualifications,
      assignedClasses: teacher.assignedClasses
    }));

    res.status(200).json({
      success: true,
      count: teacherData.length,
      data: teacherData
    });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get teacher's schedule
router.get('/schedule', authMiddleware, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const schedules = await Schedule.find({ teacher: teacher._id })
      .populate('subject', 'name code')
      .populate('teacher', 'fullName employeeId')
      .sort({ dayOfWeek: 1, startTime: 1 });

    res.json({ success: true, schedules });
  } catch (error) {
    console.error('Error fetching teacher schedule:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get exams for teacher's subjects
router.get('/exams', authMiddleware, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user._id })
      .populate('assignedClasses.subjects');
    
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Get all subjects this teacher teaches
    const subjectIds = [];
    teacher.assignedClasses.forEach((ac) => {
      if (ac.subjects && Array.isArray(ac.subjects)) {
        ac.subjects.forEach((subject) => {
          if (!subjectIds.includes(subject._id.toString())) {
            subjectIds.push(subject._id);
          }
        });
      }
    });

    // Get exams for these subjects
    const exams = await Exam.find({
      subject: { $in: subjectIds },
      status: { $ne: 'Cancelled' }
    })
      .populate('subject', 'name code')
      .sort({ date: 1, startTime: 1 });

    res.json({ success: true, exams });
  } catch (error) {
    console.error('Error fetching exams:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
