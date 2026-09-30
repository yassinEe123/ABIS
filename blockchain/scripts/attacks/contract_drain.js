// 20 rapid small vault withdrawals after a large deposit to simulate contract fund drain
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

  console.log(`🔴 CONTRACT_DRAIN [${TC}] | attacker: ${attacker.address}`);

  // Deposit large sum first
  try {
    const depTx = await vault.deposit({ value: e("5") });
    await depTx.wait();
    console.log("   initial deposit ✅  5 ETH");
  } catch (err) {
    console.log("   initial deposit ❌ BLOCKED:", err.shortMessage || err.message);
    return;
  }

  await sleep(500);
  console.log("   Rapid small withdrawals to drain contract...");

  for (let i = 0; i < 20; i++) {
    try {
      const tx = await vault.withdraw(e("0.1"));
      await tx.wait();
      console.log(`  withdraw ${i+1} ✅  0.1 ETH  (total drained: ${((i+1)*0.1).toFixed(1)} ETH)`);
    } catch (err) {
      console.log(`  withdraw ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(100);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
