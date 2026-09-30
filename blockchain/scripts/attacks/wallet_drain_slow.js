// 5 slow ETH sends with long delays simulating patient wallet drain to avoid detection
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
  const target   = signers[TGT].address;

  console.log("🔴 WALLET_DRAIN_SLOW | attacker:", attacker.address);
  console.log("   Slowly draining wallet with hour-spaced transfers...");

  const amounts = ["0.05","0.10","0.15","0.08","0.20","0.12","0.07","0.18"];

  for (let i = 0; i < amounts.length; i++) {
    try {
      const tx = await attacker.sendTransaction({ to: target, value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  ${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    if (i < amounts.length - 1) {
      console.log(`  ⏳ next tx in 4s...`);
      await sleep(4000);
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
