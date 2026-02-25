const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const User = require('../models/User');
const Result = require('../models/Result');
const Schedule = require('../models/Schedule');
const Exam = require('../models/Exam');
const { authMiddleware, checkRole } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// Get student by user ID
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.params.userId })
      .populate('userId', 'fullName email');
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ success: true, student });
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all students (Teacher/Admin)
router.get('/', authMiddleware, checkRole('teacher', 'admin'), async (req, res) => {
  try {
    // Support filtering by class and section
    const { class: className, section } = req.query;
    const filter = {};
    
    if (className) {
      filter.class = className;
    }
    if (section) {
      filter.section = section;
    }
    
    const students = await Student.find(filter).populate('userId', 'fullName email');
    res.json({ success: true, students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get student by user ID
router.get('/me', authMiddleware, checkRole('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id }).populate('userId', 'fullName email');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }
    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create student (Admin/Teacher)
router.post('/', authMiddleware, checkRole('admin', 'teacher'), async (req, res) => {
  try {
    const { email, password, fullName, rollNumber, class: className, section } = req.body;

    // Create user
    const user = await User.create({
      email,
      password,
      fullName,
      role: 'student'
    });

    // Create student profile
    const student = await Student.create({
      userId: user._id,
      rollNumber,
      class: className,
      section
    });

    res.status(201).json({ success: true, student, message: 'Student created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete student (Admin)
router.delete('/:id', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Delete user account
    await User.findByIdAndDelete(student.userId);
    // Delete student profile
    await Student.findByIdAndDelete(req.params.id);
    // Delete all results
    await Result.deleteMany({ studentId: req.params.id });

    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get student's class schedule
router.get('/schedule', authMiddleware, checkRole('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const schedules = await Schedule.find({
      class: student.class,
      section: student.section,
      isActive: true
    })
      .populate('subject', 'name code')
      .populate({
        path: 'teacher',
        populate: { path: 'userId', select: 'fullName email' }
      })
      .sort({ dayOfWeek: 1, startTime: 1 });

    res.json({ success: true, schedules });
  } catch (error) {
    console.error('Error fetching student schedule:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get exams for student's subjects
router.get('/exams', authMiddleware, checkRole('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    // Get exams for this student's class and section
    const exams = await Exam.find({
      class: student.class,
      section: student.section,
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

// Generate and download roll number slip as HTML/PDF
router.get('/roll-number-slip', authMiddleware, checkRole('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id }).populate('userId', 'fullName email profileImage');
    
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Load logo image and convert to base64
    const logoPath = path.join(__dirname, '..', '..', 'Erp-School', 'src', 'Images', 'ico.png');
    console.log('Logo path:', logoPath);
    console.log('Logo exists:', fs.existsSync(logoPath));
    
    let logoBase64 = '';
    
    try {
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = logoBuffer.toString('base64');
        console.log('Logo loaded successfully, base64 length:', logoBase64.length);
      } else {
        console.log('Logo file not found at:', logoPath);
      }
    } catch (logoError) {
      console.log('Error reading logo:', logoError.message);
    }

    // Fetch exams for this student's class and section
    const exams = await Exam.find({
      class: student.class,
      section: student.section,
      status: { $ne: 'Cancelled' }
    })
      .populate('subject', 'name')
      .populate('createdBy', 'fullName')
      .sort({ date: 1, startTime: 1 });

    // Check if exams are scheduled
    if (!exams || exams.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No exams scheduled. Roll number slip cannot be generated until exams are scheduled by the admin.' 
      });
    }

    // Format exams for display
    const examsHTML = exams.map(exam => {
      const examDate = new Date(exam.date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      const teacherName = exam.createdBy?.fullName || 'N/A';
      return `
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 10px; font-size: 13px;">${exam.subject?.name || 'N/A'}</td>
          <td style="padding: 10px; font-size: 13px;">${examDate}</td>
          <td style="padding: 10px; font-size: 13px;">${exam.startTime}</td>
          <td style="padding: 10px; font-size: 13px;">${exam.endTime}</td>
          <td style="padding: 10px; font-size: 13px;">${exam.room || 'N/A'}</td>
          <td style="padding: 10px; font-size: 13px;">${teacherName}</td>
        </tr>
      `;
    }).join('');

    console.log('Student profile image:', student.userId.profileImage);
    console.log('Student full name:', student.userId.fullName);

    // Create HTML for the slip
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .slip-container {
            max-width: 800px;
            margin: 20px auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border: 3px solid #1e40af;
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #1e40af;
            padding-bottom: 20px;
            margin-bottom: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
          }
          .logo {
            width: 50px;
            height: 50px;
            object-fit: contain;
          }
          .header-text {
            text-align: center;
          }
          .school-name {
            font-size: 28px;
            font-weight: bold;
            color: #1e40af;
            margin: 0;
          }
          .slip-title {
            font-size: 18px;
            color: #666;
            font-weight: bold;
            margin: 0;
          }
          .content {
            display: flex;
            gap: 30px;
            margin-bottom: 30px;
          }
          .profile-section {
            text-align: center;
            flex: 0 0 150px;
          }
          .profile-image {
            width: 140px;
            height: 140px;
            border-radius: 8px;
            border: 3px solid #1e40af;
            margin-bottom: 10px;
            object-fit: cover;
            background: #f0f0f0;
            display: block;
            margin-left: auto;
            margin-right: auto;
          }
          .details-section {
            flex: 1;
          }
          .detail-row {
            display: flex;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e0e0e0;
          }
          .detail-label {
            font-weight: bold;
            color: #1e40af;
            min-width: 120px;
            font-size: 14px;
          }
          .detail-value {
            color: #333;
            font-size: 14px;
          }
          .exams-section {
            margin-top: 30px;
            border-top: 2px solid #1e40af;
            padding-top: 20px;
          }
          .exams-title {
            font-size: 16px;
            font-weight: bold;
            color: #1e40af;
            margin-bottom: 15px;
          }
          .exams-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .exams-table th {
            background-color: #1e40af;
            color: white;
            padding: 12px;
            text-align: left;
            font-size: 13px;
            font-weight: bold;
          }
          .exams-table td {
            padding: 10px;
            font-size: 13px;
          }
          .date-issued {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            color: #666;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 3px solid #1e40af;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="slip-container">
          <div class="header">
            ${logoBase64 ? 
              `<img src="data:image/png;base64,${logoBase64}" alt="Logo" style="width: 60px; height: 60px; object-fit: contain; margin-right: 10px;">` :
              `<svg width="60" height="60" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style="margin-right: 10px;">
                <circle cx="100" cy="100" r="95" fill="#1e40af" stroke="#1e40af" stroke-width="2"/>
                <circle cx="100" cy="70" r="25" fill="white"/>
                <path d="M 70 120 Q 100 100 130 120 L 130 150 Q 100 160 70 150 Z" fill="white"/>
                <text x="100" y="180" text-anchor="middle" font-size="14" font-weight="bold" fill="#1e40af">HES</text>
              </svg>`
            }
            <div class="header-text">
              <div class="school-name">HIRA EDUCATION SYSTEM</div>
              <div class="slip-title">ROLL NUMBER SLIP</div>
            </div>
          </div>

          <div class="content">
            <div class="profile-section">
              ${student.userId.profileImage ? 
                `<img src="${student.userId.profileImage}" alt="Profile" style="width: 140px; height: 140px; border-radius: 8px; border: 3px solid #1e40af; object-fit: cover; display: block; margin: 0 auto;">` :
                `<div style="width: 140px; height: 140px; border-radius: 8px; border: 3px solid #1e40af; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 50px; font-weight: bold; margin: 0 auto;">
                  ${student.userId.fullName.charAt(0).toUpperCase()}
                </div>`
              }
              <div style="color: #666; font-size: 12px; margin-top: 10px; text-align: center;">Student Photo</div>
            </div>

            <div class="details-section">
              <div class="detail-row">
                <div class="detail-label">Name:</div>
                <div class="detail-value">${student.userId.fullName}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Roll Number:</div>
                <div class="detail-value">${student.rollNumber}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Class:</div>
                <div class="detail-value">${student.class}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Section:</div>
                <div class="detail-value">${student.section}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Email:</div>
                <div class="detail-value">${student.userId.email}</div>
              </div>
              <div class="detail-row">
                <div class="detail-label">Status:</div>
                <div class="detail-value">${student.isActive ? 'Active' : 'Inactive'}</div>
              </div>
            </div>
          </div>

          ${exams.length > 0 ? `
            <div class="exams-section">
              <div class="exams-title">Assigned Subjects & Exams</div>
              <table class="exams-table">
                <thead>
                  <tr>
                    <th>Subject Name</th>
                    <th>Exam Date</th>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Room No</th>
                    <th>Teacher Name</th>
                  </tr>
                </thead>
                <tbody>
                  ${examsHTML}
                </tbody>
              </table>
            </div>
          ` : ''}

          <div class="date-issued">
            Issued: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>

          <div class="footer">
            <p>This is an official roll number slip issued by Hira Education System.</p>
            <p>Please keep this document safe for admission and enrollment purposes.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send as HTML response
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="roll-number-slip-${student.rollNumber}.html"`);
    res.send(htmlContent);
  } catch (error) {
    console.error('Error generating roll number slip:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
