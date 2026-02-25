const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['Academic', 'Facility', 'Staff', 'Administration', 'Technical', 'Other'],
    default: 'Other'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Resolved', 'Closed'],
    default: 'Pending'
  },
  submittedBy: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['student', 'teacher'],
      required: true
    },
    email: String,
    class: String, // For students
    department: String // For teachers
  },
  adminResponse: {
    message: String,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    respondedAt: Date
  },
  resolvedAt: Date,
  attachments: [{
    filename: String,
    url: String
  }]
}, {
  timestamps: true
});

// Index for faster queries
complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ 'submittedBy.userId': 1 });

module.exports = mongoose.model('Complaint', complaintSchema);
