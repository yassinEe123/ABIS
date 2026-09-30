// 8 rapid large deposits to overwhelm lending collateral tracking
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "8")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const lending = await hre.ethers.getContractAt("ABISLending", dep.lending, attacker);

  console.log("🔴 COLLATERAL_DUMP | attacker:", attacker.address);
  console.log("   Rapid large deposits to flood collateral pool...");

  const amounts = ["0.5","1.0","2.0","5.0","3.0","4.0","1.5","2.5"];

  for (let i = 0; i < 8; i++) {
    try {
      const tx = await lending.deposit({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  deposit ${i+1} ✅  amount=${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  deposit ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(300);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
