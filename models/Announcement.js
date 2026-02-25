const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
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
    enum: ['General', 'Academic', 'Sports', 'Events', 'Holiday', 'Urgent'],
    default: 'General'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  targetAudience: {
    type: String,
    enum: ['All', 'Students', 'Teachers', 'Parents', 'Specific Class', 'Specific Section'],
    default: 'All'
  },
  class: {
    type: String,
    required: function() {
      return this.targetAudience === 'Specific Class' || this.targetAudience === 'Specific Section';
    }
  },
  section: {
    type: String,
    required: function() {
      return this.targetAudience === 'Specific Section';
    }
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  attachments: [{
    name: String,
    url: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  views: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Announcement', announcementSchema);
