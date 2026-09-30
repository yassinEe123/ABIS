// 15 token transfers each to a different signer address to simulate token spray attack
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "2")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const token = await hre.ethers.getContractAt("ABISToken", dep.token, attacker);
  const tokenAdmin = await hre.ethers.getContractAt("ABISToken", dep.token, signers[0]);

  console.log("🔴 SPRAY_TOKEN_MULTI | attacker:", attacker.address);

  // Fund attacker with tokens from deployer (signer[0] is whitelisted in agent)
  const fundTx = await tokenAdmin.transfer(attacker.address, hre.ethers.parseUnits("10000", 18));
  await fundTx.wait();
  console.log("   funded: 10000 tokens");

  const amounts  = [100, 150, 200, 120, 300, 180, 250, 110, 200, 130, 280, 160, 220, 190, 100];

  for (let i = 0; i < 15; i++) {
    const recipient = signers[(TGT + i) % 18 + 1].address;
    const tokenAmount = hre.ethers.parseUnits(amounts[i].toString(), 18);
    try {
      const tx = await token.transfer(recipient, tokenAmount);
      await tx.wait();
      console.log(`  tx ${i+1} ✅  to=${recipient.slice(0,10)}... amount=${amounts[i]} tokens`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(500);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
