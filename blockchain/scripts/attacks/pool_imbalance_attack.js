// 3 very large DEX buyTokens to massively imbalance the liquidity pool
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "6")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const dex = await hre.ethers.getContractAt("ABISDex", dep.dex, attacker);

  console.log("🔴 POOL_IMBALANCE_ATTACK | attacker:", attacker.address);
  console.log("   Sending oversized buyTokens to skew the pool ratio...");

  const amounts = ["10","50","100"];

  for (let i = 0; i < 3; i++) {
    try {
      console.log(`  tx ${i+1}: buying with ${amounts[i]} ETH — attempting pool imbalance...`);
      const tx = await dex.buyTokens({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  amount=${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(300);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
