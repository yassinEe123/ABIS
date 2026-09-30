// Phantom Strike — unknown anomaly pattern
// Designed to be detected by IsolationForest (not RandomForest).
// Combines cross-protocol switching, zigzag amounts, and alternating targets
// in a way that doesn't match any of the 48 trained attack classes.
const hre  = require("hardhat");
const fs   = require("fs");
const path = require("path");

const dep   = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e     = hre.ethers.parseEther;

async function main() {
  const signers = await hre.ethers.getSigners();
  const ATK     = Math.min(19, Math.max(1, parseInt(process.env.ABIS_ATTACKER ?? "12")));
  const attacker = signers[ATK];

  const vault   = await hre.ethers.getContractAt("DemoVault",   dep.vault,   attacker);
  const dex     = await hre.ethers.getContractAt("ABISDex",     dep.dex,     attacker);
  const lending = await hre.ethers.getContractAt("ABISLending", dep.lending, attacker);

  console.log("🔴 PHANTOM_STRIKE | attacker:", attacker.address);
  console.log("   Pattern: cross-protocol + zigzag amounts + irregular timing");

  // Zigzag amounts: alternates between tiny and large values in an unpredictable way.
  // This specific combination of std_value + tx_count + unique_to + cross-protocol
  // doesn't match any of the 48 labeled classes, so RandomForest confidence stays low.
  const steps = [
    { proto: "vault",   action: "deposit",  amount: "0.001", delay: 180 },
    { proto: "dex",     action: "buy",      amount: "2.500", delay: 120 },
    { proto: "lending", action: "deposit",  amount: "0.003", delay: 200 },
    { proto: "vault",   action: "deposit",  amount: "1.800", delay: 150 },
    { proto: "dex",     action: "buy",      amount: "0.002", delay: 100 },
    { proto: "lending", action: "deposit",  amount: "3.200", delay: 180 },
    { proto: "vault",   action: "deposit",  amount: "0.001", delay: 130 },
    { proto: "dex",     action: "buy",      amount: "0.900", delay: 200 },
    { proto: "lending", action: "deposit",  amount: "0.004", delay: 110 },
    { proto: "vault",   action: "deposit",  amount: "2.100", delay: 160 },
    { proto: "dex",     action: "buy",      amount: "0.001", delay: 140 },
    { proto: "lending", action: "deposit",  amount: "1.500", delay: 190 },
    { proto: "vault",   action: "deposit",  amount: "0.002", delay: 120 },
    { proto: "dex",     action: "buy",      amount: "4.000", delay: 100 },
    { proto: "vault",   action: "deposit",  amount: "0.001", delay: 170 },
    { proto: "lending", action: "deposit",  amount: "0.005", delay: 130 },
    { proto: "dex",     action: "buy",      amount: "2.700", delay: 150 },
    { proto: "vault",   action: "deposit",  amount: "0.003", delay: 110 },
    { proto: "lending", action: "deposit",  amount: "3.800", delay: 180 },
    { proto: "dex",     action: "buy",      amount: "0.001", delay: 120 },
  ];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    try {
      let tx;
      if (s.proto === "vault") {
        tx = await vault.deposit({ value: e(s.amount) });
      } else if (s.proto === "dex") {
        tx = await dex.buyTokens({ value: e(s.amount) });
      } else {
        tx = await lending.deposit({ value: e(s.amount) });
      }
      await tx.wait();
      console.log(`  step ${String(i+1).padStart(2,"0")} ✅  [${s.proto.padEnd(7)}] amount=${s.amount} ETH`);
    } catch (err) {
      console.log(`  step ${String(i+1).padStart(2,"0")} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(s.delay);
  }

  console.log("🔴 Done");
}

main().catch(err => { console.error(err); process.exit(1); });
