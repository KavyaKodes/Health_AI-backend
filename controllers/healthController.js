const HealthRecord = require('../models/HealthRecord');
const { predictHealth } = require('../utils/healthPredictor');

// @desc    Add a health record
// @route   POST /api/health
// @access  Private
const addRecord = async (req, res, next) => {
  try {
    const { date, steps, waterIntake, sleepHours, calories, heartRate, weight, notes } = req.body;

    // Run AI prediction on submitted data
    const prediction = predictHealth({ steps, waterIntake, sleepHours, calories, heartRate, weight });

    const record = await HealthRecord.create({
      userId: req.user.id,
      date: date || new Date(),
      steps,
      waterIntake,
      sleepHours,
      calories,
      heartRate,
      weight,
      notes,
      healthScore: prediction.healthScore,
      riskLevel: prediction.riskLevel,
      suggestions: prediction.suggestions
    });

    res.status(201).json({
      success: true,
      record,
      prediction
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all health records for current user
// @route   GET /api/health
// @access  Private
const getRecords = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, startDate, endDate } = req.query;

    const filter = { userId: req.user.id };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await HealthRecord.countDocuments(filter);
    const records = await HealthRecord.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      records,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single health record
// @route   GET /api/health/:id
// @access  Private
const getRecord = async (req, res, next) => {
  try {
    const record = await HealthRecord.findOne({ _id: req.params.id, userId: req.user.id });
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }
    res.json({ success: true, record });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a health record
// @route   PUT /api/health/:id
// @access  Private
const updateRecord = async (req, res, next) => {
  try {
    const { steps, waterIntake, sleepHours, calories, heartRate, weight, notes, date } = req.body;

    const existingRecord = await HealthRecord.findOne({ _id: req.params.id, userId: req.user.id });
    if (!existingRecord) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // Re-run AI prediction with updated data
    const updatedData = {
      steps: steps ?? existingRecord.steps,
      waterIntake: waterIntake ?? existingRecord.waterIntake,
      sleepHours: sleepHours ?? existingRecord.sleepHours,
      calories: calories ?? existingRecord.calories,
      heartRate: heartRate ?? existingRecord.heartRate,
      weight: weight ?? existingRecord.weight
    };
    const prediction = predictHealth(updatedData);

    const record = await HealthRecord.findByIdAndUpdate(
      req.params.id,
      {
        ...updatedData,
        notes,
        date: date || existingRecord.date,
        healthScore: prediction.healthScore,
        riskLevel: prediction.riskLevel,
        suggestions: prediction.suggestions
      },
      { new: true, runValidators: true }
    );

    res.json({ success: true, record, prediction });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a health record
// @route   DELETE /api/health/:id
// @access  Private
const deleteRecord = async (req, res, next) => {
  try {
    const record = await HealthRecord.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard stats (today + weekly aggregates)
// @route   GET /api/health/dashboard
// @access  Private
const getDashboardStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // 7 days ago
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    // Today's record
    const todayRecord = await HealthRecord.findOne({
      userId,
      date: { $gte: today, $lte: todayEnd }
    }).sort({ createdAt: -1 });

    // Weekly aggregates
    const weeklyData = await HealthRecord.aggregate([
      {
        $match: {
          userId: require('mongoose').Types.ObjectId.createFromHexString(userId.toString()),
          date: { $gte: weekAgo }
        }
      },
      {
        $group: {
          _id: null,
          totalSteps: { $sum: '$steps' },
          avgSleep: { $avg: '$sleepHours' },
          totalCalories: { $sum: '$calories' },
          avgWater: { $avg: '$waterIntake' },
          avgHeartRate: { $avg: '$heartRate' },
          avgHealthScore: { $avg: '$healthScore' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Daily data for chart (last 7 days)
    const dailyData = await HealthRecord.find({
      userId,
      date: { $gte: weekAgo }
    })
      .sort({ date: 1 })
      .select('date steps sleepHours calories waterIntake heartRate weight healthScore riskLevel');

    // Latest record for AI predictions
    const latestRecord = await HealthRecord.findOne({ userId }).sort({ date: -1 });

    res.json({
      success: true,
      today: todayRecord,
      weekly: weeklyData[0] || {
        totalSteps: 0,
        avgSleep: 0,
        totalCalories: 0,
        avgWater: 0,
        avgHeartRate: 0,
        avgHealthScore: 0,
        count: 0
      },
      dailyData,
      latestPrediction: latestRecord
        ? {
            healthScore: latestRecord.healthScore,
            riskLevel: latestRecord.riskLevel,
            suggestions: latestRecord.suggestions
          }
        : null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get weekly detailed report
// @route   GET /api/health/weekly-report
// @access  Private
const getWeeklyReport = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const records = await HealthRecord.find({
      userId,
      date: { $gte: weekAgo }
    }).sort({ date: 1 });

    const report = {
      period: { from: weekAgo, to: new Date() },
      totalRecords: records.length,
      averages: {
        steps: Math.round(records.reduce((s, r) => s + r.steps, 0) / (records.length || 1)),
        sleepHours: Math.round((records.reduce((s, r) => s + r.sleepHours, 0) / (records.length || 1)) * 10) / 10,
        waterIntake: Math.round((records.reduce((s, r) => s + r.waterIntake, 0) / (records.length || 1)) * 10) / 10,
        calories: Math.round(records.reduce((s, r) => s + r.calories, 0) / (records.length || 1)),
        heartRate: Math.round(records.reduce((s, r) => s + r.heartRate, 0) / (records.length || 1)),
        healthScore: Math.round(records.reduce((s, r) => s + r.healthScore, 0) / (records.length || 1))
      },
      totals: {
        steps: records.reduce((s, r) => s + r.steps, 0),
        calories: records.reduce((s, r) => s + r.calories, 0)
      },
      riskDistribution: {
        Low: records.filter((r) => r.riskLevel === 'Low').length,
        Medium: records.filter((r) => r.riskLevel === 'Medium').length,
        High: records.filter((r) => r.riskLevel === 'High').length
      },
      records
    };

    res.json({ success: true, report });
  } catch (error) {
    next(error);
  }
};

module.exports = { addRecord, getRecords, getRecord, updateRecord, deleteRecord, getDashboardStats, getWeeklyReport };
