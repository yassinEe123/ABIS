#!/bin/bash
# Full hybrid model training pipeline
# Run from: /home/kali/ABIS/ai/training/

set -e
VENV="../../ai/venv/bin/python"
[ ! -f "$VENV" ] && VENV="../venv/bin/python"

echo "════════════════════════════════════════════════"
echo "  ABIS Hybrid Training Pipeline"
echo "════════════════════════════════════════════════"

echo ""
echo "▶ Step 1/4 — Generating attack dataset (48 types × 1000 samples)…"
$VENV generate_attack_dataset.py

echo ""
echo "▶ Step 2/4 — Generating improved normal dataset (150k samples)…"
$VENV generate_normal_dataset.py

echo ""
echo "▶ Step 3/4 — Training RandomForest classifier on attack dataset…"
$VENV train_classifier.py

echo ""
echo "▶ Step 4/4 — Training IsolationForest on pure normal dataset…"
$VENV train_iforest.py

echo ""
echo "════════════════════════════════════════════════"
echo "  ✅  All models trained and saved!"
echo ""
echo "  Models:"
echo "    ai/models/abis_classifier.pkl      (48 attack types)"
echo "    ai/models/abis_clf_scaler.pkl"
echo "    ai/models/abis_clf_labels.pkl"
echo "    ai/models/abis_iforest_v2.pkl      (unknown anomalies)"
echo "    ai/models/abis_scaler_v2.pkl"
echo "    ai/models/risk_calibration_v2.pkl"
echo ""
echo "  Restart the ABIS agent to load the new models."
echo "════════════════════════════════════════════════"
