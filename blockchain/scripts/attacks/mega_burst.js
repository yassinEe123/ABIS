// 70 vault deposits with alternating amounts at 100ms intervals to simulate mega burst
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "8")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const TC = process.env.ABIS_TARGET_CONTRACT ?? "vault";
  const [_cName, _cAddr, _cAbi] = TC === "lending"
    ? ["ABISLending", dep.lending, "ABISLending"]
    : TC === "dex"
    ? ["ABISDex",     dep.dex,    "ABISDex"]
    : ["DemoVault",   dep.vault,  "DemoVault"];
  const vault = await hre.ethers.getContractAt(_cAbi, _cAddr, attacker);

  console.log(`🔴 MEGA_BURST [${TC}] | attacker: ${attacker.address}`);

  // Alternating small and large amounts
  const baseAmounts = ["0.01","0.05","0.1","0.2","0.5","0.3","0.15","0.08","0.4","0.25"];

  for (let i = 0; i < 70; i++) {
    const amount = baseAmounts[i % baseAmounts.length];
    try {
      const tx = await vault.deposit({ value: e(amount) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  amount=${amount} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(100);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
