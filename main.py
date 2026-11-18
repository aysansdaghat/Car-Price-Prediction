# -*- coding: utf-8 -*-
"""
سامانه پیش‌بینی قیمت و دسته‌بندی خودرو
داده‌ها مصنوعی و صرفاً آموزشی هستند.
برای اجرا:
    pip install pandas numpy scikit-learn matplotlib
    python main.py
"""
from pathlib import Path
import sys
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.metrics import (mean_squared_error, mean_absolute_error, r2_score,
                             accuracy_score, f1_score, confusion_matrix,
                             ConfusionMatrixDisplay)

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "cars_dataset.csv"
PRICE_BORDERS = (1_000_000_000, 3_000_000_000)  # تومان

def load_and_clean_data():
    """بارگذاری، بررسی و پاک‌سازی داده‌ها."""
    df = pd.read_csv(DATA_FILE)
    print("\n--- بررسی اولیه داده‌ها ---")
    print("ابعاد اولیه:", df.shape)
    print("\\nنوع داده‌ها:\\n", df.dtypes)
    print("\\nمقادیر خالی قبل از پاک‌سازی:\\n", df.isna().sum())

    # مقادیر نامعتبر را به NaN تبدیل می‌کنیم تا با میانه/مد جایگزین شوند.
    df.loc[~df["Year"].between(1390, 1405), "Year"] = np.nan
    df.loc[df["Mileage"] < 0, "Mileage"] = np.nan
    df.loc[~df["Engine_Size"].between(0.5, 8), "Engine_Size"] = np.nan
    df.loc[df["Price"] <= 0, "Price"] = np.nan
    df = df.dropna(subset=["Price"]).copy()
    print("\\nمقادیر خالی پس از مدیریت داده‌های نامعتبر:\\n", df.isna().sum())
    print("ابعاد پس از پاک‌سازی:", df.shape)
    return df

def make_preprocessor(numeric_features, categorical_features, scale_numeric=False):
    numeric_steps = [("imputer", SimpleImputer(strategy="median"))]
    if scale_numeric:
        numeric_steps.append(("scaler", StandardScaler()))
    numeric_pipe = Pipeline(numeric_steps)
    categorical_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))
    ])
    return ColumnTransformer([
        ("num", numeric_pipe, numeric_features),
        ("cat", categorical_pipe, categorical_features)
    ])

def analyze_data(df):
    print("\\n--- چهار نمونه تحلیل داده ---")
    print("1) میانگین قیمت بر اساس برند (میلیون تومان):")
    print((df.groupby("Brand")["Price"].mean()/1e6).round(1).sort_values(ascending=False))
    print("\\n2) میانگین قیمت بر اساس سال تولید:")
    print((df.groupby("Year")["Price"].mean()/1e6).round(1).tail(8))
    print("\\n3) همبستگی کارکرد و قیمت:", round(df["Mileage"].corr(df["Price"]), 3))
    print("\\n4) میانگین قیمت بر اساس وضعیت بدنه:")
    print((df.groupby("Body_Condition")["Price"].mean()/1e6).round(1).sort_values(ascending=False))
    print("\\nمیانگین قیمت بر اساس گیربکس:")
    print((df.groupby("Gearbox")["Price"].mean()/1e6).round(1))

    # Save a useful analysis chart.
    (df.groupby("Brand")["Price"].mean()/1e6).sort_values().plot(kind="barh", figsize=(9,5))
    plt.xlabel("Average price (million Toman)")
    plt.title("Average car price by brand - synthetic data")
    plt.tight_layout()
    plt.savefig(BASE_DIR / "brand_price_analysis.png", dpi=150)
    plt.close()

def train_price_models(df):
    features = ["Brand","Model","Year","Mileage","Engine_Size","Gearbox","Fuel_Type","Body_Condition"]
    X, y = df[features], df["Price"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42
    )
    numeric = ["Year","Mileage","Engine_Size"]
    categorical = ["Brand","Model","Gearbox","Fuel_Type","Body_Condition"]
    models = {
        "Linear Regression": LinearRegression(),
        "Random Forest Regressor": RandomForestRegressor(
            n_estimators=250, random_state=42, min_samples_leaf=2
        )
    }
    results, fitted = [], {}
    for name, model in models.items():
        pipe = Pipeline([
            ("preprocessor", make_preprocessor(numeric, categorical)),
            ("model", model)
        ])
        pipe.fit(X_train, y_train)
        pred = pipe.predict(X_test)
        results.append({
            "Model": name,
            "RMSE": np.sqrt(mean_squared_error(y_test, pred)),
            "MAE": mean_absolute_error(y_test, pred),
            "R2": r2_score(y_test, pred)
        })
        fitted[name] = pipe
    result_df = pd.DataFrame(results).sort_values("RMSE")
    print("\\n--- مقایسه مدل‌های پیش‌بینی قیمت ---")
    print(result_df.to_string(index=False, formatters={
        "RMSE": "{:,.0f}".format, "MAE": "{:,.0f}".format, "R2": "{:.3f}".format
    }))
    return fitted, result_df

