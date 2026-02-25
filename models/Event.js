const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['Holiday', 'Competition', 'Activity', 'Seminar'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    default: null
  },
  endTime: {
    type: String,
    default: null
  },
  applicableFor: {
    type: String,
    enum: ['All Students', 'Specific Class', 'Specific Section'],
    default: 'All Students'
  },
  class: {
    type: String,
    default: null
  },
  section: {
    type: String,
    default: null
  },
  description: {
    type: String,
    default: null
  },
  location: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['Active', 'Cancelled', 'Completed'],
    default: 'Active'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Event', eventSchema);
