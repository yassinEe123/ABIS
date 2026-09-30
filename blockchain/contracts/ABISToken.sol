// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IABISRegistry {
    function enforceAccess(address wallet, address protocol) external;
}

contract ABISToken {
    IABISRegistry public registry;
    address public owner;

    string public constant name     = "ABIS Token";
    string public constant symbol   = "ABST";
    uint8  public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier abisGuard() {
        registry.enforceAccess(msg.sender, address(this));
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address registryAddress, uint256 initialSupply) {
        registry = IABISRegistry(registryAddress);
        owner    = msg.sender;
        uint256 total = initialSupply * 10 ** decimals;
        totalSupply           = total;
        balanceOf[msg.sender] = total;
        emit Transfer(address(0), msg.sender, total);
    }

    function transfer(address to, uint256 amount) external abisGuard returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external abisGuard returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external abisGuard returns (bool) {
        require(balanceOf[from] >= amount,           "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    // Only owner can mint — no abisGuard (used for liquidity setup)
    function mint(address to, uint256 amount) external onlyOwner {
        totalSupply    += amount;
        balanceOf[to]  += amount;
        emit Transfer(address(0), to, amount);
    }
}
