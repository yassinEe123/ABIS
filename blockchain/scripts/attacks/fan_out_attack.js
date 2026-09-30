// 40 direct ETH sends each to a different address to simulate wide fan-out attack
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

  console.log("🔴 FAN_OUT_ATTACK | attacker:", attacker.address);

  // Generate 40 unique targets by reusing signers cyclically (skip attacker)
  const targetSigners = signers.filter((_, idx) => idx !== ATK);
  // Rotate so targets start from TGT
  const tgtRelIdx = targetSigners.findIndex(s => s.address === signers[Math.min(19, TGT)].address);
  const rotated = tgtRelIdx >= 0
    ? [...targetSigners.slice(tgtRelIdx), ...targetSigners.slice(0, tgtRelIdx)]
    : targetSigners;
  const amounts = [
    "0.01","0.05","0.10","0.02","0.15","0.08","0.20","0.03","0.25","0.07",
    "0.12","0.04","0.18","0.09","0.22","0.06","0.13","0.11","0.25","0.01",
    "0.05","0.14","0.08","0.19","0.03","0.16","0.07","0.21","0.04","0.10",
    "0.17","0.06","0.23","0.02","0.11","0.15","0.08","0.20","0.05","0.24"
  ];

  for (let i = 0; i < 40; i++) {
    const target = rotated[i % rotated.length].address;
    try {
      const tx = await attacker.sendTransaction({ to: target, value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  to=${target.slice(0,10)}... amount=${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(200);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
