// 25 rapid vault deposits simulating the call pattern of a reentrancy exploit attempt
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

  const TC = process.env.ABIS_TARGET_CONTRACT ?? "vault";
  const [_cName, _cAddr, _cAbi] = TC === "lending"
    ? ["ABISLending", dep.lending, "ABISLending"]
    : TC === "dex"
    ? ["ABISDex",     dep.dex,    "ABISDex"]
    : ["DemoVault",   dep.vault,  "DemoVault"];
  const vault = await hre.ethers.getContractAt(_cAbi, _cAddr, attacker);

  console.log(`🔴 REENTRANCY_SIMULATION [${TC}] | attacker: ${attacker.address}`);
  console.log("   Simulating reentrancy-style recursive call pattern...");

  const amounts = [
    "0.01","0.5","0.1","0.3","0.05","0.2","0.15","0.4","0.01","0.5",
    "0.05","0.3","0.1","0.2","0.5","0.01","0.4","0.1","0.3","0.05",
    "0.2","0.15","0.5","0.01","0.3"
  ];
  const delays = [
    50,200,100,500,50,300,150,400,50,500,
    100,200,50,300,500,50,400,100,200,50,
    300,150,500,50,200
  ];

  for (let i = 0; i < 25; i++) {
    try {
      const tx = await vault.deposit({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  call ${i+1} ✅  ${amounts[i]} ETH  (reentrant depth sim ${i+1})`);
    } catch (err) {
      console.log(`  call ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(delays[i]);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
