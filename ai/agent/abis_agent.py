import json
import logging
import logging.handlers
import os
import time
import threading
import subprocess
from pathlib import Path
from collections import defaultdict

import numpy as np
import pandas as pd
import requests
from web3 import Web3
import joblib

# ── Structured logging ────────────────────────────────────────────────────────
LOG_PATH = Path(__file__).resolve().parent.parent.parent / "logs" / "abis_agent.log"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":%(message)s}',
    handlers=[
        logging.StreamHandler(),
        logging.handlers.RotatingFileHandler(
            LOG_PATH, maxBytes=5*1024*1024, backupCount=3
        ),
    ]
)
log = logging.getLogger("ABIS")

def logj(**kwargs):
    """Emit a structured JSON log line."""
    log.info(json.dumps(kwargs))

# ── Configuration ─────────────────────────────────────────────────────────────
RPC = os.environ.get("ABIS_RPC", "http://127.0.0.1:8545")

_BASE = Path(__file__).resolve().parent.parent.parent

DEPLOY_PATH   = _BASE / "blockchain/deployments/localhost.json"
ARTIFACTS_DIR = _BASE / "blockchain/artifacts/contracts"

IFOREST_PATH = _BASE / "ai/models/abis_iforest_v2.pkl"
SCALER_PATH  = _BASE / "ai/models/abis_scaler_v2.pkl"
CAL_PATH     = _BASE / "ai/models/risk_calibration_v2.pkl"
CLF_PATH     = _BASE / "ai/models/abis_classifier.pkl"
CLF_SCL_PATH = _BASE / "ai/models/abis_clf_scaler.pkl"
CLF_LBL_PATH = _BASE / "ai/models/abis_clf_labels.pkl"

REPUTATION_PATH = _BASE / "ai/data/wallet_reputation.json"
BUFFER_PATH     = _BASE / "ai/data/new_attacks_buffer.csv"

# ── Alerting (Discord / Slack webhook via env) ────────────────────────────────
DISCORD_WEBHOOK  = os.environ.get("ABIS_DISCORD_WEBHOOK", "")
SLACK_WEBHOOK    = os.environ.get("ABIS_SLACK_WEBHOOK", "")

# ── Thresholds ────────────────────────────────────────────────────────────────
WINDOWS              = [5, 10, 30]
WINDOWS_LONG         = [300, 3600]        # A2: 5-min and 1-hour windows
WARN_THRESHOLD       = 40
WARN_SECONDS         = 120
WARN_TX_DELAY        = 30
BLOCK_SECONDS        = 600
BASE_RISK_THRESHOLD  = 65
FREEZE_THRESHOLD     = 92
MIN_EVENTS_FOR_SCORE = 2
MIN_EVENTS_FOR_BLOCK = 2
LOCAL_COOLDOWN_S     = 60
HIST_PURGE_AGE_S     = 600
HIST_LONG_PURGE_S    = 7200              # purge long-window history after 2h
PURGE_EVERY_N_BLOCKS = 50
CLF_CONFIDENCE_THRESHOLD = 0.65
CLF_SOFT_THRESHOLD       = 0.25
ONLINE_RETRAIN_EVERY     = 50

# A1: Multi-wallet Sybil detection
SYBIL_WINDOW_S       = 30               # time bucket for coordination detection
SYBIL_MIN_WALLETS    = 3               # min unique wallets to flag as coordinated
SYBIL_RISK_BOOST     = 20              # extra risk added when Sybil detected

FEATURES = [
    "tx_count_w", "avg_value_w", "std_value_w", "dt_prev",
    "value_eth", "unique_to_w", "same_to_burst_w", "contract_target", "window_s",
    "protocol_code",
]
# IForest was trained without protocol_code (9 features); CLF uses all 10
IFOREST_FEATURES = FEATURES[:-1]

PROTOCOL_CODE = {"Dex": 1, "Vault": 2, "Token": 3, "Lending": 4}

