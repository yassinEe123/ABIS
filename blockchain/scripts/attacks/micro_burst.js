// 40 tiny vault deposits in rapid succession to simulate micro-transaction burst
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

  const TC = process.env.ABIS_TARGET_CONTRACT ?? "vault";
  const [_cName, _cAddr, _cAbi] = TC === "lending"
    ? ["ABISLending", dep.lending, "ABISLending"]
    : TC === "dex"
    ? ["ABISDex",     dep.dex,    "ABISDex"]
    : ["DemoVault",   dep.vault,  "DemoVault"];
  const vault = await hre.ethers.getContractAt(_cAbi, _cAddr, attacker);

  console.log(`🔴 MICRO_BURST [${TC}] | attacker: ${attacker.address}`);

  const amounts = [
    "0.001","0.002","0.003","0.001","0.005","0.002","0.004","0.001","0.003","0.005",
    "0.002","0.001","0.004","0.003","0.005","0.001","0.002","0.003","0.004","0.001",
    "0.005","0.002","0.001","0.003","0.004","0.005","0.002","0.001","0.003","0.002",
    "0.004","0.001","0.005","0.003","0.002","0.004","0.001","0.005","0.003","0.002"
  ];

  for (let i = 0; i < 40; i++) {
    try {
      const tx = await vault.deposit({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  amount=${amounts[i]} ETH`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(200);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
