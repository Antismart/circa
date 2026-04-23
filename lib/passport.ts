import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
  gtinStub: string;
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

const PASSPORTS_DIR = join(process.cwd(), "data", "passports");

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
    gtin: input.gtinStub,
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

export function passportPath(tokenId: string, onChainSerial: number): string {
  return join(PASSPORTS_DIR, `${tokenId}-${onChainSerial}.json`);
}

export function savePassport(
  passport: Passport,
  tokenId: string,
  onChainSerial: number
): string {
  if (!existsSync(PASSPORTS_DIR)) mkdirSync(PASSPORTS_DIR, { recursive: true });
  const path = passportPath(tokenId, onChainSerial);
  writeFileSync(path, `${JSON.stringify(passport, null, 2)}\n`);
  return path;
}

export function loadPassport(
  tokenId: string,
  onChainSerial: number
): Passport | null {
  const path = passportPath(tokenId, onChainSerial);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as Passport;
}

export function buildDlPath(tokenId: string, onChainSerial: number): string {
  return `/p/${tokenId}-${onChainSerial}`;
}
