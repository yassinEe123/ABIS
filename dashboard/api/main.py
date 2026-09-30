"""
ABIS Dashboard API v4.0
Improvements: SQLite cache, SSE push, CORS strict, rate limiting,
input validation, health check, whitelist/circuit-breaker endpoints,
stats endpoint, pagination.
"""
import asyncio
import json
import os
import re
import sqlite3
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sse_starlette.sse import EventSourceResponse
from web3 import Web3

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

# ── SQLite cache ──────────────────────────────────────────────────────────────
BASE_DIR      = Path(__file__).resolve().parent
DB_PATH       = BASE_DIR / "abis_cache.db"
DEPLOY_PATH   = (BASE_DIR / "../../blockchain/deployments/localhost.json").resolve()
ARTIFACTS_DIR = (BASE_DIR / "../../blockchain/artifacts/contracts").resolve()
BLOCKCHAIN_DIR = (BASE_DIR / "../../blockchain").resolve()
ATTACKS_META_PATH = BLOCKCHAIN_DIR / "scripts/attacks/attacks_meta.json"
REPUTATION_PATH = (BASE_DIR / "../../ai/data/wallet_reputation.json").resolve()
RPC = "http://127.0.0.1:8545"

# ── In-memory cache with TTL ──────────────────────────────────────────────────
_cache: Dict[str, Any] = {}
_cache_ts: Dict[str, float] = {}
CACHE_TTL = 2.0  # seconds

def cache_get(key: str):
    if key in _cache and (time.time() - _cache_ts.get(key, 0)) < CACHE_TTL:
        return _cache[key]
    return None

def cache_set(key: str, val: Any):
    _cache[key] = val
    _cache_ts[key] = time.time()

def cache_invalidate(key: str = None):
    if key:
        _cache.pop(key, None)
        _cache_ts.pop(key, None)
    else:
        _cache.clear()
        _cache_ts.clear()

# ── Protocol metadata ─────────────────────────────────────────────────────────
PROTOCOL_META = {
    "registry": {"name": "ABISRegistry", "type": "registry",  "description": "Global blocklist & enforcement"},
    "vault":    {"name": "DemoVault",    "type": "vault",     "description": "ETH deposit/withdraw vault"},
    "token":    {"name": "ABISToken",    "type": "token",     "description": "ERC-20 token (ABST)"},
    "dex":      {"name": "ABISDex",      "type": "dex",       "description": "ETH ↔ ABST swap DEX"},
    "lending":  {"name": "ABISLending",  "type": "lending",   "description": "ETH collateral + borrow"},
}

# ── Load deployment ───────────────────────────────────────────────────────────
with open(DEPLOY_PATH) as f:
    deployment = json.load(f)

REGISTRY_ADDR = Web3.to_checksum_address(deployment["registry"])
w3 = Web3(Web3.HTTPProvider(RPC))


def load_abi(name: str) -> list:
    files = list(ARTIFACTS_DIR.rglob(f"{name}.json"))
    if not files:
        raise FileNotFoundError(f"ABI not found: {name}")
    with open(files[0]) as f:
        return json.load(f)["abi"]


registry_abi = load_abi("ABISRegistry")
registry     = w3.eth.contract(address=REGISTRY_ADDR, abi=registry_abi)


# ── SQLite init ───────────────────────────────────────────────────────────────
def db_connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def db_init():
    con = db_connect()
    con.executescript("""
        CREATE TABLE IF NOT EXISTS incidents (
            block_number INTEGER,
            tx_hash TEXT,
            wallet TEXT,
            risk_score INTEGER,
            anomaly_type TEXT,
            action TEXT,
            protocol TEXT,
            attack_type TEXT,
            method TEXT,
            confidence REAL,
            PRIMARY KEY (tx_hash, wallet)
        );
        CREATE TABLE IF NOT EXISTS blocked_events (
            block_number INTEGER,
            tx_hash TEXT PRIMARY KEY,
            wallet TEXT,
            risk_score INTEGER,
            reason TEXT,
            until_ts INTEGER
        );
        CREATE TABLE IF NOT EXISTS frozen_events (
            block_number INTEGER,
            tx_hash TEXT PRIMARY KEY,
            wallet TEXT,
            risk_score INTEGER,
            reason TEXT
        );
        CREATE TABLE IF NOT EXISTS warned_events (
            block_number INTEGER,
            tx_hash TEXT PRIMARY KEY,
            wallet TEXT,
            risk_score INTEGER,
            reason TEXT,
            tx_delay INTEGER,
            warned_until INTEGER
        );
        CREATE TABLE IF NOT EXISTS protocol_blocked_events (
            block_number INTEGER,
            tx_hash TEXT,
            wallet TEXT,
            protocol TEXT,
            risk_score INTEGER,
            reason TEXT,
            until_ts INTEGER,
            PRIMARY KEY (tx_hash, wallet, protocol)
        );
        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_incidents_wallet ON incidents(wallet);
        CREATE INDEX IF NOT EXISTS idx_blocked_wallet ON blocked_events(wallet);
    """)
    con.commit()
    con.close()


