// Single ultra-fast buyTokens within 10-150ms of startup to simulate token sniper bot
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "9")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const dex = await hre.ethers.getContractAt("ABISDex", dep.dex, attacker);

  console.log("🔴 SNIPER_BOT | attacker:", attacker.address);
  console.log("   Sniper positioned — waiting for signal...");

  // Minimal delay simulating detection of target tx in mempool
  await sleep(10 + Math.floor(Math.random() * 140)); // 10-150ms

  const amounts = ["0.1","1.0","5.0"];

  for (let i = 0; i < amounts.length; i++) {
    const startTime = Date.now();
    try {
      const tx = await dex.buyTokens({ value: e(amounts[i]) });
      await tx.wait();
      const elapsed = Date.now() - startTime;
      console.log(`  snipe ${i+1} ✅  ${amounts[i]} ETH  latency=${elapsed}ms`);
    } catch (err) {
      console.log(`  snipe ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(50 + Math.floor(Math.random() * 50)); // 50-100ms between shots
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
