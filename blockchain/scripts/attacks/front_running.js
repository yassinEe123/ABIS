// 4 ultra-fast buyTokens with minimal delay to simulate front-running bot behavior
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "3")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const dex = await hre.ethers.getContractAt("ABISDex", dep.dex, attacker);

  console.log("🔴 FRONT_RUNNING | attacker:", attacker.address);
  console.log("   Ultra-fast buys simulating mempool front-runner...");

  const amounts = ["0.1","0.5","1.0","2.0"];
  const delays  = [50, 100, 150, 80];

  for (let i = 0; i < 4; i++) {
    try {
      const tx = await dex.buyTokens({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  amount=${amounts[i]} ETH  delay=${delays[i]}ms`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(delays[i]);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
