const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { predict } = require('../controllers/predictionController');

router.post('/', auth, predict);

module.exports = router;
