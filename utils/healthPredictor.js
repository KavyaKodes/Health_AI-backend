/**
 * AI Health Prediction Engine
 * Pure Node.js ML-style scoring algorithm
 * Analyzes health metrics and returns risk level + personalized suggestions
 */

const WEIGHTS = {
  steps: 25,
  sleep: 25,
  water: 20,
  calories: 15,
  heartRate: 10,
  weight: 5
};

/**
 * Calculate a 0-100 health score from daily metrics
 */
function calculateHealthScore(data) {
  const { steps = 0, sleepHours = 0, waterIntake = 0, calories = 0, heartRate = 0, weight = 0 } = data;
  let score = 0;

  // Steps scoring (target: 10,000 steps)
  const stepsScore = Math.min(steps / 10000, 1) * WEIGHTS.steps;
  score += stepsScore;

  // Sleep scoring (target: 7-9 hours)
  let sleepScore = 0;
  if (sleepHours >= 7 && sleepHours <= 9) sleepScore = WEIGHTS.sleep;
  else if (sleepHours >= 6 && sleepHours < 7) sleepScore = WEIGHTS.sleep * 0.75;
  else if (sleepHours > 9 && sleepHours <= 10) sleepScore = WEIGHTS.sleep * 0.75;
  else if (sleepHours >= 5 && sleepHours < 6) sleepScore = WEIGHTS.sleep * 0.5;
  else if (sleepHours > 0) sleepScore = WEIGHTS.sleep * 0.25;
  score += sleepScore;

  // Water intake scoring (target: 8 glasses)
  const waterScore = Math.min(waterIntake / 8, 1) * WEIGHTS.water;
  score += waterScore;

  // Calories scoring (target: 1800-2200 for average adult)
  let caloriesScore = 0;
  if (calories > 0) {
    if (calories >= 1800 && calories <= 2200) caloriesScore = WEIGHTS.calories;
    else if (calories >= 1600 && calories < 1800) caloriesScore = WEIGHTS.calories * 0.8;
    else if (calories > 2200 && calories <= 2500) caloriesScore = WEIGHTS.calories * 0.8;
    else if (calories >= 1400 && calories < 1600) caloriesScore = WEIGHTS.calories * 0.6;
    else if (calories > 2500 && calories <= 3000) caloriesScore = WEIGHTS.calories * 0.5;
    else caloriesScore = WEIGHTS.calories * 0.3;
  }
  score += caloriesScore;

  // Heart rate scoring (normal resting: 60-100 bpm, athletic: 40-60)
  let heartRateScore = 0;
  if (heartRate > 0) {
    if (heartRate >= 60 && heartRate <= 100) heartRateScore = WEIGHTS.heartRate;
    else if (heartRate >= 40 && heartRate < 60) heartRateScore = WEIGHTS.heartRate * 0.9; // athletic
    else if (heartRate > 100 && heartRate <= 110) heartRateScore = WEIGHTS.heartRate * 0.6;
    else if (heartRate > 110) heartRateScore = WEIGHTS.heartRate * 0.2;
    else heartRateScore = WEIGHTS.heartRate * 0.3;
  } else {
    heartRateScore = WEIGHTS.heartRate * 0.5; // no data - neutral
  }
  score += heartRateScore;

  // Weight scoring (simplified - if data present give partial credit)
  if (weight > 0 && weight < 200) score += WEIGHTS.weight;
  else if (weight > 0) score += WEIGHTS.weight * 0.5;

  return Math.round(Math.min(Math.max(score, 0), 100));
}

/**
 * Determine risk level from health score
 */
function getRiskLevel(score) {
  if (score >= 70) return 'Low';
  if (score >= 40) return 'Medium';
  return 'High';
}

/**
 * Generate personalized health suggestions
 */
