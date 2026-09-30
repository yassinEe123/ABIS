// 3 very large single buyTokens to cause extreme price slippage on the DEX
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "5")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const dex = await hre.ethers.getContractAt("ABISDex", dep.dex, attacker);

  console.log("🔴 PRICE_SLIPPAGE_ABUSE | attacker:", attacker.address);

  const amounts = ["5","25","50"];
  const delays  = [2000, 10000, 30000];

  for (let i = 0; i < 3; i++) {
    try {
      console.log(`  tx ${i+1}: large buy of ${amounts[i]} ETH — expecting slippage...`);
      const tx = await dex.buyTokens({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  amount=${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    if (i < 2) {
      console.log(`  ⏳ Simulating ${delays[i]/1000}s delay before next attack...`);
      await sleep(delays[i] > 5000 ? 3000 : delays[i]);
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
