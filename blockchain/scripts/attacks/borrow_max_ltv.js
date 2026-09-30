// Deposit 5 ETH collateral then repeatedly borrow at max LTV to stress lending protocol
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "7")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const lending = await hre.ethers.getContractAt("ABISLending", dep.lending, attacker);

  console.log("🔴 BORROW_MAX_LTV | attacker:", attacker.address);
  console.log("   Depositing 5 ETH collateral...");

  try {
    const depTx = await lending.deposit({ value: e("5") });
    await depTx.wait();
    console.log("   deposit ✅  5 ETH");
  } catch (err) {
    console.log("   deposit ❌ BLOCKED:", err.shortMessage || err.message);
    return;
  }

  await sleep(500);
  console.log("   Attempting repeated max-LTV borrows...");

  for (let i = 0; i < 5; i++) {
    try {
      const tx = await lending.borrow(e("1"));
      await tx.wait();
      console.log(`  borrow ${i+1} ✅  1 ETH`);
    } catch (err) {
      console.log(`  borrow ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(300);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
