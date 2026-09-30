// 15 direct ETH sends each to a different address to simulate ETH spray attack
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "3")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  console.log("🔴 SPRAY_ETH_MULTI | attacker:", attacker.address);

  const amounts = [
    "0.05","0.10","0.15","0.20","0.08","0.25","0.12","0.30",
    "0.07","0.18","0.22","0.09","0.28","0.11","0.16"
  ];

  for (let i = 0; i < 15; i++) {
    // Send to different signers starting from TGT, cycling safely
    const targetIdx = (TGT + i) % 20;
    const target = signers[targetIdx].address;
    try {
      const tx = await attacker.sendTransaction({ to: target, value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  to=${target.slice(0,10)}... amount=${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(500);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
