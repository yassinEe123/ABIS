// Deposit 10 ETH then execute 3 large withdrawals with delays to simulate vault drain
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers  = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "3")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const attacker = signers[ATK];

  const TC = process.env.ABIS_TARGET_CONTRACT ?? "vault";
  const [_cName, _cAddr, _cAbi] = TC === "lending"
    ? ["ABISLending", dep.lending, "ABISLending"]
    : TC === "dex"
    ? ["ABISDex",     dep.dex,    "ABISDex"]
    : ["DemoVault",   dep.vault,  "DemoVault"];
  const vault = await hre.ethers.getContractAt(_cAbi, _cAddr, attacker);

  console.log(`🔴 VAULT_DRAIN [${TC}] | attacker: ${attacker.address}`);

  // Establish a large position first
  try {
    const depTx = await vault.deposit({ value: e("10") });
    await depTx.wait();
    console.log("   initial deposit ✅  10 ETH");
  } catch (err) {
    console.log("   initial deposit ❌ BLOCKED:", err.shortMessage || err.message);
    return;
  }

  await sleep(1000);
  console.log("   Draining vault with large staged withdrawals...");

  const withdrawAmounts = ["5","3","2"];
  const withdrawDelays  = [1000, 5000, 15000];

  for (let i = 0; i < 3; i++) {
    try {
      const tx = await vault.withdraw(e(withdrawAmounts[i]));
      await tx.wait();
      console.log(`  withdraw ${i+1} ✅  ${withdrawAmounts[i]} ETH`);
    } catch (err) {
      console.log(`  withdraw ${i+1} ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    if (i < 2) {
      const delay = withdrawDelays[i];
      console.log(`  ⏳ Simulating ${delay/1000}s delay between withdrawals...`);
      await sleep(delay > 3000 ? 3000 : delay);
    }
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
