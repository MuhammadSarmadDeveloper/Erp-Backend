const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const { authMiddleware } = require('../middleware/auth');

// Helper function to check if user is admin
const checkRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};

// Get all announcements with filters
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { category, priority, targetAudience, isActive, isPinned } = req.query;
    
    let query = {};
    
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (targetAudience) query.targetAudience = targetAudience;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (isPinned !== undefined) query.isPinned = isPinned === 'true';
    
    // Only show active announcements for non-admin users (without date filtering)
    if (req.user.role !== 'admin') {
      query.isActive = true;
    }

    const announcements = await Announcement.find(query)
      .populate('createdBy', 'fullName email')
      .sort({ isPinned: -1, createdAt: -1 });

    res.json({ announcements });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ message: 'Failed to fetch announcements' });
  }
});

// Get active announcements (for students/teachers)
router.get('/active', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    
    const announcements = await Announcement.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    })
      .populate('createdBy', 'fullName')
      .sort({ isPinned: -1, createdAt: -1 })
      .limit(50);

    res.json({ announcements });
  } catch (error) {
    console.error('Error fetching active announcements:', error);
    res.status(500).json({ message: 'Failed to fetch announcements' });
  }
});

// Get single announcement by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('createdBy', 'fullName email');

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    // Increment view count
    announcement.views += 1;
    await announcement.save();

    res.json({ announcement });
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({ message: 'Failed to fetch announcement' });
  }
});

// Create new announcement (admin only)
router.post('/', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    const announcementData = {
      ...req.body,
      createdBy: req.user._id
    };

    const announcement = new Announcement(announcementData);
    await announcement.save();

    const populatedAnnouncement = await Announcement.findById(announcement._id)
      .populate('createdBy', 'fullName email');

    res.status(201).json({ 
      message: 'Announcement created successfully',
      announcement: populatedAnnouncement 
    });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ message: 'Failed to create announcement' });
  }
});

// Update announcement (admin only)
router.put('/:id', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'fullName email');

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    res.json({ 
      message: 'Announcement updated successfully',
      announcement 
    });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ message: 'Failed to update announcement' });
  }
});

// Toggle pin status (admin only)
router.patch('/:id/pin', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    
    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    announcement.isPinned = !announcement.isPinned;
    await announcement.save();

    res.json({ 
      message: announcement.isPinned ? 'Announcement pinned' : 'Announcement unpinned',
      announcement 
    });
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ message: 'Failed to toggle pin' });
  }
});

// Toggle active status (admin only)
router.patch('/:id/toggle', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    
    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    announcement.isActive = !announcement.isActive;
    await announcement.save();

    res.json({ 
      message: announcement.isActive ? 'Announcement activated' : 'Announcement deactivated',
      announcement 
    });
  } catch (error) {
    console.error('Error toggling status:', error);
    res.status(500).json({ message: 'Failed to toggle status' });
  }
});

// Delete announcement (admin only)
router.delete('/:id', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ message: 'Failed to delete announcement' });
  }
});

module.exports = router;
