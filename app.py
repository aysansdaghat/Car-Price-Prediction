
# -*- coding: utf-8 -*-
"""Flask API + car price prediction dashboard."""

from pathlib import Path
import json
import os

import joblib
import pandas as pd

from flask import Flask, jsonify, render_template, request
import main as project
from train_models import train_and_save


# ==========================================
# SAFE CONVERSION
# ==========================================

def safe_int(value, default=0):
    try:
        if pd.isna(value):
            return default
        return int(float(value))
    except (ValueError, TypeError, OverflowError):
        return default


def safe_float(value, default=0.0):
    try:
        if pd.isna(value):
            return default
        return float(value)
    except (ValueError, TypeError, OverflowError):
        return default


# ==========================================
# PATHS AND CONFIGURATION
# ==========================================

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

FEATURE_COLS = [
    "Brand",
    "Model",
    "Year",
    "Mileage",
    "Engine_Size",
    "Gearbox",
    "Fuel_Type",
    "Body_Condition"
]

NUMERIC_COLS = [
    "Year",
    "Mileage",
    "Engine_Size",
    "Price"
]


# ==========================================
# LOAD TRAINED MODELS
# ==========================================

def load_assets():

    required = [
        MODEL_DIR / "price_model.joblib",
        MODEL_DIR / "class_model.joblib",
        MODEL_DIR / "metrics.json",
        MODEL_DIR / "options.json"
    ]

    if not all(path.exists() for path in required):
        train_and_save()

    price_model = joblib.load(required[0])
    class_model = joblib.load(required[1])

    metrics = json.loads(
        required[2].read_text(encoding="utf-8")
    )

    options = json.loads(
        required[3].read_text(encoding="utf-8")
    )

    return price_model, class_model, metrics, options


price_model, class_model, metrics, options = load_assets()


# ==========================================
# LOAD DATASET
# ==========================================

dataset = pd.read_csv(
    BASE_DIR / "cars_dataset.csv"
)

# تبدیل ستون‌های عددی به نوع عددی
# مقادیر نامعتبر به NaN تبدیل می‌شوند تا API متوقف نشود.

for column in NUMERIC_COLS:
    dataset[column] = pd.to_numeric(
        dataset[column],
        errors="coerce"
    )

# حذف فاصله‌های اضافی از ستون‌های متنی

for column in [
    "Brand",
    "Model",
    "Gearbox",
    "Fuel_Type",
    "Body_Condition"
]:
    dataset[column] = dataset[column].apply(
        lambda value: value.strip()
        if isinstance(value, str)
        else value
    )

# فقط خودروهایی که تمام مشخصات لازم و قیمت معتبر دارند
# برای مقایسه قابل انتخاب هستند.

valid_dataset = dataset.dropna(
    subset=FEATURE_COLS + ["Price"]
).copy()


# ==========================================
# DASHBOARD ANALYTICS
# ==========================================

# میانگین قیمت بر اساس سال تولید

year_data = (
    dataset.dropna(subset=["Year", "Price"])
    .groupby("Year")["Price"]
    .mean()
    .sort_index()
)

metrics["year_average"] = [
    {
        "year": safe_int(year),
        "price": safe_float(price)
    }
    for year, price in year_data.items()
]


# تحلیل قیمت بر اساس میزان کارکرد

mileage_bins = [
    0,
    50000,
    100000,
    150000,
    200000,
    float("inf")
]

mileage_labels = [
    "۰ تا ۵۰ هزار",
    "۵۰ تا ۱۰۰ هزار",
    "۱۰۰ تا ۱۵۰ هزار",
    "۱۵۰ تا ۲۰۰ هزار",
    "بیش از ۲۰۰ هزار"
]

mileage_groups = pd.cut(
    dataset["Mileage"],
    bins=mileage_bins,
    labels=mileage_labels,
    include_lowest=True
)

mileage_stats = (
    dataset.assign(_mileage_group=mileage_groups)
    .dropna(subset=["_mileage_group", "Price"])
    .groupby("_mileage_group", observed=False)
    .agg(
        count=("Price", "size"),
        price=("Price", "mean")
    )
)

