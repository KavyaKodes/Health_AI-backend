const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  predictNutrition,
  predictFitness,
  predictMentalHealth,
  predictProductivity,
  predictSleep,
} = require('../controllers/predictionController');

router.post('/nutrition',     auth, predictNutrition);
router.post('/fitness',       auth, predictFitness);
router.post('/mental-health', auth, predictMentalHealth);
router.post('/productivity',  auth, predictProductivity);
router.post('/sleep',         auth, predictSleep);

module.exports = router;
