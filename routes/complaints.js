const express = require('express');
const router = express.Router();
const Complaint = require('../models/Complaint');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const { authMiddleware } = require('../middleware/auth');

// Get all complaints (Admin only)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    const { status, priority, category, page = 1, limit = 20 } = req.query;
    
    const filter = {};
    if (status && status !== 'All') filter.status = status;
    if (priority && priority !== 'All') filter.priority = priority;
    if (category && category !== 'All') filter.category = category;

    const complaints = await Complaint.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const count = await Complaint.countDocuments(filter);

    res.json({
      success: true,
      complaints,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    console.error('Error fetching complaints:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get complaints by user (Student/Teacher)
router.get('/my-complaints', authMiddleware, async (req, res) => {
  try {
    const complaints = await Complaint.find({ 
      'submittedBy.userId': req.user._id 
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, complaints });
  } catch (error) {
    console.error('Error fetching user complaints:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new complaint (Student/Teacher)
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;

    if (!title || !description) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and description are required' 
      });
    }

    // Get user details based on role
    let userDetails = {
      userId: req.user._id,
      name: req.user.fullName,
      role: req.user.role,
      email: req.user.email
    };

    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id });
      if (student) {
        userDetails.class = student.class;
      }
    } else if (req.user.role === 'teacher') {
      const teacher = await Teacher.findOne({ userId: req.user._id });
      if (teacher) {
        userDetails.department = teacher.department || 'N/A';
      }
    }

    const complaint = new Complaint({
      title,
      description,
      category: category || 'Other',
      priority: priority || 'Medium',
      submittedBy: userDetails
    });

    await complaint.save();

    res.status(201).json({ 
      success: true, 
      message: 'Complaint submitted successfully',
      complaint 
    });
  } catch (error) {
    console.error('Error creating complaint:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update complaint status (Admin only)
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    const { status } = req.body;
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({ 
        success: false, 
        message: 'Complaint not found' 
      });
    }

    complaint.status = status;
    
    if (status === 'Resolved' || status === 'Closed') {
      complaint.resolvedAt = new Date();
    }

    await complaint.save();

    res.json({ 
      success: true, 
      message: 'Complaint status updated successfully',
      complaint 
    });
  } catch (error) {
    console.error('Error updating complaint status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add admin response (Admin only)
router.put('/:id/respond', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    const { message } = req.body;
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({ 
        success: false, 
        message: 'Complaint not found' 
      });
    }

    complaint.adminResponse = {
      message,
      respondedBy: req.user.userId,
      respondedAt: new Date()
    };

    await complaint.save();

    res.json({ 
      success: true, 
      message: 'Response added successfully',
      complaint 
    });
  } catch (error) {
    console.error('Error adding response:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update complaint (Owner only, if Pending)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({ 
        success: false, 
        message: 'Complaint not found' 
      });
    }

    // Check if user is the owner
    if (complaint.submittedBy.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only edit your own complaints' 
      });
    }

    // Only allow editing if status is Pending
    if (complaint.status !== 'Pending') {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only edit complaints with Pending status' 
      });
    }

    // Update fields
    if (title) complaint.title = title;
    if (description) complaint.description = description;
    if (category) complaint.category = category;
    if (priority) complaint.priority = priority;

    await complaint.save();

    res.json({ 
      success: true, 
      message: 'Complaint updated successfully',
      complaint 
    });
  } catch (error) {
    console.error('Error updating complaint:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete complaint (Admin or Owner if Pending)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({ 
        success: false, 
        message: 'Complaint not found' 
      });
    }

    // Check if user is admin or the owner
    const isOwner = complaint.submittedBy.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    // If owner (not admin), only allow deletion if status is Pending
    if (!isAdmin && complaint.status !== 'Pending') {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only delete complaints with Pending status' 
      });
    }

    await Complaint.findByIdAndDelete(req.params.id);

    res.json({ 
      success: true, 
      message: 'Complaint deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting complaint:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get complaint statistics (Admin only)
router.get('/statistics', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin only.' 
      });
    }

    const stats = await Complaint.aggregate([
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byPriority: [
            { $group: { _id: '$priority', count: { $sum: 1 } } }
          ],
          byCategory: [
            { $group: { _id: '$category', count: { $sum: 1 } } }
          ],
          total: [
            { $count: 'count' }
          ]
        }
      }
    ]);

    res.json({ success: true, stats: stats[0] });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
