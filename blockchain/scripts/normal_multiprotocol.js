// Generates normal legitimate traffic across all 4 ABIS-protected protocols
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
);

function rand(min, max) { return Math.random() * (max - min) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const signers = await hre.ethers.getSigners();
  const admin   = signers[0];
  const users   = signers.slice(5, 15); // 10 normal users

  const vault   = await hre.ethers.getContractAt("DemoVault",   deployment.vault,   admin);
  const token   = await hre.ethers.getContractAt("ABISToken",   deployment.token,   admin);
  const dex     = await hre.ethers.getContractAt("ABISDex",     deployment.dex,     admin);
  const lending = await hre.ethers.getContractAt("ABISLending", deployment.lending, admin);

  // Give each user some ABST to interact with
  for (const user of users) {
    await token.transfer(user.address, hre.ethers.parseUnits("500", 18));
  }
  console.log("✅ Users funded with 500 ABST each");
  console.log("🟢 Normal multi-protocol traffic started (60 txs)\n");

  const actions = ["vault", "token", "dex", "lending"];

  for (let i = 1; i <= 60; i++) {
    const user   = users[Math.floor(Math.random() * users.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];

    try {
      switch (action) {
        case "vault": {
          const v = await hre.ethers.getContractAt("DemoVault", deployment.vault, user);
          const ethAmt = rand(0.001, 0.01).toFixed(4);
          const tx = await v.deposit({ value: hre.ethers.parseEther(ethAmt) });
          await tx.wait();
          console.log(`tx ${i.toString().padStart(2)} | VAULT   deposit ${ethAmt} ETH | ${user.address.slice(0,10)}…`);
          break;
        }
        case "token": {
          const t       = await hre.ethers.getContractAt("ABISToken", deployment.token, user);
          const victim  = users[Math.floor(Math.random() * users.length)];
          const amount  = Math.floor(rand(1, 50)).toString();
          const tx = await t.transfer(victim.address, hre.ethers.parseUnits(amount, 18));
          await tx.wait();
          console.log(`tx ${i.toString().padStart(2)} | TOKEN   transfer ${amount} ABST | ${user.address.slice(0,10)}…`);
          break;
        }
        case "dex": {
          const d      = await hre.ethers.getContractAt("ABISDex", deployment.dex, user);
          const ethAmt = rand(0.001, 0.005).toFixed(4);
          const tx = await d.buyTokens({ value: hre.ethers.parseEther(ethAmt) });
          await tx.wait();
          console.log(`tx ${i.toString().padStart(2)} | DEX     buy   ${ethAmt} ETH  | ${user.address.slice(0,10)}…`);
          break;
        }
        case "lending": {
          const l      = await hre.ethers.getContractAt("ABISLending", deployment.lending, user);
          const ethAmt = rand(0.005, 0.02).toFixed(4);
          const tx = await l.deposit({ value: hre.ethers.parseEther(ethAmt) });
          await tx.wait();
          console.log(`tx ${i.toString().padStart(2)} | LENDING deposit ${ethAmt} ETH  | ${user.address.slice(0,10)}…`);
          break;
        }
      }
    } catch (e) {
      console.log(`tx ${i.toString().padStart(2)} | ${action.toUpperCase().padEnd(7)} SKIPPED (${e.shortMessage || e.message})`);
    }

    // Small delay between txs to simulate realistic spacing
    await sleep(Math.floor(rand(100, 400)));
  }

  console.log("\n✅ Normal multi-protocol traffic done");
}

main().catch((e) => { console.error(e); process.exit(1); });
