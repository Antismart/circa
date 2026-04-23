import {
  buildDlPath,
  buildPassport,
  finalizePassport,
  hashPassport,
  loadPassport,
  savePassport,
} from "../lib/passport";
import { buildNftMetadata, mintPassportNft } from "../lib/hts";
import { getEventsForToken, submitEvent } from "../lib/hcs";
import { requireEnv } from "../lib/hedera";

async function main(): Promise<void> {
  console.log("── Track 1 smoke test ──");
  console.log("This will mint one real testnet NFT and write one HCS event.");
  console.log("");

  requireEnv("HTS_COLLECTION_ID");
  requireEnv("HCS_TOPIC_ID");
  const manufacturerAccountId = requireEnv("MANUFACTURER_ACCOUNT_ID");

  console.log("Step 1: build passport");
  const passport = buildPassport({
    gtinStub: "STUB-CIRCA-SMOKE-0001",
    serialNumber: "SMOKE-001",
    name: "Aurora Pro Espresso Machine (smoke test)",
    category: "kitchen-appliance/espresso-machine",
    manufacturerName: "Aurora Kaffeemaschinen GmbH",
    manufacturerAccountId,
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
  });
  console.log(`  preliminary hash: ${passport.integrity.contentHash}`);

  console.log("Step 2: mint NFT on HTS");
  const metadata = buildNftMetadata(
    buildDlPath("pending", 0),
    passport.integrity.contentHash
  );
  console.log(`  metadata: ${metadata.byteLength} bytes`);
  const mint = await mintPassportNft(metadata);
  console.log(`  tokenId: ${mint.tokenId}`);
  console.log(`  serial:  ${mint.serial}`);
  console.log(`  txId:    ${mint.txId}`);

  console.log("Step 3: finalize passport with on-chain ids and save to disk");
  const finalized = finalizePassport(passport, mint.tokenId, mint.serial, mint.txId);
  const path = savePassport(finalized, mint.tokenId, mint.serial);
  console.log(`  wrote: ${path}`);
  console.log(`  final hash: ${finalized.integrity.contentHash}`);

  const reloaded = loadPassport(mint.tokenId, mint.serial);
  if (!reloaded) throw new Error("Round-trip read failed");
  const rehash = hashPassport(reloaded);
  if (rehash !== finalized.integrity.contentHash) {
    throw new Error(
      `Canonicalization mismatch: wrote ${finalized.integrity.contentHash}, reread ${rehash}`
    );
  }
  console.log("  round-trip hash matches ✓");

  console.log("Step 4: submit mint event to HCS");
  const event = await submitEvent({
    type: "mint",
    tokenId: mint.tokenId,
    serial: mint.serial,
    actor: manufacturerAccountId,
    timestamp: new Date().toISOString(),
    contentHash: finalized.integrity.contentHash,
  });
  console.log(`  sequence: ${event.sequenceNumber}`);
  console.log(`  consensus: ${event.consensusTimestamp}`);

  console.log("Step 5: read event back via mirror node (with lag tolerance)");
  const deadlineMs = Date.now() + 30_000;
  let found = false;
  while (Date.now() < deadlineMs) {
    const events = await getEventsForToken(mint.tokenId, mint.serial);
    const match = events.find((e) => e.sequenceNumber === event.sequenceNumber);
    if (match) {
      console.log(`  mirror confirmed event at seq ${match.sequenceNumber} ✓`);
      console.log(`  event type: ${match.event.type}`);
      found = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!found) {
    throw new Error(`Mirror did not return event within 30s (seq ${event.sequenceNumber})`);
  }

  const network = process.env.HEDERA_NETWORK ?? "testnet";
  console.log("");
  console.log("── Smoke test PASSED ──");
  console.log(`  HashScan NFT: https://hashscan.io/${network}/token/${mint.tokenId}/${mint.serial}`);
  console.log(`  HashScan tx:  https://hashscan.io/${network}/transaction/${mint.txId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("");
    console.error("Smoke test failed:");
    console.error(err);
    process.exit(1);
  });
