// 10 tiny DEX buys spread across 3 interaction types to stealthily accumulate tokens
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "12")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const dex   = await hre.ethers.getContractAt("ABISDex",   dep.dex,   attacker);
  const vault  = await hre.ethers.getContractAt("DemoVault", dep.vault, attacker);

  console.log("🔴 STEALTH_ACCUMULATION | attacker:", attacker.address);
  console.log("   Tiny buys mixed with other activity to disguise accumulation...");

  const txPlan = [
    { type: "dex",   amount: "0.001" },
    { type: "vault", amount: "0.01"  },
    { type: "dex",   amount: "0.003" },
    { type: "dex",   amount: "0.002" },
    { type: "vault", amount: "0.005" },
    { type: "dex",   amount: "0.005" },
    { type: "dex",   amount: "0.001" },
    { type: "vault", amount: "0.008" },
    { type: "dex",   amount: "0.025" },
    { type: "dex",   amount: "0.010" }
  ];
  const delays = [3000, 2000, 5000, 4000, 15000, 2000, 8000, 3000, 10000, 2000];

  for (let i = 0; i < txPlan.length; i++) {
    const plan = txPlan[i];
    try {
      let tx;
      if (plan.type === "dex") {
        tx = await dex.buyTokens({ value: e(plan.amount) });
      } else {
        tx = await vault.deposit({ value: e(plan.amount) });
      }
      await tx.wait();
      console.log(`  tx ${i+1} ✅  [${plan.type}] ${plan.amount} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    if (i < txPlan.length - 1) {
      const d = delays[i];
      console.log(`  ⏳ Simulating ${d/1000}s stealth delay...`);
      await sleep(d > 5000 ? 2000 : d);
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
