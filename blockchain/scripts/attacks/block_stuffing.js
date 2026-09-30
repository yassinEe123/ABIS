// 100 rapid tiny vault deposits to stuff blocks and simulate transaction congestion DoS
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "10")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const TC = process.env.ABIS_TARGET_CONTRACT ?? "vault";
  const [_cName, _cAddr, _cAbi] = TC === "lending"
    ? ["ABISLending", dep.lending, "ABISLending"]
    : TC === "dex"
    ? ["ABISDex",     dep.dex,    "ABISDex"]
    : ["DemoVault",   dep.vault,  "DemoVault"];
  const vault = await hre.ethers.getContractAt(_cAbi, _cAddr, attacker);

  console.log(`🔴 BLOCK_STUFFING [${TC}] | attacker: ${attacker.address}`);
  console.log("   Flooding blocks with 100 tiny transactions to create congestion...");

  for (let i = 0; i < 100; i++) {
    try {
      const tx = await vault.deposit({ value: e("0.001") });
      await tx.wait();
      if (i % 10 === 0 || i < 5) {
        console.log(`  tx ${i+1} ✅  0.001 ETH`);
      } else if (i === 9) {
        console.log("  ... (logging every 10 txs) ...");
      }
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    const delay = 10 + Math.floor(Math.random() * 290); // 10-300ms
    await sleep(delay);
  }

  console.log("🔴 Done — 100 block-stuffing txs completed");
}

main().catch(e => { console.error(e); process.exit(1); });
