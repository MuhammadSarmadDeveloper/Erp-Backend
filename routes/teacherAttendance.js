const express = require('express');
const router = express.Router();
const TeacherAttendance = require('../models/TeacherAttendance');
const Teacher = require('../models/Teacher');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// Mark teacher attendance (Admin only)
router.post('/mark', authMiddleware, async (req, res) => {
  try {
    const { teacherId, date, status, remarks } = req.body;

    // Verify admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can mark teacher attendance' });
    }

    // Verify teacher exists
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    // Check if record already exists for this date
    const existingRecord = await TeacherAttendance.findOne({ teacherId, date: new Date(date) });
    
    if (existingRecord) {
      return res.status(400).json({ success: false, message: 'Attendance already marked for this teacher on this date' });
    }

    const attendance = new TeacherAttendance({
      teacherId,
      date: new Date(date),
      status,
      remarks: remarks || null,
      markedBy: req.user._id
    });

    await attendance.save();
    await attendance.populate('teacherId', 'fullName');
    await attendance.populate('markedBy', 'fullName');

    res.status(201).json({
      success: true,
      message: 'Teacher attendance marked successfully',
      data: attendance
    });
  } catch (error) {
    console.error('Error marking teacher attendance:', error);
    res.status(500).json({ success: false, message: 'Failed to mark attendance', error: error.message });
  }
});

// Get teacher attendance by date range (Admin)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, teacherId } = req.query;

    // Verify admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can view all teacher attendance' });
    }

    const query = {};

    if (teacherId) {
      query.teacherId = teacherId;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    const records = await TeacherAttendance.find(query)
      .populate('teacherId', 'fullName employeeId')
      .populate('markedBy', 'fullName')
      .populate('editedBy', 'fullName')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error('Error fetching teacher attendance:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance', error: error.message });
  }
});

// Get teacher attendance history (Individual teacher or admin)
router.get('/teacher/:teacherId', authMiddleware, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { month, year, day } = req.query;

    // Try to find teacher by ID first, if not found, try to find by userId
    let teacher = await Teacher.findById(teacherId);
    
    if (!teacher) {
      // Maybe it's a User ID, try to find teacher by userId
      teacher = await Teacher.findOne({ userId: teacherId });
    }

    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    const user = await User.findById(req.user._id);
    if (teacher.userId.toString() !== req.user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const query = { teacherId: teacher._id };

    // Handle both month-year format (YYYY-MM) and separate month/year query params
    if (month) {
      if (month.includes('-')) {
        // Format: YYYY-MM
        const [y, m] = month.split('-');
        
        if (day) {
          // Filter by specific day
          const dayNum = String(day).padStart(2, '0');
          const specificDate = new Date(`${y}-${m}-${dayNum}`);
          const nextDay = new Date(specificDate);
          nextDay.setDate(nextDay.getDate() + 1);
          query.date = { $gte: specificDate, $lt: nextDay };
        } else {
          // Filter by entire month
          const startDate = new Date(y, parseInt(m) - 1, 1);
          const endDate = new Date(y, parseInt(m), 0);
          endDate.setHours(23, 59, 59, 999);
          query.date = { $gte: startDate, $lte: endDate };
        }
      } else if (year) {
        // Format: separate month and year parameters
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        endDate.setHours(23, 59, 59, 999);
        query.date = { $gte: startDate, $lte: endDate };
      }
    }

    const records = await TeacherAttendance.find(query)
      .populate('markedBy', 'fullName')
      .populate('editedBy', 'fullName')
      .sort({ date: -1 });

    // Calculate statistics
    const total = records.length;
    const present = records.filter(r => r.status === 'Present').length;
    const absent = records.filter(r => r.status === 'Absent').length;
    const leave = records.filter(r => r.status === 'Leave').length;

    res.status(200).json({
      success: true,
      data: records,
      statistics: {
        total,
        present,
        absent,
        leave,
        percentage: total > 0 ? ((present / total) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching teacher attendance history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance', error: error.message });
  }
});

// Update teacher attendance (Admin only)
router.put('/:attendanceId', authMiddleware, async (req, res) => {
  try {
    const { status, remarks } = req.body;

    // Verify admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can update teacher attendance' });
    }

    const attendance = await TeacherAttendance.findById(req.params.attendanceId);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    attendance.status = status || attendance.status;
    attendance.remarks = remarks || attendance.remarks;
    attendance.editedBy = req.user._id;
    attendance.editedAt = new Date();

    await attendance.save();
    await attendance.populate('teacherId', 'fullName');
    await attendance.populate('markedBy', 'fullName');
    await attendance.populate('editedBy', 'fullName');

    res.status(200).json({
      success: true,
      message: 'Attendance updated successfully',
      data: attendance
    });
  } catch (error) {
    console.error('Error updating teacher attendance:', error);
    res.status(500).json({ success: false, message: 'Failed to update attendance', error: error.message });
  }
});

// Delete teacher attendance (Admin only)
router.delete('/:attendanceId', authMiddleware, async (req, res) => {
  try {
    // Verify admin
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can delete teacher attendance' });
    }

    const attendance = await TeacherAttendance.findByIdAndDelete(req.params.attendanceId);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting teacher attendance:', error);
    res.status(500).json({ success: false, message: 'Failed to delete attendance', error: error.message });
  }
});

module.exports = router;
