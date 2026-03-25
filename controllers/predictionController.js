const axios = require('axios');

const MODEL_URLS = {
  nutrition:    'https://health-ai-model1.onrender.com/predict',
  fitness:      'https://health-ai-model2.onrender.com/predict',
  mentalHealth: 'https://health-ai-model3.onrender.com/predict',
  productivity: 'https://health-ai-model4.onrender.com/predict',
  sleep:        'https://health-ai-model5-1.onrender.com/predict',
};

const proxyPredict = (modelKey) => async (req, res, next) => {
  try {
    const response = await axios.post(MODEL_URLS[modelKey], req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000, // 60s — Render free tier cold starts can take 50s+
    });
    res.json({ success: true, result: response.data });
  } catch (error) {
    if (error.response) {
      return res.status(error.response.status).json({
        message: error.response.data?.detail || 'AI model returned an error',
      });
    }
    next(error);
  }
};

module.exports = {
  predictNutrition:    proxyPredict('nutrition'),
  predictFitness:      proxyPredict('fitness'),
  predictMentalHealth: proxyPredict('mentalHealth'),
  predictProductivity: proxyPredict('productivity'),
  predictSleep:        proxyPredict('sleep'),
};
