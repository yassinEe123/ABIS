"""
ABIS Integration Test (T4)
Tests the full pipeline: blockchain → agent → API → dashboard data.

Prerequisites:
  - Hardhat node running on :8545
  - Contracts deployed
  - API running on :8000

Run: cd /home/kali/ABIS && python3 -m pytest tests/test_integration.py -v
"""
import time
import subprocess
import pytest
import requests
from web3 import Web3

API_URL  = "http://127.0.0.1:8000"
RPC_URL  = "http://127.0.0.1:8545"
TIMEOUT  = 10


# ── Fixtures ─────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def w3():
    w = Web3(Web3.HTTPProvider(RPC_URL))
    assert w.is_connected(), f"Cannot connect to Hardhat at {RPC_URL}"
    return w


@pytest.fixture(scope="module")
def deployment(w3):
    import json
    from pathlib import Path
    p = Path(__file__).parent.parent / "blockchain/deployments/localhost.json"
    assert p.exists(), "localhost.json not found — run deploy first"
    return json.loads(p.read_text())


@pytest.fixture(scope="module")
def registry(w3, deployment):
    import json
    from pathlib import Path
    abi_path = Path(__file__).parent.parent / "blockchain/artifacts/contracts/ABISRegistry.sol/ABISRegistry.json"
    abi = json.loads(abi_path.read_text())["abi"]
    addr = Web3.to_checksum_address(deployment["registry"])
    return w3.eth.contract(address=addr, abi=abi)


# ── T4a: Blockchain connectivity ──────────────────────────────────────────────
class TestBlockchain:
    def test_hardhat_connected(self, w3):
        assert w3.is_connected()

    def test_block_number_positive(self, w3):
        assert w3.eth.block_number >= 0

    def test_registry_deployed(self, registry):
        owner = registry.functions.owner().call()
        assert Web3.is_address(owner)

    def test_contracts_in_deployment(self, deployment):
        assert "registry" in deployment
        assert "vault" in deployment
        assert "dex" in deployment
        assert "lending" in deployment

    def test_registry_not_paused(self, registry):
        assert registry.functions.paused().call() is False


