export const ROLES = ["manufacturer", "consumer", "repairer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_COOKIE_NAME = "circular-role";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
