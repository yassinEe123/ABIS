const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
);

const VAULT_ADDR = deployment.vault;

async function main() {
  const users = (await hre.ethers.getSigners()).slice(1, 21); // 20 wallets
  const TOTAL_TX = 20000;

  console.log("Vault:", VAULT_ADDR);
  console.log("Generating", TOTAL_TX, "normal deposits...");

  for (let i = 1; i <= TOTAL_TX; i++) {
    const u = users[Math.floor(Math.random() * users.length)];
    const vault = await hre.ethers.getContractAt("DemoVault", VAULT_ADDR, u);

    const valueEth = (Math.random() * 0.005 + 0.001).toFixed(6); // 0.001 → 0.006 ETH

    const tx = await vault.deposit({
      value: hre.ethers.parseEther(valueEth)
    });
    await tx.wait();

    if (i % 200 === 0) {
      console.log(`progress: ${i}/${TOTAL_TX}`);
    }
  }

  console.log("✅ Done normal traffic generation");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
