const express = require('express');
const router = express.Router();
const Salary = require('../models/Salary');
const Teacher = require('../models/Teacher');
const { authMiddleware } = require('../middleware/auth');

// Get all salary records with filters
router.get('/records', authMiddleware, async (req, res) => {
  try {
    const { year, month, teacherId, status } = req.query;
    
    let query = {};
    
    if (year) {
      query.year = parseInt(year);
    }
    
    if (month) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthIndex = parseInt(month) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        query.month = monthNames[monthIndex];
      }
    }
    
    if (teacherId) {
      query.teacherId = teacherId;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const salaryRecords = await Salary.find(query)
      .populate({
        path: 'teacherId',
        select: 'employeeId userId',
        populate: {
          path: 'userId',
          select: 'fullName email'
        }
      })
      .sort({ year: -1, month: -1, createdAt: -1 });
    
    res.json({
      success: true,
      data: salaryRecords
    });
  } catch (error) {
    console.error('Error fetching salary records:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salary records',
      error: error.message
    });
  }
});

// Get salary record by ID
router.get('/records/:id', authMiddleware, async (req, res) => {
  try {
    const salaryRecord = await Salary.findById(req.params.id)
      .populate({
        path: 'teacherId',
        select: 'employeeId userId',
        populate: {
          path: 'userId',
          select: 'fullName email'
        }
      });
    
    if (!salaryRecord) {
      return res.status(404).json({
        success: false,
        message: 'Salary record not found'
      });
    }
    
    res.json({
      success: true,
      data: salaryRecord
    });
  } catch (error) {
    console.error('Error fetching salary record:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salary record',
      error: error.message
    });
  }
});

// Create a new salary record
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const {
      teacherId,
      month,
      year,
      basicSalary,
      allowances,
      deductions,
      totalSalary,
      status,
      paymentDate,
      paymentMethod,
      remarks
    } = req.body;
    
    // Validate required fields
    if (!teacherId || !month || !year || !basicSalary || totalSalary === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Check if teacher exists
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }
    
    // Check if salary record already exists for this teacher, month, and year
    const existingRecord = await Salary.findOne({
      teacherId,
      month,
      year
    });
    
    if (existingRecord) {
      return res.status(400).json({
        success: false,
        message: 'Salary record already exists for this teacher, month, and year'
      });
    }
    
    // Create new salary record
    const salaryRecord = new Salary({
      teacherId,
      month,
      year,
      basicSalary,
      allowances: allowances || 0,
      deductions: deductions || 0,
      totalSalary,
      status: status || 'Pending',
      paymentDate: paymentDate || null,
      paymentMethod: paymentMethod || null,
      remarks: remarks || null
    });
    
    await salaryRecord.save();
    
    // Populate teacher details before sending response
    await salaryRecord.populate({
      path: 'teacherId',
      select: 'employeeId userId',
      populate: {
        path: 'userId',
        select: 'fullName email'
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'Salary record created successfully',
      data: salaryRecord
    });
  } catch (error) {
    console.error('Error creating salary record:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating salary record',
      error: error.message
    });
  }
});

// Update salary record
router.put('/update/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const salaryRecord = await Salary.findById(id);
    
    if (!salaryRecord) {
      return res.status(404).json({
        success: false,
        message: 'Salary record not found'
      });
    }
    
    // Update fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        salaryRecord[key] = updateData[key];
      }
    });
    
    // Recalculate total salary if basic salary, allowances, or deductions are updated
    if (updateData.basicSalary !== undefined || updateData.allowances !== undefined || updateData.deductions !== undefined) {
      salaryRecord.totalSalary = salaryRecord.basicSalary + (salaryRecord.allowances || 0) - (salaryRecord.deductions || 0);
    }
    
    await salaryRecord.save();
    
    // Populate teacher details before sending response
    await salaryRecord.populate({
      path: 'teacherId',
      select: 'employeeId userId',
      populate: {
        path: 'userId',
        select: 'fullName email'
      }
    });
    
    res.json({
      success: true,
      message: 'Salary record updated successfully',
      data: salaryRecord
    });
  } catch (error) {
    console.error('Error updating salary record:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating salary record',
      error: error.message
    });
  }
});

// Delete salary record
router.delete('/delete/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const salaryRecord = await Salary.findByIdAndDelete(id);
    
    if (!salaryRecord) {
      return res.status(404).json({
        success: false,
        message: 'Salary record not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Salary record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting salary record:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting salary record',
      error: error.message
    });
  }
});

// Get salary statistics
router.get('/statistics', authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.query;
    
    let query = {};
    
    if (year) {
      query.year = parseInt(year);
    }
    
    if (month) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthIndex = parseInt(month) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        query.month = monthNames[monthIndex];
      }
    }
    
    const totalRecords = await Salary.countDocuments(query);
    const paidRecords = await Salary.countDocuments({ ...query, status: 'Paid' });
    const pendingRecords = await Salary.countDocuments({ ...query, status: 'Pending' });
    const processingRecords = await Salary.countDocuments({ ...query, status: 'Processing' });
    
    const paidAmount = await Salary.aggregate([
      { $match: { ...query, status: 'Paid' } },
      { $group: { _id: null, total: { $sum: '$totalSalary' } } }
    ]);
    
    const pendingAmount = await Salary.aggregate([
      { $match: { ...query, status: 'Pending' } },
      { $group: { _id: null, total: { $sum: '$totalSalary' } } }
    ]);
    
    const processingAmount = await Salary.aggregate([
      { $match: { ...query, status: 'Processing' } },
      { $group: { _id: null, total: { $sum: '$totalSalary' } } }
    ]);
    
    res.json({
      success: true,
      statistics: {
        totalRecords,
        paidRecords,
        pendingRecords,
        processingRecords,
        paidAmount: paidAmount[0]?.total || 0,
        pendingAmount: pendingAmount[0]?.total || 0,
        processingAmount: processingAmount[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error fetching salary statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching salary statistics',
      error: error.message
    });
  }
});

module.exports = router;
