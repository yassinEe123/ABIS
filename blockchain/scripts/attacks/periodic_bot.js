// 5 DEX buyTokens at exact periodic intervals simulating an automated trading bot
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "10")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const dex = await hre.ethers.getContractAt("ABISDex", dep.dex, attacker);

  console.log("🔴 PERIODIC_BOT | attacker:", attacker.address);
  console.log("   Note: real bot fires every 15s — simulating with 3s intervals");

  const amounts = ["0.05","0.08","0.06","0.09","0.07"];

  for (let i = 0; i < 5; i++) {
    const timestamp = new Date().toISOString();
    try {
      const tx = await dex.buyTokens({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tick ${i+1} ✅  [${timestamp}] amount=${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  tick ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    if (i < 4) {
      console.log(`  ⏳ Simulating 15s periodic interval (using 3s)...`);
      await sleep(3000); // 3s simulation of 15s real interval
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
