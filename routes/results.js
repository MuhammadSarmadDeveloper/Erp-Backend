const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const Student = require('../models/Student');
const { authMiddleware, checkRole } = require('../middleware/auth');

// Get results for a student
router.get('/student/:studentId', authMiddleware, async (req, res) => {
  try {
    const results = await Result.find({ studentId: req.params.studentId })
      .populate('subjectId')
      .populate('teacherId', 'fullName');
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get my results (Student)
router.get('/my-results', authMiddleware, checkRole('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const results = await Result.find({ studentId: student._id })
      .populate('subjectId')
      .populate('teacherId', 'fullName');
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all results (Teacher/Admin)
router.get('/', authMiddleware, checkRole('teacher', 'admin'), async (req, res) => {
  try {
    const results = await Result.find()
      .populate('studentId')
      .populate('subjectId')
      .populate('teacherId', 'fullName');
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create or update result (Teacher/Admin)
router.post('/', authMiddleware, checkRole('teacher', 'admin'), async (req, res) => {
  try {
    const { studentId, subjectId, marks, grade } = req.body;

    // Check if result already exists
    let result = await Result.findOne({ studentId, subjectId });

    if (result) {
      // Update existing result
      result.marks = marks;
      result.grade = grade;
      result.teacherId = req.user._id;
      await result.save();
    } else {
      // Create new result
      result = await Result.create({
        studentId,
        subjectId,
        marks,
        grade,
        teacherId: req.user._id
      });
    }

    await result.populate('subjectId');
    await result.populate('teacherId', 'fullName');

    res.json({ success: true, result, message: 'Result saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete result (Admin)
router.delete('/:id', authMiddleware, checkRole('admin', 'teacher'), async (req, res) => {
  try {
    await Result.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Result deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
