// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ABISRegistry — AI Blockchain Immune System Registry
/// @notice Central enforcement contract: whitelist, circuit-breaker,
///         graduated blocking (Warn / Block / Protocol-Block / Freeze)
///         and on-chain reputation scoring.
contract ABISRegistry {

    // ── Roles ─────────────────────────────────────────────────────────────────
    address public owner;
    address public authorizedAgent;

    // ── Circuit-breaker ───────────────────────────────────────────────────────
    bool public paused;

    // ── Whitelist (trusted addresses bypass all enforcement) ──────────────────
    mapping(address => bool) public whitelist;

    // ── Level 2 & 3 — global blocks ───────────────────────────────────────────
    mapping(address => uint256) public blockedUntil;
    mapping(address => bool)    public frozen;

    // ── Level 1 — warning / rate-limit ────────────────────────────────────────
    mapping(address => uint256) public warnedUntil;
    mapping(address => uint256) public minTxDelay;
    mapping(address => uint256) public lastTxTimestamp;

    // ── Level 2b — per-protocol block ─────────────────────────────────────────
    mapping(address => mapping(address => uint256)) public protocolBlockedUntil;

    // ── On-chain reputation ───────────────────────────────────────────────────
    mapping(address => uint256) public reputationScore;
    mapping(address => uint256) public incidentCount;
    mapping(address => uint256) public lastIncidentBlock;

    // ── Events ────────────────────────────────────────────────────────────────
    event IncidentLogged(address indexed wallet, uint256 riskScore, string anomalyType, string action);
    event WalletWarned(address indexed wallet, uint256 riskScore, string reason, uint256 until, uint256 txDelay);
    event WalletBlocked(address indexed wallet, uint256 until, uint256 riskScore, string reason);
    event WalletBlockedOnProtocol(address indexed wallet, address indexed protocol, uint256 until, uint256 riskScore, string reason);
    event WalletFrozen(address indexed wallet, uint256 riskScore, string reason);
    event WalletUnblocked(address indexed wallet);
    event RateLimitHit(address indexed wallet, uint256 waitSeconds);
    event AttackEscalated(address indexed wallet, string fromLevel, string toLevel, uint256 riskScore);
    event WhitelistUpdated(address indexed wallet, bool added);
    event AgentAuthorized(address indexed agent);
    event CircuitBreakerToggled(bool paused, address by);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "ABISRegistry: not owner");
        _;
    }

    modifier onlyAgent() {
        require(
            msg.sender == owner || msg.sender == authorizedAgent,
            "ABISRegistry: not authorized agent"
        );
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "ABISRegistry: circuit breaker active - system paused");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor() {
        owner           = msg.sender;
        authorizedAgent = msg.sender;   // deployer is default agent (overrideable)
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS (onlyOwner)
    // ═════════════════════════════════════════════════════════════════════════

    /// @notice Authorize a new AI agent address to call enforcement functions
    function setAuthorizedAgent(address agent) external onlyOwner {
        require(agent != address(0), "Zero address");
        authorizedAgent = agent;
        emit AgentAuthorized(agent);
    }

    /// @notice Pause / unpause all enforcement (circuit breaker)
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit CircuitBreakerToggled(_paused, msg.sender);
    }

    /// @notice Add an address to the whitelist (permanently trusted)
    function addToWhitelist(address wallet) external onlyOwner {
        whitelist[wallet] = true;
        emit WhitelistUpdated(wallet, true);
    }

    /// @notice Remove an address from the whitelist
    function removeFromWhitelist(address wallet) external onlyOwner {
        whitelist[wallet] = false;
        emit WhitelistUpdated(wallet, false);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═════════════════════════════════════════════════════════════════════════

    function isBlocked(address wallet) public view returns (bool) {
        if (frozen[wallet]) return true;
        return blockedUntil[wallet] > block.timestamp;
    }

    function isWarned(address wallet) public view returns (bool) {
        return warnedUntil[wallet] > block.timestamp;
    }

    function isBlockedOnProtocol(address wallet, address protocol) public view returns (bool) {
        if (isBlocked(wallet)) return true;
        return protocolBlockedUntil[wallet][protocol] > block.timestamp;
    }

    function protocolBlockSecondsLeft(address wallet, address protocol) external view returns (uint256) {
        uint256 until = protocolBlockedUntil[wallet][protocol];
        return until > block.timestamp ? until - block.timestamp : 0;
    }

    /// @notice Returns full wallet profile in a single call (gas-efficient for API)
    function getWalletProfile(address wallet) external view returns (
        bool   _frozen,
        bool   _blocked,
        bool   _warned,
        uint256 _blockedUntil,
        uint256 _warnedUntil,
        uint256 _txDelay,
        uint256 _reputation,
        uint256 _incidents,
        bool   _whitelisted,
        bool   _paused
    ) {
        return (
            frozen[wallet],
            blockedUntil[wallet] > block.timestamp,
            warnedUntil[wallet]  > block.timestamp,
            blockedUntil[wallet],
            warnedUntil[wallet],
            minTxDelay[wallet],
            reputationScore[wallet],
            incidentCount[wallet],
            whitelist[wallet],
            paused
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ACCESS ENFORCEMENT (called by abisGuard on every protected contract)
    // ═════════════════════════════════════════════════════════════════════════

    function enforceAccess(address wallet, address protocol) external whenNotPaused {
        // Whitelisted wallets bypass ALL enforcement
        if (whitelist[wallet]) return;

        // Level 3 — permanent freeze
        require(!frozen[wallet], "Frozen by ABIS");

        // Level 2 — global temp-block
        require(blockedUntil[wallet] <= block.timestamp, "Blocked by ABIS");

        // Level 2b — protocol-specific block
        require(
            protocolBlockedUntil[wallet][protocol] <= block.timestamp,
            "Blocked on this protocol by ABIS"
        );

        // Level 1 — rate-limit enforcement
        if (warnedUntil[wallet] > block.timestamp) {
            uint256 lastTime = lastTxTimestamp[wallet];
            uint256 delay    = minTxDelay[wallet];
            if (lastTime + delay > block.timestamp) {
                uint256 wait = (lastTime + delay) - block.timestamp;
                emit RateLimitHit(wallet, wait);
                revert("Rate limited by ABIS");
            }
            lastTxTimestamp[wallet] = block.timestamp;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // AGENT ENFORCEMENT FUNCTIONS (onlyAgent)
    // ═════════════════════════════════════════════════════════════════════════

    function warnWallet(
        address wallet,
        uint256 durationSeconds,
        uint256 txDelaySeconds,
        uint256 riskScore,
        string calldata reason
    ) external onlyAgent {
        require(!whitelist[wallet], "Wallet is whitelisted");
        bool wasBlocked = blockedUntil[wallet] > block.timestamp;

        warnedUntil[wallet]     = block.timestamp + durationSeconds;
        minTxDelay[wallet]      = txDelaySeconds;
        lastTxTimestamp[wallet] = block.timestamp;
        _updateReputation(wallet, riskScore);

        emit WalletWarned(wallet, riskScore, reason, warnedUntil[wallet], txDelaySeconds);
        emit IncidentLogged(wallet, riskScore, reason, "WARN");
        if (wasBlocked) emit AttackEscalated(wallet, "BLOCK", "WARN", riskScore);
    }

    function blockWallet(
        address wallet,
        uint256 durationSeconds,
        uint256 riskScore,
        string calldata reason
    ) external onlyAgent {
        require(!whitelist[wallet], "Wallet is whitelisted");
        bool wasWarned = warnedUntil[wallet] > block.timestamp;

        blockedUntil[wallet] = block.timestamp + durationSeconds;
        _updateReputation(wallet, riskScore);

        emit WalletBlocked(wallet, blockedUntil[wallet], riskScore, reason);
        emit IncidentLogged(wallet, riskScore, reason, "BLOCK_TEMP");
        if (wasWarned) emit AttackEscalated(wallet, "WARN", "BLOCK", riskScore);
    }

    function blockWalletOnProtocol(
        address wallet,
        address protocol,
        uint256 durationSeconds,
        uint256 riskScore,
        string calldata reason
    ) external onlyAgent {
        require(!whitelist[wallet], "Wallet is whitelisted");
        bool wasWarned = warnedUntil[wallet] > block.timestamp;

        protocolBlockedUntil[wallet][protocol] = block.timestamp + durationSeconds;
        _updateReputation(wallet, riskScore);

        emit WalletBlockedOnProtocol(wallet, protocol, protocolBlockedUntil[wallet][protocol], riskScore, reason);
        emit IncidentLogged(wallet, riskScore, reason, "BLOCK_PROTOCOL");
        if (wasWarned) emit AttackEscalated(wallet, "WARN", "BLOCK_PROTOCOL", riskScore);
    }

    function freezeWallet(
        address wallet,
        uint256 riskScore,
        string calldata reason
    ) external onlyAgent {
        require(!whitelist[wallet], "Wallet is whitelisted");
        bool wasBlocked = blockedUntil[wallet] > block.timestamp;

        frozen[wallet] = true;
        _updateReputation(wallet, riskScore);

        emit WalletFrozen(wallet, riskScore, reason);
        emit IncidentLogged(wallet, riskScore, reason, "FREEZE");
        if (wasBlocked) emit AttackEscalated(wallet, "BLOCK", "FREEZE", riskScore);
    }

    function unblockWallet(address wallet) external onlyAgent {
        blockedUntil[wallet]    = 0;
        frozen[wallet]          = false;
        warnedUntil[wallet]     = 0;
        minTxDelay[wallet]      = 0;
        lastTxTimestamp[wallet] = 0;
        emit WalletUnblocked(wallet);
    }

    function unblockFromProtocol(address wallet, address protocol) external onlyAgent {
        protocolBlockedUntil[wallet][protocol] = 0;
    }

    function logIncident(
        address wallet,
        uint256 riskScore,
        string calldata anomalyType,
        string calldata action
    ) external onlyAgent {
        emit IncidentLogged(wallet, riskScore, anomalyType, action);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═════════════════════════════════════════════════════════════════════════

    function _updateReputation(address wallet, uint256 riskScore) internal {
        reputationScore[wallet]   += riskScore;
        incidentCount[wallet]     += 1;
        lastIncidentBlock[wallet]  = block.number;
    }
}
