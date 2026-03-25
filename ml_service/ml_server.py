"""
AI Health ML Server — FastAPI
Loads all 5 pkl models and exposes a unified /ai/analyze endpoint.
Run: python ml_server.py
Listens on: http://localhost:8000
"""

import os
import warnings
import numpy as np
import joblib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

warnings.filterwarnings("ignore")

app = FastAPI(title="HealthAI ML Server", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Base paths ──────────────────────────────────────────────────────────────
ML_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATHS = {
    "sleep":        os.path.join(ML_DIR, "Sleep_health.pkl"),
    "fitness":      os.path.join(ML_DIR, "fitness_tracker.pkl"),
    "mental":       os.path.join(ML_DIR, "mental_health.pkl"),
    "productivity": os.path.join(ML_DIR, "mental_productivity.pkl"),
    "nutrition":    os.path.join(ML_DIR, "daily_food_nutrition.pkl"),
}

models = {}
for name, path in MODEL_PATHS.items():
    try:
        models[name] = joblib.load(path)
        print(f"✅ Loaded model: {name}")
    except Exception as e:
        models[name] = None
        print(f"⚠️  Could not load model '{name}': {e}")


# ── Request Schema ──────────────────────────────────────────────────────────
class HealthInput(BaseModel):
    # Personal
    age: float = 25
    gender: str = "Male"          # Male / Female
    weight_kg: float = 70
    height_cm: float = 170

    # Sleep
    sleep_hours: float = 7.0
    sleep_quality: float = 7.0    # 1–10

    # Activity
    steps: int = 8000
    workout_duration_mins: float = 30
    physical_activity_level: float = 3  # 1–5

    # Vitals
    heart_rate: float = 72
    stress_level: float = 5      # 1–10
    blood_pressure_sys: float = 120
    blood_pressure_dia: float = 80

    # Nutrition
    calories: float = 2000
    calories_burned: float = 400
    protein_g: float = 70
    carbs_g: float = 250
    fat_g: float = 65
    fiber_g: float = 25
    water_liters: float = 2.0

    # Mental / Lifestyle
    screen_time_hours: float = 4.0
    diet_quality: float = 7.0     # 1–10
    mood_level: float = 7.0       # 1–10
    depression_score: float = 10
    anxiety_score: float = 10
    social_support_score: float = 70

    # Occupation / lifestyle context
    occupation: str = "Other"     # Software Engineer | Doctor | Teacher | Other
    bmi_category: str = "Normal"  # Normal | Overweight | Obese | Underweight

    # Optional meal info
    meal_type: str = "Lunch"      # Breakfast | Lunch | Dinner | Snack


# ── Helpers ─────────────────────────────────────────────────────────────────
def _gender_enc(g: str) -> int:
    return 0 if g.lower() == "female" else 1

def _occ_enc(o: str) -> int:
    mapping = {"Software Engineer": 0, "Doctor": 1, "Teacher": 2,
               "Nurse": 3, "Accountant": 4, "Lawyer": 5, "Other": 6}
    return mapping.get(o, 6)

def _bmi_enc(b: str) -> int:
    mapping = {"Underweight": 0, "Normal": 1, "Overweight": 2, "Obese": 3}
    return mapping.get(b, 1)

def _meal_enc(m: str) -> int:
    mapping = {"Breakfast": 0, "Lunch": 1, "Dinner": 2, "Snack": 3}
    return mapping.get(m, 1)

def safe_predict(model, X):
    """Try to predict; return None on any error."""
    if model is None:
        return None
    try:
        return model.predict(np.array(X).reshape(1, -1))
    except Exception as e:
        print(f"Predict error: {e}")
        return None

def safe_predict_proba(model, X):
    if model is None:
        return None
    try:
        if hasattr(model, 'predict_proba'):
            return model.predict_proba(np.array(X).reshape(1, -1))
    except Exception:
        pass
    return None


# ── Fallback scoring (used when model fails) ─────────────────────────────────
def fallback_sleep_score(d: HealthInput):
    score = 0
    if 7 <= d.sleep_hours <= 9: score += 40
    elif 6 <= d.sleep_hours < 7: score += 25
    else: score += 10
    if d.stress_level <= 4: score += 30
    elif d.stress_level <= 7: score += 15
    if d.steps >= 8000: score += 30
    return score  # 0–100

def fallback_mental_risk(d: HealthInput):
    score = d.stress_level * 10 + d.depression_score + d.anxiety_score
    if score < 40: return "Low"
    if score < 80: return "Medium"
    return "High"

def fallback_productivity(d: HealthInput):
    s = (d.sleep_hours / 9) * 3
    s += (1 - d.stress_level / 10) * 3
    s += (d.diet_quality / 10) * 2
    s += (d.mood_level / 10) * 2
    return min(round(s, 1), 10.0)

def fallback_mood(d: HealthInput):
    score = (d.steps / 10000) * 30 + (d.sleep_hours / 9) * 30 + (1 - d.stress_level / 10) * 40
    if score >= 70: return "Happy"
    if score >= 40: return "Neutral"
    return "Tired"

def fallback_nutrition(d: HealthInput):
    if d.protein_g >= 50 and d.fiber_g >= 20: return "High Nutrition"
    if d.calories > 2500: return "High Calorie"
    return "Balanced"


# ── Model-specific feature builders ─────────────────────────────────────────
def build_sleep_features(d: HealthInput):
    # Dataset: Gender, Age, Occupation, Sleep Duration, Quality of Sleep,
    # Physical Activity Level, Stress Level, BMI Category, Heart Rate, Daily Steps
    bp_encoded = d.blood_pressure_sys / 200.0  # normalize
    return [
        _gender_enc(d.gender),
        d.age,
        _occ_enc(d.occupation),
        d.sleep_hours,
        d.sleep_quality,
        d.physical_activity_level,
        d.stress_level,
        _bmi_enc(d.bmi_category),
        bp_encoded,
        d.heart_rate,
        d.steps,
    ]

def build_fitness_features(d: HealthInput):
    # Dataset: age, gender, height_cm, weight_kg, steps, calories_burned,
    # sleep_hours, heart_rate_avg, workout_type, workout_duration_minutes,
    # water_intake_liters, stress_level
    return [
        d.age,
        _gender_enc(d.gender),
        d.height_cm,
        d.weight_kg,
        d.steps,
        d.calories_burned,
        d.sleep_hours,
        d.heart_rate,
        d.workout_duration_mins,   # workout_type encoded as mins
        d.workout_duration_mins,
        d.water_liters,
        d.stress_level,
    ]

def build_mental_features(d: HealthInput):
    # Dataset: age, gender, employment_status, work_environment,
    # mental_health_history, seeks_treatment, stress_level, sleep_hours,
    # physical_activity_days, depression_score, anxiety_score,
    # social_support_score, productivity_score
    prod = fallback_productivity(d)
    return [
        d.age,
        _gender_enc(d.gender),
        1,  # Employed
        1,  # Office
        0,  # No history
        0,  # Doesn't seek treatment
        d.stress_level,
        d.sleep_hours,
        min(int(d.workout_duration_mins / 30), 7),  # activity days 0–7
        d.depression_score,
        d.anxiety_score,
        d.social_support_score,
        prod,
    ]

def build_productivity_features(d: HealthInput):
    # Dataset features with engineering:
    # sleep_hours, daily_exercise_mins, screen_time_hours, diet_quality_1_10,
    # stress_level_1_10, mood_level_1_10 + engineered features
    sl = d.sleep_hours
    ex = d.workout_duration_mins
    sc = d.screen_time_hours
    di = d.diet_quality
    st = d.stress_level
    mo = d.mood_level

    # Interaction features (from inject_improved_model.py)
    sleep_x_diet = sl * di
    stress_x_sleep = st * sl
    mood_x_diet = mo * di
    exercise_x_sleep = ex * sl
    screen_stress = sc * st

    # Polynomial
    sleep_sq = sl ** 2
    stress_sq = st ** 2
    mood_sq = mo ** 2

    # Ratio
    exercise_per_screen = ex / (sc + 1)
    sleep_stress_ratio = sl / (st + 1)
    wellness_score = (sl + di + mo) / 3

    return [
        sl, ex, sc, di, st, mo,
        sleep_x_diet, stress_x_sleep, mood_x_diet,
        exercise_x_sleep, screen_stress,
        sleep_sq, stress_sq, mood_sq,
        exercise_per_screen, sleep_stress_ratio, wellness_score
    ]

def build_nutrition_features(d: HealthInput):
    # Dataset: Calories(kcal), Protein(g), Carbs(g), Fat(g), Fiber(g),
    # Sugars(g), Sodium(mg), Cholesterol(mg), Meal_Type, Water_Intake(ml)
    return [
        d.calories,
        d.protein_g,
        d.carbs_g,
        d.fat_g,
        d.fiber_g,
        max(d.carbs_g * 0.4, 0),   # estimated sugars
        1500,                        # avg sodium
        100,                         # avg cholesterol
        _meal_enc(d.meal_type),
        d.water_liters * 1000,       # convert L → ml
    ]


# ── AI recommendations generator ────────────────────────────────────────────
def generate_recommendations(d: HealthInput, results: dict) -> list:
    recs = []

    if d.sleep_hours < 7:
        recs.append({"icon": "😴", "category": "Sleep", "priority": "high",
                     "message": f"You slept {d.sleep_hours}h. Target 7–9h for optimal recovery. Try a consistent bedtime."})
    elif d.sleep_hours > 9:
        recs.append({"icon": "⚠️", "category": "Sleep", "priority": "medium",
                     "message": "Oversleeping can indicate fatigue or depression. Keep sleep to 7–9h."})

    if d.steps < 5000:
        recs.append({"icon": "🚶", "category": "Fitness", "priority": "high",
                     "message": f"Only {d.steps:,} steps today. Add a 20-min walk to boost mood and cardiovascular health."})
    elif d.steps < 10000:
        recs.append({"icon": "🏃", "category": "Fitness", "priority": "medium",
                     "message": f"{10000 - d.steps:,} more steps to hit your 10,000-step goal. You're almost there!"})

    if d.water_liters < 2.0:
        recs.append({"icon": "💧", "category": "Hydration", "priority": "high",
                     "message": f"Only {d.water_liters}L water. Drink at least 2–2.5L daily to maintain energy and focus."})

    if d.stress_level >= 7:
        recs.append({"icon": "🧘", "category": "Mental Health", "priority": "high",
                     "message": f"Stress level {d.stress_level}/10 is high. Try 10-min meditation or deep breathing today."})

    if d.screen_time_hours > 6:
        recs.append({"icon": "📱", "category": "Productivity", "priority": "medium",
                     "message": f"{d.screen_time_hours}h screen time is high. Take a 20-20-20 break every 20 minutes."})

    if d.calories < 1500:
        recs.append({"icon": "🥗", "category": "Nutrition", "priority": "high",
                     "message": "Calorie intake is low. Eating too little can impair focus and metabolism."})
    elif d.calories > 2800:
        recs.append({"icon": "🍽️", "category": "Nutrition", "priority": "medium",
                     "message": "Calorie intake is high. Consider smaller portions and more nutrient-dense foods."})

    if d.heart_rate > 100:
        recs.append({"icon": "❤️", "category": "Vitals", "priority": "high",
                     "message": f"Resting heart rate {d.heart_rate}bpm is elevated. Reduce caffeine and practise relaxation."})

    if d.workout_duration_mins < 20:
        recs.append({"icon": "💪", "category": "Exercise", "priority": "medium",
                     "message": "Less than 20 mins exercise today. Even a short walk improves insulin sensitivity."})

    if d.diet_quality < 5:
        recs.append({"icon": "🥦", "category": "Nutrition", "priority": "medium",
                     "message": "Diet quality is low. Add more vegetables, lean protein, and reduce ultra-processed foods."})

    # Model-driven recommendations
    mental_risk = results.get("mental_health_risk", "")
    if mental_risk == "High":
        recs.append({"icon": "🧠", "category": "Mental Health", "priority": "high",
                     "message": "AI detected high mental health risk. Consider speaking with a mental health professional."})

    sleep_disorder = results.get("sleep_disorder", "")
    if sleep_disorder in ["Insomnia", "Sleep Apnea"]:
        recs.append({"icon": "🌙", "category": "Sleep", "priority": "high",
                     "message": f"AI predicts possible {sleep_disorder}. Consult a sleep specialist for proper evaluation."})

    prod_score = results.get("productivity_score")
    if prod_score is not None and prod_score < 5:
        recs.append({"icon": "🎯", "category": "Productivity", "priority": "medium",
                     "message": f"Productivity score is {prod_score:.1f}/10. Prioritise sleep and reduce screen time to boost focus."})

    if not recs:
        recs.append({"icon": "⭐", "category": "Great Job", "priority": "low",
                     "message": "All your metrics look excellent today! Keep up the amazing health habits."})

    return recs[:8]  # cap at 8


# ── Main endpoint ────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "ok", "models_loaded": {k: v is not None for k, v in models.items()}}

@app.post("/ai/analyze")
def analyze(data: HealthInput):
    results = {}

    # ── 1. Sleep Health ───────────────────────────────────────────────────
    sleep_labels = ["None", "Insomnia", "Sleep Apnea"]
    sf = build_sleep_features(data)
    sp = safe_predict(models["sleep"], sf)
    if sp is not None:
        pred_val = sp[0]
        if isinstance(pred_val, (int, float, np.integer)):
            results["sleep_disorder"] = sleep_labels[int(pred_val)] if int(pred_val) < len(sleep_labels) else str(pred_val)
        else:
            results["sleep_disorder"] = str(pred_val)
    else:
        # Fallback: score-based
        score = fallback_sleep_score(data)
        results["sleep_disorder"] = "None" if score > 60 else ("Insomnia" if data.sleep_hours < 6 else "None")
    results["sleep_quality_score"] = min(round((data.sleep_hours / 9) * data.sleep_quality * 10, 1), 100)

    # ── 2. Fitness / Mood ─────────────────────────────────────────────────
    mood_labels = ["Happy", "Neutral", "Tired", "Stressed", "Energetic"]
    ff = build_fitness_features(data)
    fp = safe_predict(models["fitness"], ff)
    if fp is not None:
        pred_val = fp[0]
        if isinstance(pred_val, (int, float, np.integer)):
            results["mood"] = mood_labels[int(pred_val) % len(mood_labels)]
        else:
            results["mood"] = str(pred_val)
    else:
        results["mood"] = fallback_mood(data)

    # ── 3. Mental Health Risk ─────────────────────────────────────────────
    risk_labels = ["Low", "Medium", "High"]
    mf = build_mental_features(data)
    mp = safe_predict(models["mental"], mf)
    if mp is not None:
        pred_val = mp[0]
        if isinstance(pred_val, (int, float, np.integer)):
            idx = int(pred_val)
            results["mental_health_risk"] = risk_labels[idx] if idx < len(risk_labels) else str(pred_val)
        else:
            results["mental_health_risk"] = str(pred_val)
    else:
        results["mental_health_risk"] = fallback_mental_risk(data)

    # ── 4. Productivity Score ─────────────────────────────────────────────
    pf = build_productivity_features(data)
    pp = safe_predict(models["productivity"], pf)
    if pp is not None:
        raw = float(pp[0])
        results["productivity_score"] = round(min(max(raw, 1), 10), 2)
    else:
        results["productivity_score"] = fallback_productivity(data)

    # ── 5. Nutrition Quality ──────────────────────────────────────────────
    nutrition_labels = ["Protein/Dairy", "Grain", "Vegetables", "Fruits",
                        "Snacks/Sweets", "Beverages", "Balanced"]
    nf = build_nutrition_features(data)
    np_ = safe_predict(models["nutrition"], nf)
    if np_ is not None:
        pred_val = np_[0]
        if isinstance(pred_val, (int, float, np.integer)):
            idx = int(pred_val)
            results["nutrition_category"] = nutrition_labels[idx] if idx < len(nutrition_labels) else "Balanced"
        else:
            results["nutrition_category"] = str(pred_val)
    else:
        results["nutrition_category"] = fallback_nutrition(data)

    # ── Overall AI Health Score ───────────────────────────────────────────
    sleep_pts  = min(data.sleep_hours / 9, 1) * 25
    steps_pts  = min(data.steps / 10000, 1) * 20
    water_pts  = min(data.water_liters / 2.5, 1) * 15
    stress_pts = (1 - data.stress_level / 10) * 20
    prod_pts   = (results["productivity_score"] / 10) * 10
    diet_pts   = (data.diet_quality / 10) * 10
    overall_score = round(sleep_pts + steps_pts + water_pts + stress_pts + prod_pts + diet_pts, 1)

    risk_level = "Low" if overall_score >= 70 else "Medium" if overall_score >= 45 else "High"

    results["overall_health_score"] = overall_score
    results["risk_level"] = risk_level
    results["recommendations"] = generate_recommendations(data, results)

    return {
        "success": True,
        "models_used": {k: v is not None for k, v in models.items()},
        "analysis": results,
        "input_summary": {
            "sleep_hours": data.sleep_hours,
            "steps": data.steps,
            "stress_level": data.stress_level,
            "water_liters": data.water_liters,
            "calories": data.calories,
            "mood_level": data.mood_level,
        }
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("ml_server:app", host="0.0.0.0", port=port, reload=True)