function generateSuggestions(data) {
  const { steps = 0, sleepHours = 0, waterIntake = 0, calories = 0, heartRate = 0, weight = 0 } = data;
  const suggestions = [];

  // Steps suggestions
  if (steps < 5000) {
    suggestions.push('🚶 You\'re walking very little. Try to reach at least 5,000 steps daily. Start with short walks after meals.');
  } else if (steps < 10000) {
    suggestions.push(`🏃 Good progress! You're ${10000 - steps} steps away from the daily 10,000 step goal. Try a 20-minute walk.`);
  } else {
    suggestions.push('✅ Excellent! You\'ve hit the 10,000 step goal. Keep up the great work!');
  }

  // Sleep suggestions
  if (sleepHours < 6) {
    suggestions.push('😴 You\'re severely sleep-deprived. Aim for 7-9 hours. Poor sleep increases risk of heart disease and obesity.');
  } else if (sleepHours < 7) {
    suggestions.push('😴 Try to get at least 7 hours of sleep. Create a consistent bedtime routine for better sleep quality.');
  } else if (sleepHours > 9) {
    suggestions.push('⚠️ You\'re sleeping more than 9 hours. Oversleeping can be a sign of underlying health issues. Maintain a regular schedule.');
  } else {
    suggestions.push('✅ Great sleep habits! 7-9 hours of sleep supports immune function and cognitive performance.');
  }

  // Water intake suggestions
  if (waterIntake < 4) {
    suggestions.push('💧 You\'re significantly under-hydrated. Drink at least 8 glasses (2 liters) of water daily. Keep a water bottle with you.');
  } else if (waterIntake < 8) {
    suggestions.push(`💧 You need ${8 - waterIntake} more glasses of water today. Proper hydration boosts energy and metabolism.`);
  } else {
    suggestions.push('✅ Well hydrated! Drinking enough water supports kidney function and energy levels.');
  }

  // Calories suggestions
  if (calories > 0) {
    if (calories < 1400) {
      suggestions.push('⚠️ Your calorie intake is very low. Eating too little can slow metabolism and cause nutrient deficiencies. Consult a nutritionist.');
    } else if (calories < 1800) {
      suggestions.push('🥗 Your calorie intake is slightly low. Ensure you\'re getting enough nutrients with balanced meals.');
    } else if (calories > 2500) {
      suggestions.push('🍽️ Your calorie intake is high. Consider reducing portion sizes and choosing nutrient-dense foods over processed ones.');
    } else {
      suggestions.push('✅ Your calorie intake is within a healthy range. Focus on the quality of calories — lean proteins, veggies, whole grains.');
    }
  }

  // Heart rate suggestions
  if (heartRate > 100) {
    suggestions.push('❤️ Your resting heart rate is elevated. This may indicate stress or dehydration. Practice deep breathing and ensure proper hydration.');
  } else if (heartRate > 0 && heartRate < 50) {
    suggestions.push('❤️ Your heart rate is very low. If you\'re not an athlete, consult your doctor about bradycardia screening.');
  } else if (heartRate > 0) {
    suggestions.push('✅ Your heart rate is in the normal range. Regular cardio exercise helps maintain a healthy heart rate.');
  }

  // Weight suggestions
  if (weight > 100) {
    suggestions.push('⚖️ Consider tracking your BMI and consulting with a healthcare professional for personalized weight management advice.');
  }

  // General wellness tips
  const wellnessTips = [
    '🧘 Try 10 minutes of mindfulness or meditation to reduce stress and improve mental health.',
    '🥦 Include more vegetables and fruits in your diet for essential vitamins and minerals.',
    '☀️ Get at least 15 minutes of sunlight daily for natural Vitamin D synthesis.',
    '🏋️ Incorporate strength training 2-3 times per week to boost metabolism and bone density.',
    '📱 Reduce screen time before bed to improve sleep quality.'
  ];

  // Add 1-2 random wellness tips
  const randomTips = wellnessTips.sort(() => 0.5 - Math.random()).slice(0, 2);
  suggestions.push(...randomTips);

  return suggestions;
}

/**
 * Main prediction function
 */
function predictHealth(data) {
  const healthScore = calculateHealthScore(data);
  const riskLevel = getRiskLevel(healthScore);
  const suggestions = generateSuggestions(data);

  return {
    healthScore,
    riskLevel,
    suggestions,
    breakdown: {
      stepsStatus: data.steps >= 10000 ? 'excellent' : data.steps >= 7000 ? 'good' : data.steps >= 5000 ? 'fair' : 'poor',
      sleepStatus: data.sleepHours >= 7 && data.sleepHours <= 9 ? 'excellent' : data.sleepHours >= 6 ? 'good' : 'poor',
      hydrationStatus: data.waterIntake >= 8 ? 'excellent' : data.waterIntake >= 6 ? 'good' : data.waterIntake >= 4 ? 'fair' : 'poor',
      caloriesStatus: data.calories >= 1800 && data.calories <= 2200 ? 'excellent' : data.calories > 0 ? 'fair' : 'no-data',
      heartRateStatus: data.heartRate >= 60 && data.heartRate <= 100 ? 'normal' : data.heartRate > 100 ? 'elevated' : data.heartRate > 0 ? 'low' : 'no-data'
    }
  };
}

module.exports = { predictHealth, calculateHealthScore, getRiskLevel, generateSuggestions };
