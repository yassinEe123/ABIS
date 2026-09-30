// Unknown attack pattern — NOT in the 48 labeled types.
// Probes all protocols + wallets with alternating huge/tiny amounts
// and irregular timing → IsolationForest detects as "unknown_anomaly"

const hre  = require("hardhat");
const fs   = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const signers  = await hre.ethers.getSigners();
  const attacker = signers[6];   // fresh wallet not used by other scripts

  const vault   = await hre.ethers.getContractAt("DemoVault",   deployment.vault,   attacker);
  const dex     = await hre.ethers.getContractAt("ABISDex",     deployment.dex,     attacker);
  const lending = await hre.ethers.getContractAt("ABISLending", deployment.lending, attacker);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("⚠️   UNKNOWN PATTERN ATTACK");
  console.log("    Probe + zigzag across all protocols & wallets");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Attacker:", attacker.address);
  console.log("");

  const txs = [
    // large vault deposit
    async () => {
      const tx = await vault.deposit({ value: hre.ethers.parseEther("3.0") });
      await tx.wait();
      console.log("tx 1 | 3.0 ETH → Vault (large deposit)");
    },
    // tiny ETH to random wallet
    async () => {
      const tx = await attacker.sendTransaction({ to: signers[15].address, value: hre.ethers.parseEther("0.001") });
      await tx.wait();
      console.log("tx 2 | 0.001 ETH → wallet (tiny probe)");
    },
    // large dex swap
    async () => {
      const tx = await dex.buyTokens({ value: hre.ethers.parseEther("2.5") });
      await tx.wait();
      console.log("tx 3 | 2.5 ETH → DEX (large swap)");
    },
    // tiny lending deposit
    async () => {
      const tx = await lending.deposit({ value: hre.ethers.parseEther("0.002") });
      await tx.wait();
      console.log("tx 4 | 0.002 ETH → Lending (tiny probe)");
    },
    // large vault again
    async () => {
      const tx = await vault.deposit({ value: hre.ethers.parseEther("2.8") });
      await tx.wait();
      console.log("tx 5 | 2.8 ETH → Vault (large deposit)");
    },
    // tiny different wallet
    async () => {
      const tx = await attacker.sendTransaction({ to: signers[16].address, value: hre.ethers.parseEther("0.003") });
      await tx.wait();
      console.log("tx 6 | 0.003 ETH → wallet (tiny probe)");
    },
    // large dex again
    async () => {
      const tx = await dex.buyTokens({ value: hre.ethers.parseEther("1.8") });
      await tx.wait();
      console.log("tx 7 | 1.8 ETH → DEX (large swap)");
    },
    // tiny to another wallet
    async () => {
      const tx = await attacker.sendTransaction({ to: signers[17].address, value: hre.ethers.parseEther("0.001") });
      await tx.wait();
      console.log("tx 8 | 0.001 ETH → wallet (tiny probe)");
    },
  ];

  for (let i = 0; i < txs.length; i++) {
    try {
      await txs[i]();
    } catch (e) {
      console.log(`tx ${i + 1} | ❌ BLOCKED by ABIS: ${e.shortMessage || e.message}`);
      break;
    }
    await sleep(200);
  }

  console.log("\n⚠️   Unknown attack finished");
  console.log("    Check ABIS agent — should show 'unknown_anomaly'");
}

main().catch(e => { console.error(e); process.exit(1); });
