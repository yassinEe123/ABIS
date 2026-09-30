// 50 rapid vault deposits to flood contract call queue and test DoS resistance
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "6")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const TC = process.env.ABIS_TARGET_CONTRACT ?? "vault";
  const [_cName, _cAddr, _cAbi] = TC === "lending"
    ? ["ABISLending", dep.lending, "ABISLending"]
    : TC === "dex"
    ? ["ABISDex",     dep.dex,    "ABISDex"]
    : ["DemoVault",   dep.vault,  "DemoVault"];
  const vault = await hre.ethers.getContractAt(_cAbi, _cAddr, attacker);

  console.log(`🔴 CONTRACT_CALL_FLOOD [${TC}] | attacker: ${attacker.address}`);
  console.log("   Flooding vault with 50 rapid contract calls at 80ms intervals...");

  for (let i = 0; i < 50; i++) {
    try {
      const tx = await vault.deposit({ value: e("0.001") });
      await tx.wait();
      console.log(`  call ${i+1} ✅  0.001 ETH`);
    } catch (err) {
      console.log(`  call ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(80);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
