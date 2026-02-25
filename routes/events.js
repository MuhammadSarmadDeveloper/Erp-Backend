const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { authMiddleware, checkRole } = require('../middleware/auth');

// Get all events (admin/teacher)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { category, startDate, endDate, class: className, section } = req.query;
    
    let query = {};
    
    if (category) query.category = category;
    if (className) query.class = className;
    if (section) query.section = section;
    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }
    
    const events = await Event.find(query)
      .populate('createdBy', 'fullName')
      .sort({ startDate: 1 });
    
    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get upcoming events
router.get('/upcoming', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const events = await Event.find({
      startDate: { $gte: today },
      status: 'Active'
    })
      .populate('createdBy', 'fullName')
      .sort({ startDate: 1 })
      .limit(20);
    
    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get event by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('createdBy', 'fullName');
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create event (admin only)
router.post('/', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    const {
      title,
      category,
      startDate,
      endDate,
      startTime,
      endTime,
      applicableFor,
      class: className,
      section,
      description,
      location,
      status
    } = req.body;
    
    const event = new Event({
      title,
      category,
      startDate,
      endDate,
      startTime,
      endTime,
      applicableFor,
      class: className,
      section,
      description,
      location,
      status,
      createdBy: req.user.userId
    });
    
    await event.save();
    
    const populatedEvent = await Event.findById(event._id).populate('createdBy', 'fullName');
    
    res.status(201).json({ success: true, event: populatedEvent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update event (admin only)
router.put('/:id', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    const {
      title,
      category,
      startDate,
      endDate,
      startTime,
      endTime,
      applicableFor,
      class: className,
      section,
      description,
      location,
      status
    } = req.body;
    
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      {
        title,
        category,
        startDate,
        endDate,
        startTime,
        endTime,
        applicableFor,
        class: className,
        section,
        description,
        location,
        status
      },
      { new: true }
    ).populate('createdBy', 'fullName');
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete event (admin only)
router.delete('/:id', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
