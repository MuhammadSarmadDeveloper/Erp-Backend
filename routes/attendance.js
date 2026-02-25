const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// Mark attendance for a class (Teacher only)
router.post('/mark', authMiddleware, async (req, res) => {
  try {
    const { class: classNum, section, attendanceData } = req.body;
    
    // Verify teacher exists
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ success: false, message: 'Only teachers can mark attendance' });
    }

    // Verify teacher has this class assigned
    const hasClass = teacher.assignedClasses.some(
      ac => ac.class === classNum && ac.section === section
    );
    if (!hasClass) {
      return res.status(403).json({ success: false, message: 'You do not have this class assigned' });
    }

    // Process attendance data (attendanceData should be array of {studentId, status, remarks})
    const attendanceRecords = attendanceData.map(record => ({
      studentId: record.studentId,
      teacherId: teacher._id,
      class: classNum,
      section: section,
      date: new Date(record.date),
      status: record.status,
      remarks: record.remarks || null,
      markedBy: req.user._id
    }));

    // Use insertMany with upsert logic
    const results = [];
    for (const record of attendanceRecords) {
      const existing = await Attendance.findOneAndUpdate(
        {
          studentId: record.studentId,
          date: record.date,
          class: record.class,
          section: record.section
        },
        record,
        { upsert: true, new: true }
      );
      results.push(existing);
    }

    res.status(201).json({
      success: true,
      message: `Attendance marked for ${results.length} students`,
      data: results
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ success: false, message: 'Error marking attendance', error: error.message });
  }
});

// Get attendance for a specific class on a date (Teacher)
router.get('/class/:classNum/:section/:date', authMiddleware, async (req, res) => {
  try {
    const { classNum, section, date } = req.params;
    
    // Verify teacher exists
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ success: false, message: 'Only teachers can view attendance' });
    }

    // Parse date
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(attendanceDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all students in the class
    const students = await Student.find({
      class: classNum,
      section: section,
      isActive: true
    }).populate('userId', 'fullName email');

    // Get attendance records for this class on this date
    const attendance = await Attendance.find({
      class: classNum,
      section: section,
      date: {
        $gte: attendanceDate,
        $lt: nextDay
      }
    }).populate('studentId', 'rollNumber');

    // Merge student data with attendance
    const attendanceRecords = students.map(student => {
      const record = attendance.find(a => a.studentId._id.toString() === student._id.toString());
      return {
        studentId: student._id,
        rollNumber: student.rollNumber,
        fullName: student.userId?.fullName || 'Unknown',
        email: student.userId?.email || '',
        status: record?.status || 'Present',
        remarks: record?.remarks || null,
        attendanceId: record?._id || null
      };
    });

    res.json({
      success: true,
      date: date,
      class: classNum,
      section: section,
      attendance: attendanceRecords
    });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ success: false, message: 'Error fetching attendance', error: error.message });
  }
});

// Get student's attendance history
router.get('/student/:studentId', authMiddleware, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { fromDate, toDate } = req.query;

    let query = { studentId };

    if (fromDate && toDate) {
      query.date = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate)
      };
    }

    const attendance = await Attendance.find(query)
      .populate('studentId', 'rollNumber')
      .populate('markedBy', 'fullName')
      .sort({ date: -1 });

    // Calculate attendance statistics
    const total = attendance.length;
    const present = attendance.filter(a => a.status === 'Present').length;
    const absent = attendance.filter(a => a.status === 'Absent').length;
    const leave = attendance.filter(a => a.status === 'Leave').length;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      statistics: {
        total,
        present,
        absent,
        leave,
        percentage: parseFloat(percentage)
      },
      attendance
    });
  } catch (error) {
    console.error('Error fetching student attendance:', error);
    res.status(500).json({ success: false, message: 'Error fetching attendance', error: error.message });
  }
});

