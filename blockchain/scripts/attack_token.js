// Simulates a burst of rapid ERC20 token transfers — triggers ABIS detection
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
);

async function main() {
  const signers  = await hre.ethers.getSigners();
  const admin    = signers[0];
  const attacker = signers[2];
  const victims  = signers.slice(10, 15); // 5 random victim addresses

  const token = await hre.ethers.getContractAt("ABISToken", deployment.token, admin);

  console.log("🔴 TOKEN BURST ATTACK");
  console.log("Attacker:", attacker.address);
  console.log("Token:   ", deployment.token);

  // Fund attacker with 5 000 ABST from admin
  const seedAmount = hre.ethers.parseUnits("5000", 18);
  await token.transfer(attacker.address, seedAmount);
  console.log("✅ Attacker funded: 5000 ABST");

  // Burst: 6 rapid transfers to different victims
  const tokenAsAttacker = await hre.ethers.getContractAt("ABISToken", deployment.token, attacker);
  const amounts = ["200", "300", "150", "400", "250", "500", "180", "350", "220", "280"];

  for (let i = 0; i < amounts.length; i++) {
    const victim = victims[i % victims.length];
    try {
      const tx = await tokenAsAttacker.transfer(
        victim.address,
        hre.ethers.parseUnits(amounts[i], 18)
      );
      await tx.wait();
      console.log(`burst ${i + 1} | ${amounts[i]} ABST → ${victim.address.slice(0, 10)}…`);
    } catch (e) {
      console.log(`burst ${i + 1} | ❌ BLOCKED by ABIS: ${e.shortMessage || e.message}`);
      break;
    }
  }

  console.log("🔴 Token burst attack finished");
}

main().catch((e) => { console.error(e); process.exit(1); });