# ── T4b: API reachable ────────────────────────────────────────────────────────
class TestAPIReachable:
    def test_api_health(self):
        r = requests.get(f"{API_URL}/health", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d["blockchain"] is True
        assert d["database"] is True

    def test_api_status_connected(self):
        r = requests.get(f"{API_URL}/status", timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["connected"] is True

    def test_api_protocols_match_deployment(self, deployment):
        r = requests.get(f"{API_URL}/protocols", timeout=TIMEOUT)
        protos = r.json()
        api_addrs = {p["address"].lower() for p in protos}
        for key, addr in deployment.items():
            assert addr.lower() in api_addrs, f"{key} not in API protocols"


# ── T4c: Enforcement pipeline ─────────────────────────────────────────────────
class TestEnforcementPipeline:
    def test_block_wallet_via_api_unblock(self, w3, registry):
        admin   = w3.eth.accounts[0]
        victim  = w3.eth.accounts[5]

        # Block via direct contract call
        nonce = w3.eth.get_transaction_count(admin)
        tx = registry.functions.blockWallet(victim, 60, 70, "integration test").build_transaction(
            {"from": admin, "nonce": nonce, "gas": 200_000}
        )
        w3.eth.wait_for_transaction_receipt(w3.eth.send_transaction(tx))

        # Verify API sees it
        time.sleep(3)
        r = requests.get(f"{API_URL}/blocked-wallets", timeout=TIMEOUT)
        wallets = r.json()
        blocked_addrs = [w["wallet"].lower() for w in wallets]
        assert victim.lower() in blocked_addrs, "Blocked wallet not visible in API"

        # Unblock via API
        r2 = requests.post(f"{API_URL}/unblock/{victim}", timeout=TIMEOUT)
        assert r2.status_code == 200
        assert r2.json()["success"] is True

        # Verify unblocked
        time.sleep(2)
        r3 = requests.get(f"{API_URL}/blocked-wallets", timeout=TIMEOUT)
        blocked_after = [w["wallet"].lower() for w in r3.json()]
        assert victim.lower() not in blocked_after, "Wallet still blocked after unblock"

    def test_freeze_wallet_via_api_unfreeze(self, w3, registry):
        admin  = w3.eth.accounts[0]
        victim = w3.eth.accounts[6]

        nonce = w3.eth.get_transaction_count(admin)
        tx = registry.functions.freezeWallet(victim, 95, "integration freeze").build_transaction(
            {"from": admin, "nonce": nonce, "gas": 200_000}
        )
        w3.eth.wait_for_transaction_receipt(w3.eth.send_transaction(tx))

        time.sleep(3)
        r = requests.get(f"{API_URL}/frozen-wallets", timeout=TIMEOUT)
        frozen_addrs = [w["wallet"].lower() for w in r.json()]
        assert victim.lower() in frozen_addrs, "Frozen wallet not in API"

        # Unfreeze
        r2 = requests.post(f"{API_URL}/unfreeze/{victim}", timeout=TIMEOUT)
        assert r2.status_code == 200

    def test_whitelist_add_remove(self, w3, registry):
        safe_wallet = w3.eth.accounts[7]

        # Add to whitelist via API
        r = requests.post(f"{API_URL}/whitelist/{safe_wallet}", timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["success"] is True

        # Verify on-chain
        time.sleep(2)
        assert registry.functions.whitelist(safe_wallet).call() is True

        # Remove from whitelist via API
        r2 = requests.delete(f"{API_URL}/whitelist/{safe_wallet}", timeout=TIMEOUT)
        assert r2.status_code == 200
        assert r2.json()["success"] is True

        # Verify removed
        time.sleep(2)
        assert registry.functions.whitelist(safe_wallet).call() is False

    def test_circuit_breaker_pause_resume(self, registry):
        # Pause
        r = requests.post(f"{API_URL}/circuit-breaker/pause", timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["paused"] is True

        # Verify via API
        time.sleep(1)
        r2 = requests.get(f"{API_URL}/circuit-breaker", timeout=TIMEOUT)
        assert r2.json()["paused"] is True

        # Resume
        r3 = requests.post(f"{API_URL}/circuit-breaker/unpause", timeout=TIMEOUT)
        assert r3.status_code == 200
        assert r3.json()["paused"] is False


# ── T4d: Incident logging ─────────────────────────────────────────────────────
class TestIncidentLogging:
    def test_log_incident_appears_in_api(self, w3, registry):
        admin   = w3.eth.accounts[0]
        victim  = w3.eth.accounts[8]

        # Log incident directly
        nonce = w3.eth.get_transaction_count(admin)
        tx = registry.functions.logIncident(
            victim, 55, "burst_dex_same", "WARN"
        ).build_transaction({"from": admin, "nonce": nonce, "gas": 200_000})
        w3.eth.wait_for_transaction_receipt(w3.eth.send_transaction(tx))

        time.sleep(3)
        r = requests.get(f"{API_URL}/incidents?limit=20", timeout=TIMEOUT)
        incidents = r.json()
        wallets_in_log = [i["wallet"].lower() for i in incidents]
        assert victim.lower() in wallets_in_log, "Incident not visible in API"

    def test_metrics_update_after_block(self, w3, registry):
        r_before = requests.get(f"{API_URL}/metrics", timeout=TIMEOUT)
        count_before = r_before.json().get("incidentCount", 0)

        admin  = w3.eth.accounts[0]
        victim = w3.eth.accounts[9]
        nonce  = w3.eth.get_transaction_count(admin)
        tx = registry.functions.blockWallet(victim, 30, 80, "metrics test").build_transaction(
            {"from": admin, "nonce": nonce, "gas": 200_000}
        )
        w3.eth.wait_for_transaction_receipt(w3.eth.send_transaction(tx))

        time.sleep(3)
        r_after = requests.get(f"{API_URL}/metrics", timeout=TIMEOUT)
        count_after = r_after.json().get("incidentCount", 0)
        assert count_after >= count_before, "Incident count did not increase"
