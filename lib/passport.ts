import { createHash } from "node:crypto";
import { prisma } from "./db";

export interface Material {
  material: string;
  mass_g: number;
  recycledPercent: number;
}

export interface CarbonFootprint {
  total_kgCO2e: number;
  breakdown: {
    materials: number;
    manufacturing: number;
    transport: number;
  };
}

export interface PassportIntegrity {
  contentHash: string;
  hederaAnchorTx: string | null;
  version: number;
}

export interface Passport {
  "@context": string[];
  "@id": string;
  type: string[];
  gtin: string;
  serialNumber: string;
  name: string;
  category: string;
  manufacturer: {
    name: string;
    accountId: string;
  };
  dateOfManufacture: string;
  placeOfManufacture: { country: string; city: string };
  public: {
    materialComposition: Material[];
    carbonFootprint: CarbonFootprint;
    repairabilityScore: number;
    expectedLifetimeYears: number;
    imageUrl?: string;
  };
  integrity: PassportIntegrity;
}

export interface BuildPassportInput {
  gtin: string;
  serialNumber: string;
  name: string;
  category: string;
  manufacturerName: string;
  manufacturerAccountId: string;
  dateOfManufacture: string;
  placeOfManufacture: { country: string; city: string };
  materialComposition: Material[];
  carbonFootprint: CarbonFootprint;
  repairabilityScore: number;
  expectedLifetimeYears: number;
  imageUrl?: string;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => [k, canonicalize(v)] as const);
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}

export function hashPassport(passport: Passport): string {
  const { integrity: _omit, ...rest } = passport;
  void _omit;
  const canonical = JSON.stringify(canonicalize(rest));
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${digest}`;
}

export function buildPassport(input: BuildPassportInput): Passport {
  const preliminary: Passport = {
    "@context": ["https://schema.org", "https://dpp.xyz/contexts/v1"],
    "@id": `tier0:hedera-testnet:pending`,
    type: ["Product", "DigitalProductPassport"],
    gtin: input.gtin,
    serialNumber: input.serialNumber,
    name: input.name,
    category: input.category,
    manufacturer: {
      name: input.manufacturerName,
      accountId: input.manufacturerAccountId,
    },
    dateOfManufacture: input.dateOfManufacture,
    placeOfManufacture: input.placeOfManufacture,
    public: {
      materialComposition: input.materialComposition,
      carbonFootprint: input.carbonFootprint,
      repairabilityScore: input.repairabilityScore,
      expectedLifetimeYears: input.expectedLifetimeYears,
      imageUrl: input.imageUrl,
    },
    integrity: {
      contentHash: "sha256:pending",
      hederaAnchorTx: null,
      version: 1,
    },
  };
  preliminary.integrity.contentHash = hashPassport(preliminary);
  return preliminary;
}

export function finalizePassport(
  passport: Passport,
  tokenId: string,
  onChainSerial: number,
  mintTxId: string
): Passport {
  const finalized: Passport = {
    ...passport,
    "@id": `tier0:hedera-testnet:${tokenId}/${onChainSerial}`,
    integrity: {
      ...passport.integrity,
      hederaAnchorTx: mintTxId,
    },
  };
  finalized.integrity.contentHash = hashPassport(finalized);
  return finalized;
}

/**
 * Fetch the canonical passport document. Reads from the Prisma Passport.passportJson
 * JSONB column (post-Postgres migration). Returns null if the row doesn't exist.
 */
export async function getPassport(
  tokenId: string,
  onChainSerial: number
): Promise<Passport | null> {
  const row = await prisma.passport.findUnique({
    where: {
      tokenId_serialNumber: { tokenId, serialNumber: onChainSerial },
    },
  });
  if (!row) return null;
  return row.passportJson as unknown as Passport;
}

/**
 * GS1 Digital Link resolver path. Format:
 *   /01/{14-digit-GTIN}/21/{serial}
 * This is the URL encoded in QR codes and the NFT metadata pointer.
 */
export function buildDlPath(gtin: string, onChainSerial: number): string {
  return `/01/${gtin}/21/${onChainSerial}`;
}
