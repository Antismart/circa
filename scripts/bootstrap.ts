import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  AccountBalanceQuery,
  AccountCreateTransaction,
  CustomFixedFee,
  CustomRoyaltyFee,
  Hbar,
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType,
  TopicCreateTransaction,
} from "@hashgraph/sdk";
import {
  getClient,
  operatorId,
  operatorKey,
  optionalEnv,
} from "../lib/hedera";

const ROLES = ["MANUFACTURER", "CONSUMER", "REPAIRER"] as const;
type Role = (typeof ROLES)[number];

const ROLE_INITIAL_HBAR = 25;
const OPERATOR_MIN_HBAR = 100;
const ROYALTY_NUMERATOR = 25;
const ROYALTY_DENOMINATOR = 1000;
const ROYALTY_FALLBACK_HBAR = 1;

const FORCE = process.argv.includes("--force");
const ENV_PATH = join(process.cwd(), ".env");

type EnvMap = Map<string, string>;

function readEnvFile(): EnvMap {
  const map: EnvMap = new Map();
  if (!existsSync(ENV_PATH)) return map;
  const lines = readFileSync(ENV_PATH, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return map;
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
    for (const key of keysToUpdate) {
      out.push(`${key}=${updates[key]}`);
    }
  }

  const tmp = `${ENV_PATH}.tmp`;
  writeFileSync(tmp, out.join("\n"));
  writeFileSync(ENV_PATH, readFileSync(tmp));
}

async function ensureOperatorFunded(): Promise<void> {
  const client = getClient();
  const balance = await new AccountBalanceQuery()
    .setAccountId(operatorId)
    .execute(client);
  const hbar = balance.hbars.toBigNumber().toNumber();
  console.log(`Operator balance: ${hbar.toFixed(2)} HBAR`);
  if (hbar < OPERATOR_MIN_HBAR) {
    throw new Error(
      `Operator has ${hbar.toFixed(2)} HBAR but needs at least ${OPERATOR_MIN_HBAR}. Top up at portal.hedera.com.`
    );
  }
}

async function ensureRoleAccount(
  role: Role,
  env: EnvMap
): Promise<{ accountId: string; key: string }> {
  const idKey = `${role}_ACCOUNT_ID`;
  const keyKey = `${role}_KEY`;
  const existingId = env.get(idKey);
  const existingKey = env.get(keyKey);

  if (!FORCE && existingId && existingKey) {
    console.log(`  ${role.padEnd(14)} exists: ${existingId}`);
    return { accountId: existingId, key: existingKey };
  }

  const client = getClient();
  const newKey = PrivateKey.generateED25519();
  const tx = await new AccountCreateTransaction()
    .setKey(newKey.publicKey)
    .setInitialBalance(new Hbar(ROLE_INITIAL_HBAR))
    .execute(client);
  const receipt = await tx.getReceipt(client);
  const newAccountId = receipt.accountId;
  if (!newAccountId) throw new Error(`${role} account creation returned no accountId`);

  const der = newKey.toStringDer();
  const accountStr = newAccountId.toString();
  console.log(`  ${role.padEnd(14)} created: ${accountStr}`);
  env.set(idKey, accountStr);
  env.set(keyKey, der);
  return { accountId: accountStr, key: der };
}

async function createCollection(
  treasuryAccountId: string,
  treasuryKey: PrivateKey,
  feeCollectorAccountId: string
): Promise<string> {
  const client = getClient();
  const royaltyFee = new CustomRoyaltyFee()
    .setNumerator(ROYALTY_NUMERATOR)
    .setDenominator(ROYALTY_DENOMINATOR)
    .setFeeCollectorAccountId(feeCollectorAccountId)
    .setFallbackFee(new CustomFixedFee().setHbarAmount(new Hbar(ROYALTY_FALLBACK_HBAR)));

  const tx = new TokenCreateTransaction()
    .setTokenName("Circular Digital Product Passport")
    .setTokenSymbol("CIRCA-DPP")
    .setTokenType(TokenType.NonFungibleUnique)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(treasuryAccountId)
    .setAdminKey(operatorKey.publicKey)
    .setSupplyKey(operatorKey.publicKey)
    .setCustomFees([royaltyFee])
    .freezeWith(client);

  const signedByTreasury = await tx.sign(treasuryKey);
  const signedByOperator = await signedByTreasury.sign(operatorKey);
  const submit = await signedByOperator.execute(client);
  const receipt = await submit.getReceipt(client);
  const tokenId = receipt.tokenId;
  if (!tokenId) throw new Error("Token creation returned no tokenId");
  return tokenId.toString();
}

