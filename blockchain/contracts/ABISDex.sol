// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IABISRegistry {
    function enforceAccess(address wallet, address protocol) external;
}

interface IABISToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// Simple ETH <-> ABST DEX at fixed rate: 1 ETH = 1000 ABST
contract ABISDex {
    IABISRegistry public registry;
    IABISToken    public token;

    uint256 public constant RATE = 1000; // tokens per ETH

    event TokensBought(address indexed buyer,  uint256 ethIn,     uint256 tokensOut);
    event TokensSold  (address indexed seller, uint256 tokensIn,  uint256 ethOut);
    event LiquidityAdded(address indexed provider, uint256 ethAmount, uint256 tokenAmount);

    modifier abisGuard() {
        registry.enforceAccess(msg.sender, address(this));
        _;
    }

    constructor(address registryAddress, address tokenAddress) {
        registry = IABISRegistry(registryAddress);
        token    = IABISToken(tokenAddress);
    }

    // Buy ABST tokens with ETH
    function buyTokens() external payable abisGuard {
        require(msg.value > 0, "Send ETH to buy tokens");
        uint256 tokensOut = (msg.value * RATE) / 1e18;
        require(token.balanceOf(address(this)) >= tokensOut, "Insufficient token liquidity");
        // Internal transfer: msg.sender here is DEX, abisGuard already validated user above
        token.transfer(msg.sender, tokensOut);
        emit TokensBought(msg.sender, msg.value, tokensOut);
    }

    // Sell ABST tokens for ETH (user must approve DEX first)
    function sellTokens(uint256 tokenAmount) external abisGuard {
        require(tokenAmount > 0, "Amount must be > 0");
        uint256 ethOut = (tokenAmount * 1e18) / RATE;
        require(address(this).balance >= ethOut, "Insufficient ETH liquidity");
        token.transferFrom(msg.sender, address(this), tokenAmount);
        payable(msg.sender).transfer(ethOut);
        emit TokensSold(msg.sender, tokenAmount, ethOut);
    }

    // Add ETH + token liquidity (called by deployer during setup)
    function addLiquidity(uint256 tokenAmount) external payable {
        if (tokenAmount > 0) {
            token.transferFrom(msg.sender, address(this), tokenAmount);
        }
        emit LiquidityAdded(msg.sender, msg.value, tokenAmount);
    }

    function ethBalance()   external view returns (uint256) { return address(this).balance; }
    function tokenBalance() external view returns (uint256) { return token.balanceOf(address(this)); }

    receive() external payable {}
}