// Get class attendance summary (Admin)
router.get('/class-summary/:classNum/:section', authMiddleware, async (req, res) => {
  try {
    const { classNum, section } = req.params;
    const { fromDate, toDate } = req.query;

    let query = { class: classNum, section: section };

    if (fromDate && toDate) {
      query.date = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate)
      };
    }

    const attendance = await Attendance.find(query)
      .populate('studentId', 'rollNumber')
      .populate('markedBy', 'fullName')
      .sort({ date: -1, 'studentId.rollNumber': 1 });

    // Group by student and calculate statistics
    const studentStats = {};
    attendance.forEach(record => {
      const rollNum = record.studentId?.rollNumber || 'Unknown';
      if (!studentStats[rollNum]) {
        studentStats[rollNum] = {
          studentId: record.studentId?._id,
          rollNumber: rollNum,
          total: 0,
          present: 0,
          absent: 0,
          leave: 0
        };
      }
      studentStats[rollNum].total++;
      studentStats[rollNum][record.status.toLowerCase()]++;
    });

    // Calculate percentage for each student
    const summary = Object.values(studentStats).map(stat => ({
      ...stat,
      percentage: stat.total > 0 ? ((stat.present / stat.total) * 100).toFixed(2) : 0
    }));

    res.json({
      success: true,
      class: classNum,
      section: section,
      summary
    });
  } catch (error) {
    console.error('Error fetching class attendance summary:', error);
    res.status(500).json({ success: false, message: 'Error fetching summary', error: error.message });
  }
});

// Update attendance (Admin)
router.put('/:attendanceId', authMiddleware, async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { status, remarks } = req.body;

    const attendance = await Attendance.findByIdAndUpdate(
      attendanceId,
      {
        status,
        remarks,
        editedAt: new Date(),
        editedBy: req.user._id
      },
      { new: true }
    ).populate('studentId', 'rollNumber').populate('markedBy', 'fullName').populate('editedBy', 'fullName');

    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    res.json({
      success: true,
      message: 'Attendance updated successfully',
      data: attendance
    });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ success: false, message: 'Error updating attendance', error: error.message });
  }
});

// Delete attendance record (Admin)
router.delete('/:attendanceId', authMiddleware, async (req, res) => {
  try {
    const { attendanceId } = req.params;

    const attendance = await Attendance.findByIdAndDelete(attendanceId);

    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    res.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attendance:', error);
    res.status(500).json({ success: false, message: 'Error deleting attendance', error: error.message });
  }
});

// Get all attendance records (Admin - with filters)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const { class: classNum, section, date, studentId } = req.query;
    let query = {};

    if (classNum) query.class = classNum;
    if (section) query.section = section;
    if (studentId) query.studentId = studentId;
    if (date) {
      const attendanceDate = new Date(date);
      attendanceDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(attendanceDate);
      nextDay.setDate(nextDay.getDate() + 1);
      query.date = {
        $gte: attendanceDate,
        $lt: nextDay
      };
    }

    const attendance = await Attendance.find(query)
      .populate('studentId', 'rollNumber')
      .populate('markedBy', 'fullName')
      .populate('editedBy', 'fullName')
      .sort({ date: -1 });

    res.json({
      success: true,
      total: attendance.length,
      data: attendance
    });
  } catch (error) {
    console.error('Error fetching all attendance:', error);
    res.status(500).json({ success: false, message: 'Error fetching attendance', error: error.message });
  }
});

// Get student attendance by class/section (for student dashboard)
router.get('/student', authMiddleware, async (req, res) => {
  try {
    const { class: classNum, section, month, day } = req.query;

    if (!classNum || !section) {
      return res.status(400).json({ 
        success: false, 
        message: 'Class and section are required' 
      });
    }

    let query = { 
      class: classNum, 
      section: section 
    };

    // If month is provided (format: YYYY-MM), filter by that month or specific day
    if (month) {
      const [year, monthNum] = month.split('-');
      
      if (day) {
        // Filter by specific day
        const dayNum = String(day).padStart(2, '0');
        const specificDate = new Date(`${year}-${monthNum}-${dayNum}`);
        const nextDay = new Date(specificDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        query.date = {
          $gte: specificDate,
          $lt: nextDay
        };
      } else {
        // Filter by entire month
        const startDate = new Date(`${year}-${monthNum}-01`);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        
        query.date = {
          $gte: startDate,
          $lt: endDate
        };
      }
    }

    const attendance = await Attendance.find(query)
      .populate({
        path: 'studentId',
        select: 'rollNumber class section'
      })
      .populate('markedBy', 'fullName')
      .populate('editedBy', 'fullName')
      .sort({ date: -1 });

    res.json({
      success: true,
      data: attendance
    });
  } catch (error) {
    console.error('Error fetching student attendance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching attendance', 
      error: error.message 
    });
  }
});

module.exports = router;