# ── Load deployment ───────────────────────────────────────────────────────────
with open(DEPLOY_PATH) as f:
    deployment = json.load(f)

REGISTRY_ADDR = Web3.to_checksum_address(deployment["registry"])
PROTOCOL_MAP: dict[str, str] = {}
_DISPLAY = {"vault": "Vault", "token": "Token", "dex": "Dex", "lending": "Lending"}
for key, addr in deployment.items():
    if key != "registry":
        PROTOCOL_MAP[addr.lower()] = _DISPLAY.get(key, key.capitalize())


# ── Model registry (hot-swappable) ────────────────────────────────────────────
class Models:
    def __init__(self):
        self.lock    = threading.Lock()
        self.iforest = joblib.load(IFOREST_PATH)
        self.scaler  = joblib.load(SCALER_PATH)
        self.cal     = joblib.load(CAL_PATH)
        self.clf     = joblib.load(CLF_PATH)
        self.clf_scl = joblib.load(CLF_SCL_PATH)
        self.clf_lbl = joblib.load(CLF_LBL_PATH)
        logj(event="models_loaded", attack_types=len(self.clf_lbl))

    def reload_classifier(self):
        try:
            new_clf, new_scl, new_lbl = (
                joblib.load(CLF_PATH),
                joblib.load(CLF_SCL_PATH),
                joblib.load(CLF_LBL_PATH),
            )
            with self.lock:
                self.clf, self.clf_scl, self.clf_lbl = new_clf, new_scl, new_lbl
            logj(event="classifier_reloaded", attack_types=len(new_lbl))
        except Exception as e:
            logj(event="reload_failed", error=str(e))


models = Models()


# ── Webhook alerts ─────────────────────────────────────────────────────────────
def send_alert(level: str, wallet: str, reason: str, risk: float):
    """A10: Send alert to Discord/Slack on critical events."""
    if not DISCORD_WEBHOOK and not SLACK_WEBHOOK:
        return
    icons  = {"FREEZE": "🧊", "BLOCK": "🔒", "WARN": "⚠️", "SYBIL": "🕸️"}
    colors = {"FREEZE": 0x7c3aed, "BLOCK": 0xef4444, "WARN": 0xf59e0b, "SYBIL": 0xe879f9}
    icon   = icons.get(level, "🚨")
    color  = colors.get(level, 0xef4444)

    def _post():
        payload_discord = {
            "embeds": [{
                "title": f"{icon} ABIS Alert — {level}",
                "description": f"**Wallet**: `{wallet}`\n**Risk**: {risk:.1f}\n**Reason**: {reason[:300]}",
                "color": color,
                "footer": {"text": "ABIS — AI Blockchain Immune System"},
            }]
        }
        payload_slack = {
            "text": f"{icon} *ABIS {level}* — `{wallet}` risk={risk:.1f}\n{reason[:200]}"
        }
        try:
            if DISCORD_WEBHOOK:
                requests.post(DISCORD_WEBHOOK, json=payload_discord, timeout=5)
            if SLACK_WEBHOOK:
                requests.post(SLACK_WEBHOOK, json=payload_slack, timeout=5)
        except Exception as e:
            logj(event="webhook_failed", error=str(e))

    threading.Thread(target=_post, daemon=True).start()


# ── Wallet reputation ─────────────────────────────────────────────────────────
def load_reputation() -> dict:
    if REPUTATION_PATH.exists():
        with open(REPUTATION_PATH) as f:
            return json.load(f)
    return {}

def save_reputation(rep: dict):
    REPUTATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REPUTATION_PATH, "w") as f:
        json.dump(rep, f, indent=2)

def record_block(rep: dict, wallet: str, ts: int):
    key = wallet.lower()
    if key not in rep:
        rep[key] = {"block_count": 0, "first_blocked": ts, "last_blocked": ts}
    rep[key]["block_count"] += 1
    rep[key]["last_blocked"]  = ts
    save_reputation(rep)

