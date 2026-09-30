// Spray ETH vers 6 wallets différents → risk ~70-80 → BLOCK_TEMP (Active Threats)
const hre = require("hardhat");

async function main() {
  const signers  = await hre.ethers.getSigners();
  const attacker = signers[5];   // wallet frais

  console.log("🔴 SPRAY ATTACK (mild) — Active Threats test");
  console.log("Attacker:", attacker.address);

  // ETH vers 6 cibles différentes = protocol=External → blockWallet() global
  const targets = [signers[10], signers[11], signers[12], signers[13], signers[14], signers[15]];
  const amounts = ["0.05", "0.08", "0.06", "0.09", "0.07", "0.05"];

  for (let i = 0; i < targets.length; i++) {
    try {
      const tx = await attacker.sendTransaction({
        to: targets[i].address,
        value: hre.ethers.parseEther(amounts[i]),
      });
      await tx.wait();
      console.log(`tx ${i+1} | ${amounts[i]} ETH → ${targets[i].address.slice(0,10)}...`);
    } catch (e) {
      console.log(`tx ${i+1} | ❌ BLOCKED: ${e.shortMessage || e.message}`);
      break;
    }
  }
  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
