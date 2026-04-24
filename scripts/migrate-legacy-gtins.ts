/**
 * One-shot Postgres schema + data migration for Phase 1 (GS1 Digital Link).
 *
 * Run against any environment (local, Vercel production Neon, etc.):
 *
 *   DATABASE_URL=postgres://... pnpm exec tsx scripts/migrate-legacy-gtins.ts
 *
 * Idempotent. Safe to re-run. Does two things:
 *
 *   1. Schema: rename Passport.gtinStub → Passport.gtin + add
 *      @@unique([gtin, serialNumber]) + @@index([gtin]). Uses IF
 *      NOT EXISTS guards so re-running is a no-op.
 *
 *   2. Data: rewrite any "STUB-CIRCA-%" rows to real valid 14-digit
 *      GTINs (Mod-10 check). Updates both the column and the
 *      passportJson.gtin field so disk JSON stays in lockstep with
 *      the DB. Prints a mapping of old→new so stale QR codes can
 *      still be traced back.
 *
 * The existing on-chain NFT metadata still contains the old /p/{tokenId}-{serial}
 * pointer — that's immutable. The old /p/... URL shape is kept as a permanent
 * redirect so already-printed QRs still land on the right page after lookup by
 * tokenId + serial.
 */

import { prisma } from "../lib/db";
import { makeGtin14 } from "../lib/gtin";

interface PgColumnsRow {
  column_name: string;
}

async function columnsExist(): Promise<{
  hasGtin: boolean;
  hasStub: boolean;
}> {
  const rows = await prisma.$queryRawUnsafe<PgColumnsRow[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'Passport' AND column_name IN ('gtin', 'gtinStub')
  `);
  const set = new Set(rows.map((r) => r.column_name));
  return { hasGtin: set.has("gtin"), hasStub: set.has("gtinStub") };
}

async function renameColumn(): Promise<void> {
  const { hasGtin, hasStub } = await columnsExist();
  if (hasGtin && !hasStub) {
    console.log("  column: already renamed to gtin");
    return;
  }
  if (!hasGtin && hasStub) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Passport" RENAME COLUMN "gtinStub" TO "gtin"`
    );
    console.log("  column: renamed gtinStub → gtin");
    return;
  }
  if (hasGtin && hasStub) {
    throw new Error(
      'Both "gtin" and "gtinStub" columns exist. Resolve manually.'
    );
  }
  throw new Error('Neither "gtin" nor "gtinStub" exists. Run prisma db push first.');
}

async function ensureIndexes(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Passport_gtin_serialNumber_key" ON "Passport"("gtin", "serialNumber")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Passport_gtin_idx" ON "Passport"("gtin")`
  );
  console.log("  indexes: created or already present");
}

/** 14-digit test GTINs start with '009' (reserved GS1-US restricted prefix range). */
function buildTestGtin(ordinal: number): string {
  const first13 = `009${String(ordinal).padStart(10, "0")}`;
  return makeGtin14(first13);
}

async function migrateStubGtins(): Promise<void> {
  const rows = await prisma.passport.findMany({
    where: { gtin: { startsWith: "STUB-CIRCA-" } },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) {
    console.log("  data: no STUB-CIRCA-% rows to migrate");
    return;
  }
  console.log(`  data: rewriting ${rows.length} legacy row(s)`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const newGtin = buildTestGtin(i + 1);

    const passportJson = row.passportJson as unknown as Record<string, unknown>;
    const updatedJson = { ...passportJson, gtin: newGtin };

    await prisma.passport.update({
      where: { id: row.id },
      data: {
        gtin: newGtin,
        passportJson: updatedJson as unknown as object,
      },
    });
    console.log(
      `    ${row.tokenId}/${row.serialNumber.toString().padStart(3, "0")}: ${row.gtin} → ${newGtin}`
    );
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }
  console.log("── circa · migrate-legacy-gtins (Phase 1) ──\n");

  console.log("Schema:");
  await renameColumn();
  await ensureIndexes();

  console.log("\nData:");
  await migrateStubGtins();

  console.log("\n── Done ──");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("\nMigration failed:");
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