def effective_threshold(rep: dict, wallet: str) -> float:
    count = rep.get(wallet.lower(), {}).get("block_count", 0)
    if count == 0: return BASE_RISK_THRESHOLD
    if count == 1: return BASE_RISK_THRESHOLD * 0.75
    return BASE_RISK_THRESHOLD * 0.55


# ── Online learning ───────────────────────────────────────────────────────────
_retrain_lock = threading.Lock()
_retraining   = False

def buffer_attack(row_df: pd.DataFrame, attack_type: str):
    row = row_df.copy()
    row["attack_type"] = attack_type
    row["label"]       = 1
    BUFFER_PATH.parent.mkdir(parents=True, exist_ok=True)
    header = not BUFFER_PATH.exists()
    row.to_csv(BUFFER_PATH, mode="a", header=header, index=False)

def buffer_size() -> int:
    if not BUFFER_PATH.exists():
        return 0
    with open(BUFFER_PATH) as f:
        return max(0, sum(1 for _ in f) - 1)

def retrain_background():
    global _retraining
    with _retrain_lock:
        if _retraining:
            return
        _retraining = True

    def _run():
        global _retraining
        try:
            logj(event="retrain_start")
            base   = pd.read_csv(_BASE / "ai/data/attack_dataset_labeled.csv")
            buf    = pd.read_csv(BUFFER_PATH)
            merged = pd.concat([base, buf], ignore_index=True)
            merged.to_csv(_BASE / "ai/data/attack_dataset_labeled.csv", index=False)
            BUFFER_PATH.unlink()
            logj(event="buffer_merged", new_samples=len(buf), total=len(merged))

            result = subprocess.run(
                [str(_BASE / "ai/venv/bin/python3"), "train_classifier_fast.py"],
                capture_output=True, text=True,
                cwd=str(_BASE / "ai/training")
            )
            if result.returncode == 0:
                models.reload_classifier()
                logj(event="retrain_complete")
            else:
                logj(event="retrain_failed", stderr=result.stderr[:500])
        except Exception as e:
            logj(event="retrain_error", error=str(e))
        finally:
            _retraining = False

    threading.Thread(target=_run, daemon=True).start()

def maybe_retrain():
    n = buffer_size()
    if n >= ONLINE_RETRAIN_EVERY:
        logj(event="retrain_triggered", buffer_size=n)
        retrain_background()


# ── Helpers ───────────────────────────────────────────────────────────────────
def load_abi(name: str) -> list:
    files = list(ARTIFACTS_DIR.rglob(f"{name}.json"))
    if not files:
        raise FileNotFoundError(f"ABI not found: {name}")
    with open(files[0]) as f:
        return json.load(f)["abi"]

def clamp(x, lo, hi):
    return max(lo, min(hi, x))

def score_to_risk(score: float, cal: dict) -> float:
    p1, p99 = float(cal["p1"]), float(cal["p99"])
    if p99 <= p1: return 50.0
    return float(100.0 * clamp((p99 - score) / (p99 - p1), 0.0, 1.0))

def is_contract(w3: Web3, address: str) -> int:
    if not address: return 0
    try:
        code = w3.eth.get_code(Web3.to_checksum_address(address))
        return 1 if code and code not in (b"", b"\x00") else 0
    except Exception:
        return 0

def build_row(tx_count_w, avg_value_w, std_value_w, dt_prev,
              value_eth, unique_to_w, same_to_burst_w, contract_target, window_s,
              protocol_code=0):
    return pd.DataFrame([{
        "tx_count_w": tx_count_w, "avg_value_w": avg_value_w,
        "std_value_w": std_value_w, "dt_prev": dt_prev,
        "value_eth": value_eth, "unique_to_w": unique_to_w,
        "same_to_burst_w": same_to_burst_w, "contract_target": contract_target,
        "window_s": window_s, "protocol_code": protocol_code,
    }], columns=FEATURES)

