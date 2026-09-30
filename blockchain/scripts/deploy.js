const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1 — ABISRegistry
  const Registry = await hre.ethers.getContractFactory("ABISRegistry");
  const registry  = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("✅ ABISRegistry  →", registryAddr);

  // 2 — DemoVault
  const Vault = await hre.ethers.getContractFactory("DemoVault");
  const vault  = await Vault.deploy(registryAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("✅ DemoVault     →", vaultAddr);

  // 3 — ABISToken  (1 000 000 ABST initial supply to deployer)
  const Token = await hre.ethers.getContractFactory("ABISToken");
  const token  = await Token.deploy(registryAddr, 1_000_000);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("✅ ABISToken     →", tokenAddr);

  // 4 — ABISDex
  const Dex = await hre.ethers.getContractFactory("ABISDex");
  const dex  = await Dex.deploy(registryAddr, tokenAddr);
  await dex.waitForDeployment();
  const dexAddr = await dex.getAddress();
  console.log("✅ ABISDex       →", dexAddr);

  // Seed DEX with 10 ETH + 500 000 ABST liquidity
  const tokenAmount = hre.ethers.parseUnits("500000", 18);
  await token.approve(dexAddr, tokenAmount);
  await dex.addLiquidity(tokenAmount, { value: hre.ethers.parseEther("10") });
  console.log("   DEX seeded: 10 ETH + 500 000 ABST");

  // 5 — ABISLending  (funded with 10 ETH at deploy)
  const Lending = await hre.ethers.getContractFactory("ABISLending");
  const lending  = await Lending.deploy(registryAddr, { value: hre.ethers.parseEther("10") });
  await lending.waitForDeployment();
  const lendingAddr = await lending.getAddress();
  console.log("✅ ABISLending   →", lendingAddr);

  // Save all addresses
  const deployment = {
    registry : registryAddr,
    vault    : vaultAddr,
    token    : tokenAddr,
    dex      : dexAddr,
    lending  : lendingAddr,
  };

  const out = path.join(__dirname, "..", "deployments", "localhost.json");
  fs.writeFileSync(out, JSON.stringify(deployment, null, 2));
  console.log("\n📄 Deployment saved →", out);
}

main().catch((err) => { console.error(err); process.exit(1); });
