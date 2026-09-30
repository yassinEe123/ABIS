const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("ABISRegistry — ABIS Enforcement Suite", function () {

  async function deploy() {
    const [owner, agent, user1, user2, user3] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("ABISRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();
    return { registry, owner, agent, user1, user2, user3 };
  }

  // ── S1: Roles ────────────────────────────────────────────────────────────────
  describe("S1 — Roles & Access Control", function () {
    it("deploys with owner = deployer", async function () {
      const { registry, owner } = await deploy();
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("deploys with authorizedAgent = deployer", async function () {
      const { registry, owner } = await deploy();
      expect(await registry.authorizedAgent()).to.equal(owner.address);
    });

    it("owner can set a new authorized agent", async function () {
      const { registry, agent } = await deploy();
      await registry.setAuthorizedAgent(agent.address);
      expect(await registry.authorizedAgent()).to.equal(agent.address);
    });

    it("non-owner cannot set authorized agent", async function () {
      const { registry, user1, agent } = await deploy();
      await expect(registry.connect(user1).setAuthorizedAgent(agent.address))
        .to.be.revertedWith("ABISRegistry: not owner");
    });

    it("authorized agent can call enforcement functions", async function () {
      const { registry, owner, agent, user1 } = await deploy();
      await registry.setAuthorizedAgent(agent.address);
      await expect(
        registry.connect(agent).warnWallet(user1.address, 120, 30, 50, "test")
      ).to.not.be.reverted;
    });

    it("unauthorized address cannot call enforcement functions", async function () {
      const { registry, user1, user2 } = await deploy();
      await expect(registry.connect(user1).warnWallet(user2.address, 120, 30, 50, "test"))
        .to.be.revertedWith("ABISRegistry: not authorized agent");
    });
  });

  // ── C1: Whitelist ───────────────────────────────────────────────────────────
  describe("C1 — Whitelist", function () {
    it("owner can add address to whitelist", async function () {
      const { registry, user1 } = await deploy();
      await registry.addToWhitelist(user1.address);
      expect(await registry.whitelist(user1.address)).to.equal(true);
    });

    it("owner can remove address from whitelist", async function () {
      const { registry, user1 } = await deploy();
      await registry.addToWhitelist(user1.address);
      await registry.removeFromWhitelist(user1.address);
      expect(await registry.whitelist(user1.address)).to.equal(false);
    });

    it("non-owner cannot modify whitelist", async function () {
      const { registry, user1, user2 } = await deploy();
      await expect(registry.connect(user1).addToWhitelist(user2.address))
        .to.be.revertedWith("ABISRegistry: not owner");
    });

    it("whitelisted wallet cannot be warned", async function () {
      const { registry, user1 } = await deploy();
      await registry.addToWhitelist(user1.address);
      await expect(registry.warnWallet(user1.address, 120, 30, 50, "test"))
        .to.be.revertedWith("Wallet is whitelisted");
    });

    it("whitelisted wallet bypasses enforceAccess", async function () {
      const { registry, user1 } = await deploy();
      await registry.addToWhitelist(user1.address);
      await expect(registry.enforceAccess(user1.address, ethers.ZeroAddress))
        .to.not.be.reverted;
    });
  });

  // ── C4: Circuit Breaker ─────────────────────────────────────────────────────
  describe("C4 — Circuit Breaker", function () {
    it("is not paused by default", async function () {
      const { registry } = await deploy();
      expect(await registry.paused()).to.equal(false);
    });

    it("owner can pause enforcement", async function () {
      const { registry } = await deploy();
      await registry.setPaused(true);
      expect(await registry.paused()).to.equal(true);
    });

    it("when paused, enforceAccess reverts", async function () {
      const { registry, user1 } = await deploy();
      await registry.setPaused(true);
      await expect(registry.enforceAccess(user1.address, ethers.ZeroAddress))
        .to.be.revertedWith("ABISRegistry: circuit breaker active - system paused");
    });

    it("owner can unpause enforcement", async function () {
      const { registry, user1 } = await deploy();
      await registry.setPaused(true);
      await registry.setPaused(false);
      await expect(registry.enforceAccess(user1.address, ethers.ZeroAddress))
        .to.not.be.reverted;
    });

    it("non-owner cannot toggle circuit breaker", async function () {
      const { registry, user1 } = await deploy();
      await expect(registry.connect(user1).setPaused(true))
        .to.be.revertedWith("ABISRegistry: not owner");
    });
  });

  // ── Graduated Enforcement ────────────────────────────────────────────────────
  describe("Graduated Enforcement", function () {
    it("L1 — warnWallet sets warnedUntil and rate limit", async function () {
      const { registry, user1 } = await deploy();
      const tx = await registry.warnWallet(user1.address, 120, 30, 50, "test warn");
      await tx.wait();
      const warned = await registry.isWarned(user1.address);
      expect(warned).to.equal(true);
      expect(await registry.minTxDelay(user1.address)).to.equal(30n);
    });

    it("L2 — blockWallet blocks wallet for specified duration", async function () {
      const { registry, user1 } = await deploy();
      await registry.blockWallet(user1.address, 600, 75, "test block");
      expect(await registry.isBlocked(user1.address)).to.equal(true);
    });

    it("L2 — blocked wallet reverts on enforceAccess", async function () {
      const { registry, user1 } = await deploy();
      await registry.blockWallet(user1.address, 600, 75, "test block");
      await expect(registry.enforceAccess(user1.address, ethers.ZeroAddress))
        .to.be.revertedWith("Blocked by ABIS");
    });

    it("L2b — blockWalletOnProtocol blocks only on specified protocol", async function () {
      const { registry, user1, user2 } = await deploy();
      const protocol = user2.address;
      await registry.blockWalletOnProtocol(user1.address, protocol, 600, 70, "proto block");
      expect(await registry.isBlockedOnProtocol(user1.address, protocol)).to.equal(true);
      expect(await registry.isBlockedOnProtocol(user1.address, ethers.ZeroAddress)).to.equal(false);
    });

    it("L3 — freezeWallet permanently freezes wallet", async function () {
      const { registry, user1 } = await deploy();
      await registry.freezeWallet(user1.address, 95, "test freeze");
      expect(await registry.frozen(user1.address)).to.equal(true);
      expect(await registry.isBlocked(user1.address)).to.equal(true);
    });

    it("L3 — frozen wallet reverts on enforceAccess", async function () {
      const { registry, user1 } = await deploy();
      await registry.freezeWallet(user1.address, 95, "test freeze");
      await expect(registry.enforceAccess(user1.address, ethers.ZeroAddress))
        .to.be.revertedWith("Frozen by ABIS");
    });

    it("unblockWallet clears all enforcement", async function () {
      const { registry, user1 } = await deploy();
      await registry.blockWallet(user1.address, 600, 75, "test");
      await registry.unblockWallet(user1.address);
      expect(await registry.isBlocked(user1.address)).to.equal(false);
      expect(await registry.isWarned(user1.address)).to.equal(false);
      expect(await registry.frozen(user1.address)).to.equal(false);
    });

    it("unblockWallet also unfreezes a frozen wallet", async function () {
      const { registry, user1 } = await deploy();
      await registry.freezeWallet(user1.address, 95, "test freeze");
      await registry.unblockWallet(user1.address);
      expect(await registry.frozen(user1.address)).to.equal(false);
      expect(await registry.isBlocked(user1.address)).to.equal(false);
    });
  });

  // ── C9: On-chain Reputation ─────────────────────────────────────────────────
  describe("C9 — On-Chain Reputation", function () {
    it("warnWallet increments incidentCount", async function () {
      const { registry, user1 } = await deploy();
      await registry.warnWallet(user1.address, 120, 30, 50, "test");
      expect(await registry.incidentCount(user1.address)).to.equal(1n);
    });

    it("multiple blocks accumulate reputation score", async function () {
      const { registry, user1 } = await deploy();
      await registry.blockWallet(user1.address, 600, 70, "block 1");
      await registry.unblockWallet(user1.address);
      await registry.blockWallet(user1.address, 600, 80, "block 2");
      expect(await registry.reputationScore(user1.address)).to.equal(150n);
      expect(await registry.incidentCount(user1.address)).to.equal(2n);
    });

    it("getWalletProfile returns correct 10-tuple", async function () {
      const { registry, user1 } = await deploy();
      await registry.blockWallet(user1.address, 600, 75, "profile test");
      const [_frozen, _blocked, _warned, _until, _wuntil, _delay, _rep, _inc, _wl, _paused]
        = await registry.getWalletProfile(user1.address);
      expect(_frozen).to.equal(false);
      expect(_blocked).to.equal(true);
      expect(_rep).to.equal(75n);
      expect(_inc).to.equal(1n);
      expect(_wl).to.equal(false);
      expect(_paused).to.equal(false);
    });
  });

  // ── Events ──────────────────────────────────────────────────────────────────
  describe("Events", function () {
    it("emits WalletWarned on warn", async function () {
      const { registry, user1 } = await deploy();
      await expect(registry.warnWallet(user1.address, 120, 30, 50, "warn reason"))
        .to.emit(registry, "WalletWarned")
        .withArgs(user1.address, 50, "warn reason", anyValue, 30);
    });

    it("emits WalletBlocked on block", async function () {
      const { registry, user1 } = await deploy();
      await expect(registry.blockWallet(user1.address, 600, 75, "block reason"))
        .to.emit(registry, "WalletBlocked");
    });

    it("emits WalletFrozen on freeze", async function () {
      const { registry, user1 } = await deploy();
      await expect(registry.freezeWallet(user1.address, 95, "freeze reason"))
        .to.emit(registry, "WalletFrozen")
        .withArgs(user1.address, 95, "freeze reason");
    });

    it("emits AttackEscalated when warned wallet gets blocked", async function () {
      const { registry, user1 } = await deploy();
      await registry.warnWallet(user1.address, 120, 30, 50, "warn");
      await expect(registry.blockWallet(user1.address, 600, 75, "escalate"))
        .to.emit(registry, "AttackEscalated")
        .withArgs(user1.address, "WARN", "BLOCK", 75);
    });

    it("emits CircuitBreakerToggled on pause", async function () {
      const { registry, owner } = await deploy();
      await expect(registry.setPaused(true))
        .to.emit(registry, "CircuitBreakerToggled")
        .withArgs(true, owner.address);
    });

    it("emits WhitelistUpdated on add/remove", async function () {
      const { registry, user1 } = await deploy();
      await expect(registry.addToWhitelist(user1.address))
        .to.emit(registry, "WhitelistUpdated")
        .withArgs(user1.address, true);
      await expect(registry.removeFromWhitelist(user1.address))
        .to.emit(registry, "WhitelistUpdated")
        .withArgs(user1.address, false);
    });
  });
});

