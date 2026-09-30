// 12 rapid buyTokens on DEX from same attacker to simulate burst trading attack
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "2")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const dex = await hre.ethers.getContractAt("ABISDex", dep.dex, attacker);

  console.log("🔴 BURST_DEX_SAME | attacker:", attacker.address);

  const amounts = [
    "0.008","0.012","0.015","0.020","0.025","0.010",
    "0.018","0.030","0.009","0.022","0.028","0.016"
  ];
  const delays = [500, 800, 1200, 600, 900, 2000, 700, 1500, 500, 3000, 1100, 800];

  for (let i = 0; i < 12; i++) {
    try {
      const tx = await dex.buyTokens({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  amount=${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(delays[i]);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
