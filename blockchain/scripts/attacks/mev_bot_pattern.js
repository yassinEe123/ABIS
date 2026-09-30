// 6 cycles of instant buy-then-sell to simulate MEV bot arbitrage extraction
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "7")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const dex   = await hre.ethers.getContractAt("ABISDex",   dep.dex,   attacker);
  const token = await hre.ethers.getContractAt("ABISToken", dep.token, attacker);

  console.log("🔴 MEV_BOT_PATTERN | attacker:", attacker.address);
  console.log("   Simulating MEV bot: instant buy-sell cycles to extract value...");

  const ethAmounts   = ["0.05","0.2","0.5","1.0","2.0","0.8"];
  const tokenAmounts = ["5","20","50","100","200","80"];
  const cycleDelays  = [50, 100, 500, 200, 50, 300];

  for (let i = 0; i < 6; i++) {
    console.log(`  cycle ${i+1}: buy ${ethAmounts[i]} ETH → sell ${tokenAmounts[i]} tokens`);

    try {
      const buyTx = await dex.buyTokens({ value: e(ethAmounts[i]) });
      await buyTx.wait();
      console.log(`    buy ✅  ${ethAmounts[i]} ETH`);
    } catch (err) {
      console.log(`    buy ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }

    await sleep(cycleDelays[i]);

    try {
      const sellAmount = hre.ethers.parseUnits(tokenAmounts[i], 18);
      const appTx = await token.approve(dep.dex, sellAmount);
      await appTx.wait();
      const sellTx = await dex.sellTokens(sellAmount);
      await sellTx.wait();
      console.log(`    sell ✅  ${tokenAmounts[i]} tokens`);
    } catch (err) {
      console.log(`    sell ❌ BLOCKED: ${err.shortMessage || err.message}`);
    }

    await sleep(cycleDelays[i]);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
