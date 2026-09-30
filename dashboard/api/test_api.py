"""
ABIS API — Integration Tests (T2+T3)
Requires: hardhat node running on :8545 with contracts deployed.
Run: cd /home/kali/ABIS/dashboard/api && pytest test_api.py -v
"""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# ── Health & Status ─────────────────────────────────────────────────────────
class TestHealth:
    def test_health_ok(self):
        r = client.get("/health")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] in ("ok", "degraded")
        assert "blockchain" in d
        assert "database" in d
        assert "version" in d

    def test_health_has_registry(self):
        r = client.get("/health")
        d = r.json()
        assert "registry" in d
        assert d["registry"].startswith("0x")

    def test_root_returns_api_info(self):
        r = client.get("/")
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "ABIS API"
        assert "version" in d

    def test_status_endpoint(self):
        r = client.get("/status")
        assert r.status_code == 200
        d = r.json()
        assert "connected" in d
        assert "latest_block" in d


# ── Protocols ────────────────────────────────────────────────────────────────
class TestProtocols:
    def test_protocols_returns_list(self):
        r = client.get("/protocols")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 4

    def test_protocols_have_required_fields(self):
        r = client.get("/protocols")
        for p in r.json():
            assert "key" in p
            assert "name" in p
            assert "address" in p
            assert p["address"].startswith("0x")


# ── Metrics ──────────────────────────────────────────────────────────────────
class TestMetrics:
    def test_metrics_returns_dict(self):
        r = client.get("/metrics")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict)

    def test_metrics_has_counts(self):
        r = client.get("/metrics")
        d = r.json()
        if d.get("connected", True):
            assert "incidentCount" in d
            assert "blockedCount" in d
            assert "frozenCount" in d
            assert "warnedCount" in d


# ── Incidents ────────────────────────────────────────────────────────────────
class TestIncidents:
    def test_incidents_returns_list(self):
        r = client.get("/incidents")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_incidents_pagination_limit(self):
        r = client.get("/incidents?limit=5")
        assert r.status_code == 200
        data = r.json()
        assert len(data) <= 5

    def test_incidents_invalid_limit(self):
        r = client.get("/incidents?limit=0")
        assert r.status_code == 422

    def test_incidents_filter_by_action(self):
        r = client.get("/incidents?action=FREEZE")
        assert r.status_code == 200

    def test_incidents_filter_by_wallet(self):
        r = client.get("/incidents?wallet=0x0000000000000000000000000000000000000001")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ── Wallet lists ─────────────────────────────────────────────────────────────
class TestWalletLists:
    def test_blocked_wallets_list(self):
        r = client.get("/blocked-wallets")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_frozen_wallets_list(self):
        r = client.get("/frozen-wallets")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_warned_wallets_list(self):
        r = client.get("/warned-wallets")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_protocol_blocks_list(self):
        r = client.get("/protocol-blocks")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_blocked_history_list(self):
        r = client.get("/blocked-history")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ── Timeline & Stats ─────────────────────────────────────────────────────────
class TestTimeline:
    def test_timeline_returns_list(self):
        r = client.get("/timeline")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats_structure(self):
        r = client.get("/stats")
        assert r.status_code == 200
        d = r.json()
        assert "attackTypeDistribution" in d
        assert "protocolDistribution" in d
        assert "actionDistribution" in d
        assert "topWallets" in d
        assert "riskBuckets" in d
        buckets = d["riskBuckets"]
        assert "critical" in buckets
        assert "high" in buckets
        assert "medium" in buckets
        assert "low" in buckets


# ── Address Validation ────────────────────────────────────────────────────────
class TestAddressValidation:
    def test_invalid_address_rejected(self):
        r = client.get("/wallet/notanaddress")
        assert r.status_code == 400

    def test_short_address_rejected(self):
        r = client.get("/wallet/0x1234")
        assert r.status_code == 400

    def test_valid_address_accepted(self):
        r = client.get("/wallet/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
        assert r.status_code in (200, 503)

    def test_invalid_unblock_address(self):
        r = client.post("/unblock/invalid_addr")
        assert r.status_code == 400


# ── Circuit Breaker ────────────────────────────────────────────────────────────
class TestCircuitBreaker:
    def test_get_circuit_breaker_status(self):
        r = client.get("/circuit-breaker")
        assert r.status_code in (200, 503)
        if r.status_code == 200:
            assert "paused" in r.json()

    def test_invalid_circuit_breaker_action(self):
        r = client.post("/circuit-breaker/invalid")
        assert r.status_code == 400


# ── Whitelist ─────────────────────────────────────────────────────────────────
class TestWhitelist:
    def test_get_whitelist(self):
        r = client.get("/whitelist")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_add_invalid_address_to_whitelist(self):
        r = client.post("/whitelist/0xBAD")
        assert r.status_code == 400

    def test_remove_invalid_address_from_whitelist(self):
        r = client.request("DELETE", "/whitelist/0xBAD")
        assert r.status_code == 400


# ── Rate Limiting ─────────────────────────────────────────────────────────────
class TestRateLimiting:
    def test_incidents_endpoint_accessible(self):
        r = client.get("/incidents?limit=1")
        assert r.status_code in (200, 429)
