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
  const [, user] = await hre.ethers.getSigners();
  const vault = await hre.ethers.getContractAt("DemoVault", VAULT_ADDR, user);

  console.log("Normal user:", user.address);
  console.log("Vault:", VAULT_ADDR);

  const tx = await vault.deposit({
    value: hre.ethers.parseEther("0.01"),
  });

  await tx.wait();

  console.log("✅ Normal deposit done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
