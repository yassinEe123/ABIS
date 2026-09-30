"""
Generates a synthetic labeled dataset for 48 known attack types.
~1000 samples per class → ~48 000 rows total.
Output: ai/data/attack_dataset_labeled.csv
"""
import numpy as np
import pandas as pd
from pathlib import Path

np.random.seed(42)

OUT = Path("../data/attack_dataset_labeled.csv")
N   = 3125   # samples per attack class  →  48 × 3125 = 150 000 rows

# ── Sampling helpers ──────────────────────────────────────────────────────────
def uni(lo, hi):   return lambda n: np.random.uniform(lo, hi, n)
def rint(lo, hi):  return lambda n: np.random.randint(lo, hi + 1, n).astype(float)
def const(v):      return lambda n: np.full(n, float(v))
def binom(p):      return lambda n: np.random.binomial(1, p, n).astype(float)


def make(n, tx_count_w, avg_value_w, std_value_w, dt_prev,
         value_eth, unique_to_w, same_to_burst_w, contract_target, label,
         protocol_code=0):
    """Build a DataFrame of n attack samples for a given label."""

    def sample(spec):
        if callable(spec):
            return np.clip(spec(n), 0, None)
        lo, hi = spec
        return np.random.uniform(lo, hi, n)

    df = pd.DataFrame({
        "tx_count_w":      np.clip(sample(tx_count_w),    1, 500).astype(int).astype(float),
        "avg_value_w":     np.clip(sample(avg_value_w),   0, 10000),
        "std_value_w":     np.clip(sample(std_value_w),   0, 5000),
        "dt_prev":         np.clip(sample(dt_prev),       0.05, 999999),
        "value_eth":       np.clip(sample(value_eth),     0, 10000),
        "unique_to_w":     np.clip(sample(unique_to_w),   1, 500).astype(int).astype(float),
        "same_to_burst_w": np.clip(sample(same_to_burst_w), 1, 500).astype(int).astype(float),
        "contract_target": np.clip(sample(contract_target), 0, 1).astype(int).astype(float),
        "window_s":        np.full(n, 30.0),
        "protocol_code":   np.full(n, float(protocol_code)),
        "attack_type":     label,
        "label":           1,
    })
    return df


# ── 48 Attack definitions ─────────────────────────────────────────────────────

ATTACKS = []

# ── Category 1: Burst (same target) ──────────────────────────────────────────

