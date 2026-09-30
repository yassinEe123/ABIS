// signer[15] simulating a newly created wallet sending 15 rapid vault deposits
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "15")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK]; // Simulates brand-new wallet

  const vault = await hre.ethers.getContractAt("DemoVault", dep.vault, attacker);

  console.log("🔴 NEW_WALLET_BURST | attacker (new wallet):", attacker.address);
  console.log("   Simulating freshly created wallet flooding vault with deposits...");

  const amounts = [
    "0.05","0.10","0.08","0.15","0.12","0.20","0.07","0.18",
    "0.09","0.14","0.06","0.11","0.16","0.13","0.19"
  ];

  for (let i = 0; i < 15; i++) {
    try {
      const tx = await vault.deposit({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  amount=${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(200);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
