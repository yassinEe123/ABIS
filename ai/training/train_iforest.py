"""
Trains IsolationForest on PURE normal transactions only.
Outputs:
  - ai/models/abis_iforest_v2.pkl
  - ai/models/abis_scaler_v2.pkl
  - ai/models/risk_calibration_v2.pkl
"""
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib

DATA      = Path("../data/dataset_normal_improved.csv")
MODEL_OUT = Path("../models/abis_iforest_v2.pkl")
SCALER_OUT= Path("../models/abis_scaler_v2.pkl")
CAL_OUT   = Path("../models/risk_calibration_v2.pkl")

FEATURES = [
    "tx_count_w", "avg_value_w", "std_value_w", "dt_prev",
    "value_eth", "unique_to_w", "same_to_burst_w", "contract_target", "window_s",
]


def main():
    df = pd.read_csv(DATA)
    print(f"Normal dataset: {len(df)} rows")

    X = df[FEATURES].values

    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    model = IsolationForest(
        n_estimators=400,
        contamination=0.02,   # only 2% of pure-normal expected as false-positives
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    print("Training IsolationForest on normal data…")
    model.fit(Xs)

    # Calibrate: compute score distribution on normal data
    scores = model.score_samples(Xs)
    print("\nScore distribution on normal data:")
    for pct in [1, 2, 5, 10, 25, 50, 75, 90, 95, 99]:
        print(f"  p{pct:>2}: {np.percentile(scores, pct):.5f}")

    # Calibration anchors:
    #   p3  → most anomalous 3% of normal traffic (false-positive floor)
    #   p92 → clearly normal traffic ceiling
    cal = {
        "p1":  float(np.percentile(scores, 3)),
        "p50": float(np.percentile(scores, 50)),
        "p99": float(np.percentile(scores, 92)),
    }
    print(f"\nCalibration: {cal}")

    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model,  MODEL_OUT)
    joblib.dump(scaler, SCALER_OUT)
    joblib.dump(cal,    CAL_OUT)

    print(f"\n✅  Saved: {MODEL_OUT}")
    print(f"✅  Saved: {SCALER_OUT}")
    print(f"✅  Saved: {CAL_OUT}")


if __name__ == "__main__":
    main()
