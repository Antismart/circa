import { config } from "dotenv";
import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";

config({ path: ".env" });
config({ path: ".env.local", override: true });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return v.trim();
}

export function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function parsePrivateKey(raw: string): PrivateKey {
  const s = raw.trim();
  if (s.startsWith("302e") || s.startsWith("302a") || s.startsWith("3030")) {
    return PrivateKey.fromStringED25519(s);
  }
  if (s.startsWith("0x") || /^[0-9a-fA-F]{64}$/.test(s)) {
    return PrivateKey.fromStringECDSA(s);
  }
  try {
    return PrivateKey.fromStringED25519(s);
  } catch {
    return PrivateKey.fromStringECDSA(s);
  }
}

export const HEDERA_NETWORK = optionalEnv("HEDERA_NETWORK") ?? "testnet";
export const MIRROR_BASE_URL =
  optionalEnv("HEDERA_MIRROR_NODE") ?? "https://testnet.mirrornode.hedera.com";

export const operatorId = AccountId.fromString(requireEnv("HEDERA_OPERATOR_ID"));
export const operatorKey = parsePrivateKey(requireEnv("HEDERA_OPERATOR_KEY"));

type GlobalWithClient = typeof globalThis & { __circaHederaClient?: Client };

export function getClient(): Client {
  const g = globalThis as GlobalWithClient;
  if (g.__circaHederaClient) return g.__circaHederaClient;

  const client =
    HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, operatorKey);
  g.__circaHederaClient = client;
  return client;
}

export async function mirrorFetch<T>(path: string): Promise<T> {
  const url = `${MIRROR_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Mirror node ${res.status} for ${path}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}
