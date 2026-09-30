const hre = require("hardhat");
const fs = require("fs"), path = require("path");
const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json")));

async function main() {
  const signers  = await hre.ethers.getSigners();
  const attacker = signers[8];   // the wallet-to-wallet attacker
  const victim   = signers[9];
  const innocent = signers[11];  // another wallet — NOT blocked

  const reg     = await hre.ethers.getContractAt("ABISRegistry", dep.registry);
  const vault   = await hre.ethers.getContractAt("DemoVault",    dep.vault,    attacker);
  const dex     = await hre.ethers.getContractAt("ABISDex",      dep.dex,      attacker);
  const token   = await hre.ethers.getContractAt("ABISToken",    dep.token,    attacker);
  const lending = await hre.ethers.getContractAt("ABISLending",  dep.lending,  attacker);

  console.log("Attacker :", attacker.address);
  console.log("Victim   :", victim.address);
  console.log("isBlocked:", await reg.isBlocked(attacker.address));
  console.log("");

  // Try all 4 protocols with the blocked wallet
  const tests = [
    { name: "DemoVault  (deposit)",  fn: () => vault.deposit({ value: hre.ethers.parseEther("0.01") }) },
    { name: "ABISDex    (buyTokens)",fn: () => dex.buyTokens({ value: hre.ethers.parseEther("0.01") }) },
    { name: "ABISToken  (transfer)", fn: () => token.transfer(victim.address, hre.ethers.parseUnits("1", 18)) },
    { name: "ABISLending(deposit)",  fn: () => lending.deposit({ value: hre.ethers.parseEther("0.01") }) },
  ];

  console.log("── Testing blocked wallet on all protocols ──");
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`❌  ${t.name} — NOT blocked (unexpected!)`);
    } catch(e) {
      console.log(`✅  ${t.name} — REJECTED: ${e.shortMessage || e.message.slice(0, 60)}`);
    }
  }

  // Confirm innocent wallet is still free
  console.log("\n── Innocent wallet (not attacked) ──");
  const vaultI = await hre.ethers.getContractAt("DemoVault", dep.vault, innocent);
  try {
    await vaultI.deposit({ value: hre.ethers.parseEther("0.01") });
    console.log("✅  Innocent wallet — deposit OK (correct behavior)");
  } catch(e) {
    console.log("❌  Innocent wallet blocked (false positive!):", e.message.slice(0, 60));
  }
}

main().catch(console.error);
