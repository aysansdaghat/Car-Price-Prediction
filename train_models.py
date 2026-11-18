# -*- coding: utf-8 -*-
"""آموزش مدل‌ها و ذخیره مدل‌های قابل استفاده توسط داشبورد."""
from pathlib import Path
import json
import joblib
import pandas as pd
import main as project

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(exist_ok=True)

def train_and_save():
    df = project.load_and_clean_data()
    project.analyze_data(df)
    price_models, price_results = project.train_price_models(df)
    class_models, class_results = project.train_classification_models(df)

    best_price_name = str(price_results.iloc[0]["Model"])
    best_class_name = str(class_results.iloc[0]["Model"])
    joblib.dump(price_models[best_price_name], MODEL_DIR / "price_model.joblib")
    joblib.dump(class_models[best_class_name], MODEL_DIR / "class_model.joblib")

    metrics = {
        "best_price_model": best_price_name,
        "best_class_model": best_class_name,
        "regression": [
            {"model": str(r["Model"]), "rmse": float(r["RMSE"]),
             "mae": float(r["MAE"]), "r2": float(r["R2"])}
            for _, r in price_results.iterrows()
        ],
        "classification": [
            {"model": str(r["Model"]), "accuracy": float(r["Accuracy"]),
             "f1": float(r["F1_weighted"])}
            for _, r in class_results.iterrows()
        ],
        "rows": int(len(df)),
        "brands": int(df["Brand"].nunique()),
        "models": int(df["Model"].nunique()),
        "category_counts": {
            str(k): int(v) for k, v in
            df["Price"].apply(project.price_to_class).value_counts().to_dict().items()
        },
        "brand_average": [
            {"brand": str(k), "price": float(v)}
            for k, v in (df.groupby("Brand")["Price"].mean().sort_values(ascending=False).items())
        ],
        "disclaimer": "داده‌های این پروژه مصنوعی و آموزشی هستند؛ قیمت‌ها قیمت قطعی بازار نیستند."
    }
    (MODEL_DIR / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # Metadata used to populate the dashboard's dropdowns.
    options = {
        "brands": sorted(df["Brand"].dropna().astype(str).unique().tolist()),
        "models_by_brand": {
            str(brand): sorted(group["Model"].dropna().astype(str).unique().tolist())
            for brand, group in df.groupby("Brand")
        },
        "gearboxes": sorted(df["Gearbox"].dropna().astype(str).unique().tolist()),
        "fuel_types": sorted(df["Fuel_Type"].dropna().astype(str).unique().tolist()),
        "conditions": sorted(df["Body_Condition"].dropna().astype(str).unique().tolist())
    }
    (MODEL_DIR / "options.json").write_text(
        json.dumps(options, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("\nمدل‌ها و اطلاعات داشبورد ذخیره شدند.")
    return metrics

if __name__ == "__main__":
    train_and_save()
