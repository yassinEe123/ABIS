// 4 cycles of deposit-borrow-immediate-repay to simulate flash loan abuse pattern
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

  const lending = await hre.ethers.getContractAt("ABISLending", dep.lending, attacker);

  console.log("🔴 FLASH_BORROW_REPAY | attacker:", attacker.address);

  for (let i = 0; i < 4; i++) {
    console.log(`  cycle ${i+1}:`);

    try {
      const depTx = await lending.deposit({ value: e("2") });
      await depTx.wait();
      console.log(`    deposit ✅  2 ETH`);
    } catch (err) {
      console.log(`    deposit ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }

    await sleep(100);

    try {
      const borTx = await lending.borrow(e("0.5"));
      await borTx.wait();
      console.log(`    borrow ✅  0.5 ETH`);
    } catch (err) {
      console.log(`    borrow ❌ BLOCKED: ${err.shortMessage || err.message}`);
      await sleep(100);
      continue;
    }

    await sleep(100);

    try {
      const repTx = await lending.repay({ value: e("0.5") });
      await repTx.wait();
      console.log(`    repay ✅  0.5 ETH`);
    } catch (err) {
      console.log(`    repay ❌ BLOCKED: ${err.shortMessage || err.message}`);
    }

    await sleep(100);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
