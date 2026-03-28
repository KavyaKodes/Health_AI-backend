const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const axios = require('axios');

const MODEL_URLS = {
  nutrition:    'https://health-ai-model1.onrender.com/predict',
  fitness:      'https://health-ai-model2.onrender.com/predict',
  mentalHealth: 'https://health-ai-model3.onrender.com/predict',
  productivity: 'https://health-ai-model4.onrender.com/predict',
  sleep:        'https://health-ai-model5-1.onrender.com/predict',
};

// ── Fallback scoring (used when model fails) ─────────────────────────────────
const fallback_sleep_score = (d) => {
  let score = 0;
  if (d.sleep_hours >= 7 && d.sleep_hours <= 9) score += 40;
  else if (d.sleep_hours >= 6 && d.sleep_hours < 7) score += 25;
  else score += 10;
  if (d.stress_level <= 4) score += 30;
  else if (d.stress_level <= 7) score += 15;
  if (d.steps >= 8000) score += 30;
  return score;
};

const fallback_mental_risk = (d) => {
  const score = d.stress_level * 10 + d.depression_score + d.anxiety_score;
  if (score < 40) return "Low";
  if (score < 80) return "Medium";
  return "High";
};

const fallback_productivity = (d) => {
  let s = (d.sleep_hours / 9) * 3;
  s += (1 - d.stress_level / 10) * 3;
  s += (d.diet_quality / 10) * 2;
  s += (d.mood_level / 10) * 2;
  return Math.min(Math.round(s * 10) / 10, 10.0);
};

const fallback_mood = (d) => {
  const score = (d.steps / 10000) * 30 + (d.sleep_hours / 9) * 30 + (1 - d.stress_level / 10) * 40;
  if (score >= 70) return "Happy";
  if (score >= 40) return "Neutral";
  return "Tired";
};

const fallback_nutrition = (d) => {
  if (d.protein_g >= 50 && d.fiber_g >= 20) return "High Nutrition";
  if (d.calories > 2500) return "High Calorie";
  return "Balanced";
};

const generate_recommendations = (d, results) => {
  const recs = [];

  if (d.sleep_hours < 7) {
      recs.push({icon: "😴", category: "Sleep", priority: "high", message: `You slept ${d.sleep_hours}h. Target 7–9h for optimal recovery. Try a consistent bedtime.`});
  } else if (d.sleep_hours > 9) {
      recs.push({icon: "⚠️", category: "Sleep", priority: "medium", message: "Oversleeping can indicate fatigue or depression. Keep sleep to 7–9h."});
  }
  if (d.steps < 5000) {
      recs.push({icon: "🚶", category: "Fitness", priority: "high", message: `Only ${d.steps} steps today. Add a 20-min walk to boost mood and cardiovascular health.`});
  } else if (d.steps < 10000) {
      recs.push({icon: "🏃", category: "Fitness", priority: "medium", message: `${10000 - d.steps} more steps to hit your 10,000-step goal. You're almost there!`});
  }
  if (d.water_liters < 2.0) {
      recs.push({icon: "💧", category: "Hydration", priority: "high", message: `Only ${d.water_liters}L water. Drink at least 2–2.5L daily to maintain energy and focus.`});
  }
  if (d.stress_level >= 7) {
      recs.push({icon: "🧘", category: "Mental Health", priority: "high", message: `Stress level ${d.stress_level}/10 is high. Try 10-min meditation or deep breathing today.`});
  }
  if (d.screen_time_hours > 6) {
      recs.push({icon: "📱", category: "Productivity", priority: "medium", message: `${d.screen_time_hours}h screen time is high. Take a 20-20-20 break every 20 minutes.`});
  }
  if (d.calories < 1500) {
      recs.push({icon: "🥗", category: "Nutrition", priority: "high", message: "Calorie intake is low. Eating too little can impair focus and metabolism."});
  } else if (d.calories > 2800) {
      recs.push({icon: "🍽️", category: "Nutrition", priority: "medium", message: "Calorie intake is high. Consider smaller portions and more nutrient-dense foods."});
  }
  if (d.heart_rate > 100) {
      recs.push({icon: "❤️", category: "Vitals", priority: "high", message: `Resting heart rate ${d.heart_rate}bpm is elevated. Reduce caffeine and practise relaxation.`});
  }
  if (d.workout_duration_mins < 20) {
      recs.push({icon: "💪", category: "Exercise", priority: "medium", message: "Less than 20 mins exercise today. Even a short walk improves insulin sensitivity."});
  }
  if (d.diet_quality < 5) {
      recs.push({icon: "🥦", category: "Nutrition", priority: "medium", message: "Diet quality is low. Add more vegetables, lean protein, and reduce ultra-processed foods."});
  }

  const mental_risk = results.mental_health_risk || "";
  if (mental_risk === "High") {
      recs.push({icon: "🧠", category: "Mental Health", priority: "high", message: "AI detected high mental health risk. Consider speaking with a mental health professional."});
  }

  const sleep_disorder = results.sleep_disorder || "";
  if (sleep_disorder === "Insomnia" || sleep_disorder === "Sleep Apnea") {
      recs.push({icon: "🌙", category: "Sleep", priority: "high", message: `AI predicts possible ${sleep_disorder}. Consult a sleep specialist for proper evaluation.`});
  }

  const prod_score = results.productivity_score;
  if (prod_score !== undefined && prod_score < 5) {
      recs.push({icon: "🎯", category: "Productivity", priority: "medium", message: `Productivity score is ${prod_score.toFixed(1)}/10. Prioritise sleep and reduce screen time to boost focus.`});
  }

  if (recs.length === 0) {
      recs.push({icon: "⭐", category: "Great Job", priority: "low", message: "All your metrics look excellent today! Keep up the amazing health habits."});
  }

  return recs.slice(0, 8);
};

