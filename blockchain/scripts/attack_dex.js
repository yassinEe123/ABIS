// Simulates rapid swap bursts on ABISDex — triggers ABIS detection
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
);

async function main() {
  const signers  = await hre.ethers.getSigners();
  const attacker = signers[3];

  const dex = await hre.ethers.getContractAt("ABISDex", deployment.dex, attacker);

  console.log("🔴 DEX BURST ATTACK");
  console.log("Attacker:", attacker.address);
  console.log("DEX:     ", deployment.dex);

  // Burst: 10 rapid buyTokens calls with varying ETH amounts
  const amounts = ["0.010", "0.015", "0.020", "0.012", "0.018", "0.025", "0.010", "0.030", "0.008", "0.022"];

  for (let i = 0; i < amounts.length; i++) {
    try {
      const tx = await dex.buyTokens({
        value: hre.ethers.parseEther(amounts[i]),
      });
      await tx.wait();
      const tokens = (parseFloat(amounts[i]) * 1000).toFixed(0);
      console.log(`swap ${i + 1} | ${amounts[i]} ETH → ${tokens} ABST`);
    } catch (e) {
      console.log(`swap ${i + 1} | ❌ BLOCKED by ABIS: ${e.shortMessage || e.message}`);
      break;
    }
  }

  console.log("🔴 DEX burst attack finished");
}

main().catch((e) => { console.error(e); process.exit(1); });
