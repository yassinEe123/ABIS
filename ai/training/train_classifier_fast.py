"""
Fast online retraining — used when buffer accumulates new attack samples.
200 trees instead of 400 for speed. Same interface as train_classifier.py.
"""
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import joblib

DATA      = Path("../data/attack_dataset_labeled.csv")
MODEL_OUT = Path("../models/abis_classifier.pkl")
SCALER_OUT= Path("../models/abis_clf_scaler.pkl")
LABELS_OUT= Path("../models/abis_clf_labels.pkl")

FEATURES = [
    "tx_count_w", "avg_value_w", "std_value_w", "dt_prev",
    "value_eth", "unique_to_w", "same_to_burst_w", "contract_target", "window_s",
    "protocol_code",
]


def main():
    df = pd.read_csv(DATA)
    print(f"[fast-retrain] {len(df)} rows, {df['attack_type'].nunique()} types")

    X  = df[FEATURES].values
    le = LabelEncoder()
    y  = le.fit_transform(df["attack_type"].values)

    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    Xtr, Xte, ytr, yte = train_test_split(Xs, y, test_size=0.15,
                                           random_state=42, stratify=y)

    model = RandomForestClassifier(
        n_estimators=200,         # faster than full 400
        max_depth=None,
        min_samples_leaf=2,
        n_jobs=-1,
        random_state=42,
        class_weight="balanced",
    )
    model.fit(Xtr, ytr)

    acc = accuracy_score(yte, model.predict(Xte))
    print(f"[fast-retrain] accuracy: {acc:.4f}")

    joblib.dump(model,          MODEL_OUT)
    joblib.dump(scaler,         SCALER_OUT)
    joblib.dump(list(le.classes_), LABELS_OUT)
    print(f"[fast-retrain] saved ✅")


if __name__ == "__main__":
    main()
