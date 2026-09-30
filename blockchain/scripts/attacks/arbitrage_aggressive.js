// Alternating vault deposits and DEX buyTokens rapidly to simulate aggressive arbitrage
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "8")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const vault = await hre.ethers.getContractAt("DemoVault", dep.vault, attacker);
  const dex   = await hre.ethers.getContractAt("ABISDex",   dep.dex,   attacker);

  console.log("🔴 ARBITRAGE_AGGRESSIVE | attacker:", attacker.address);
  console.log("   Rapidly alternating between vault and DEX to exploit price differences...");

  const vaultAmounts = ["0.5","1.0","2.0"];
  const dexAmounts   = ["0.3","0.8","1.5"];

  for (let i = 0; i < 3; i++) {
    // Vault deposit
    try {
      const vaultTx = await vault.deposit({ value: e(vaultAmounts[i]) });
      await vaultTx.wait();
      console.log(`  arb ${i+1} vault ✅  ${vaultAmounts[i]} ETH`);
    } catch (err) {
      console.log(`  arb ${i+1} vault ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(100);

    // DEX buyTokens immediately after
    try {
      const dexTx = await dex.buyTokens({ value: e(dexAmounts[i]) });
      await dexTx.wait();
      console.log(`  arb ${i+1} dex   ✅  ${dexAmounts[i]} ETH`);
    } catch (err) {
      console.log(`  arb ${i+1} dex   ❌ BLOCKED: ${err.shortMessage || err.message}`);
    }
    await sleep(150);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
