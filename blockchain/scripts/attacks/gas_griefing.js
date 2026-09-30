// 30 rapid minimal vault deposits to grief gas and clog the transaction queue
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "5")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const TC = process.env.ABIS_TARGET_CONTRACT ?? "vault";
  const [_cName, _cAddr, _cAbi] = TC === "lending"
    ? ["ABISLending", dep.lending, "ABISLending"]
    : TC === "dex"
    ? ["ABISDex",     dep.dex,    "ABISDex"]
    : ["DemoVault",   dep.vault,  "DemoVault"];
  const vault = await hre.ethers.getContractAt(_cAbi, _cAddr, attacker);

  console.log(`🔴 GAS_GRIEFING [${TC}] | attacker: ${attacker.address}`);
  console.log("   Flooding mempool with minimum-cost transactions to grief gas usage...");

  for (let i = 0; i < 30; i++) {
    try {
      const tx = await vault.deposit({ value: e("0.001") });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  0.001 ETH  (gas consumed cumulatively)`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(100);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