// @desc    Run full AI analysis on health data
// @route   POST /api/ai/analyze
// @access  Private
router.post('/analyze', auth, async (req, res, next) => {
  try {
    const d = {
      age: req.body.age || req.user?.age || 25,
      gender: req.body.gender || req.user?.gender || 'Male',
      weight_kg: req.body.weight_kg || 70,
      height_cm: req.body.height_cm || req.user?.height || 170,
      sleep_hours: req.body.sleep_hours || 7,
      sleep_quality: req.body.sleep_quality || 7,
      steps: req.body.steps || 0,
      workout_duration_mins: req.body.workout_duration_mins || 0,
      physical_activity_level: req.body.physical_activity_level || 3,
      heart_rate: req.body.heart_rate || 72,
      stress_level: req.body.stress_level || 5,
      blood_pressure_sys: req.body.blood_pressure_sys || 120,
      blood_pressure_dia: req.body.blood_pressure_dia || 80,
      calories: req.body.calories || 2000,
      calories_burned: req.body.calories_burned || 400,
      protein_g: req.body.protein_g || 70,
      carbs_g: req.body.carbs_g || 250,
      fat_g: req.body.fat_g || 65,
      fiber_g: req.body.fiber_g || 25,
      water_liters: req.body.water_liters || 2,
      screen_time_hours: req.body.screen_time_hours || 4,
      diet_quality: req.body.diet_quality || 7,
      mood_level: req.body.mood_level || 7,
      depression_score: req.body.depression_score || 10,
      anxiety_score: req.body.anxiety_score || 10,
      social_support_score: req.body.social_support_score || 70,
      occupation: req.body.occupation || 'Other',
      bmi_category: req.body.bmi_category || 'Normal',
      meal_type: req.body.meal_type || 'Lunch'
    };

    // Calculate fallback productivity before using it in the mental model payload
    const fb_productivity = fallback_productivity(d);

    // Call 5 APIs concurrently
    const makeReq = async (url, payload) => {
      try {
        const result = await axios.post(url, payload, { timeout: 15000 });
        return result.data?.prediction !== undefined ? result.data.prediction : result.data;
      } catch (err) {
        console.error(`Error calling ${url}:`, err.message);
        return null;
      }
    };

    const [nutrRes, fitRes, mentalRes, prodRes, sleepRes] = await Promise.all([
      makeReq(MODEL_URLS.nutrition, {
        protein_g: d.protein_g,
        carbohydrates_g: d.carbs_g,
        fat_g: d.fat_g,
        fiber_g: d.fiber_g,
        sugars_g: Math.max(d.carbs_g * 0.4, 0)
      }),
      makeReq(MODEL_URLS.fitness, {
        height_cm: d.height_cm,
        weight_kg: d.weight_kg,
        steps: d.steps,
        sleep_hours: d.sleep_hours,
        heart_rate_avg: d.heart_rate,
        workout_duration_minutes: d.workout_duration_mins,
        water_intake_liters: d.water_liters,
        stress_level: d.stress_level
      }),
      makeReq(MODEL_URLS.mentalHealth, {
        xage: d.age,
        stress_level: d.stress_level,
        sleep_hours: d.sleep_hours,
        physical_activity_days: Math.min(Math.floor(d.workout_duration_mins / 30), 7),
        depression_score: d.depression_score,
        anxiety_score: d.anxiety_score,
        social_support_score: d.social_support_score,
        productivity_score: fb_productivity
      }),
      makeReq(MODEL_URLS.productivity, {
        sleep_hours: d.sleep_hours,
        daily_exercise_mins: d.workout_duration_mins,
        screen_time_hours: d.screen_time_hours,
        diet_quality_1_10: d.diet_quality,
        stress_level_1_10: d.stress_level,
        mood_level_1_10: d.mood_level
      }),
      makeReq(MODEL_URLS.sleep, {
        Age: d.age,
        Sleep_Duration: d.sleep_hours,
        Quality_of_Sleep: d.sleep_quality,
        Physical_Activity_Level: d.physical_activity_level,
        Stress_Level: d.stress_level,
        Heart_Rate: d.heart_rate,
        Daily_Steps: d.steps
      })
    ]);

    const results = {};
    
    // Nutrition
    results.nutrition_category = typeof nutrRes === 'string' ? nutrRes : fallback_nutrition(d);
    if (!results.nutrition_category || Array.isArray(results.nutrition_category)) {
      results.nutrition_category = fallback_nutrition(d);
    }

    // Fitness (returns mood)
    results.mood = typeof fitRes === 'string' ? fitRes : fallback_mood(d);
    if (!results.mood || Array.isArray(results.mood)) {
        results.mood = fallback_mood(d);
    }

    // Mental
    results.mental_health_risk = typeof mentalRes === 'string' ? mentalRes : fallback_mental_risk(d);
    if (!results.mental_health_risk || Array.isArray(results.mental_health_risk)) {
        results.mental_health_risk = fallback_mental_risk(d);
    }

    // Productivity
    if (prodRes && typeof prodRes === 'number') {
      results.productivity_score = Math.min(Math.max(prodRes, 1), 10);
    } else if (prodRes && typeof prodRes === 'string' && !isNaN(parseFloat(prodRes))) {
      results.productivity_score = Math.min(Math.max(parseFloat(prodRes), 1), 10);
    } else {
      results.productivity_score = fb_productivity;
    }

    // Sleep
    results.sleep_disorder = typeof sleepRes === 'string' ? sleepRes : (fallback_sleep_score(d) > 60 ? 'None' : (d.sleep_hours < 6 ? 'Insomnia' : 'None'));
    if (!results.sleep_disorder || Array.isArray(results.sleep_disorder)) {
        results.sleep_disorder = (fallback_sleep_score(d) > 60 ? 'None' : (d.sleep_hours < 6 ? 'Insomnia' : 'None'));
    }
    
    results.sleep_quality_score = Math.min(Math.round((d.sleep_hours / 9) * d.sleep_quality * 10 * 10) / 10, 100);

    // Overall Score Calculation
    const sleep_pts  = Math.min(d.sleep_hours / 9, 1) * 25;
    const steps_pts  = Math.min(d.steps / 10000, 1) * 20;
    const water_pts  = Math.min(d.water_liters / 2.5, 1) * 15;
    const stress_pts = (1 - d.stress_level / 10) * 20;
    const prod_pts   = (results.productivity_score / 10) * 10;
    const diet_pts   = (d.diet_quality / 10) * 10;
    const overall_score = Math.round((sleep_pts + steps_pts + water_pts + stress_pts + prod_pts + diet_pts) * 10) / 10;

    let risk_level = "High";
    if (overall_score >= 70) risk_level = "Low";
    else if (overall_score >= 45) risk_level = "Medium";

    results.overall_health_score = overall_score;
    results.risk_level = risk_level;
    results.recommendations = generate_recommendations(d, results);

    res.json({
      success: true,
      models_used: {
        nutrition: nutrRes != null,
        fitness: fitRes != null,
        mental: mentalRes != null,
        productivity: prodRes != null,
        sleep: sleepRes != null
      },
      analysis: results,
      input_summary: {
        sleep_hours: d.sleep_hours,
        steps: d.steps,
        stress_level: d.stress_level,
        water_liters: d.water_liters,
        calories: d.calories,
        mood_level: d.mood_level,
      }
    });

  } catch (error) {
    next(error);
  }
});

// @desc    Check ML service health
// @route   GET /api/ai/status
// @access  Private
router.get('/status', auth, async (req, res) => {
  res.json({ online: true, models: MODEL_URLS });
});

module.exports = router;
