"""
Generates a rich synthetic dataset of PURE normal transactions.
8 realistic user archetypes → 150 000 rows total.
Output: ai/data/dataset_normal_improved.csv

Used ONLY by IsolationForest — NO attack data mixed in.
"""
import numpy as np
import pandas as pd
from pathlib import Path

np.random.seed(42)

OUT = Path("../data/dataset_normal_improved.csv")
FEATURES = [
    "tx_count_w", "avg_value_w", "std_value_w", "dt_prev",
    "value_eth", "unique_to_w", "same_to_burst_w", "contract_target", "window_s",
    "protocol_code",
]

# ── Archetype builder ─────────────────────────────────────────────────────────

def archetype(n, tx_count_w, avg_value_w, std_value_w, dt_prev,
              value_eth, unique_to_w, same_to_burst_w, contract_target):
    def sample(spec):
        if callable(spec): return np.clip(spec(n), 0, None)
        lo, hi = spec
        return np.random.uniform(lo, hi, n)

    return pd.DataFrame({
        "tx_count_w":      np.clip(sample(tx_count_w),     1, 500).astype(int).astype(float),
        "avg_value_w":     np.clip(sample(avg_value_w),    0, 10000),
        "std_value_w":     np.clip(sample(std_value_w),    0, 5000),
        "dt_prev":         np.clip(sample(dt_prev),        1, 999999),
        "value_eth":       np.clip(sample(value_eth),      0, 10000),
        "unique_to_w":     np.clip(sample(unique_to_w),    1, 500).astype(int).astype(float),
        "same_to_burst_w": np.clip(sample(same_to_burst_w),1, 500).astype(int).astype(float),
        "contract_target": np.clip(sample(contract_target),0, 1).astype(int).astype(float),
        "window_s":        np.full(n, 30),
        "protocol_code":   np.random.choice([0, 1, 2, 3, 4], size=n).astype(float),
        "label":           0,
    })


parts = []

# ── 1. Casual user (small infrequent ETH transfers) ──────────────────────────
parts.append(archetype(25_000,
    tx_count_w    = lambda n: np.random.randint(1, 3, n).astype(float),
    avg_value_w   = lambda n: np.random.exponential(0.15, n),
    std_value_w   = lambda n: np.random.exponential(0.03, n),
    dt_prev       = lambda n: np.random.exponential(1800, n) + 60,
    value_eth     = lambda n: np.random.exponential(0.15, n),
    unique_to_w   = lambda n: np.random.randint(1, 3, n).astype(float),
    same_to_burst_w = lambda n: np.random.randint(1, 3, n).astype(float),
    contract_target = lambda n: np.random.binomial(1, 0.2, n).astype(float),
))

# ── 2. DeFi trader (moderate swaps on DEX, regular intervals) ────────────────
parts.append(archetype(25_000,
    tx_count_w    = lambda n: np.random.randint(1, 5, n).astype(float),
    avg_value_w   = lambda n: np.random.uniform(0.05, 2.0, n),
    std_value_w   = lambda n: np.random.uniform(0.01, 0.8, n),
    dt_prev       = lambda n: np.random.uniform(30, 600, n),
    value_eth     = lambda n: np.random.uniform(0.05, 2.5, n),
    unique_to_w   = lambda n: np.random.randint(1, 4, n).astype(float),
    same_to_burst_w = lambda n: np.random.randint(1, 4, n).astype(float),
    contract_target = lambda n: np.random.binomial(1, 0.85, n).astype(float),
))

# ── 3. Liquidity provider (large, infrequent, same protocol) ─────────────────
parts.append(archetype(20_000,
    tx_count_w    = lambda n: np.random.randint(1, 3, n).astype(float),
    avg_value_w   = lambda n: np.random.uniform(1.0, 20.0, n),
    std_value_w   = lambda n: np.random.uniform(0.0, 3.0, n),
    dt_prev       = lambda n: np.random.exponential(3600, n) + 300,
    value_eth     = lambda n: np.random.uniform(1.0, 25.0, n),
    unique_to_w   = lambda n: np.random.randint(1, 2, n).astype(float),
    same_to_burst_w = lambda n: np.random.randint(1, 3, n).astype(float),
    contract_target = lambda n: np.ones(n),
))

