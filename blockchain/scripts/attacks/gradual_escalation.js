// 8 deposits with exponentially increasing amounts to simulate gradual threat escalation
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "9")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const TC = process.env.ABIS_TARGET_CONTRACT ?? "vault";
  const [_cName, _cAddr, _cAbi] = TC === "lending"
    ? ["ABISLending", dep.lending, "ABISLending"]
    : TC === "dex"
    ? ["ABISDex",     dep.dex,    "ABISDex"]
    : ["DemoVault",   dep.vault,  "DemoVault"];
  const vault = await hre.ethers.getContractAt(_cAbi, _cAddr, attacker);

  console.log(`🔴 GRADUAL_ESCALATION [${TC}] | attacker: ${attacker.address}`);
  console.log("   Starting small, gradually escalating deposit size...");

  const amounts = ["0.01","0.05","0.1","0.2","0.5","1.0","2.0","5.0"];

  for (let i = 0; i < 8; i++) {
    try {
      const tx = await vault.deposit({ value: e(amounts[i]) });
      await tx.wait();
      console.log(`  tx ${i+1} ✅  amount=${amounts[i]} ETH  (escalation level ${i+1}/8)`);
    } catch (err) {
      console.log(`  tx ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    if (i < 7) {
      console.log(`  ⏳ Simulating ${5+(i*3)}s delay (escalation pause)...`);
      await sleep(2000); // 2s simulation of 5-20s real delay
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
