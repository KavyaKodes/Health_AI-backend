const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const https = require('https');
const http = require('http');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Helper to call Python ML service
const callMLService = (data) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const url = new URL(`${ML_SERVICE_URL}/ai/analyze`);
    const lib = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON from ML service'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ML service timeout')); });
    req.write(body);
    req.end();
  });
};

// @desc    Run full AI analysis on health data
// @route   POST /api/ai/analyze
// @access  Private
router.post('/analyze', auth, async (req, res, next) => {
  try {
    const {
      age, gender, weight_kg, height_cm,
      sleep_hours, sleep_quality,
      steps, workout_duration_mins, physical_activity_level,
      heart_rate, stress_level, blood_pressure_sys, blood_pressure_dia,
      calories, calories_burned, protein_g, carbs_g, fat_g, fiber_g, water_liters,
      screen_time_hours, diet_quality, mood_level,
      depression_score, anxiety_score, social_support_score,
      occupation, bmi_category, meal_type
    } = req.body;

    // Build payload for ML service
    const mlPayload = {
      age: age || req.user.age || 25,
      gender: gender || req.user.gender || 'Male',
      weight_kg: weight_kg || 70,
      height_cm: height_cm || req.user.height || 170,
      sleep_hours: sleep_hours || 7,
      sleep_quality: sleep_quality || 7,
      steps: steps || 0,
      workout_duration_mins: workout_duration_mins || 0,
      physical_activity_level: physical_activity_level || 3,
      heart_rate: heart_rate || 72,
      stress_level: stress_level || 5,
      blood_pressure_sys: blood_pressure_sys || 120,
      blood_pressure_dia: blood_pressure_dia || 80,
      calories: calories || 2000,
      calories_burned: calories_burned || 400,
      protein_g: protein_g || 70,
      carbs_g: carbs_g || 250,
      fat_g: fat_g || 65,
      fiber_g: fiber_g || 25,
      water_liters: water_liters || 2,
      screen_time_hours: screen_time_hours || 4,
      diet_quality: diet_quality || 7,
      mood_level: mood_level || 7,
      depression_score: depression_score || 10,
      anxiety_score: anxiety_score || 10,
      social_support_score: social_support_score || 70,
      occupation: occupation || 'Other',
      bmi_category: bmi_category || 'Normal',
      meal_type: meal_type || 'Lunch'
    };

    let mlResult;
    try {
      mlResult = await callMLService(mlPayload);
    } catch (mlErr) {
      // ML service not running — return error with helpful message
      return res.status(503).json({
        success: false,
        message: 'ML service is offline. Start it with: cd backend/ml_service && python ml_server.py',
        error: mlErr.message
      });
    }

    res.json({
      success: true,
      ...mlResult
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Check ML service health
// @route   GET /api/ai/status
// @access  Private
router.get('/status', auth, async (req, res) => {
  try {
    const result = await callMLService({ /* empty health-check style */ });
    res.json({ online: true, models: result?.models_used || {} });
  } catch {
    res.json({ online: false, models: {} });
  }
});

module.exports = router;
