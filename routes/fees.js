const express = require('express');
const router = express.Router();
const Fee = require('../models/Fee');
const Student = require('../models/Student');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Create fee slip for a student (Admin only)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { studentId, amount, dueDate, month, year, description } = req.body;

    // Check if student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if fee already exists for this month/year
    const existingFee = await Fee.findOne({ studentId, month, year });
    if (existingFee) {
      return res.status(400).json({ message: 'Fee slip already exists for this month' });
    }

    const fee = new Fee({
      studentId,
      amount,
      dueDate,
      month,
      year,
      description,
      status: 'pending'
    });

    await fee.save();
    
    const populatedFee = await Fee.findById(fee._id)
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'fullName email' }
      });

    res.status(201).json({ 
      message: 'Fee slip created successfully', 
      fee: populatedFee 
    });
  } catch (error) {
    console.error('Error creating fee:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get all fees for a student (Student can view their own)
router.get('/my-fees', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    const fees = await Fee.find({ studentId: student._id })
      .sort({ year: -1, createdAt: -1 })
      .populate({
        path: 'studentId',
        populate: { path: 'userId', select: 'fullName email' }
      });

    res.json({ fees });
  } catch (error) {
    console.error('Error fetching fees:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update fee status (Admin only)
router.patch('/:feeId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, paidDate } = req.body;
    const fee = await Fee.findByIdAndUpdate(
      req.params.feeId,
      { status, paidDate: status === 'paid' ? paidDate || new Date() : null },
      { new: true }
    ).populate({
      path: 'studentId',
      populate: { path: 'userId', select: 'fullName email' }
    });

    if (!fee) {
      return res.status(404).json({ message: 'Fee not found' });
    }

    res.json({ message: 'Fee updated successfully', fee });
  } catch (error) {
    console.error('Error updating fee:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update fee details (Admin only)
router.put('/:feeId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { amount, dueDate, month, year, description } = req.body;
    const fee = await Fee.findByIdAndUpdate(
      req.params.feeId,
      { amount, dueDate, month, year, description },
      { new: true }
    ).populate({
      path: 'studentId',
      populate: { path: 'userId', select: 'fullName email' }
    });

    if (!fee) {
      return res.status(404).json({ message: 'Fee not found' });
    }

    res.json({ message: 'Fee updated successfully', fee });
  } catch (error) {
    console.error('Error updating fee:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete fee (Admin only)
router.delete('/:feeId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const fee = await Fee.findByIdAndDelete(req.params.feeId);
    if (!fee) {
      return res.status(404).json({ message: 'Fee not found' });
    }

    res.json({ message: 'Fee deleted successfully' });
  } catch (error) {
    console.error('Error deleting fee:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
