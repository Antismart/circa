import {
  buildDlPath,
  buildPassport,
  finalizePassport,
  hashPassport,
  type BuildPassportInput,
} from "../lib/passport";
import type { Prisma } from "@prisma/client";
import { buildNftMetadata, mintPassportNft } from "../lib/hts";
import { submitEvent } from "../lib/hcs";
import { requireEnv } from "../lib/hedera";
import { prisma } from "../lib/db";

interface SeedProduct extends Omit<BuildPassportInput, "manufacturerAccountId"> {
  key: string;
}

const PRODUCTS: SeedProduct[] = [
  {
    key: "coffee-machine",
    gtinStub: "STUB-CIRCA-0000001",
    serialNumber: "CM-2026-0001",
    name: "Aurora Pro Espresso Machine",
    category: "kitchen-appliance/espresso-machine",
    manufacturerName: "Aurora Kaffeemaschinen GmbH",
    dateOfManufacture: "2026-03-14",
    placeOfManufacture: { country: "DE", city: "Gütersloh" },
    materialComposition: [
      { material: "steel-304", mass_g: 4200, recycledPercent: 42 },
      { material: "abs-plastic", mass_g: 620, recycledPercent: 18 },
      { material: "copper", mass_g: 380, recycledPercent: 55 },
      { material: "aluminum-6061", mass_g: 910, recycledPercent: 70 },
    ],
    carbonFootprint: {
      total_kgCO2e: 87.4,
      breakdown: { materials: 52.1, manufacturing: 18.3, transport: 17.0 },
    },
    repairabilityScore: 7.2,
    expectedLifetimeYears: 12,
  },
  {
    key: "e-bike",
    gtinStub: "STUB-CIRCA-0000002",
    serialNumber: "EB-2026-0001",
    name: "Velox City Commuter E-Bike",
    category: "mobility/e-bike",
    manufacturerName: "Velox Mobility BV",
    dateOfManufacture: "2026-02-01",
    placeOfManufacture: { country: "NL", city: "Utrecht" },
    materialComposition: [
      { material: "aluminum-6061", mass_g: 9800, recycledPercent: 68 },
      { material: "li-ion-battery", mass_g: 2400, recycledPercent: 22 },
      { material: "rubber", mass_g: 1500, recycledPercent: 35 },
      { material: "steel-304", mass_g: 1100, recycledPercent: 50 },
    ],
    carbonFootprint: {
      total_kgCO2e: 164.0,
      breakdown: { materials: 102.0, manufacturing: 32.0, transport: 30.0 },
    },
    repairabilityScore: 8.1,
    expectedLifetimeYears: 10,
  },
  {
    key: "office-chair",
    gtinStub: "STUB-CIRCA-0000003",
    serialNumber: "OC-2026-0001",
    name: "Nord Ergonomic Task Chair",
    category: "furniture/office-chair",
    manufacturerName: "Nord Furniture AB",
    dateOfManufacture: "2026-01-10",
    placeOfManufacture: { country: "SE", city: "Malmö" },
    materialComposition: [
      { material: "steel-304", mass_g: 6200, recycledPercent: 60 },
      { material: "polyester-mesh", mass_g: 850, recycledPercent: 40 },
      { material: "pu-foam", mass_g: 1200, recycledPercent: 10 },
      { material: "nylon", mass_g: 480, recycledPercent: 25 },
    ],
    carbonFootprint: {
      total_kgCO2e: 42.5,
      breakdown: { materials: 26.0, manufacturing: 9.5, transport: 7.0 },
    },
    repairabilityScore: 6.5,
    expectedLifetimeYears: 15,
  },
];

async function seedOne(product: SeedProduct, manufacturerAccountId: string): Promise<void> {
  console.log(`\nSeeding ${product.name}...`);

  const passport = buildPassport({ ...product, manufacturerAccountId });

  const metadata = buildNftMetadata(buildDlPath("pending", 0), passport.integrity.contentHash);
  const mint = await mintPassportNft(metadata);
  console.log(`  minted ${mint.tokenId}/${mint.serial}  tx=${mint.txId}`);

  const finalized = finalizePassport(passport, mint.tokenId, mint.serial, mint.txId);

  const passportRow = await prisma.passport.create({
    data: {
      tokenId: mint.tokenId,
      serialNumber: mint.serial,
      gtinStub: product.gtinStub,
      ownerAccountId: manufacturerAccountId,
      manufacturerAccountId,
      currentContentHash: finalized.integrity.contentHash,
      passportJson: finalized as unknown as Prisma.InputJsonValue,
      mintTxId: mint.txId,
    },
  });
  console.log(`  row inserted: ${passportRow.id}`);

  const mintEvent = await submitEvent({
    type: "mint",
    tokenId: mint.tokenId,
    serial: mint.serial,
    actor: manufacturerAccountId,
    timestamp: new Date().toISOString(),
    contentHash: finalized.integrity.contentHash,
  });
  console.log(`  mint event seq=${mintEvent.sequenceNumber}`);

  await prisma.event.create({
    data: {
      passportId: passportRow.id,
      type: "mint",
      actorAccountId: manufacturerAccountId,
      payloadHash: hashPassport(finalized),
      hcsSequenceNumber: mintEvent.sequenceNumber,
      hcsConsensusTimestamp: mintEvent.consensusTimestamp,
    },
  });
}

async function main(): Promise<void> {
  console.log("── circa · seed ──");
  const manufacturerAccountId = requireEnv("MANUFACTURER_ACCOUNT_ID");
  requireEnv("HTS_COLLECTION_ID");
  requireEnv("HCS_TOPIC_ID");
  console.log(`Manufacturer: ${manufacturerAccountId}`);
  console.log(`Products to seed: ${PRODUCTS.length}`);

  for (const product of PRODUCTS) {
    await seedOne(product, manufacturerAccountId);
  }

  const network = process.env.HEDERA_NETWORK ?? "testnet";
  const rows = await prisma.passport.findMany({
    orderBy: { createdAt: "asc" },
    select: { tokenId: true, serialNumber: true, gtinStub: true },
  });
  console.log("\n── Summary ──");
  for (const r of rows) {
    console.log(
      `  ${r.gtinStub.padEnd(22)}  ${r.tokenId}/${r.serialNumber}  ` +
        `https://hashscan.io/${network}/token/${r.tokenId}/${r.serialNumber}`
    );
  }
  console.log(`\nTotal passports in DB: ${rows.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\nSeed failed:");
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
