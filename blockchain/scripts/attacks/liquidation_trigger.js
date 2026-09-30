// Deposit collateral, borrow, then attempt withdrawals to trigger under-collateralization
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

  const lending = await hre.ethers.getContractAt("ABISLending", dep.lending, attacker);

  console.log("🔴 LIQUIDATION_TRIGGER | attacker:", attacker.address);

  // Deposit collateral
  try {
    const depTx = await lending.deposit({ value: e("2") });
    await depTx.wait();
    console.log("   deposit ✅  2 ETH collateral");
  } catch (err) {
    console.log("   deposit ❌ BLOCKED:", err.shortMessage || err.message);
    return;
  }

  await sleep(500);

  // Borrow against collateral
  try {
    const borTx = await lending.borrow(e("0.5"));
    await borTx.wait();
    console.log("   borrow ✅  0.5 ETH");
  } catch (err) {
    console.log("   borrow ❌ BLOCKED:", err.shortMessage || err.message);
    return;
  }

  await sleep(300);
  console.log("   Attempting withdrawals to trigger under-collateralization...");

  // Try to withdraw more than safe collateral level
  const withdrawAmounts = ["0.5","0.5","0.5","0.5","0.5"];

  for (let i = 0; i < 5; i++) {
    try {
      const tx = await lending.withdraw(e(withdrawAmounts[i]));
      await tx.wait();
      console.log(`  withdraw ${i+1} ✅  ${withdrawAmounts[i]} ETH — collateral still accepted`);
    } catch (err) {
      console.log(`  withdraw ${i+1} ❌ BLOCKED (under-collat triggered): ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(200);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
