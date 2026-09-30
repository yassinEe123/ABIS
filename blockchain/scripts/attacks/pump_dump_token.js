// Buy tokens 8 times to inflate price then dump (sellTokens) to simulate pump-and-dump
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

  const dex   = await hre.ethers.getContractAt("ABISDex",   dep.dex,   attacker);
  const token = await hre.ethers.getContractAt("ABISToken", dep.token, attacker);

  console.log("🔴 PUMP_DUMP_TOKEN | attacker:", attacker.address);
  console.log("   Phase 1: PUMP — buying tokens to inflate price...");

  const buyAmounts = ["1","2","3","5","8","10","7","4"];

  let totalTokensReceived = hre.ethers.parseUnits("0", 18);

  for (let i = 0; i < 8; i++) {
    try {
      const tx = await dex.buyTokens({ value: e(buyAmounts[i]) });
      await tx.wait();
      console.log(`  buy ${i+1} ✅  amount=${buyAmounts[i]} ETH`);
      // Estimate tokens received (approximate)
      totalTokensReceived += hre.ethers.parseUnits(buyAmounts[i], 18);
    } catch (err) {
      console.log(`  buy ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(400);
  }

  console.log("   Phase 2: DUMP — selling accumulated tokens...");

  // Use a fixed sell amount based on what was likely acquired
  const sellAmount = hre.ethers.parseUnits("500", 18);

  try {
    const approveTx = await token.approve(dep.dex, sellAmount);
    await approveTx.wait();
    console.log("   approve ✅");

    const sellTx = await dex.sellTokens(sellAmount);
    await sellTx.wait();
    console.log("   sell ✅  amount=500 tokens — DUMP complete");
  } catch (err) {
    console.log("   sell ❌ BLOCKED:", err.shortMessage || err.message);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
