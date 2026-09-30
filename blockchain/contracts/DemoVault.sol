// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IABISRegistry {
    function enforceAccess(address wallet, address protocol) external;
}

contract DemoVault {
    IABISRegistry public registry;
    mapping(address => uint256) public balances;

    // ── Reentrancy guard ──────────────────────────────────────────────────────
    bool private _locked;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    constructor(address registryAddress) {
        registry = IABISRegistry(registryAddress);
    }

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

    function deposit() external payable abisGuard {
        require(msg.value > 0, "Zero deposit");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external abisGuard nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
        emit Withdraw(msg.sender, amount);
    }

    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }
}
