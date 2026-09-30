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

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

async function main() {
  const signers = await hre.ethers.getSigners();

  console.log("🔥 CHAOS ATTACK STARTED");
  console.log("Vault:", VAULT_ADDR);

  for (let i = 0; i < 12; i++) {
    const attacker = signers[Math.floor(rand(1, 6))];

    const vault = await hre.ethers.getContractAt(
      "DemoVault",
      VAULT_ADDR,
      attacker
    );

    let value;

    if (Math.random() < 0.2) {
      value = rand(1, 5); // whale-like tx
    } else {
      value = rand(0.001, 0.05); // random small/medium tx
    }

    const tx = await vault.deposit({
      value: hre.ethers.parseEther(value.toFixed(4)),
    });

    await tx.wait();

    console.log(
      `tx ${i + 1} | wallet=${attacker.address} | value=${value.toFixed(4)} ETH`
    );
  }

  console.log("💥 CHAOS ATTACK FINISHED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