# ── 4. HODLer (very rare, large transfers) ────────────────────────────────────
parts.append(archetype(15_000,
    tx_count_w    = lambda n: np.ones(n),
    avg_value_w   = lambda n: np.random.uniform(0.5, 30.0, n),
    std_value_w   = lambda n: np.zeros(n),
    dt_prev       = lambda n: np.random.exponential(7200, n) + 600,
    value_eth     = lambda n: np.random.uniform(0.5, 30.0, n),
    unique_to_w   = lambda n: np.ones(n),
    same_to_burst_w = lambda n: np.ones(n),
    contract_target = lambda n: np.random.binomial(1, 0.4, n).astype(float),
))

# ── 5. Token user (ERC-20 transfers, medium frequency) ───────────────────────
parts.append(archetype(25_000,
    tx_count_w    = lambda n: np.random.randint(1, 4, n).astype(float),
    avg_value_w   = lambda n: np.random.uniform(10, 500, n),
    std_value_w   = lambda n: np.random.uniform(0, 100, n),
    dt_prev       = lambda n: np.random.uniform(60, 1800, n),
    value_eth     = lambda n: np.random.uniform(10, 600, n),
    unique_to_w   = lambda n: np.random.randint(1, 4, n).astype(float),
    same_to_burst_w = lambda n: np.random.randint(1, 4, n).astype(float),
    contract_target = lambda n: np.ones(n),
))

# ── 6. Lender/borrower (deposits + borrows, regular) ─────────────────────────
parts.append(archetype(20_000,
    tx_count_w    = lambda n: np.random.randint(1, 3, n).astype(float),
    avg_value_w   = lambda n: np.random.uniform(0.2, 5.0, n),
    std_value_w   = lambda n: np.random.uniform(0.0, 2.0, n),
    dt_prev       = lambda n: np.random.uniform(120, 3600, n),
    value_eth     = lambda n: np.random.uniform(0.2, 6.0, n),
    unique_to_w   = lambda n: np.random.randint(1, 2, n).astype(float),
    same_to_burst_w = lambda n: np.random.randint(1, 3, n).astype(float),
    contract_target = lambda n: np.ones(n),
))

# ── 7. Multi-protocol user (uses several DeFi protocols, spread out) ──────────
parts.append(archetype(25_000,
    tx_count_w    = lambda n: np.random.randint(2, 6, n).astype(float),
    avg_value_w   = lambda n: np.random.uniform(0.05, 3.0, n),
    std_value_w   = lambda n: np.random.uniform(0.02, 1.5, n),
    dt_prev       = lambda n: np.random.uniform(15, 300, n),
    value_eth     = lambda n: np.random.uniform(0.05, 3.5, n),
    unique_to_w   = lambda n: np.random.randint(2, 6, n).astype(float),
    same_to_burst_w = lambda n: np.random.randint(1, 3, n).astype(float),
    contract_target = lambda n: np.random.binomial(1, 0.9, n).astype(float),
))

# ── 8. Power user (high frequency but legitimate, professional trader) ─────────
parts.append(archetype(15_000,
    tx_count_w    = lambda n: np.random.randint(3, 9, n).astype(float),
    avg_value_w   = lambda n: np.random.uniform(0.1, 5.0, n),
    std_value_w   = lambda n: np.random.uniform(0.05, 2.0, n),
    dt_prev       = lambda n: np.random.uniform(5, 120, n),
    value_eth     = lambda n: np.random.uniform(0.1, 6.0, n),
    unique_to_w   = lambda n: np.random.randint(2, 8, n).astype(float),
    same_to_burst_w = lambda n: np.random.randint(2, 7, n).astype(float),
    contract_target = lambda n: np.random.binomial(1, 0.95, n).astype(float),
))

# ── Assemble ──────────────────────────────────────────────────────────────────
df = pd.concat(parts, ignore_index=True)
df = df[FEATURES + ["label"]]
df = df.sample(frac=1, random_state=42).reset_index(drop=True)

OUT.parent.mkdir(parents=True, exist_ok=True)
df.to_csv(OUT, index=False)

print(f"✅  Normal dataset saved → {OUT}")
print(f"    Total rows : {len(df)}")
print(f"    All label=0: {(df['label'] == 0).all()}")
print(f"\nFeature stats:")
print(df[FEATURES].describe().to_string())
