const { predictHealth } = require('../utils/healthPredictor');

// @desc    Predict health risk from submitted data
// @route   POST /api/predict
// @access  Private
const predict = async (req, res, next) => {
  try {
    const { steps = 0, waterIntake = 0, sleepHours = 0, calories = 0, heartRate = 0, weight = 0 } = req.body;

    const result = predictHealth({ steps, waterIntake, sleepHours, calories, heartRate, weight });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { predict };