def purge_inactive(hist_w: dict, current_ts: int, max_age: int) -> int:
    stale = []
    for W, wallets in hist_w.items():
        for w, entries in list(wallets.items()):
            if entries and (current_ts - entries[-1][0]) > max_age:
                stale.append((W, w))
    for W, w in stale:
        del hist_w[W][w]
    return len(stale)

def connect(rpc: str) -> Web3:
    while True:
        try:
            w3 = Web3(Web3.HTTPProvider(rpc))
            if w3.is_connected():
                return w3
        except Exception:
            pass
        logj(event="waiting_for_node", rpc=rpc)
        time.sleep(3)


# ── Hybrid scoring ────────────────────────────────────────────────────────────
def hybrid_score(row_df):
    with models.lock:
        clf, clf_scl, clf_lbl = models.clf, models.clf_scl, models.clf_lbl
        iforest, if_scl, cal  = models.iforest, models.scaler, models.cal

    Xc    = clf_scl.transform(row_df.values)
    proba = clf.predict_proba(Xc)[0]
    best_idx  = int(np.argmax(proba))
    best_conf = float(proba[best_idx])
    attack_pred = clf_lbl[best_idx]

    # IForest was trained on 9 features (no protocol_code) — drop last column
    Xs      = if_scl.transform(row_df[IFOREST_FEATURES].values)
    if_score= float(iforest.score_samples(Xs)[0])
    if_risk = float(score_to_risk(if_score, cal))

    if best_conf >= CLF_CONFIDENCE_THRESHOLD:
        risk = float(65.0 + (best_conf - CLF_CONFIDENCE_THRESHOLD) /
                     (1.0 - CLF_CONFIDENCE_THRESHOLD) * 34.0)
        risk = min(max(risk, if_risk), 99.0)
        return risk, attack_pred, "classifier", best_conf

    if best_conf >= CLF_SOFT_THRESHOLD:
        return if_risk, attack_pred, "iforest+clf", best_conf

    if if_risk >= BASE_RISK_THRESHOLD:
        return if_risk, "unknown_anomaly", "iforest", None

    return if_risk, "normal", "iforest", None


# ── Feature extraction ────────────────────────────────────────────────────────
def extract_features(hist_w, sender, bt, tx_to, value_eth, W):
    entries = hist_w[W].get(sender, [])
    w_vals  = [v for _, v, _ in entries]
    w_tos   = [a for _, _, a in entries]

    tx_count_w    = len(w_vals)
    avg_value_w   = float(np.mean(w_vals))  if w_vals else 0.0
    std_value_w   = float(np.std(w_vals))   if w_vals else 0.0
    unique_to_w   = len(set(w_tos))
    same_to_burst = int(sum(1 for x in w_tos if x == tx_to))
    dt_prev       = bt - entries[-2][0] if len(entries) >= 2 else 999999

    return tx_count_w, avg_value_w, std_value_w, dt_prev, unique_to_w, same_to_burst


