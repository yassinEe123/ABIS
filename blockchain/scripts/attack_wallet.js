// Simulates rapid direct ETH transfers from attacker wallet to victim wallet.
// No DeFi protocol involved — pure wallet-to-wallet.
// Proves ABIS monitors ALL blockchain transactions, not just protocol calls.

const hre = require("hardhat");

async function main() {
  const signers = await hre.ethers.getSigners();

  // Use fresh wallets not used by other scripts
  const attacker = signers[8];
  const victim   = signers[9];

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔴  WALLET-TO-WALLET BURST ATTACK");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Attacker :", attacker.address);
  console.log("Victim   :", victim.address);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // 10 rapid ETH transfers of varying amounts
  const amounts = [
    "0.10", "0.15", "0.20", "0.12",
    "0.18", "0.25", "0.11", "0.30",
    "0.09", "0.22",
  ];

  for (let i = 0; i < amounts.length; i++) {
    try {
      const tx = await attacker.sendTransaction({
        to: victim.address,
        value: hre.ethers.parseEther(amounts[i]),
      });
      await tx.wait();
      console.log(`transfer ${(i + 1).toString().padStart(2)} | ${amounts[i]} ETH → ${victim.address.slice(0, 10)}…`);
    } catch (e) {
      console.log(`transfer ${(i + 1).toString().padStart(2)} | ❌  BLOCKED by ABIS: ${e.shortMessage || e.message}`);
      break;
    }
  }

  console.log("\n🔴  Wallet-to-wallet attack finished");
  console.log("    Check the ABIS agent log to see if the attacker was detected & blocked.");
}

main().catch((e) => { console.error(e); process.exit(1); });
