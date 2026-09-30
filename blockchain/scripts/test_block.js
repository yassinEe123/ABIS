const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
);

const REGISTRY_ADDR = deployment.registry;
const VAULT_ADDR = deployment.vault;

async function main() {
  const [admin, attacker] = await hre.ethers.getSigners();

  const registry = await hre.ethers.getContractAt("ABISRegistry", REGISTRY_ADDR, admin);
  const vaultAsAttacker = await hre.ethers.getContractAt("DemoVault", VAULT_ADDR, attacker);

  console.log("Registry:", REGISTRY_ADDR);
  console.log("Vault:", VAULT_ADDR);
  console.log("Admin:", admin.address);
  console.log("Attacker:", attacker.address);

  console.log("\n1) Deposit normal...");
  let tx = await vaultAsAttacker.deposit({ value: hre.ethers.parseEther("0.1") });
  await tx.wait();
  console.log("   ✅ Deposit OK");

  console.log("\n2) Block attacker wallet for 10 minutes...");
  tx = await registry.blockWallet(
    attacker.address,
    600,
    95,
    "Anomaly: burst tx / zero-day suspected"
  );
  await tx.wait();
  console.log("   ✅ Wallet blocked");

  console.log("\n3) Deposit after block (should FAIL)...");
  try {
    tx = await vaultAsAttacker.deposit({ value: hre.ethers.parseEther("0.01") });
    await tx.wait();
    console.log("   ❌ Unexpected: deposit succeeded (should have failed)");
  } catch (e) {
    console.log("   ✅ Expected failure:", e.shortMessage || e.message);
  }

  const blocked = await registry.isBlocked(attacker.address);
  console.log("\n4) Registry isBlocked(attacker):", blocked);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
