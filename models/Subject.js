const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true,
    unique: true
  },
  maxMarks: {
    type: Number,
    required: true,
    default: 100
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    default: null
  },
  class: {
    type: String,
    default: null
  },
  section: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Subject', subjectSchema);
