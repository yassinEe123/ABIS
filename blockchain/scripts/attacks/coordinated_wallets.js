// 4 signers hit vault simultaneously in 3 rounds to simulate coordinated wallet attack
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
  const attackers = [signers[ATK], signers[Math.min(19, ATK+1)], signers[Math.min(19, ATK+2)], signers[Math.min(19, ATK+3)]];

  console.log("🔴 COORDINATED_WALLETS | attackers:");
  attackers.forEach((a, i) => console.log(`   wallet[${i}]:`, a.address));

  const roundAmounts = [
    ["0.1","0.2","0.15","0.25"],
    ["0.3","0.1","0.2","0.15"],
    ["0.2","0.3","0.25","0.1"]
  ];

  for (let round = 0; round < 3; round++) {
    console.log(`  --- Round ${round+1}: all wallets deposit simultaneously ---`);

    const promises = attackers.map(async (attacker, j) => {
      const vault = await hre.ethers.getContractAt("DemoVault", dep.vault, attacker);
      try {
        const tx = await vault.deposit({ value: e(roundAmounts[round][j]) });
        await tx.wait();
        console.log(`    wallet[${j}] ✅  amount=${roundAmounts[round][j]} ETH`);
      } catch (err) {
        console.log(`    wallet[${j}] ❌ BLOCKED: ${err.shortMessage || err.message}`);
      }
    });

    await Promise.all(promises);
    await sleep(500);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