def price_to_class(price):
    if price < PRICE_BORDERS[0]:
        return "اقتصادی"
    if price <= PRICE_BORDERS[1]:
        return "میان‌رده"
    return "گران‌قیمت"

def train_classification_models(df):
    # IMPORTANT: Price is used only to create labels, never as a model input.
    features = ["Brand","Model","Year","Mileage","Engine_Size","Gearbox","Fuel_Type","Body_Condition"]
    X = df[features].copy()
    y = df["Price"].apply(price_to_class)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    numeric = ["Year","Mileage","Engine_Size"]
    categorical = ["Brand","Model","Gearbox","Fuel_Type","Body_Condition"]
    models = {
        "Decision Tree": DecisionTreeClassifier(max_depth=7, random_state=42),
        "Random Forest": RandomForestClassifier(n_estimators=250, random_state=42, min_samples_leaf=2),
        "Gaussian Naive Bayes": GaussianNB()
    }
    results, fitted = [], {}
    for name, model in models.items():
        pre = make_preprocessor(numeric, categorical, scale_numeric=(name == "Gaussian Naive Bayes"))
        pipe = Pipeline([("preprocessor", pre), ("model", model)])
        pipe.fit(X_train, y_train)
        pred = pipe.predict(X_test)
        results.append({
            "Model": name,
            "Accuracy": accuracy_score(y_test, pred),
            "F1_weighted": f1_score(y_test, pred, average="weighted")
        })
        fitted[name] = pipe
        if name == "Random Forest":
            cm = confusion_matrix(y_test, pred, labels=["اقتصادی","میان‌رده","گران‌قیمت"])
            disp = ConfusionMatrixDisplay(cm, display_labels=["اقتصادی","میان‌رده","گران‌قیمت"])
            disp.plot(cmap="Blues", values_format="d")
            plt.title("Random Forest - Confusion Matrix")
            plt.tight_layout()
            plt.savefig(BASE_DIR / "confusion_matrix.png", dpi=150)
            plt.close()
    result_df = pd.DataFrame(results).sort_values("F1_weighted", ascending=False)
    print("\\n--- مقایسه مدل‌های دسته‌بندی ---")
    print(result_df.to_string(index=False, formatters={
        "Accuracy": "{:.3f}".format, "F1_weighted": "{:.3f}".format
    }))
    return fitted, result_df

def test_new_cars(price_models, class_models):
    samples = pd.DataFrame([
        ["Saipa","Quick",1402,45000,1.5,"Manual","Petrol","Good"],
        ["Iran Khodro","Dena",1403,22000,1.7,"Automatic","Petrol","Excellent"],
        ["Toyota","Corolla",1401,60000,1.8,"Automatic","Hybrid","Good"],
        ["Hyundai","Tucson",1402,35000,2.0,"Automatic","Petrol","Excellent"],
        ["BMW","Series 3",1403,18000,2.0,"Automatic","Petrol","Excellent"],
    ], columns=["Brand","Model","Year","Mileage","Engine_Size","Gearbox","Fuel_Type","Body_Condition"])
    best_price_name = "Random Forest Regressor"
    best_class_name = "Random Forest"
    price_predictions = price_models[best_price_name].predict(samples)
    class_predictions = class_models[best_class_name].predict(samples)
    output = samples[["Brand","Model"]].copy()
    output["Predicted_Price_Toman"] = price_predictions.round(-6).astype("int64")
    output["Predicted_Category"] = class_predictions
    print("\\n--- آزمایش روی پنج خودروی جدید ---")
    print(output.to_string(index=False))
    output.to_csv(BASE_DIR / "five_car_predictions.csv", index=False, encoding="utf-8-sig")
    return output

def main():
    df = load_and_clean_data()
    analyze_data(df)
    price_models, price_results = train_price_models(df)
    class_models, class_results = train_classification_models(df)
    test_new_cars(price_models, class_models)
    print("\\nاجرا کامل شد. نمودارها و خروجی پیش‌بینی در پوشه پروژه ذخیره شدند.")
    print("توجه: داده‌ها مصنوعی هستند و خروجی‌ها قیمت واقعی بازار محسوب نمی‌شوند.")

if __name__ == "__main__":
    main()
