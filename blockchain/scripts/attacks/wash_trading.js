// 6 cycles of buyTokens then immediately sellTokens same amount to simulate wash trading
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "4")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const dex   = await hre.ethers.getContractAt("ABISDex",   dep.dex,   attacker);
  const token = await hre.ethers.getContractAt("ABISToken", dep.token, attacker);

  console.log("🔴 WASH_TRADING | attacker:", attacker.address);

  const ethAmounts     = ["0.5","1.0","2.0","3.0","5.0","4.0"];
  const tokenAmounts   = ["50","100","200","300","500","400"];

  for (let i = 0; i < 6; i++) {
    console.log(`  cycle ${i+1}: buy ${ethAmounts[i]} ETH worth then sell ${tokenAmounts[i]} tokens`);

    // BUY
    try {
      const buyTx = await dex.buyTokens({ value: e(ethAmounts[i]) });
      await buyTx.wait();
      console.log(`    buy ✅`);
    } catch (err) {
      console.log(`    buy ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }

    await sleep(200);

    // SELL
    try {
      const sellAmount = hre.ethers.parseUnits(tokenAmounts[i], 18);
      const appTx = await token.approve(dep.dex, sellAmount);
      await appTx.wait();
      const sellTx = await dex.sellTokens(sellAmount);
      await sellTx.wait();
      console.log(`    sell ✅`);
    } catch (err) {
      console.log(`    sell ❌ BLOCKED: ${err.shortMessage || err.message}`);
    }

    await sleep(300);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
