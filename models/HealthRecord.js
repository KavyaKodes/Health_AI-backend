const mongoose = require('mongoose');

const HealthRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      default: Date.now
    },
    steps: {
      type: Number,
      default: 0,
      min: [0, 'Steps cannot be negative'],
      max: [100000, 'Steps value seems too high']
    },
    waterIntake: {
      type: Number, // in glasses (250ml each)
      default: 0,
      min: [0, 'Water intake cannot be negative'],
      max: [30, 'Water intake seems too high']
    },
    sleepHours: {
      type: Number,
      default: 0,
      min: [0, 'Sleep hours cannot be negative'],
      max: [24, 'Sleep hours cannot exceed 24']
    },
    calories: {
      type: Number,
      default: 0,
      min: [0, 'Calories cannot be negative'],
      max: [10000, 'Calories seem too high']
    },
    heartRate: {
      type: Number, // bpm
      default: 0,
      min: [0, 'Heart rate cannot be negative'],
      max: [300, 'Heart rate seems too high']
    },
    weight: {
      type: Number, // in kg
      default: 0,
      min: [0, 'Weight cannot be negative'],
      max: [500, 'Weight seems too high']
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      default: ''
    },
    // AI-computed fields
    healthScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    riskLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium'
    },
    suggestions: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

// Index for fast user+date queries
HealthRecordSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('HealthRecord', HealthRecordSchema);
