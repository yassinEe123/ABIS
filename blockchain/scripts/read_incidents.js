const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")
);

const REGISTRY = deployment.registry;

async function main() {
  const reg = await hre.ethers.getContractAt("ABISRegistry", REGISTRY);

  const events = await reg.queryFilter(reg.filters.IncidentLogged(), 0, "latest");
  console.log("IncidentLogged events:", events.length);

  for (const e of events.slice(-5)) {
    const { wallet, riskScore, anomalyType, action } = e.args;
    console.log({
      blockNumber: e.blockNumber,
      wallet,
      riskScore: Number(riskScore),
      anomalyType,
      action
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
