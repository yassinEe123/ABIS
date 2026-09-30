// Chain of ETH relays through 4 signers repeated 5 times to simulate relay/hopping attack
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "localhost.json"), "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const e = hre.ethers.parseEther;

async function main() {
  const signers = await hre.ethers.getSigners();
  const ATK = Math.min(19, Math.max(0, parseInt(process.env.ABIS_ATTACKER ?? "2")));
  const TGT = Math.min(19, Math.max(0, parseInt(process.env.ABIS_TARGET_WALLET ?? "10")));
  const R0 = ATK;
  const R1 = Math.min(19, ATK+1);
  const R2 = Math.min(19, ATK+2);
  const R3 = Math.min(19, ATK+3);

  console.log(`🔴 RELAY_ATTACK | relay chain: signer[${R0}] → [${R1}] → [${R2}] → [${R3}]`);
  console.log("   Hop addresses:");
  [R0,R1,R2,R3].forEach(i => console.log(`   signer[${i}]:`, signers[i].address));

  const relayAmount = "0.2";

  for (let round = 0; round < 5; round++) {
    console.log(`  --- Relay round ${round+1} ---`);

    // signer[R0] → signer[R1]
    try {
      const tx1 = await signers[R0].sendTransaction({ to: signers[R1].address, value: e(relayAmount) });
      await tx1.wait();
      console.log(`    hop 1: [${R0}] → [${R1}] ✅  ${relayAmount} ETH`);
    } catch (err) {
      console.log(`    hop 1 ❌ BLOCKED: ${err.shortMessage || err.message}`);
      break;
    }
    await sleep(500);

    // signer[R1] → signer[R2]
    try {
      const tx2 = await signers[R1].sendTransaction({ to: signers[R2].address, value: e(relayAmount) });
      await tx2.wait();
      console.log(`    hop 2: [${R1}] → [${R2}] ✅  ${relayAmount} ETH`);
    } catch (err) {
      console.log(`    hop 2 ❌ BLOCKED: ${err.shortMessage || err.message}`);
    }
    await sleep(500);

    // signer[R2] → signer[R3]
    try {
      const tx3 = await signers[R2].sendTransaction({ to: signers[R3].address, value: e(relayAmount) });
      await tx3.wait();
      console.log(`    hop 3: [${R2}] → [${R3}] ✅  ${relayAmount} ETH`);
    } catch (err) {
      console.log(`    hop 3 ❌ BLOCKED: ${err.shortMessage || err.message}`);
    }
    await sleep(500);
  }

  console.log("🔴 Done");
}

main().catch(e => { console.error(e); process.exit(1); });