# ── A1: Multi-wallet Sybil detection ─────────────────────────────────────────
def check_sybil_coordination(
    sybil_buckets: dict,
    sender: str,
    protocol: str,
    attack_type: str,
    bt: int,
) -> tuple[bool, int]:
    """
    Detect coordinated attacks: 3+ wallets showing same attack type
    on same protocol within SYBIL_WINDOW_S seconds.
    Returns (is_coordinated, wallet_count).
    """
    bucket_key = (protocol, attack_type, bt // SYBIL_WINDOW_S)
    if bucket_key not in sybil_buckets:
        sybil_buckets[bucket_key] = set()
    sybil_buckets[bucket_key].add(sender)

    # Purge old buckets
    current_bucket = bt // SYBIL_WINDOW_S
    old_keys = [k for k in sybil_buckets if current_bucket - k[2] > 5]
    for k in old_keys:
        del sybil_buckets[k]

    count = len(sybil_buckets[bucket_key])
    return count >= SYBIL_MIN_WALLETS, count


# ── A2: Low-and-slow long-window scoring ──────────────────────────────────────
def score_long_window(hist_long: dict, sender: str, bt: int, W: int) -> float:
    """
    Check cumulative activity over long windows (5min, 1h).
    Returns a risk boost if unusual cumulative volume detected.
    """
    entries = hist_long[W].get(sender, [])
    if len(entries) < 5:
        return 0.0
    vals = [v for _, v, _ in entries]
    cnt  = len(vals)
    avg  = float(np.mean(vals))
    # Low-and-slow: many low-value txs over a long period
    if cnt >= 10 and avg < 0.01:
        return min(25.0, cnt * 1.5)
    # Gradual escalation: increasing values over time
    if cnt >= 6:
        first_half = vals[:cnt//2]
        second_half = vals[cnt//2:]
        if np.mean(second_half) > np.mean(first_half) * 2.0:
            return 15.0
    return 0.0


# ── Main loop ─────────────────────────────────────────────────────────────────
def main():
    # S6: Load private key from env if available
    private_key = os.environ.get("AGENT_PRIVATE_KEY", "")

    reputation = load_reputation()
    logj(event="agent_start",
         known_wallets=len(reputation),
         iforest=IFOREST_PATH.name,
         classifier=CLF_PATH.name,
         windows=WINDOWS,
         long_windows=WINDOWS_LONG,
         base_threshold=BASE_RISK_THRESHOLD,
         freeze_threshold=FREEZE_THRESHOLD)

    while True:
        try:
            w3       = connect(RPC)
            reg_abi  = load_abi("ABISRegistry")
            registry = w3.eth.contract(address=REGISTRY_ADDR, abi=reg_abi)

            # Determine admin account
            if private_key:
                account = w3.eth.account.from_key(private_key)
                admin   = account.address
                logj(event="using_private_key", admin=admin)
            else:
                admin = w3.eth.accounts[0]
                logj(event="using_default_account", admin=admin)

            logj(event="connected", admin=admin, registry=REGISTRY_ADDR)

            # Short-window history
            hist_w: dict[int, dict] = {W: defaultdict(list) for W in WINDOWS}
            # Long-window history (A2)
            hist_long: dict[int, dict] = {W: defaultdict(list) for W in WINDOWS_LONG}
            # Sybil detection buckets (A1)
            sybil_buckets: dict = {}

            last_action_ts:  dict[str, int] = {}
            last_action_lvl: dict[str, int] = {}
            last_block  = w3.eth.block_number
            blocks_seen = 0

            while True:
                current = w3.eth.block_number

                for bn in range(last_block + 1, current + 1):
                    block = w3.eth.get_block(bn, full_transactions=True)
                    bt    = int(block.timestamp)
                    blocks_seen += 1

                    for tx in block.transactions:
                        sender    = tx["from"].lower()
                        # Never score the admin/agent account itself
                        if sender == admin.lower():
                            continue
                        tx_to     = tx.to.lower() if tx.to else "none"
                        value_eth = int(tx["value"]) / 1e18
                        protocol  = PROTOCOL_MAP.get(tx_to, "External")
                        c_target  = is_contract(w3, tx.to) if tx.to else 0

                        # Update short windows
                        for W in WINDOWS:
                            hist_w[W][sender].append((bt, value_eth, tx_to))
                            hist_w[W][sender] = [
                                (t, v, a) for t, v, a in hist_w[W][sender]
                                if (bt - t) <= W
                            ]

                        # Update long windows (A2)
                        for W in WINDOWS_LONG:
                            hist_long[W][sender].append((bt, value_eth, tx_to))
                            hist_long[W][sender] = [
                                (t, v, a) for t, v, a in hist_long[W][sender]
                                if (bt - t) <= W
                            ]

                        tx_count_main = len(hist_w[30][sender])
                        if tx_count_main < MIN_EVENTS_FOR_SCORE:
                            continue

                        proto_code = PROTOCOL_CODE.get(protocol, 0)

                        # ── Score all short windows ───────────────────────
                        best_risk = best_window = 0
                        best_attack = "normal"; best_method = "iforest"
                        best_conf = None; best_cnt = tx_count_main
                        best_unique = 1; best_same = 0; best_row = None

                        for W in WINDOWS:
                            cnt_w, avg_w, std_w, dt_w, uniq_w, same_w = extract_features(
                                hist_w, sender, bt, tx_to, value_eth, W
                            )
                            if cnt_w < MIN_EVENTS_FOR_SCORE:
                                continue
                            row = build_row(cnt_w, avg_w, std_w, dt_w,
                                            value_eth, uniq_w, same_w, c_target, W,
                                            protocol_code=proto_code)
                            risk, attack, method, conf = hybrid_score(row)
                            if risk > best_risk:
                                best_risk   = risk
                                best_window = W
                                best_attack = attack
                                best_method = method
                                best_conf   = conf
                                best_cnt    = cnt_w
                                best_unique = uniq_w
                                best_same   = same_w
                                best_row    = row

                        # A2: Boost risk from long windows (low-and-slow)
                        long_boost = max(
                            score_long_window(hist_long, sender, bt, W)
                            for W in WINDOWS_LONG
                        )
                        if long_boost > 0:
                            logj(event="long_window_boost", sender=sender,
                                 boost=long_boost, original_risk=round(best_risk, 1))
                        best_risk = min(99.0, best_risk + long_boost)

                        # A1: Sybil coordination detection
                        is_coordinated, sybil_count = check_sybil_coordination(
                            sybil_buckets, sender, protocol, best_attack, bt
                        )
                        if is_coordinated:
                            sybil_boost = min(SYBIL_RISK_BOOST, sybil_count * 5)
                            best_risk   = min(99.0, best_risk + sybil_boost)
                            logj(event="sybil_detected", protocol=protocol,
                                 attack=best_attack, wallet_count=sybil_count,
                                 boost=sybil_boost)

                        # Cooldown with escalation bypass
                        cur_lvl  = (3 if best_risk >= FREEZE_THRESHOLD
                                    else 2 if best_risk >= BASE_RISK_THRESHOLD else 1)
                        prev_lvl = last_action_lvl.get(sender, 0)
                        if (sender in last_action_ts
                                and (bt - last_action_ts[sender]) < LOCAL_COOLDOWN_S
                                and cur_lvl <= prev_lvl):
                            continue

                        threshold = effective_threshold(reputation, sender)
                        rep_count = reputation.get(sender, {}).get("block_count", 0)

                        if best_risk < WARN_THRESHOLD or best_cnt < MIN_EVENTS_FOR_BLOCK:
                            continue

                        sender_cs = Web3.to_checksum_address(sender)

                        proto_addr = None
                        for addr, pname in PROTOCOL_MAP.items():
                            if pname == protocol:
                                proto_addr = Web3.to_checksum_address(addr)
                                break
                        is_known_proto = proto_addr is not None

                        already_frozen  = registry.functions.frozen(sender_cs).call()
                        already_blocked = registry.functions.isBlocked(sender_cs).call()
                        already_warned  = registry.functions.isWarned(sender_cs).call()

                        if already_frozen:
                            continue

                        # Build reason string
                        reason = (
                            f"protocol={protocol} "
                            f"attack_type={best_attack} "
                            f"method={best_method} "
                            f"risk={best_risk:.1f} "
                            f"window={best_window}s "
                            f"cnt{best_window}s={best_cnt} "
                            f"unique_to={best_unique} "
                            f"same_to={best_same}"
                        )
                        if best_conf is not None:
                            reason += f" confidence={best_conf:.3f}"
                        if rep_count > 0:
                            reason += f" repeat_offender={rep_count}"
                        if is_coordinated:
                            reason += f" sybil_wallets={sybil_count}"
                        if long_boost > 0:
                            reason += f" long_window_boost={long_boost:.1f}"

                        nonce = w3.eth.get_transaction_count(admin)

                        # ── Level 3: Freeze ───────────────────────────────
                        if best_risk >= FREEZE_THRESHOLD:
                            logj(event="FREEZE", sender=sender, risk=round(best_risk,1),
                                 attack=best_attack, protocol=protocol)
                            tx_b = registry.functions.freezeWallet(
                                sender_cs, int(best_risk), reason
                            ).build_transaction({"from": admin, "nonce": nonce, "gas": 350_000})
                            send_alert("FREEZE", sender, reason, best_risk)

                        # ── Level 2b / 2: Block ───────────────────────────
                        elif best_risk >= threshold:
                            if already_blocked:
                                continue
                            if is_known_proto:
                                already_pb = registry.functions.isBlockedOnProtocol(
                                    sender_cs, proto_addr
                                ).call()
                                if already_pb:
                                    continue
                                logj(event=f"BLOCK_PROTOCOL", sender=sender,
                                     protocol=protocol, risk=round(best_risk,1), attack=best_attack)
                                tx_b = registry.functions.blockWalletOnProtocol(
                                    sender_cs, proto_addr, BLOCK_SECONDS, int(best_risk), reason
                                ).build_transaction({"from": admin, "nonce": nonce, "gas": 350_000})
                            else:
                                logj(event="BLOCK_GLOBAL", sender=sender,
                                     risk=round(best_risk,1), attack=best_attack)
                                tx_b = registry.functions.blockWallet(
                                    sender_cs, BLOCK_SECONDS, int(best_risk), reason
                                ).build_transaction({"from": admin, "nonce": nonce, "gas": 350_000})
                                send_alert("BLOCK", sender, reason, best_risk)

                        # ── Level 1: Warn ─────────────────────────────────
                        else:
                            if already_warned or already_blocked:
                                continue
                            logj(event="WARN", sender=sender,
                                 risk=round(best_risk,1), attack=best_attack)
                            tx_b = registry.functions.warnWallet(
                                sender_cs, WARN_SECONDS, WARN_TX_DELAY, int(best_risk), reason
                            ).build_transaction({"from": admin, "nonce": nonce, "gas": 350_000})

                        if private_key:
                            signed = w3.eth.account.sign_transaction(tx_b, private_key)
                            receipt = w3.eth.wait_for_transaction_receipt(
                                w3.eth.send_raw_transaction(signed.raw_transaction)
                            )
                        else:
                            receipt = w3.eth.wait_for_transaction_receipt(
                                w3.eth.send_transaction(tx_b)
                            )

                        logj(event="tx_mined", tx=receipt.transactionHash.hex(),
                             block=receipt.blockNumber)

                        if best_risk >= threshold:
                            record_block(reputation, sender, bt)
                        if best_row is not None and best_attack not in ("normal", "unknown_anomaly"):
                            buffer_attack(best_row, best_attack)
                            maybe_retrain()

                        last_action_ts[sender]  = bt
                        last_action_lvl[sender] = cur_lvl

                last_block = current

                if blocks_seen % PURGE_EVERY_N_BLOCKS == 0 and blocks_seen > 0:
                    ts_now = int(w3.eth.get_block("latest")["timestamp"])
                    n1 = purge_inactive(hist_w, ts_now, HIST_PURGE_AGE_S)
                    n2 = purge_inactive(hist_long, ts_now, HIST_LONG_PURGE_S)
                    if n1 + n2:
                        logj(event="purge", short_purged=n1, long_purged=n2)

                time.sleep(1)

        except KeyboardInterrupt:
            logj(event="agent_stopped")
            break
        except Exception as exc:
            logj(event="fatal_error", error=str(exc))
            time.sleep(5)


if __name__ == "__main__":
    main()
