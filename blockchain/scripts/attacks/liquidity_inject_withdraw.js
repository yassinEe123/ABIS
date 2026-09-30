// 8 cycles of lending deposit then immediate withdraw to destabilize liquidity pool
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "5")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const lending = await hre.ethers.getContractAt("ABISLending", dep.lending, attacker);

  console.log("🔴 LIQUIDITY_INJECT_WITHDRAW | attacker:", attacker.address);

  const amounts = ["2","5","8","3","15","7","4","10"];

  for (let i = 0; i < 8; i++) {
    console.log(`  cycle ${i+1}: inject ${amounts[i]} ETH then withdraw...`);

    try {
      const depTx = await lending.deposit({ value: e(amounts[i]) });
      await depTx.wait();
      console.log(`    deposit ✅  ${amounts[i]} ETH`);
    } catch (err) {
      console.log(`    deposit ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }

    await sleep(200);

    try {
      const witTx = await lending.withdraw(e(amounts[i]));
      await witTx.wait();
      console.log(`    withdraw ✅  ${amounts[i]} ETH`);
    } catch (err) {
      console.log(`    withdraw ❌ BLOCKED: ${err.shortMessage || err.message}`);
    }

    await sleep(300);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