metrics["mileage_average"] = [
    {
        "range": str(label),
        "count": safe_int(row["count"]),
        "price": safe_float(row["price"])
    }
    for label, row in mileage_stats.iterrows()
]


# ==========================================
# HOME PAGE
# ==========================================

@app.get("/")
def index():
    return render_template("index.html")


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "سامانه آماده است"
    })


# ==========================================
# DASHBOARD API
# ==========================================

@app.get("/api/dashboard")
def dashboard():

    return jsonify({
        "metrics": metrics,
        "options": options,
        "price_borders": [
            1_000_000_000,
            3_000_000_000
        ]
    })


# ==========================================
# VEHICLES API
# ==========================================

@app.get("/api/vehicles")
def vehicles():
    """
    دریافت، جست‌وجو و فیلتر خودروها
    برای بخش مقایسه و فیلتر هوشمند.
    """

    frame = valid_dataset.copy()

    brand = request.args.get(
        "brand", ""
    ).strip()

    year_from = request.args.get(
        "year_from", type=int
    )

    year_to = request.args.get(
        "year_to", type=int
    )

    price_min = request.args.get(
        "price_min", type=float
    )

    price_max = request.args.get(
        "price_max", type=float
    )

    mileage_max = request.args.get(
        "mileage_max", type=float
    )

    query = request.args.get(
        "q", ""
    ).strip().lower()

    # فیلتر برند

    if brand:
        frame = frame[
            frame["Brand"].astype(str) == brand
        ]

    # فیلتر سال تولید

    if year_from is not None:
        frame = frame[
            frame["Year"] >= year_from
        ]

    if year_to is not None:
        frame = frame[
            frame["Year"] <= year_to
        ]

    # فیلتر قیمت

    if price_min is not None:
        frame = frame[
            frame["Price"] >= price_min
        ]

    if price_max is not None:
        frame = frame[
            frame["Price"] <= price_max
        ]

    # فیلتر کارکرد

    if mileage_max is not None:
        frame = frame[
            frame["Mileage"] <= mileage_max
        ]

    # جست‌وجوی برند یا مدل

    if query:

        mask = (
            frame["Brand"]
            .astype(str)
            .str.lower()
            .str.contains(query, na=False)
            |
            frame["Model"]
            .astype(str)
            .str.lower()
            .str.contains(query, na=False)
        )

        frame = frame[mask]

    # آماده‌سازی اطلاعات خودروها

    rows = []

    for idx, row in frame.head(150).iterrows():

        rows.append({
            "id": safe_int(idx),

            "brand": str(row["Brand"]),
            "model": str(row["Model"]),

            "year": safe_int(row["Year"]),
            "mileage": safe_int(row["Mileage"]),

            "engine_size": safe_float(
                row["Engine_Size"]
            ),

            "gearbox": str(row["Gearbox"]),
            "fuel_type": str(row["Fuel_Type"]),

            "body_condition": str(
                row["Body_Condition"]
            ),

            "price": safe_int(row["Price"])
        })

    return jsonify({
        "total": int(len(frame)),
        "vehicles": rows,

        "brands": sorted(
            dataset["Brand"]
            .dropna()
            .astype(str)
            .unique()
            .tolist()
        )
    })


# ==========================================
# COMPARE TWO VEHICLES
# ==========================================

