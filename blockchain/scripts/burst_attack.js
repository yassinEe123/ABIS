const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "deployments", "localhost.json"),
    "utf8"
  )
);

const VAULT_ADDR = deployment.vault;

async function main() {
  const [, , attacker] = await hre.ethers.getSigners();
  const vault = await hre.ethers.getContractAt("DemoVault", VAULT_ADDR, attacker);

  console.log("Burst attacker:", attacker.address);
  console.log("Vault:", VAULT_ADDR);

  const amounts = ["0.005", "0.010", "0.015", "0.020", "0.025"];

  for (let i = 0; i < amounts.length; i++) {
    const tx = await vault.deposit({
      value: hre.ethers.parseEther(amounts[i]),
    });
    await tx.wait();
    console.log(`burst deposit ${i + 1} done | amount=${amounts[i]} ETH`);
  }

  console.log("🚨 Burst attack simulation completed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});



