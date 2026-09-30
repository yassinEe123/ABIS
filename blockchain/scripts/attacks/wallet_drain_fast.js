// 2 instant large ETH transfers to simulate rapid wallet drain in minimal time
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
  const target   = signers[TGT].address;

  console.log("🔴 WALLET_DRAIN_FAST | attacker:", attacker.address);
  console.log("   Instant large ETH transfers to drain wallet in seconds...");

  const amounts = ["1","20"];

  for (let i = 0; i < 2; i++) {
    try {
      console.log(`  tx ${i+1}: sending ${amounts[i]} ETH instantly...`);
      const tx = await attacker.sendTransaction({ to: target, value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  ${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(500);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
