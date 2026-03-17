const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  addRecord,
  getRecords,
  getRecord,
  updateRecord,
  deleteRecord,
  getDashboardStats,
  getWeeklyReport
} = require('../controllers/healthController');

// All routes require authentication
router.use(auth);

router.get('/dashboard', getDashboardStats);
router.get('/weekly-report', getWeeklyReport);
router.get('/', getRecords);
router.get('/:id', getRecord);
router.post('/', addRecord);
router.put('/:id', updateRecord);
router.delete('/:id', deleteRecord);

module.exports = router;
