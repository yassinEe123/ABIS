// Front-run, victim, and back-run sandwich pattern on DEX — 3 rapid iterations
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
  const attacker = signers[ATK];

  const dex   = await hre.ethers.getContractAt("ABISDex",   dep.dex,   attacker);
  const token = await hre.ethers.getContractAt("ABISToken", dep.token, attacker);

  console.log("🔴 SANDWICH_ATTACK | attacker:", attacker.address);

  for (let round = 0; round < 3; round++) {
    console.log(`  --- Round ${round+1} ---`);

    // Front-run: buy before victim
    try {
      const frontTx = await dex.buyTokens({ value: e("0.1") });
      await frontTx.wait();
      console.log(`    front-run buy ✅  0.1 ETH`);
    } catch (err) {
      console.log(`    front-run ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(100);

    // Middle: simulate victim transaction
    try {
      const midTx = await dex.buyTokens({ value: e("0.5") });
      await midTx.wait();
      console.log(`    middle (victim sim) ✅  0.5 ETH`);
    } catch (err) {
      console.log(`    middle ❌ BLOCKED: ${err.shortMessage || err.message}`);
    }
    await sleep(100);

    // Back-run: sell after victim pumped price
    try {
      const backAmount = hre.ethers.parseUnits("50", 18);
      const appTx = await token.approve(dep.dex, backAmount);
      await appTx.wait();
      const backTx = await dex.sellTokens(backAmount);
      await backTx.wait();
      console.log(`    back-run sell ✅  50 tokens`);
    } catch (err) {
      console.log(`    back-run ❌ BLOCKED: ${err.shortMessage || err.message}`);
    }

    await sleep(200);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
