// 50 zero-value direct transactions to vault address to simulate zero-value spam attack
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "4")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  console.log("🔴 ZERO_VALUE_SPAM | attacker:", attacker.address);
  console.log("   Flooding vault address with zero-value transactions...");

  for (let i = 0; i < 50; i++) {
    try {
      const tx = await attacker.sendTransaction({ to: dep.vault, value: 0 });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  value=0 ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(100);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
