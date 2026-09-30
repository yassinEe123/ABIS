// 12 rapid token transfers to one fixed recipient to simulate token burst attack
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "3")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];
  const recipient = signers[TGT].address;

  const token = await hre.ethers.getContractAt("ABISToken", dep.token, attacker);
  const tokenAdmin = await hre.ethers.getContractAt("ABISToken", dep.token, signers[0]);

  console.log("🔴 BURST_TOKEN_SAME | attacker:", attacker.address);
  console.log("   recipient:", recipient);

  // Fund attacker with tokens from deployer (signer[0] is whitelisted in agent)
  const fundTx = await tokenAdmin.transfer(attacker.address, hre.ethers.parseUnits("10000", 18));
  await fundTx.wait();
  console.log("   funded: 10000 tokens");

  const amounts = [150, 200, 100, 300, 250, 180, 120, 500, 200, 400, 350, 150];

  for (let i = 0; i < 12; i++) {
    try {
      const tokenAmount = hre.ethers.parseUnits(amounts[i].toString(), 18);
      const tx = await token.transfer(recipient, tokenAmount);
      await tx.wait();
      console.log(`  tx ${i+1} ✅  amount=${amounts[i]} tokens`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(500);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
