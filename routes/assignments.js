const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Subject = require('../models/Subject');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const { authMiddleware } = require('../middleware/auth');

// Get all assignments (admin view)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .populate('subject', 'name code')
      .populate('teacher')
      .populate({
        path: 'teacher',
        populate: {
          path: 'userId',
          select: 'fullName email'
        }
      })
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 });

    res.json({ success: true, assignments });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get assignments for teacher
router.get('/teacher/:teacherId', authMiddleware, async (req, res) => {
  try {
    const assignments = await Assignment.find({ teacher: req.params.teacherId })
      .populate('subject', 'name code')
      .sort({ createdAt: -1 });

    res.json({ success: true, assignments });
  } catch (error) {
    console.error('Error fetching teacher assignments:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get assignments for student (by class and section)
router.get('/student/:class/:section', authMiddleware, async (req, res) => {
  try {
    const { class: studentClass, section } = req.params;
    
    const assignments = await Assignment.find({
      class: studentClass,
      section: section,
      status: 'active'
    })
      .populate('subject', 'name code')
      .populate({
        path: 'teacher',
        populate: {
          path: 'userId',
          select: 'fullName'
        }
      })
      .sort({ dueDate: 1 });

    res.json({ success: true, assignments });
  } catch (error) {
    console.error('Error fetching student assignments:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create new assignment (teacher/admin)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      title,
      description,
      subject,
      class: assignmentClass,
      section,
      teacher,
      dueDate,
      totalMarks,
      attachments
    } = req.body;

    const assignment = new Assignment({
      title,
      description,
      subject,
      class: assignmentClass,
      section,
      teacher,
      dueDate,
      totalMarks,
      attachments: attachments || [],
      createdBy: req.user.id
    });

    await assignment.save();

    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate('subject', 'name code')
      .populate({
        path: 'teacher',
        populate: {
          path: 'userId',
          select: 'fullName email'
        }
      });

    res.status(201).json({
      success: true,
      message: 'Assignment created successfully',
      assignment: populatedAssignment
    });
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update assignment (teacher/admin)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const {
      title,
      description,
      subject,
      class: assignmentClass,
      section,
      dueDate,
      totalMarks,
      status,
      attachments
    } = req.body;

    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        subject,
        class: assignmentClass,
        section,
        dueDate,
        totalMarks,
        status,
        attachments
      },
      { new: true }
    )
      .populate('subject', 'name code')
      .populate({
        path: 'teacher',
        populate: {
          path: 'userId',
          select: 'fullName email'
        }
      });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    res.json({
      success: true,
      message: 'Assignment updated successfully',
      assignment
    });
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete assignment (teacher/admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const assignment = await Assignment.findByIdAndDelete(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    res.json({
      success: true,
      message: 'Assignment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Submit assignment (student)
router.post('/:assignmentId/submit', authMiddleware, async (req, res) => {
  try {
    const { files, comment } = req.body;
    
    console.log('Submit request - User ID:', req.user._id);
    console.log('Submit request - Assignment ID:', req.params.assignmentId);
    console.log('Submit request - Files count:', files?.length || 0);
    
    // Find student
    const student = await Student.findOne({ userId: req.user._id });
    console.log('Found student:', student?._id);
    
    if (!student) {
      console.error('Student not found for user:', req.user._id);
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Check if already submitted
    const existingSubmission = await AssignmentSubmission.findOne({
      assignment: req.params.assignmentId,
      student: student._id
    });

    console.log('Existing submission:', existingSubmission?._id);

    if (existingSubmission) {
      // Update existing submission
      existingSubmission.files = files || [];
      existingSubmission.comment = comment || '';
      existingSubmission.submittedAt = new Date();
      existingSubmission.status = 'submitted';
      await existingSubmission.save();

      return res.json({
        success: true,
        message: 'Assignment resubmitted successfully',
        submission: existingSubmission
      });
    }

    // Create new submission
    const submission = new AssignmentSubmission({
      assignment: req.params.assignmentId,
      student: student._id,
      files: files || [],
      comment: comment || '',
      status: 'submitted'
    });

    await submission.save();

    console.log('Created new submission:', submission._id);

    res.status(201).json({
      success: true,
      message: 'Assignment submitted successfully',
      submission
    });
  } catch (error) {
    console.error('Error submitting assignment:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Get submissions for an assignment (teacher/admin)
router.get('/:assignmentId/submissions', authMiddleware, async (req, res) => {
  try {
    const submissions = await AssignmentSubmission.find({
      assignment: req.params.assignmentId
    })
      .populate({
        path: 'student',
        populate: {
          path: 'userId',
          select: 'fullName email'
        }
      })
      .sort({ submittedAt: -1 });

    res.json({ success: true, submissions });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get student's submission for an assignment
router.get('/:assignmentId/my-submission', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const submission = await AssignmentSubmission.findOne({
      assignment: req.params.assignmentId,
      student: student._id
    });

    res.json({ success: true, submission });
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Grade submission (teacher/admin)
router.put('/submissions/:submissionId/grade', authMiddleware, async (req, res) => {
  try {
    const { grade, teacherFeedback } = req.body;

    const submission = await AssignmentSubmission.findByIdAndUpdate(
      req.params.submissionId,
      {
        grade,
        teacherFeedback,
        status: 'graded'
      },
      { new: true }
    )
      .populate({
        path: 'student',
        populate: {
          path: 'userId',
          select: 'fullName email'
        }
      });

    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    res.json({
      success: true,
      message: 'Submission graded successfully',
      submission
    });
  } catch (error) {
    console.error('Error grading submission:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
