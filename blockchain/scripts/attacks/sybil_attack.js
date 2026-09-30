// 3 different signers each send 8 txs to vault to simulate coordinated Sybil identity attack
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "2")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attackers = [signers[ATK], signers[Math.min(19, ATK+1)], signers[Math.min(19, ATK+2)]];

  console.log("🔴 SYBIL_ATTACK | signers:");
  attackers.forEach((a, i) => console.log(`   identity[${i}]:`, a.address));

  const amounts = [
    ["0.1","0.2","0.3","0.15","0.05","0.25","0.1","0.2"],
    ["0.2","0.1","0.15","0.3","0.25","0.1","0.2","0.05"],
    ["0.3","0.15","0.1","0.2","0.1","0.3","0.05","0.25"]
  ];

  for (let identity = 0; identity < attackers.length; identity++) {
    console.log(`  --- Sybil identity ${identity+1} ---`);
    const vault = await hre.ethers.getContractAt("DemoVault", dep.vault, attackers[identity]);

    for (let i = 0; i < 8; i++) {
      try {
        const tx = await vault.deposit({ value: e(amounts[identity][i]) });
        await tx.wait();
        console.log(`    tx ${i+1} ✅  amount=${amounts[identity][i]} ETH`);
      } catch (err) {
        console.log(`    tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
        break;
      }
      await sleep(500);
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