def db_get_last_synced_block() -> int:
    con = db_connect()
    row = con.execute("SELECT value FROM sync_state WHERE key='last_block'").fetchone()
    con.close()
    return int(row["value"]) if row else 0


def db_set_last_synced_block(block: int):
    con = db_connect()
    con.execute("INSERT OR REPLACE INTO sync_state VALUES ('last_block', ?)", (str(block),))
    con.commit()
    con.close()


def sync_events(from_block: int = 0):
    """Fetch new blockchain events and persist to SQLite cache."""
    if not w3.is_connected():
        return
    to_block = w3.eth.block_number
    if from_block > to_block:
        return

    con = db_connect()
    try:
        # Incidents
        for e in registry.events.IncidentLogged().get_logs(from_block=from_block, to_block=to_block):
            a = e["args"]
            con.execute("""
                INSERT OR IGNORE INTO incidents
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (
                e["blockNumber"], e["transactionHash"].hex(),
                a["wallet"], int(a["riskScore"]), a["anomalyType"], a["action"],
                extract_protocol(a["anomalyType"]),
                extract_attack_type(a["anomalyType"]),
                extract_method(a["anomalyType"]),
                extract_confidence(a["anomalyType"]),
            ))

        # Blocked
        for e in registry.events.WalletBlocked().get_logs(from_block=from_block, to_block=to_block):
            a = e["args"]
            con.execute("""
                INSERT OR IGNORE INTO blocked_events VALUES (?,?,?,?,?,?)
            """, (
                e["blockNumber"], e["transactionHash"].hex(),
                a["wallet"], int(a["riskScore"]), a["reason"], int(a["until"]),
            ))

        # Frozen
        for e in registry.events.WalletFrozen().get_logs(from_block=from_block, to_block=to_block):
            a = e["args"]
            con.execute("""
                INSERT OR IGNORE INTO frozen_events VALUES (?,?,?,?,?)
            """, (
                e["blockNumber"], e["transactionHash"].hex(),
                a["wallet"], int(a["riskScore"]), a["reason"],
            ))

        # Warned
        for e in registry.events.WalletWarned().get_logs(from_block=from_block, to_block=to_block):
            a = e["args"]
            con.execute("""
                INSERT OR IGNORE INTO warned_events VALUES (?,?,?,?,?,?,?)
            """, (
                e["blockNumber"], e["transactionHash"].hex(),
                a["wallet"], int(a["riskScore"]), a["reason"],
                int(a["txDelay"]), int(a["until"]),
            ))

        # Protocol blocked
        for e in registry.events.WalletBlockedOnProtocol().get_logs(from_block=from_block, to_block=to_block):
            a = e["args"]
            con.execute("""
                INSERT OR IGNORE INTO protocol_blocked_events VALUES (?,?,?,?,?,?,?)
            """, (
                e["blockNumber"], e["transactionHash"].hex(),
                a["wallet"], a["protocol"],
                int(a["riskScore"]), a["reason"], int(a["until"]),
            ))

        con.commit()
        db_set_last_synced_block(to_block)
        cache_invalidate()
    finally:
        con.close()


# ── Background sync task ──────────────────────────────────────────────────────
_sync_task = None

async def _sync_loop():
    while True:
        try:
            last = db_get_last_synced_block()
            sync_events(from_block=max(0, last))
        except Exception:
            pass
        await asyncio.sleep(2)

@asynccontextmanager
async def lifespan(app: FastAPI):
    db_init()
    # Initial sync — respect saved cursor so history resets survive restarts
    try:
        last = db_get_last_synced_block()
        sync_events(from_block=max(0, last))
    except Exception:
        pass
    task = asyncio.create_task(_sync_loop())
    yield
    task.cancel()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="ABIS API", version="4.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# S11: Strict CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────
def validate_address(addr: str) -> str:
    """S16: Validate and checksum an Ethereum address."""
    if not re.match(r"^0x[a-fA-F0-9]{40}$", addr):
        raise HTTPException(400, f"Invalid Ethereum address: {addr}")
    return Web3.to_checksum_address(addr)

def latest_ts() -> int:
    return int(w3.eth.get_block("latest")["timestamp"])

def wallet_state(wallet: str) -> Dict[str, Any]:
    cs          = Web3.to_checksum_address(wallet)
    blocked     = registry.functions.isBlocked(cs).call()
    frozen      = registry.functions.frozen(cs).call()
    warned      = registry.functions.isWarned(cs).call()
    until       = int(registry.functions.blockedUntil(cs).call())
    warned_until= int(registry.functions.warnedUntil(cs).call())
    tx_delay    = int(registry.functions.minTxDelay(cs).call())
    whitelisted = registry.functions.whitelist(cs).call()
    reputation  = int(registry.functions.reputationScore(cs).call())
    incidents   = int(registry.functions.incidentCount(cs).call())
    now         = latest_ts()
    return {
        "wallet":               cs,
        "isBlockedNow":         blocked,
        "isFrozen":             frozen,
        "isWarned":             warned,
        "isWhitelisted":        whitelisted,
        "until":                until,
        "warnedUntil":          warned_until,
        "txDelay":              tx_delay,
        "secondsRemaining":     max(0, until - now) if blocked and not frozen else 0,
        "warnSecondsRemaining": max(0, warned_until - now) if warned else 0,
        "onChainReputation":    reputation,
        "onChainIncidents":     incidents,
    }

def extract_protocol(reason: str) -> str:
    if not reason: return "Unknown"
    m = re.search(r"protocol=(\w+)", reason)
    return m.group(1) if m else "Vault"

def extract_attack_type(reason: str) -> str:
    if not reason: return "unknown_anomaly"
    m = re.search(r"attack_type=([\w_]+)", reason)
    at = m.group(1) if m else "unknown_anomaly"
    return "unknown_anomaly" if at == "normal" else at

def extract_method(reason: str) -> str:
    if not reason: return "iforest"
    m = re.search(r"method=([\w+]+)", reason)
    return m.group(1) if m else "iforest"

def extract_confidence(reason: str) -> Optional[float]:
    if not reason: return None
    m = re.search(r"confidence=([\d.]+)", reason)
    return float(m.group(1)) if m else None

def extract_window(reason: str) -> int:
    if not reason: return 30
    m = re.search(r"window=(\d+)s", reason)
    return int(m.group(1)) if m else 30

def extract_repeat(reason: str) -> int:
    if not reason: return 0
    m = re.search(r"repeat_offender=(\d+)", reason)
    return int(m.group(1)) if m else 0

def load_reputation() -> dict:
    if REPUTATION_PATH.exists():
        with open(REPUTATION_PATH) as f:
            return json.load(f)
    return {}


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
def health():
    """I6: Health check — shows status of every component."""
    connected = w3.is_connected()
    db_ok = DB_PATH.exists()
    last_block = w3.eth.block_number if connected else None
    paused = False
    if connected:
        try:
            paused = registry.functions.paused().call()
        except Exception:
            pass
    return {
        "status":       "ok" if connected else "degraded",
        "blockchain":   connected,
        "database":     db_ok,
        "registry":     REGISTRY_ADDR,
        "latest_block": last_block,
        "circuit_breaker_active": paused,
        "version":      "4.0.0",
    }


@app.get("/")
def root():
    connected = w3.is_connected()
    return {
        "name":         "ABIS API",
        "version":      "4.0.0",
        "connected":    connected,
        "registry":     REGISTRY_ADDR,
        "latest_block": w3.eth.block_number if connected else None,
        "protocols":    len([k for k in deployment if k != "registry"]),
    }


@app.get("/status")
def status():
    connected = w3.is_connected()
    paused = False
    if connected:
        try: paused = registry.functions.paused().call()
        except Exception: pass
    return {
        "connected":    connected,
        "latest_block": w3.eth.block_number if connected else None,
        "registry":     REGISTRY_ADDR,
        "paused":       paused,
    }


@app.get("/protocols")
def protocols():
    connected = w3.is_connected()
    result = []
    for key, meta in PROTOCOL_META.items():
        addr = deployment.get(key)
        if not addr: continue
        result.append({
            "key":         key,
            "name":        meta["name"],
            "type":        meta["type"],
            "description": meta["description"],
            "address":     Web3.to_checksum_address(addr),
            "connected":   connected,
        })
    return result


@app.get("/metrics")
def metrics():
    cached = cache_get("metrics")
    if cached: return cached

    if not w3.is_connected():
        return {"connected": False}

    con = db_connect()
    inc_count  = con.execute("SELECT COUNT(*) FROM incidents").fetchone()[0]
    blk_count  = con.execute("SELECT COUNT(DISTINCT tx_hash) FROM blocked_events").fetchone()[0]
    frz_count  = con.execute("SELECT COUNT(DISTINCT wallet) FROM frozen_events").fetchone()[0]
    wrn_count  = con.execute("SELECT COUNT(DISTINCT wallet) FROM warned_events").fetchone()[0]
    pb_count   = con.execute("SELECT COUNT(*) FROM protocol_blocked_events").fetchone()[0]
    con.close()

    # Live counts from chain for accuracy
    active_blocked = len(_active_blocked_list())
    frozen_list    = len(_frozen_list())
    warned_list    = len(_warned_list())
    proto_list     = len(_protocol_blocked_list())

    result = {
        "connected":          True,
        "latestBlock":        w3.eth.block_number,
        "incidentCount":      inc_count,
        "blockedCount":       active_blocked,
        "frozenCount":        frozen_list,
        "warnedCount":        warned_list,
        "protocolBlockCount": proto_list,
        "blockedHistoryCount":blk_count,
        "unblockedCount":     con_count_unblocked(),
    }
    cache_set("metrics", result)
    return result

def con_count_unblocked():
    try:
        events = registry.events.WalletUnblocked().get_logs(from_block=0, to_block="latest")
        return len(events)
    except Exception:
        return 0


@app.get("/incidents")
@limiter.limit("60/minute")
def incidents(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    page: int  = Query(1, ge=1),
    wallet: Optional[str] = None,
    protocol: Optional[str] = None,
    action: Optional[str] = None,
    attack_type: Optional[str] = None,
):
    """I3: Paginated, filterable incident log from SQLite cache."""
    if not w3.is_connected():
        return []

    con = db_connect()
    q   = "SELECT * FROM incidents WHERE 1=1"
    params: list = []
    if wallet:
        q += " AND LOWER(wallet)=LOWER(?)"
        params.append(wallet)
    if protocol:
        q += " AND protocol=?"
        params.append(protocol)
    if action:
        q += " AND action=?"
        params.append(action)
    if attack_type:
        q += " AND attack_type=?"
        params.append(attack_type)

    q += " ORDER BY block_number DESC LIMIT ? OFFSET ?"
    params += [limit, (page - 1) * limit]

    rows = con.execute(q, params).fetchall()
    con.close()

    return [dict(r) | {"blockNumber": r["block_number"], "txHash": r["tx_hash"],
                        "riskScore": r["risk_score"], "anomalyType": r["anomaly_type"],
                        "attackType": r["attack_type"]} for r in rows]


@app.get("/blocked-wallets")
def blocked_wallets(
    limit: int = Query(50, ge=1, le=200),
    active_only: bool = True,
):
    if not w3.is_connected(): return []
    return _active_blocked_list(limit) if active_only else _full_blocked_list(limit)


@app.get("/blocked-history")
def blocked_history(limit: int = Query(50, ge=1, le=200)):
    if not w3.is_connected(): return []
    return _full_blocked_list(limit)


@app.get("/frozen-wallets")
def frozen_wallets(limit: int = Query(50, ge=1, le=200)):
    if not w3.is_connected(): return []
    return _frozen_list(limit)


@app.get("/warned-wallets")
def warned_wallets(limit: int = Query(50, ge=1, le=200)):
    if not w3.is_connected(): return []
    return _warned_list(limit)


@app.get("/protocol-blocks")
def protocol_blocks(limit: int = Query(50, ge=1, le=200)):
    if not w3.is_connected(): return []
    return _protocol_blocked_list(limit)


@app.get("/timeline")
def timeline(limit: int = Query(80, ge=1, le=500)):
    if not w3.is_connected(): return []
    con = db_connect()
    rows = con.execute(
        "SELECT block_number, risk_score, wallet, action, protocol "
        "FROM incidents ORDER BY block_number DESC LIMIT ?", (limit,)
    ).fetchall()
    con.close()
    return [{"block": r["block_number"], "risk": r["risk_score"],
             "wallet": r["wallet"], "action": r["action"],
             "protocol": r["protocol"]} for r in rows]


@app.get("/stats")
def stats():
    """Statistics endpoint for the dashboard Stats page."""
    cached = cache_get("stats")
    if cached: return cached

    con = db_connect()

    # Attack type distribution
    atk_dist = con.execute(
        "SELECT attack_type, COUNT(*) as cnt FROM incidents "
        "WHERE attack_type IS NOT NULL GROUP BY attack_type ORDER BY cnt DESC"
    ).fetchall()

    # Protocol distribution
    proto_dist = con.execute(
        "SELECT protocol, COUNT(*) as cnt FROM incidents GROUP BY protocol ORDER BY cnt DESC"
    ).fetchall()

    # Action distribution
    action_dist = con.execute(
        "SELECT action, COUNT(*) as cnt FROM incidents GROUP BY action ORDER BY cnt DESC"
    ).fetchall()

    # Top wallets by incident count
    top_wallets = con.execute(
        "SELECT wallet, COUNT(*) as cnt, MAX(risk_score) as max_risk "
        "FROM incidents GROUP BY wallet ORDER BY cnt DESC LIMIT 10"
    ).fetchall()

    # Risk score buckets
    risk_buckets = {
        "critical": con.execute("SELECT COUNT(*) FROM incidents WHERE risk_score >= 90").fetchone()[0],
        "high":     con.execute("SELECT COUNT(*) FROM incidents WHERE risk_score >= 70 AND risk_score < 90").fetchone()[0],
        "medium":   con.execute("SELECT COUNT(*) FROM incidents WHERE risk_score >= 40 AND risk_score < 70").fetchone()[0],
        "low":      con.execute("SELECT COUNT(*) FROM incidents WHERE risk_score < 40").fetchone()[0],
    }

    # Timeline by block (last 100 blocks with incidents)
    timeline_data = con.execute(
        "SELECT block_number, COUNT(*) as cnt, MAX(risk_score) as max_risk "
        "FROM incidents GROUP BY block_number ORDER BY block_number DESC LIMIT 100"
    ).fetchall()

    con.close()

    result = {
        "attackTypeDistribution": [{"type": r["attack_type"], "count": r["cnt"]} for r in atk_dist],
        "protocolDistribution":   [{"protocol": r["protocol"], "count": r["cnt"]} for r in proto_dist],
        "actionDistribution":     [{"action": r["action"], "count": r["cnt"]} for r in action_dist],
        "topWallets":             [{"wallet": r["wallet"], "count": r["cnt"], "maxRisk": r["max_risk"]} for r in top_wallets],
        "riskBuckets":            risk_buckets,
        "timelineByBlock":        [{"block": r["block_number"], "count": r["cnt"], "maxRisk": r["max_risk"]} for r in timeline_data],
    }
    cache_set("stats", result)
    return result


@app.get("/reputation")
def reputation_list():
    rep = load_reputation()
    return [{"wallet": k, **v}
            for k, v in sorted(rep.items(), key=lambda x: -x[1].get("block_count", 0))]


@app.get("/wallet/{address}")
def wallet_status(address: str):
    if not w3.is_connected():
        raise HTTPException(503, "Blockchain not connected")
    cs = validate_address(address)

    state = wallet_state(cs)

    con = db_connect()
    rows = con.execute(
        "SELECT * FROM incidents WHERE LOWER(wallet)=LOWER(?) ORDER BY block_number DESC",
        (cs,)
    ).fetchall()
    con.close()

    wallet_incidents = [
        {
            "blockNumber": r["block_number"],
            "txHash":      r["tx_hash"],
            "riskScore":   r["risk_score"],
            "anomalyType": r["anomaly_type"],
            "protocol":    r["protocol"],
            "attackType":  r["attack_type"],
            "method":      r["method"],
            "confidence":  r["confidence"],
            "action":      r["action"],
        }
        for r in rows
    ]

    rep = load_reputation()
    rep_entry = rep.get(cs.lower(), rep.get(cs, {}))
    return {**state, "incidents": wallet_incidents, "reputation": rep_entry}


@app.get("/wallet-profile/{address}")
def wallet_profile(address: str):
    """C9: Full on-chain profile in a single registry call."""
    if not w3.is_connected():
        raise HTTPException(503, "Blockchain not connected")
    cs = validate_address(address)
    try:
        profile = registry.functions.getWalletProfile(cs).call()
        return {
            "wallet":       cs,
            "frozen":       profile[0],
            "blocked":      profile[1],
            "warned":       profile[2],
            "blockedUntil": profile[3],
            "warnedUntil":  profile[4],
            "txDelay":      profile[5],
            "reputation":   profile[6],
            "incidents":    profile[7],
            "whitelisted":  profile[8],
            "paused":       profile[9],
        }
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Whitelist endpoints ───────────────────────────────────────────────────────
@app.get("/whitelist")
def get_whitelist():
    """C1: Get current whitelist from on-chain events."""
    if not w3.is_connected():
        raise HTTPException(503, "Blockchain not connected")
    events = registry.events.WhitelistUpdated().get_logs(from_block=0, to_block="latest")
    current: Dict[str, bool] = {}
    for e in events:
        current[e["args"]["wallet"].lower()] = e["args"]["added"]
    return [{"wallet": w, "whitelisted": s} for w, s in current.items() if s]


@app.post("/whitelist/{address}")
def add_to_whitelist(address: str):
    """C1: Add wallet to whitelist (bypasses all enforcement)."""
    if not w3.is_connected():
        raise HTTPException(503, "Blockchain not connected")
    cs = validate_address(address)
    try:
        admin = w3.eth.accounts[0]
        nonce = w3.eth.get_transaction_count(admin)
        tx = registry.functions.addToWhitelist(cs).build_transaction(
            {"from": admin, "nonce": nonce, "gas": 100_000}
        )
        receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_transaction(tx))
        cache_invalidate()
        return {"success": True, "wallet": cs, "txHash": receipt.transactionHash.hex()}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.delete("/whitelist/{address}")
def remove_from_whitelist(address: str):
    """C1: Remove wallet from whitelist."""
    if not w3.is_connected():
        raise HTTPException(503, "Blockchain not connected")
    cs = validate_address(address)
    try:
        admin = w3.eth.accounts[0]
        nonce = w3.eth.get_transaction_count(admin)
        tx = registry.functions.removeFromWhitelist(cs).build_transaction(
            {"from": admin, "nonce": nonce, "gas": 100_000}
        )
        receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_transaction(tx))
        cache_invalidate()
        return {"success": True, "wallet": cs, "txHash": receipt.transactionHash.hex()}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Circuit breaker ───────────────────────────────────────────────────────────
@app.get("/circuit-breaker")
def circuit_breaker_status():
    """C4: Get circuit breaker state."""
    if not w3.is_connected():
        raise HTTPException(503, "Blockchain not connected")
    paused = registry.functions.paused().call()
    return {"paused": paused}


@app.post("/circuit-breaker/{action}")
def circuit_breaker(action: str):
    """C4: Pause or unpause all enforcement."""
    if action not in ("pause", "unpause"):
        raise HTTPException(400, "Action must be 'pause' or 'unpause'")
    if not w3.is_connected():
        raise HTTPException(503, "Blockchain not connected")
    try:
        admin = w3.eth.accounts[0]
        nonce = w3.eth.get_transaction_count(admin)
        tx = registry.functions.setPaused(action == "pause").build_transaction(
            {"from": admin, "nonce": nonce, "gas": 80_000}
        )
        receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_transaction(tx))
        cache_invalidate()
        return {"success": True, "paused": action == "pause",
                "txHash": receipt.transactionHash.hex()}
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Unblock / Unfreeze ────────────────────────────────────────────────────────
@app.post("/unblock/{address}")
def unblock_wallet(address: str):
    if not w3.is_connected():
        raise HTTPException(503, "Blockchain not connected")
    cs = validate_address(address)
    try:
        admin      = w3.eth.accounts[0]
        is_blocked = registry.functions.isBlocked(cs).call()
        is_warned  = registry.functions.isWarned(cs).call()
        receipt    = None

        if is_blocked or is_warned:
            nonce   = w3.eth.get_transaction_count(admin)
            tx      = registry.functions.unblockWallet(cs).build_transaction(
                {"from": admin, "nonce": nonce, "gas": 250_000})
            receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_transaction(tx))

        # Always clear per-protocol blocks (protocolBlockedUntil is independent of global block)
        dep = json.loads((Path(__file__).parent.parent.parent / "blockchain/deployments/localhost.json").read_text())
        for proto_addr in [dep.get("vault"), dep.get("token"), dep.get("dex"), dep.get("lending")]:
            if not proto_addr:
                continue
            try:
                nonce = w3.eth.get_transaction_count(admin)
                ptx = registry.functions.unblockFromProtocol(cs, proto_addr).build_transaction(
                    {"from": admin, "nonce": nonce, "gas": 100_000})
                w3.eth.wait_for_transaction_receipt(w3.eth.send_transaction(ptx))
            except Exception as proto_err:
                import logging as _log
                _log.getLogger("uvicorn.error").warning(f"unblockFromProtocol failed for {cs}/{proto_addr}: {proto_err}")

        cache_invalidate()
        return {
            "success": True,
            "wallet":  cs,
            "txHash":  receipt.transactionHash.hex() if receipt else None,
            "message": "Wallet unblocked successfully",
            "state":   wallet_state(cs),
        }
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/unfreeze/{address}")
def unfreeze_wallet(address: str):
    return unblock_wallet(address)


# ── SSE — Server-Sent Events ──────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════
# ATTACK DEMO ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

_VALID_ATTACK_IDS: set = set()

def _load_attacks_meta() -> List[Dict]:
    if ATTACKS_META_PATH.exists():
        data = json.loads(ATTACKS_META_PATH.read_text())
        _VALID_ATTACK_IDS.update(a["id"] for a in data)
        return data
    return []

_attacks_meta_cache: List[Dict] = []

@app.get("/attack/list")
def attack_list():
    global _attacks_meta_cache
    if not _attacks_meta_cache:
        _attacks_meta_cache = _load_attacks_meta()
    return _attacks_meta_cache


class AttackRequest(BaseModel):
    attack: str
    attacker_index: int = 2
    target_wallet: int = 10
    target_contract: str = "vault"


@app.post("/attack/run")
async def run_attack(req: AttackRequest):
    # Reload valid IDs if needed
    if not _VALID_ATTACK_IDS:
        _load_attacks_meta()

    # Security: validate attack name
    if req.attack not in _VALID_ATTACK_IDS or ".." in req.attack or "/" in req.attack:
        raise HTTPException(status_code=400, detail="Unknown attack")
    if not (0 <= req.attacker_index <= 19):
        raise HTTPException(status_code=400, detail="attacker_index must be 0-19")
    if not (0 <= req.target_wallet <= 19):
        raise HTTPException(status_code=400, detail="target_wallet must be 0-19")
    if req.target_contract not in ("vault", "dex", "lending", "token"):
        raise HTTPException(status_code=400, detail="Invalid target_contract")

    script_path = BLOCKCHAIN_DIR / "scripts" / "attacks" / f"{req.attack}.js"
    if not script_path.exists():
        raise HTTPException(status_code=404, detail="Script not found")

    # Use the attack's default contract from meta if caller left it at default "vault"
    target_contract = req.target_contract
    if target_contract == "vault":
        meta = next((a for a in _load_attacks_meta() if a["id"] == req.attack), None)
        if meta and meta.get("contract") and meta["contract"] in ("vault", "dex", "lending", "token"):
            target_contract = meta["contract"]

    env = {
        **os.environ,
        "ABIS_ATTACKER":        str(req.attacker_index),
        "ABIS_TARGET_WALLET":   str(req.target_wallet),
        "ABIS_TARGET_CONTRACT": target_contract,
        "FORCE_COLOR": "0",
        "NO_COLOR":    "1",
    }

    async def generate():
        try:
            proc = await asyncio.create_subprocess_exec(
                "npx", "hardhat", "run",
                f"scripts/attacks/{req.attack}.js",
                "--network", "localhost",
                cwd=str(BLOCKCHAIN_DIR),
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            async for raw in proc.stdout:
                line = raw.decode("utf-8", errors="replace").rstrip()
                # Strip ANSI escape codes
                line = re.sub(r'\x1b\[[0-9;]*m', '', line)
                if line:
                    yield f"data: {json.dumps({'line': line})}\n\n"
            await proc.wait()
            yield f"data: {json.dumps({'done': True, 'exit_code': proc.returncode})}\n\n"
        except Exception as ex:
            yield f"data: {json.dumps({'error': str(ex), 'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/events/stream")
async def event_stream(request: Request):
    """U1: Real-time push via SSE — replaces 3s polling."""
    async def generator():
        last_incident_count = 0
        last_metrics = {}

        while True:
            if await request.is_disconnected():
                break
            try:
                if w3.is_connected():
                    # Sync new events
                    last = db_get_last_synced_block()
                    sync_events(from_block=max(0, last))

                    # Compute metrics
                    m = metrics()
                    if m != last_metrics:
                        yield {"event": "metrics", "data": json.dumps(m)}
                        last_metrics = dict(m)

                    # Check for new incidents
                    con = db_connect()
                    cnt = con.execute("SELECT COUNT(*) FROM incidents").fetchone()[0]
                    con.close()
                    if cnt > last_incident_count and last_incident_count > 0:
                        # Get the newest incidents
                        new_inc = incidents.__wrapped__(
                            limit=cnt - last_incident_count, page=1
                        ) if hasattr(incidents, '__wrapped__') else []
                        yield {"event": "new_incidents",
                               "data": json.dumps({"count": cnt - last_incident_count})}
                    last_incident_count = cnt

            except Exception as e:
                yield {"event": "error", "data": json.dumps({"error": str(e)})}

            await asyncio.sleep(2)

    return EventSourceResponse(generator())


# ══════════════════════════════════════════════════════════════════════════════
# INTERNAL LIST BUILDERS
# ══════════════════════════════════════════════════════════════════════════════

def _active_blocked_list(limit: int = 50) -> List[Dict[str, Any]]:
    con = db_connect()
    rows = con.execute(
        "SELECT * FROM blocked_events ORDER BY block_number DESC"
    ).fetchall()
    con.close()

    seen: Dict[str, Dict] = {}
    for r in rows:
        key = r["wallet"].lower()
        st  = wallet_state(r["wallet"])
        reason = r["reason"]
        seen[key] = {
            "wallet":         r["wallet"],
            "riskScore":      r["risk_score"],
            "reason":         reason,
            "protocol":       extract_protocol(reason),
            "attackType":     extract_attack_type(reason),
            "method":         extract_method(reason),
            "confidence":     extract_confidence(reason),
            "window":         extract_window(reason),
            "repeatOffender": extract_repeat(reason),
            "blockNumber":    r["block_number"],
            "txHash":         r["tx_hash"],
            **{k: st[k] for k in ("until", "isBlockedNow", "isFrozen", "secondsRemaining")},
        }

    items = [v for v in seen.values() if v["isBlockedNow"] and not v["isFrozen"]]
    items.sort(key=lambda x: x["blockNumber"], reverse=True)
    return items[:limit]


def _full_blocked_list(limit: int = 50) -> List[Dict[str, Any]]:
    con = db_connect()
    rows = con.execute(
        "SELECT * FROM blocked_events ORDER BY block_number DESC LIMIT ?", (limit,)
    ).fetchall()
    con.close()

    items = []
    for r in rows:
        st = wallet_state(r["wallet"])
        reason = r["reason"]
        items.append({
            "wallet":      r["wallet"],
            "riskScore":   r["risk_score"],
            "reason":      reason,
            "protocol":    extract_protocol(reason),
            "attackType":  extract_attack_type(reason),
            "method":      extract_method(reason),
            "confidence":  extract_confidence(reason),
            "blockNumber": r["block_number"],
            "txHash":      r["tx_hash"],
            **{k: st[k] for k in ("until", "isBlockedNow", "isFrozen", "secondsRemaining")},
        })
    return items


def _frozen_list(limit: int = 50) -> List[Dict[str, Any]]:
    con = db_connect()
    rows = con.execute(
        "SELECT * FROM frozen_events ORDER BY block_number DESC"
    ).fetchall()
    con.close()

    seen: Dict[str, Dict] = {}
    for r in rows:
        key = r["wallet"].lower()
        st  = wallet_state(r["wallet"])
        if st["isFrozen"]:
            reason = r["reason"]
            seen[key] = {
                "wallet":      r["wallet"],
                "riskScore":   r["risk_score"],
                "reason":      reason,
                "protocol":    extract_protocol(reason),
                "attackType":  extract_attack_type(reason),
                "method":      extract_method(reason),
                "confidence":  extract_confidence(reason),
                "blockNumber": r["block_number"],
                "txHash":      r["tx_hash"],
                "isFrozen":    True,
            }

    items = list(seen.values())
    items.sort(key=lambda x: x["blockNumber"], reverse=True)
    return items[:limit]


def _warned_list(limit: int = 50) -> List[Dict[str, Any]]:
    con = db_connect()
    rows = con.execute(
        "SELECT * FROM warned_events ORDER BY block_number DESC"
    ).fetchall()
    con.close()

    seen: Dict[str, Dict] = {}
    for r in rows:
        key = r["wallet"].lower()
        st  = wallet_state(r["wallet"])
        if st["isWarned"]:
            reason = r["reason"]
            seen[key] = {
                "wallet":               r["wallet"],
                "riskScore":            r["risk_score"],
                "reason":               reason,
                "protocol":             extract_protocol(reason),
                "attackType":           extract_attack_type(reason),
                "method":               extract_method(reason),
                "confidence":           extract_confidence(reason),
                "txDelay":              r["tx_delay"],
                "blockNumber":          r["block_number"],
                "txHash":               r["tx_hash"],
                "warnedUntil":          st["warnedUntil"],
                "warnSecondsRemaining": st["warnSecondsRemaining"],
            }

    items = list(seen.values())
    items.sort(key=lambda x: x["blockNumber"], reverse=True)
    return items[:limit]


def _protocol_blocked_list(limit: int = 50) -> List[Dict[str, Any]]:
    con = db_connect()
    rows = con.execute(
        "SELECT * FROM protocol_blocked_events ORDER BY block_number DESC"
    ).fetchall()
    con.close()

    seen: Dict[str, Dict] = {}
    now = latest_ts()
    for r in rows:
        key          = f"{r['wallet'].lower()}:{r['protocol'].lower()}"
        wallet_cs    = Web3.to_checksum_address(r["wallet"])
        protocol_cs  = Web3.to_checksum_address(r["protocol"])
        until        = int(registry.functions.protocolBlockedUntil(wallet_cs, protocol_cs).call())
        if until > now:
            reason = r["reason"]
            seen[key] = {
                "wallet":           r["wallet"],
                "protocol":         r["protocol"],
                "riskScore":        r["risk_score"],
                "reason":           reason,
                "attackType":       extract_attack_type(reason),
                "method":           extract_method(reason),
                "confidence":       extract_confidence(reason),
                "until":            until,
                "secondsRemaining": max(0, until - now),
                "blockNumber":      r["block_number"],
                "txHash":           r["tx_hash"],
            }

    items = list(seen.values())
    items.sort(key=lambda x: x["blockNumber"], reverse=True)
    return items[:limit]