@app.post("/api/compare")
def compare_vehicles():

    payload = request.get_json(
        silent=True
    ) or {}

    try:

        ids = [
            int(payload.get("first_id")),
            int(payload.get("second_id"))
        ]

        if ids[0] == ids[1]:

            return jsonify({
                "error": "برای مقایسه، دو خودروی متفاوت انتخاب کنید."
            }), 400

        results = []

        for idx in ids:

            if idx not in valid_dataset.index:

                return jsonify({
                    "error": "یکی از خودروهای انتخاب‌شده پیدا نشد یا اطلاعات کاملی ندارد."
                }), 404

            row = valid_dataset.loc[idx]

            features = pd.DataFrame(
                [
                    {
                        key: row[key]
                        for key in FEATURE_COLS
                    }
                ],
                columns=FEATURE_COLS
            )

            predicted = float(
                price_model.predict(features)[0]
            )

            predicted = max(0, predicted)

            predicted = int(
                round(predicted / 1_000_000)
                * 1_000_000
            )

            category = str(
                class_model.predict(features)[0]
            )

            results.append({

                "brand": str(row["Brand"]),
                "model": str(row["Model"]),

                "year": safe_int(row["Year"]),
                "mileage": safe_int(row["Mileage"]),

                "actual_price": safe_int(row["Price"]),

                "predicted_price": predicted,

                "category": category
            })

        difference = abs(
            results[0]["predicted_price"]
            - results[1]["predicted_price"]
        )

        higher = (
            0
            if results[0]["predicted_price"]
            >= results[1]["predicted_price"]
            else 1
        )

        return jsonify({

            "vehicles": results,

            "difference": difference,

            "higher": higher

        })

    except (TypeError, ValueError):

        return jsonify({
            "error": "لطفاً دو خودرو را برای مقایسه انتخاب کنید."
        }), 400

    except Exception:

        app.logger.exception(
            "Vehicle comparison failed"
        )

        return jsonify({
            "error": "مقایسه خودروها با خطا مواجه شد."
        }), 500


# ==========================================
# PRICE PREDICTION
# ==========================================

@app.post("/api/predict")
def predict():

    payload = request.get_json(
        silent=True
    ) or {}

    required = [
        "Brand",
        "Model",
        "Year",
        "Mileage",
        "Engine_Size",
        "Gearbox",
        "Fuel_Type",
        "Body_Condition"
    ]

    missing = [
        key
        for key in required
        if key not in payload
        or payload[key] in ("", None)
    ]

    if missing:

        return jsonify({
            "error": "همه مشخصات خودرو را کامل وارد کنید.",
            "fields": missing
        }), 400

    try:

        row = {

            "Brand": str(payload["Brand"]),
            "Model": str(payload["Model"]),

            "Year": int(payload["Year"]),

            "Mileage": float(payload["Mileage"]),

            "Engine_Size": float(
                payload["Engine_Size"]
            ),

            "Gearbox": str(payload["Gearbox"]),
            "Fuel_Type": str(payload["Fuel_Type"]),

            "Body_Condition": str(
                payload["Body_Condition"]
            )
        }

        if not 1390 <= row["Year"] <= 1405:

            raise ValueError(
                "سال تولید باید بین ۱۳۹۰ تا ۱۴۰۵ باشد."
            )

        if (
            row["Mileage"] < 0
            or row["Mileage"] > 2_000_000
        ):

            raise ValueError(
                "کارکرد باید عددی بین صفر تا ۲٬۰۰۰٬۰۰۰ کیلومتر باشد."
            )

        if (
            not 0.5 <= row["Engine_Size"] <= 8
        ):

            raise ValueError(
                "حجم موتور باید بین ۰٫۵ تا ۸ لیتر باشد."
            )

        frame = pd.DataFrame(
            [row],
            columns=FEATURE_COLS
        )

        price = max(
            0,
            float(price_model.predict(frame)[0])
        )

        category = str(
            class_model.predict(frame)[0]
        )

        return jsonify({

            "predicted_price": int(
                round(price / 1_000_000)
                * 1_000_000
            ),

            "category": category,

            "model_price": metrics["best_price_model"],

            "model_class": metrics["best_class_model"],

            "currency": "تومان",

            "note": metrics["disclaimer"]

        })

    except (ValueError, TypeError) as exc:

        return jsonify({
            "error": str(exc)
        }), 400

    except Exception:

        app.logger.exception(
            "Prediction failed"
        )

        return jsonify({
            "error": "در پیش‌بینی خطایی رخ داد. ورودی‌ها را بررسی کنید."
        }), 500


# ==========================================
# RUN SERVER
# ==========================================

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
