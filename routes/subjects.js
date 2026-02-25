const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const { authMiddleware, checkRole } = require('../middleware/auth');

// Get all subjects (for teacher/admin)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const subjects = await Subject.find()
      .populate({
        path: 'teacherId',
        populate: { path: 'userId', select: 'fullName email' }
      });
    res.json({ success: true, subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get subjects for logged-in student (filtered by class and section)
router.get('/my-subjects', authMiddleware, checkRole('student'), async (req, res) => {
  try {
    // Find the student profile
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    // Find subjects matching student's class and section
    const subjects = await Subject.find({
      $or: [
        { class: student.class, section: student.section },
        { class: student.class, section: null },
        { class: null, section: null }
      ]
    }).populate({
      path: 'teacherId',
      populate: { path: 'userId', select: 'fullName email' }
    });

    res.json({ success: true, subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create subject (Admin/Teacher)
router.post('/', authMiddleware, checkRole('admin', 'teacher'), async (req, res) => {
  try {
    const { name, code, maxMarks, teacherId, class: className, section } = req.body;
    const subject = await Subject.create({ 
      name, 
      code, 
      maxMarks,
      teacherId: teacherId || null,
      class: className || null,
      section: section || null
    });
    res.status(201).json({ success: true, subject, message: 'Subject created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete subject (Admin)
router.delete('/:id', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    await Subject.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Subject deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
