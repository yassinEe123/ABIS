// Deposit 10 ETH then make 3 large withdrawals to simulate liquidity drain attack
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "4")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const vault = await hre.ethers.getContractAt("DemoVault", dep.vault, attacker);

  console.log("🔴 LIQUIDITY_DRAIN | attacker:", attacker.address);
  console.log("   Phase 1: large deposit to establish position...");

  try {
    const depositTx = await vault.deposit({ value: e("10") });
    await depositTx.wait();
    console.log("   deposit ✅  10 ETH");
  } catch (err) {
    console.log("   deposit ❌ BLOCKED:", err.shortMessage || err.message);
    return;
  }

  await sleep(1000);

  console.log("   Phase 2: rapid large withdrawals to drain liquidity...");

  const withdrawAmounts = ["5","3","2"];
  const withdrawDelays  = [1000, 5000, 15000];

  for (let i = 0; i < 3; i++) {
    try {
      const tx = await vault.withdraw(e(withdrawAmounts[i]));
      await tx.wait();
      console.log(`  withdraw ${i+1} ✅  amount=${withdrawAmounts[i]} ETH`);
    } catch (err) {
      console.log(`  withdraw ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    if (i < 2) {
      console.log(`  ⏳ Simulating ${withdrawDelays[i]/1000}s delay...`);
      await sleep(withdrawDelays[i] > 3000 ? 3000 : withdrawDelays[i]);
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
