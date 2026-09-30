// Simulates rapid deposit/borrow cycles on ABISLending — triggers ABIS detection
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
);

async function main() {
  const signers  = await hre.ethers.getSigners();
  const attacker = signers[4];

  const lending = await hre.ethers.getContractAt("ABISLending", deployment.lending, attacker);

  console.log("🔴 LENDING BURST ATTACK");
  console.log("Attacker:", attacker.address);
  console.log("Lending: ", deployment.lending);

  // Step 1: Deposit 2 ETH as collateral
  try {
    const tx = await lending.deposit({ value: hre.ethers.parseEther("2") });
    await tx.wait();
    console.log("✅ Deposited 2 ETH collateral");
  } catch (e) {
    console.log("❌ Deposit blocked:", e.shortMessage || e.message);
    return;
  }

  // Step 2: Burst rapid deposit calls (extra collateral additions = burst pattern)
  const extras = ["0.3", "0.4", "0.5", "0.3", "0.4", "0.5"];

  for (let i = 0; i < extras.length; i++) {
    try {
      const tx = await lending.deposit({ value: hre.ethers.parseEther(extras[i]) });
      await tx.wait();
      console.log(`burst deposit ${i + 1} | +${extras[i]} ETH collateral`);
    } catch (e) {
      console.log(`burst deposit ${i + 1} | ❌ BLOCKED by ABIS: ${e.shortMessage || e.message}`);
      break;
    }
  }

  // Step 3: Try to borrow (may already be blocked)
  try {
    const tx = await lending.borrow(hre.ethers.parseEther("1"));
    await tx.wait();
    console.log("⚠️  Borrow succeeded (agent may not have blocked yet)");
  } catch (e) {
    console.log("❌ Borrow blocked by ABIS:", e.shortMessage || e.message);
  }

  console.log("🔴 Lending burst attack finished");
}

main().catch((e) => { console.error(e); process.exit(1); });
