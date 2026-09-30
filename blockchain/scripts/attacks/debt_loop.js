// 10 cycles of borrow then immediate repay to stress lending state machine
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "11")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const lending = await hre.ethers.getContractAt("ABISLending", dep.lending, attacker);

  console.log("🔴 DEBT_LOOP | attacker:", attacker.address);

  // Initial deposit for collateral
  try {
    const depTx = await lending.deposit({ value: e("5") });
    await depTx.wait();
    console.log("   initial deposit ✅  5 ETH");
  } catch (err) {
    console.log("   initial deposit ❌ BLOCKED:", err.shortMessage || err.message);
    return;
  }

  await sleep(500);
  console.log("   Starting borrow-repay debt loop...");

  for (let i = 0; i < 10; i++) {
    try {
      const borTx = await lending.borrow(e("0.2"));
      await borTx.wait();
      console.log(`  cycle ${i+1} borrow ✅  0.2 ETH`);
    } catch (err) {
      console.log(`  cycle ${i+1} borrow ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }

    await sleep(100);

    try {
      const repTx = await lending.repay({ value: e("0.2") });
      await repTx.wait();
      console.log(`  cycle ${i+1} repay  ✅  0.2 ETH`);
    } catch (err) {
      console.log(`  cycle ${i+1} repay  ❌ BLOCKED: ${err.shortMessage || err.message}`);
    }

    await sleep(300);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
