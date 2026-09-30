// 3 very large token transfers to drain token holdings in staged withdrawals
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "4")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];
  const target   = signers[TGT].address;

  const token = await hre.ethers.getContractAt("ABISToken", dep.token, attacker);
  const tokenAdmin = await hre.ethers.getContractAt("ABISToken", dep.token, signers[0]);

  console.log("🔴 TOKEN_DRAIN | attacker:", attacker.address);
  console.log("   target:", target);

  // Fund attacker with tokens from deployer (signer[0] is whitelisted in agent)
  const fundTx = await tokenAdmin.transfer(attacker.address, hre.ethers.parseUnits("100000", 18));
  await fundTx.wait();
  console.log("   funded: 100000 tokens");

  const amounts  = ["5000","20000","50000"];
  const delays   = [1000, 8000, 15000];

  for (let i = 0; i < 3; i++) {
    const tokenAmount = hre.ethers.parseUnits(amounts[i], 18);
    try {
      console.log(`  tx ${i+1}: transferring ${amounts[i]} tokens...`);
      const tx = await token.transfer(target, tokenAmount);
      await tx.wait();
      console.log(`  tx ${i+1} ✅  ${amounts[i]} tokens`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    if (i < 2) {
      console.log(`  ⏳ Simulating ${delays[i]/1000}s delay...`);
      await sleep(delays[i] > 5000 ? 3000 : delays[i]);
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
