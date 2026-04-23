import "server-only";
import { cookies } from "next/headers";
import { PrivateKey } from "@hashgraph/sdk";
import { parsePrivateKey, requireEnv } from "./hedera";
import { isRole, ROLE_COOKIE_NAME, type Role } from "./roles";

export async function getRoleFromCookie(): Promise<Role> {
  const jar = await cookies();
  const raw = jar.get(ROLE_COOKIE_NAME)?.value;
  return isRole(raw) ? raw : "consumer";
}

export function roleAccountId(role: Role): string {
  switch (role) {
    case "manufacturer":
      return requireEnv("MANUFACTURER_ACCOUNT_ID");
    case "consumer":
      return requireEnv("CONSUMER_ACCOUNT_ID");
    case "repairer":
      return requireEnv("REPAIRER_ACCOUNT_ID");
  }
}

export function roleSigningKey(role: Role): PrivateKey {
  switch (role) {
    case "manufacturer":
      return parsePrivateKey(requireEnv("MANUFACTURER_KEY"));
    case "consumer":
      return parsePrivateKey(requireEnv("CONSUMER_KEY"));
    case "repairer":
      return parsePrivateKey(requireEnv("REPAIRER_KEY"));
  }
}

export type { Role } from "./roles";
