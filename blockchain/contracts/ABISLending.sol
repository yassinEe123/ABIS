// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IABISRegistry {
    function enforceAccess(address wallet, address protocol) external;
}

// Simple ETH lending: deposit collateral → borrow up to 70% LTV → repay with 5% interest
contract ABISLending {
    IABISRegistry public registry;

    uint256 public constant MAX_LTV        = 70;  // 70 %
    uint256 public constant INTEREST_BPS   = 500; // 5 % (basis points)

    mapping(address => uint256) public collateral; // ETH deposited
    mapping(address => uint256) public borrowed;   // ETH borrowed

    // ── Reentrancy guard ─────────────────────────────────────────────────────
    bool private _locked;

    event Deposited (address indexed user, uint256 amount);
    event Borrowed  (address indexed user, uint256 amount);
    event Repaid    (address indexed user, uint256 debt, uint256 paid);
    event Withdrawn (address indexed user, uint256 amount);

    modifier abisGuard() {
        registry.enforceAccess(msg.sender, address(this));
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "ReentrancyGuard: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address registryAddress) payable {
        registry = IABISRegistry(registryAddress);
    }

    // Deposit ETH as collateral
    function deposit() external payable abisGuard {
        require(msg.value > 0, "Must deposit ETH");
        collateral[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    // Borrow ETH against collateral (max 70 % LTV)
    function borrow(uint256 amount) external abisGuard nonReentrant {
        uint256 maxBorrow = (collateral[msg.sender] * MAX_LTV / 100) - borrowed[msg.sender];
        require(amount > 0 && amount <= maxBorrow, "Exceeds LTV or zero");
        require(address(this).balance >= amount,   "Insufficient pool liquidity");
        borrowed[msg.sender] += amount;
        payable(msg.sender).transfer(amount);
        emit Borrowed(msg.sender, amount);
    }

    // Repay full debt (msg.value must cover principal + 5 % interest)
    function repay() external payable abisGuard {
        uint256 debt = borrowed[msg.sender];
        require(debt > 0, "No debt to repay");
        uint256 totalDue = debt + (debt * INTEREST_BPS / 10000);
        require(msg.value >= totalDue, "Insufficient repayment amount");
        borrowed[msg.sender] = 0;
        // Refund any excess
        if (msg.value > totalDue) {
            payable(msg.sender).transfer(msg.value - totalDue);
        }
        emit Repaid(msg.sender, debt, msg.value);
    }

    // Withdraw collateral (only when no debt)
    function withdraw(uint256 amount) external abisGuard nonReentrant {
        require(borrowed[msg.sender] == 0,          "Repay debt first");
        require(collateral[msg.sender] >= amount,    "Insufficient collateral");
        collateral[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit Withdrawn(msg.sender, amount);
    }

    function poolBalance() external view returns (uint256) { return address(this).balance; }

    receive() external payable {}
}