ATTACKS.append(make(N,
    tx_count_w    = rint(4, 15),
    avg_value_w   = uni(0.008, 0.03),
    std_value_w   = uni(0.001, 0.008),
    dt_prev       = uni(0.5, 3.0),
    value_eth     = uni(0.008, 0.035),
    unique_to_w   = const(1),
    same_to_burst_w = rint(4, 15),
    contract_target = const(1),
    label="burst_dex_same",
    protocol_code=1,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(4, 15),
    avg_value_w   = const(0),
    std_value_w   = const(0),
    dt_prev       = uni(0.5, 3.0),
    value_eth     = const(0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(4, 15),
    contract_target = const(1),
    label="burst_token_same",
    protocol_code=3,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(4, 15),
    avg_value_w   = uni(0.05, 0.5),
    std_value_w   = uni(0.01, 0.15),
    dt_prev       = uni(0.5, 3.5),
    value_eth     = uni(0.05, 0.6),
    unique_to_w   = const(1),
    same_to_burst_w = rint(4, 15),
    contract_target = const(1),
    label="burst_vault_same",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(4, 12),
    avg_value_w   = uni(0.1, 2.0),
    std_value_w   = uni(0.05, 0.8),
    dt_prev       = uni(0.5, 4.0),
    value_eth     = uni(0.1, 2.5),
    unique_to_w   = const(1),
    same_to_burst_w = rint(4, 12),
    contract_target = const(1),
    label="burst_lending_same",
    protocol_code=4,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(4, 15),
    avg_value_w   = uni(0.05, 0.35),
    std_value_w   = uni(0.01, 0.12),
    dt_prev       = uni(0.5, 3.0),
    value_eth     = uni(0.05, 0.35),
    unique_to_w   = const(1),
    same_to_burst_w = rint(4, 15),
    contract_target = const(0),
    label="burst_wallet_same",
    protocol_code=0,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(30, 60),
    avg_value_w   = uni(0.001, 0.012),
    std_value_w   = uni(0.0, 0.005),
    dt_prev       = uni(0.1, 1.0),
    value_eth     = uni(0.001, 0.015),
    unique_to_w   = rint(1, 3),
    same_to_burst_w = rint(25, 55),
    contract_target = binom(0.7),
    label="micro_burst",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(50, 120),
    avg_value_w   = uni(0.01, 0.5),
    std_value_w   = uni(0.005, 0.2),
    dt_prev       = uni(0.05, 0.8),
    value_eth     = uni(0.01, 0.5),
    unique_to_w   = rint(1, 5),
    same_to_burst_w = rint(40, 100),
    contract_target = binom(0.6),
    label="mega_burst",
    protocol_code=2,
))

# ── Category 2: Spray (multi-target) ─────────────────────────────────────────

ATTACKS.append(make(N,
    tx_count_w    = rint(10, 25),
    avg_value_w   = const(0),
    std_value_w   = const(0),
    dt_prev       = uni(0.5, 3.0),
    value_eth     = const(0),
    unique_to_w   = rint(10, 25),
    same_to_burst_w = const(1),
    contract_target = const(1),
    label="spray_token_multi",
    protocol_code=3,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(10, 25),
    avg_value_w   = uni(0.05, 0.3),
    std_value_w   = uni(0.02, 0.12),
    dt_prev       = uni(0.5, 3.0),
    value_eth     = uni(0.05, 0.35),
    unique_to_w   = rint(10, 25),
    same_to_burst_w = const(1),
    contract_target = const(0),
    label="spray_eth_multi",
    protocol_code=0,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(8, 20),
    avg_value_w   = uni(0.1, 1.0),
    std_value_w   = uni(0.05, 0.4),
    dt_prev       = uni(0.5, 4.0),
    value_eth     = uni(0.1, 1.2),
    unique_to_w   = rint(8, 20),
    same_to_burst_w = const(1),
    contract_target = const(1),
    label="spray_vault_multi",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(8, 18),
    avg_value_w   = uni(0.008, 0.03),
    std_value_w   = uni(0.002, 0.01),
    dt_prev       = uni(0.5, 3.0),
    value_eth     = uni(0.008, 0.035),
    unique_to_w   = rint(8, 18),
    same_to_burst_w = const(1),
    contract_target = const(1),
    label="spray_dex_multi",
    protocol_code=1,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(20, 60),
    avg_value_w   = uni(0.01, 0.2),
    std_value_w   = uni(0.005, 0.1),
    dt_prev       = uni(0.2, 2.0),
    value_eth     = uni(0.01, 0.25),
    unique_to_w   = rint(20, 60),
    same_to_burst_w = const(1),
    contract_target = binom(0.5),
    label="fan_out_attack",
    protocol_code=0,
))

# ── Category 3: Price manipulation ───────────────────────────────────────────

ATTACKS.append(make(N,
    tx_count_w    = rint(8, 20),
    avg_value_w   = uni(1.0, 10.0),
    std_value_w   = uni(1.5, 8.0),
    dt_prev       = uni(0.5, 4.0),
    value_eth     = uni(0.1, 15.0),
    unique_to_w   = rint(1, 3),
    same_to_burst_w = rint(5, 18),
    contract_target = const(1),
    label="pump_dump_token",
    protocol_code=1,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(6, 15),
    avg_value_w   = uni(0.5, 5.0),
    std_value_w   = uni(0.3, 3.0),
    dt_prev       = uni(1.0, 8.0),
    value_eth     = uni(0.5, 6.0),
    unique_to_w   = const(2),
    same_to_burst_w = rint(3, 8),
    contract_target = const(1),
    label="wash_trading",
    protocol_code=1,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(1, 4),
    avg_value_w   = uni(5.0, 50.0),
    std_value_w   = uni(0.5, 15.0),
    dt_prev       = uni(2.0, 30.0),
    value_eth     = uni(5.0, 50.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(1, 4),
    contract_target = const(1),
    label="price_slippage_abuse",
    protocol_code=1,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(3, 8),
    avg_value_w   = uni(0.1, 2.0),
    std_value_w   = uni(0.05, 1.0),
    dt_prev       = uni(0.05, 0.5),
    value_eth     = uni(0.1, 2.0),
    unique_to_w   = rint(1, 3),
    same_to_burst_w = rint(2, 7),
    contract_target = const(1),
    label="sandwich_attack",
    protocol_code=1,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(2, 6),
    avg_value_w   = uni(0.05, 2.0),
    std_value_w   = uni(0.01, 0.5),
    dt_prev       = uni(0.05, 0.3),
    value_eth     = uni(0.05, 2.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(2, 6),
    contract_target = const(1),
    label="front_running",
    protocol_code=1,
))

# ── Category 4: Liquidity manipulation ───────────────────────────────────────

ATTACKS.append(make(N,
    tx_count_w    = rint(2, 6),
    avg_value_w   = uni(5.0, 30.0),
    std_value_w   = uni(1.0, 10.0),
    dt_prev       = uni(0.5, 5.0),
    value_eth     = uni(5.0, 35.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(2, 6),
    contract_target = const(1),
    label="liquidity_drain",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(6, 15),
    avg_value_w   = uni(2.0, 15.0),
    std_value_w   = uni(1.5, 8.0),
    dt_prev       = uni(0.5, 4.0),
    value_eth     = uni(2.0, 18.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(6, 15),
    contract_target = const(1),
    label="liquidity_inject_withdraw",
    protocol_code=4,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(2, 5),
    avg_value_w   = uni(10.0, 80.0),
    std_value_w   = uni(5.0, 40.0),
    dt_prev       = uni(0.3, 3.0),
    value_eth     = uni(10.0, 100.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(2, 5),
    contract_target = const(1),
    label="pool_imbalance_attack",
    protocol_code=1,
))

# ── Category 5: Lending attacks ───────────────────────────────────────────────

ATTACKS.append(make(N,
    tx_count_w    = rint(2, 5),
    avg_value_w   = uni(1.0, 8.0),
    std_value_w   = uni(0.5, 4.0),
    dt_prev       = uni(0.2, 2.0),
    value_eth     = uni(1.0, 10.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(2, 5),
    contract_target = const(1),
    label="borrow_max_ltv",
    protocol_code=4,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(6, 15),
    avg_value_w   = uni(0.5, 5.0),
    std_value_w   = uni(0.3, 2.5),
    dt_prev       = uni(0.3, 3.0),
    value_eth     = uni(0.5, 6.0),
    unique_to_w   = rint(1, 3),
    same_to_burst_w = rint(5, 14),
    contract_target = const(1),
    label="collateral_dump",
    protocol_code=4,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(2, 4),
    avg_value_w   = uni(1.0, 10.0),
    std_value_w   = uni(0.5, 5.0),
    dt_prev       = uni(0.01, 0.2),
    value_eth     = uni(1.0, 12.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(2, 4),
    contract_target = const(1),
    label="flash_borrow_repay",
    protocol_code=4,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(3, 7),
    avg_value_w   = uni(0.5, 4.0),
    std_value_w   = uni(0.2, 2.0),
    dt_prev       = uni(0.5, 5.0),
    value_eth     = uni(0.5, 5.0),
    unique_to_w   = rint(1, 3),
    same_to_burst_w = rint(3, 7),
    contract_target = const(1),
    label="liquidation_trigger",
    protocol_code=4,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(8, 20),
    avg_value_w   = uni(0.2, 2.0),
    std_value_w   = uni(0.1, 1.0),
    dt_prev       = uni(0.3, 3.0),
    value_eth     = uni(0.2, 2.5),
    unique_to_w   = const(1),
    same_to_burst_w = rint(8, 20),
    contract_target = const(1),
    label="debt_loop",
    protocol_code=4,
))

# ── Category 6: Sybil & identity ─────────────────────────────────────────────

ATTACKS.append(make(N,
    tx_count_w    = rint(8, 20),
    avg_value_w   = uni(0.05, 0.5),
    std_value_w   = uni(0.005, 0.05),
    dt_prev       = uni(0.3, 2.0),
    value_eth     = uni(0.05, 0.5),
    unique_to_w   = rint(1, 4),
    same_to_burst_w = rint(6, 18),
    contract_target = binom(0.5),
    label="sybil_attack",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(10, 30),
    avg_value_w   = uni(0.1, 1.0),
    std_value_w   = uni(0.05, 0.5),
    dt_prev       = uni(0.2, 1.5),
    value_eth     = uni(0.1, 1.2),
    unique_to_w   = rint(2, 8),
    same_to_burst_w = rint(8, 28),
    contract_target = binom(0.6),
    label="new_wallet_burst",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(5, 15),
    avg_value_w   = uni(0.05, 0.5),
    std_value_w   = uni(0.005, 0.04),
    dt_prev       = uni(0.1, 1.0),
    value_eth     = uni(0.05, 0.5),
    unique_to_w   = rint(2, 8),
    same_to_burst_w = rint(4, 14),
    contract_target = binom(0.5),
    label="coordinated_wallets",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(4, 8),
    avg_value_w   = uni(0.1, 0.4),
    std_value_w   = const(0),
    dt_prev       = uni(0.5, 2.0),
    value_eth     = uni(0.1, 0.4),
    unique_to_w   = const(1),
    same_to_burst_w = rint(4, 8),
    contract_target = const(0),
    label="relay_attack",
    protocol_code=0,
))

# ── Category 7: Draining ──────────────────────────────────────────────────────

ATTACKS.append(make(N,
    tx_count_w    = rint(1, 3),
    avg_value_w   = uni(5.0, 50.0),
    std_value_w   = uni(0.0, 5.0),
    dt_prev       = uni(1.0, 15.0),
    value_eth     = uni(5.0, 50.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(1, 3),
    contract_target = const(1),
    label="vault_drain",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(2, 5),
    avg_value_w   = const(0),
    std_value_w   = const(0),
    dt_prev       = uni(1.0, 10.0),
    value_eth     = const(0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(2, 5),
    contract_target = const(1),
    label="token_drain",
    protocol_code=3,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(5, 10),
    avg_value_w   = uni(0.05, 0.25),
    std_value_w   = uni(0.01, 0.10),
    dt_prev       = uni(3.0, 6.0),
    value_eth     = uni(0.05, 0.25),
    unique_to_w   = const(1),
    same_to_burst_w = rint(5, 10),
    contract_target = const(0),
    label="wallet_drain_slow",
    protocol_code=0,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(1, 2),
    avg_value_w   = uni(1.0, 20.0),
    std_value_w   = const(0),
    dt_prev       = uni(0.5, 5.0),
    value_eth     = uni(1.0, 20.0),
    unique_to_w   = const(1),
    same_to_burst_w = const(1),
    contract_target = const(0),
    label="wallet_drain_fast",
    protocol_code=0,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(10, 30),
    avg_value_w   = uni(0.001, 0.05),
    std_value_w   = uni(0.0, 0.02),
    dt_prev       = uni(0.1, 1.0),
    value_eth     = uni(0.001, 0.06),
    unique_to_w   = const(1),
    same_to_burst_w = rint(10, 30),
    contract_target = const(1),
    label="contract_drain",
    protocol_code=2,
))

# ── Category 8: Low & slow ────────────────────────────────────────────────────

ATTACKS.append(make(N,
    tx_count_w    = rint(2, 4),
    avg_value_w   = uni(0.01, 0.1),
    std_value_w   = uni(0.005, 0.04),
    dt_prev       = uni(25.0, 35.0),
    value_eth     = uni(0.01, 0.12),
    unique_to_w   = rint(1, 3),
    same_to_burst_w = rint(2, 4),
    contract_target = binom(0.5),
    label="low_and_slow",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(4, 12),
    avg_value_w   = uni(0.01, 2.0),
    std_value_w   = uni(0.3, 2.0),
    dt_prev       = uni(5.0, 20.0),
    value_eth     = uni(0.5, 5.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(4, 12),
    contract_target = binom(0.6),
    label="gradual_escalation",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(3, 6),
    avg_value_w   = uni(0.01, 0.3),
    std_value_w   = uni(0.0, 0.01),
    dt_prev       = uni(14.5, 15.5),
    value_eth     = uni(0.01, 0.3),
    unique_to_w   = const(1),
    same_to_burst_w = rint(3, 6),
    contract_target = binom(0.5),
    label="periodic_bot",
    protocol_code=1,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(8, 25),
    avg_value_w   = uni(0.02, 0.4),
    std_value_w   = uni(0.01, 0.2),
    dt_prev       = uni(0.3, 2.0),
    value_eth     = uni(0.02, 0.5),
    unique_to_w   = rint(1, 4),
    same_to_burst_w = rint(6, 22),
    contract_target = binom(0.5),
    label="night_owl",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(5, 15),
    avg_value_w   = uni(0.001, 0.02),
    std_value_w   = uni(0.0, 0.005),
    dt_prev       = uni(3.0, 15.0),
    value_eth     = uni(0.001, 0.025),
    unique_to_w   = rint(3, 12),
    same_to_burst_w = rint(2, 5),
    contract_target = const(1),
    label="stealth_accumulation",
    protocol_code=1,
))

# ── Category 9: Contract exploits ─────────────────────────────────────────────

ATTACKS.append(make(N,
    tx_count_w    = rint(15, 40),
    avg_value_w   = uni(0.01, 0.5),
    std_value_w   = uni(0.0, 0.1),
    dt_prev       = uni(0.05, 0.5),
    value_eth     = uni(0.01, 0.5),
    unique_to_w   = const(1),
    same_to_burst_w = rint(15, 40),
    contract_target = const(1),
    label="reentrancy_simulation",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(1, 3),
    avg_value_w   = uni(1000.0, 100000.0),
    std_value_w   = uni(0.0, 10000.0),
    dt_prev       = uni(0.5, 10.0),
    value_eth     = uni(1000.0, 100000.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(1, 3),
    contract_target = const(1),
    label="integer_overflow_probe",
    protocol_code=1,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(30, 100),
    avg_value_w   = const(0),
    std_value_w   = const(0),
    dt_prev       = uni(0.1, 0.8),
    value_eth     = const(0),
    unique_to_w   = rint(1, 5),
    same_to_burst_w = rint(20, 90),
    contract_target = binom(0.7),
    label="zero_value_spam",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(20, 50),
    avg_value_w   = uni(0.0, 0.1),
    std_value_w   = uni(0.0, 0.05),
    dt_prev       = uni(0.1, 1.0),
    value_eth     = uni(0.0, 0.1),
    unique_to_w   = const(1),
    same_to_burst_w = rint(20, 50),
    contract_target = const(1),
    label="gas_griefing",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(30, 80),
    avg_value_w   = uni(0.0, 0.05),
    std_value_w   = uni(0.0, 0.02),
    dt_prev       = uni(0.1, 0.8),
    value_eth     = uni(0.0, 0.05),
    unique_to_w   = const(1),
    same_to_burst_w = rint(30, 80),
    contract_target = const(1),
    label="contract_call_flood",
    protocol_code=2,
))

# ── Category 10: MEV & arbitrage ──────────────────────────────────────────────

ATTACKS.append(make(N,
    tx_count_w    = rint(4, 12),
    avg_value_w   = uni(0.05, 2.0),
    std_value_w   = uni(0.5, 3.0),
    dt_prev       = uni(0.05, 0.5),
    value_eth     = uni(0.05, 3.0),
    unique_to_w   = rint(1, 3),
    same_to_burst_w = rint(3, 10),
    contract_target = const(1),
    label="mev_bot_pattern",
    protocol_code=1,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(6, 18),
    avg_value_w   = uni(0.05, 2.0),
    std_value_w   = uni(0.3, 2.0),
    dt_prev       = uni(0.1, 1.0),
    value_eth     = uni(0.05, 2.5),
    unique_to_w   = rint(2, 5),
    same_to_burst_w = rint(4, 16),
    contract_target = const(1),
    label="arbitrage_aggressive",
    protocol_code=2,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(1, 3),
    avg_value_w   = uni(0.1, 5.0),
    std_value_w   = uni(0.0, 1.0),
    dt_prev       = uni(0.01, 0.15),
    value_eth     = uni(0.1, 5.0),
    unique_to_w   = const(1),
    same_to_burst_w = rint(1, 3),
    contract_target = const(1),
    label="sniper_bot",
    protocol_code=1,
))

ATTACKS.append(make(N,
    tx_count_w    = rint(80, 150),
    avg_value_w   = uni(0.001, 0.05),
    std_value_w   = uni(0.0, 0.02),
    dt_prev       = uni(0.01, 0.3),
    value_eth     = uni(0.001, 0.05),
    unique_to_w   = rint(1, 5),
    same_to_burst_w = rint(70, 140),
    contract_target = const(1),
    label="block_stuffing",
    protocol_code=2,
))

# ── Assemble & save ───────────────────────────────────────────────────────────

df = pd.concat(ATTACKS, ignore_index=True)
df = df.sample(frac=1, random_state=42).reset_index(drop=True)

OUT.parent.mkdir(parents=True, exist_ok=True)
df.to_csv(OUT, index=False)

print(f"✅  Attack dataset saved → {OUT}")
print(f"    Total rows   : {len(df)}")
print(f"    Attack types : {df['attack_type'].nunique()}")
print(f"\nDistribution:")
print(df["attack_type"].value_counts().to_string())
