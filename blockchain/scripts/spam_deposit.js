const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
);

const VAULT_ADDR = deployment.vault;

async function main() {
  const [, attacker] = await hre.ethers.getSigners();
  const vault = await hre.ethers.getContractAt("DemoVault", VAULT_ADDR, attacker);

  console.log("Attacker:", attacker.address);

  for (let i = 1; i <= 3; i++) {
    const tx = await vault.deposit({
      value: hre.ethers.parseEther("0.01")
    });
    await tx.wait();
    console.log("deposit", i, "done");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
