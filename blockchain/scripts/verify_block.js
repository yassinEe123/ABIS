const hre = require("hardhat");
const fs = require("fs"), path = require("path");
const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json")));
async function main() {
  const signers = await hre.ethers.getSigners();
  const attacker = signers[3];
  const reg   = await hre.ethers.getContractAt("ABISRegistry", dep.registry);
  const dex   = await hre.ethers.getContractAt("ABISDex",      dep.dex,    attacker);
  const vault = await hre.ethers.getContractAt("DemoVault",    dep.vault,  attacker);
  const token = await hre.ethers.getContractAt("ABISToken",    dep.token,  attacker);
  console.log("Attacker:", attacker.address);
  console.log("isBlocked:", await reg.isBlocked(attacker.address));
  try { await dex.buyTokens({ value: hre.ethers.parseEther("0.01") }); console.log("❌ DEX: NOT blocked"); }
  catch(e) { console.log("✅ DEX rejected →", e.shortMessage || e.message.slice(0,70)); }
  try { await vault.deposit({ value: hre.ethers.parseEther("0.01") }); console.log("❌ Vault: NOT blocked"); }
  catch(e) { console.log("✅ Vault rejected →", e.shortMessage || e.message.slice(0,70)); }
  try { await token.transfer(signers[5].address, hre.ethers.parseUnits("1", 18)); console.log("❌ Token: NOT blocked"); }
  catch(e) { console.log("✅ Token rejected →", e.shortMessage || e.message.slice(0,70)); }
}
main().catch(console.error);
