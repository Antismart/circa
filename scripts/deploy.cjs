require("dotenv/config");
const { existsSync, readFileSync, writeFileSync, renameSync } = require("node:fs");
const { join } = require("node:path");
const hre = require("hardhat");

const ENV_PATH = join(process.cwd(), ".env");

function writeEnvAtomic(updates) {
  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const lines = existing.split("\n");
  const keysToUpdate = new Set(Object.keys(updates));
  const out = [];
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq === -1 || line.trim().startsWith("#")) {
      out.push(line);
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (keysToUpdate.has(key)) {
      out.push(`${key}=${updates[key]}`);
      keysToUpdate.delete(key);
    } else {
      out.push(line);
    }
  }
  if (keysToUpdate.size > 0) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    for (const key of keysToUpdate) out.push(`${key}=${updates[key]}`);
  }
  const tmp = `${ENV_PATH}.tmp`;
  writeFileSync(tmp, out.join("\n"));
  renameSync(tmp, ENV_PATH);
}

async function resolveContractId(evmAddress, mirrorBase) {
  const url = `${mirrorBase}/api/v1/contracts/${evmAddress.toLowerCase()}`;
  const deadlineMs = Date.now() + 45_000;
  while (Date.now() < deadlineMs) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        if (data.contract_id) return data.contract_id;
      }
    } catch {
      // mirror may not have indexed the contract yet
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const network = (process.env.HEDERA_NETWORK ?? "testnet").toLowerCase();
  const mirrorBase =
    process.env.HEDERA_MIRROR_NODE ?? "https://testnet.mirrornode.hedera.com";

  console.log("── circa · deploy CircaMarketplace ──");
  console.log(`Deployer EVM: ${deployerAddr}`);
  const bal = await hre.ethers.provider.getBalance(deployerAddr);
  console.log(`Deployer balance: ${(Number(bal) / 1e18).toFixed(4)} HBAR-equiv`);

  const Factory = await hre.ethers.getContractFactory("CircaMarketplace", deployer);
  console.log("Deploying contract...");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();
  const evmAddress = await contract.getAddress();
  console.log(`  EVM address: ${evmAddress}`);

  console.log("Resolving Hedera contract id from mirror node...");
  const contractId = await resolveContractId(evmAddress, mirrorBase);
  if (!contractId) {
    console.warn(
      "Mirror node did not surface the contract within 45s; it is deployed " +
        "but the Hedera 0.0.x id is not yet indexed."
    );
  } else {
    console.log(`  Hedera id:   ${contractId}`);
  }

  writeEnvAtomic({
    MARKETPLACE_EVM_ADDRESS: evmAddress,
    MARKETPLACE_CONTRACT_ID: contractId ?? "",
  });
  console.log("\nWrote MARKETPLACE_* to .env");

  console.log(
    `\nHashScan: https://hashscan.io/${network}/contract/${contractId ?? evmAddress}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nDeploy failed:");
    console.error(err);
    process.exit(1);
  });
