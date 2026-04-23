import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
  AccountBalanceQuery,
  AccountCreateTransaction,
  AccountId,
  Hbar,
  PrivateKey,
} from "@hashgraph/sdk";
import { getClient, operatorId, optionalEnv } from "../lib/hedera";

const ENV_PATH = join(process.cwd(), ".env");
const INITIAL_BALANCE_HBAR = 50;
const FORCE = process.argv.includes("--force");

function readEnvKey(key: string): string | undefined {
  if (!existsSync(ENV_PATH)) return undefined;
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([^=#]+)=(.*)$/);
    if (m && m[1].trim() === key) return m[2].trim();
  }
  return undefined;
}

function writeEnvAtomic(updates: Record<string, string>): void {
  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const lines = existing.split("\n");
  const keysToUpdate = new Set(Object.keys(updates));
  const out: string[] = [];
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

async function main(): Promise<void> {
  console.log("── circa · setup-evm ──");
  console.log(
    "Creates an ECDSA-keyed Hedera account for Hardhat operator use (EVM signing).\n"
  );

  const existingKey = readEnvKey("HARDHAT_OPERATOR_EVM_KEY");
  const existingId = readEnvKey("HARDHAT_OPERATOR_ACCOUNT_ID");
  if (!FORCE && existingKey && existingId) {
    console.log(`Already configured: ${existingId}`);
    console.log("Re-run with --force to recreate.");
    return;
  }

  const client = getClient();
  const balance = await new AccountBalanceQuery()
    .setAccountId(operatorId)
    .execute(client);
  const hbar = balance.hbars.toBigNumber().toNumber();
  console.log(`Operator balance: ${hbar.toFixed(2)} HBAR`);
  if (hbar < INITIAL_BALANCE_HBAR + 5) {
    throw new Error(
      `Operator has ${hbar.toFixed(2)} HBAR; need at least ${INITIAL_BALANCE_HBAR + 5}.`
    );
  }

  const ecdsaKey = PrivateKey.generateECDSA();
  const publicKey = ecdsaKey.publicKey;
  const evmAddress = publicKey.toEvmAddress();
  const rawHex = ecdsaKey.toStringRaw();

  console.log("Creating ECDSA-keyed Hedera account with alias...");
  const tx = await new AccountCreateTransaction()
    .setKey(publicKey)
    .setAlias(evmAddress)
    .setInitialBalance(new Hbar(INITIAL_BALANCE_HBAR))
    .execute(client);
  const receipt = await tx.getReceipt(client);
  const newAccountId = receipt.accountId;
  if (!newAccountId) throw new Error("AccountCreate returned no accountId");

  console.log(`  Account: ${newAccountId.toString()}`);
  console.log(`  EVM:     0x${evmAddress}`);

  const network = optionalEnv("HEDERA_NETWORK") ?? "testnet";
  writeEnvAtomic({
    HARDHAT_OPERATOR_ACCOUNT_ID: newAccountId.toString(),
    HARDHAT_OPERATOR_EVM_ADDRESS: `0x${evmAddress}`,
    HARDHAT_OPERATOR_EVM_KEY: rawHex.startsWith("0x") ? rawHex : `0x${rawHex}`,
  });

  console.log("\nWrote HARDHAT_OPERATOR_* keys to .env");
  console.log(
    `\nHashScan: https://hashscan.io/${network}/account/${newAccountId.toString()}`
  );

  const alias = AccountId.fromEvmAddress(0, 0, evmAddress);
  if (alias.toString() !== newAccountId.toString()) {
    console.warn(`Note: alias ${alias} differs from real id ${newAccountId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nsetup-evm failed:");
    console.error(err);
    process.exit(1);
  });
