// 12 vault deposits from 4 different attacker signers (3 txs each) to simulate multi-source spray
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "4")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attackers = [signers[ATK], signers[Math.min(19, ATK+1)], signers[Math.min(19, ATK+2)], signers[Math.min(19, ATK+3)]];

  console.log("🔴 SPRAY_VAULT_MULTI | attackers:");
  attackers.forEach((a, i) => console.log(`   attacker[${i}]:`, a.address));

  const amounts = [
    ["0.1","0.5","1.0"],
    ["0.2","0.8","0.3"],
    ["0.5","1.0","0.4"],
    ["0.3","0.6","0.9"]
  ];

  let txCount = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < attackers.length; j++) {
      const vault = await hre.ethers.getContractAt("DemoVault", dep.vault, attackers[j]);
      txCount++;
      try {
        const tx = await vault.deposit({ value: e(amounts[j][i]) });
        await tx.wait();
        console.log(`  tx ${txCount} ✅  attacker[${j}] amount=${amounts[j][i]} ETH`);
      } catch (err) {
        console.log(`  tx ${txCount} ❌ BLOCKED (attacker[${j}]): ${err.shortMessage || err.message}`);
      }
      await sleep(300);
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
