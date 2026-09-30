// 12 rapid direct ETH sends to a fixed wallet to simulate burst wallet attack
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "6")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];
  const target   = signers[TGT].address;

  console.log("🔴 BURST_WALLET_SAME | attacker:", attacker.address);
  console.log("   target:", target);

  for (let i = 0; i < 12; i++) {
    try {
      const tx = await attacker.sendTransaction({ to: target, value: e("0.1") });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  amount=0.1 ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(500);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
