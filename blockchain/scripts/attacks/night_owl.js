// 5 slow periodic vault deposits simulating off-hours bot activity to avoid monitoring
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "11")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const TC = process.env.ABIS_TARGET_CONTRACT ?? "vault";
  const [_cName, _cAddr, _cAbi] = TC === "lending"
    ? ["ABISLending", dep.lending, "ABISLending"]
    : TC === "dex"
    ? ["ABISDex",     dep.dex,    "ABISDex"]
    : ["DemoVault",   dep.vault,  "DemoVault"];
  const vault = await hre.ethers.getContractAt(_cAbi, _cAddr, attacker);

  console.log(`🔴 NIGHT_OWL [${TC}] | attacker: ${attacker.address}`);
  console.log("   Off-hours slow deposits simulating bot active during low-monitoring windows...");

  const amounts = ["0.02","0.08","0.15","0.35","0.40"];

  for (let i = 0; i < 5; i++) {
    const timestamp = new Date().toISOString();
    try {
      const tx = await vault.deposit({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  deposit ${i+1} ✅  [${timestamp}] amount=${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  deposit ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    if (i < 4) {
      console.log(`  ⏳ Simulating 8s delay (represents hours between off-hours activity)...`);
      await sleep(8000);
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