async function createTopic(): Promise<string> {
  const client = getClient();
  const tx = await new TopicCreateTransaction()
    .setTopicMemo("circular-dpp-events-v0")
    .setAdminKey(operatorKey.publicKey)
    .execute(client);
  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId;
  if (!topicId) throw new Error("Topic creation returned no topicId");
  return topicId.toString();
}

async function associate(
  tokenId: string,
  accountId: string,
  accountKey: PrivateKey
): Promise<void> {
  const client = getClient();
  try {
    const tx = new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([tokenId])
      .freezeWith(client);
    const signed = await tx.sign(accountKey);
    const submit = await signed.execute(client);
    await submit.getReceipt(client);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT")) {
      return;
    }
    throw err;
  }
}

async function main(): Promise<void> {
  console.log("── Circular DPP bootstrap ──");
  console.log(`Network: ${optionalEnv("HEDERA_NETWORK") ?? "testnet"}`);
  console.log(`Operator: ${operatorId.toString()}`);
  console.log(`Force rebuild: ${FORCE ? "yes" : "no"}`);
  console.log("");

  await ensureOperatorFunded();
  console.log("");

  if (!existsSync("data")) mkdirSync("data");
  if (!existsSync(join("data", "passports"))) mkdirSync(join("data", "passports"));

  const env = readEnvFile();

  console.log("Demo accounts:");
  const roleAccounts: Record<Role, { accountId: string; key: string }> = {
    MANUFACTURER: await ensureRoleAccount("MANUFACTURER", env),
    CONSUMER: await ensureRoleAccount("CONSUMER", env),
    REPAIRER: await ensureRoleAccount("REPAIRER", env),
  };
  console.log("");

  let collectionId = env.get("HTS_COLLECTION_ID");
  if (FORCE || !collectionId) {
    console.log("Creating HTS NFT collection (treasury + fee collector = manufacturer, 2.5% royalty + 1 HBAR fallback)...");
    const manufacturerKey = PrivateKey.fromStringDer(roleAccounts.MANUFACTURER.key);
    collectionId = await createCollection(
      roleAccounts.MANUFACTURER.accountId,
      manufacturerKey,
      roleAccounts.MANUFACTURER.accountId
    );
    env.set("HTS_COLLECTION_ID", collectionId);
    console.log(`  Collection: ${collectionId}`);
  } else {
    console.log(`HTS collection exists: ${collectionId}`);
  }

  let topicId = env.get("HCS_TOPIC_ID");
  if (FORCE || !topicId) {
    console.log("Creating HCS topic...");
    topicId = await createTopic();
    env.set("HCS_TOPIC_ID", topicId);
    console.log(`  Topic: ${topicId}`);
  } else {
    console.log(`HCS topic exists: ${topicId}`);
  }
  console.log("");

  console.log("Associating demo accounts with collection:");
  for (const role of ["CONSUMER", "REPAIRER"] as const) {
    const acc = roleAccounts[role];
    const k = PrivateKey.fromStringDer(acc.key);
    await associate(collectionId, acc.accountId, k);
    console.log(`  ${role.padEnd(14)} associated`);
  }
  console.log("");

  const updates: Record<string, string> = {
    HTS_COLLECTION_ID: collectionId,
    HCS_TOPIC_ID: topicId,
  };
  for (const role of ROLES) {
    updates[`${role}_ACCOUNT_ID`] = roleAccounts[role].accountId;
    updates[`${role}_KEY`] = roleAccounts[role].key;
  }
  writeEnvAtomic(updates);
  console.log("Wrote IDs to .env");
  console.log("");

  const network = optionalEnv("HEDERA_NETWORK") ?? "testnet";
  console.log("── Summary ──");
  console.log(`  HashScan token: https://hashscan.io/${network}/token/${collectionId}`);
  console.log(`  HashScan topic: https://hashscan.io/${network}/topic/${topicId}`);
  console.log(`  Manufacturer:   ${roleAccounts.MANUFACTURER.accountId}`);
  console.log(`  Consumer:       ${roleAccounts.CONSUMER.accountId}`);
  console.log(`  Repairer:       ${roleAccounts.REPAIRER.accountId}`);
  console.log("");
  console.log("Next: open the HashScan token link and confirm the royalty fee (2.5%) is visible.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("");
    console.error("Bootstrap failed:");
    console.error(err);
    process.exit(1);
  });
