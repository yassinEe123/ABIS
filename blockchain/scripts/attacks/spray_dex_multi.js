// 12 DEX buyTokens from 4 different signers to simulate multi-source DEX spray
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "2")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attackers = [signers[ATK], signers[Math.min(19, ATK+1)], signers[Math.min(19, ATK+2)], signers[Math.min(19, ATK+3)]];

  console.log("🔴 SPRAY_DEX_MULTI | attackers:");
  attackers.forEach((a, i) => console.log(`   attacker[${i}]:`, a.address));

  const amounts = [
    ["0.008","0.015","0.020"],
    ["0.012","0.025","0.010"],
    ["0.018","0.035","0.008"],
    ["0.022","0.030","0.015"]
  ];

  let txCount = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < attackers.length; j++) {
      const dex = await hre.ethers.getContractAt("ABISDex", dep.dex, attackers[j]);
      txCount++;
      try {
        const tx = await dex.buyTokens({ value: e(amounts[j][i]) });
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
