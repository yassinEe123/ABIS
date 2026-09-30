"""
Trains a RandomForest classifier on the labeled attack dataset.
Outputs:
  - ai/models/abis_classifier.pkl       (RandomForestClassifier)
  - ai/models/abis_clf_scaler.pkl       (StandardScaler)
  - ai/models/abis_clf_labels.pkl       (list of class names)
"""
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib

DATA      = Path("../data/attack_dataset_labeled.csv")
MODEL_OUT = Path("../models/abis_classifier.pkl")
SCALER_OUT= Path("../models/abis_clf_scaler.pkl")
LABELS_OUT= Path("../models/abis_clf_labels.pkl")

FEATURES = [
    "tx_count_w", "avg_value_w", "std_value_w", "dt_prev",
    "value_eth", "unique_to_w", "same_to_burst_w", "contract_target", "window_s",
]


def main():
    df = pd.read_csv(DATA)
    print(f"Dataset: {len(df)} rows, {df['attack_type'].nunique()} attack types")

    X = df[FEATURES].values
    y_raw = df["attack_type"].values

    # Encode string labels → integers
    le = LabelEncoder()
    y  = le.fit_transform(y_raw)
    class_names = list(le.classes_)
    print(f"Classes: {class_names}")

    # Scale features
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    # Train / test split (80/20)
    Xtr, Xte, ytr, yte = train_test_split(Xs, y, test_size=0.2, random_state=42, stratify=y)

    model = RandomForestClassifier(
        n_estimators=400,
        max_depth=None,
        min_samples_leaf=2,
        n_jobs=-1,
        random_state=42,
        class_weight="balanced",
    )
    print("Training RandomForest…")
    model.fit(Xtr, ytr)

    # Evaluation
    ypred = model.predict(Xte)
    acc   = accuracy_score(yte, ypred)
    print(f"\n✅  Test accuracy: {acc:.4f} ({acc*100:.2f}%)")
    print("\nClassification report (per attack type):")
    print(classification_report(yte, ypred, target_names=class_names))

    # Feature importance
    importances = model.feature_importances_
    print("\nFeature importances:")
    for feat, imp in sorted(zip(FEATURES, importances), key=lambda x: -x[1]):
        bar = "█" * int(imp * 60)
        print(f"  {feat:<20} {imp:.4f}  {bar}")

    # Save
    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model,       MODEL_OUT)
    joblib.dump(scaler,      SCALER_OUT)
    joblib.dump(class_names, LABELS_OUT)

    print(f"\n✅  Saved: {MODEL_OUT}")
    print(f"✅  Saved: {SCALER_OUT}")
    print(f"✅  Saved: {LABELS_OUT}")


if __name__ == "__main__":
    main()
