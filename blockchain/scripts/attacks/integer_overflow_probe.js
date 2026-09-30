// 2 astronomically large buyTokens to probe for integer overflow vulnerabilities
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

  console.log("🔴 INTEGER_OVERFLOW_PROBE | attacker:", attacker.address);
  console.log("   Probing for overflow with extreme values — expect BLOCKED...");

  const overflowAmounts = ["1000","1000"];

  for (let i = 0; i < 2; i++) {
    try {
      console.log(`  probe ${i+1}: sending ${overflowAmounts[i]} ETH — testing overflow boundary...`);
      const tx = await dex.buyTokens({ value: e(overflowAmounts[i]) });
      await tx.wait();
      console.log(`  probe ${i+1} ✅  ${overflowAmounts[i]} ETH — WARNING: overflow not caught!`);
    } catch (err) {
      console.log(`  probe ${i+1} ❌ BLOCKED (expected): ${err.shortMessage || err.message}`);
    }
    await sleep(500);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
