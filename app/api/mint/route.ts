import { NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  buildDlPath,
  buildPassport,
  finalizePassport,
  hashPassport,
} from "@/lib/passport";
import type { Prisma } from "@prisma/client";
import { buildNftMetadata, mintPassportNft } from "@/lib/hts";
import { isValidGtin14, normalizeGtin } from "@/lib/gtin";
import { submitEvent } from "@/lib/hcs";
import { prisma } from "@/lib/db";
import { getRoleFromCookie, roleAccountId } from "@/lib/role";
import { optionalEnv } from "@/lib/hedera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MintPayload {
  name: string;
  category: string;
  manufacturerName: string;
  country: string;
  city: string;
  dateOfManufacture: string;
  materials: Array<{ material: string; mass_g: number; recycledPercent: number }>;
  carbonFootprint: { materials: number; manufacturing: number; transport: number };
  repairabilityScore: number;
  expectedLifetimeYears: number;
  imageUrl?: string;
  gtin: string;
  serialNumber?: string;
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Missing or invalid field: ${field}`);
  }
  return v.trim();
}

function requireNumber(v: unknown, field: string): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isFinite(n)) throw new Error(`Missing or invalid field: ${field}`);
  return n;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const role = await getRoleFromCookie();
    if (role !== "manufacturer") {
      return NextResponse.json(
        { error: "only the Manufacturer role may mint passports", role },
        { status: 403 }
      );
    }
    const manufacturerAccountId = roleAccountId("manufacturer");
    const body = (await req.json()) as MintPayload;

    const name = requireString(body.name, "name");
    const category = requireString(body.category, "category");
    const manufacturerName = requireString(body.manufacturerName, "manufacturerName");
    const country = requireString(body.country, "country");
    const city = requireString(body.city, "city");
    const dateOfManufacture = requireString(body.dateOfManufacture, "dateOfManufacture");
    if (!Array.isArray(body.materials) || body.materials.length === 0) {
      throw new Error("materials must be a non-empty array");
    }
    const materials = body.materials.map((m, i) => ({
      material: requireString(m.material, `materials[${i}].material`),
      mass_g: requireNumber(m.mass_g, `materials[${i}].mass_g`),
      recycledPercent: requireNumber(m.recycledPercent, `materials[${i}].recycledPercent`),
    }));

    const cf = body.carbonFootprint ?? { materials: 0, manufacturing: 0, transport: 0 };
    const carbonFootprint = {
      total_kgCO2e:
        requireNumber(cf.materials, "carbonFootprint.materials") +
        requireNumber(cf.manufacturing, "carbonFootprint.manufacturing") +
        requireNumber(cf.transport, "carbonFootprint.transport"),
      breakdown: {
        materials: requireNumber(cf.materials, "carbonFootprint.materials"),
        manufacturing: requireNumber(cf.manufacturing, "carbonFootprint.manufacturing"),
        transport: requireNumber(cf.transport, "carbonFootprint.transport"),
      },
    };

    const serialNumber =
      body.serialNumber?.trim() ||
      `${category.split("/")[0].slice(0, 2).toUpperCase()}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const gtin = normalizeGtin(body.gtin);
    if (!gtin || !isValidGtin14(gtin)) {
      return NextResponse.json(
        {
          error:
            "GTIN is required and must be a valid 14-digit GS1 code with a correct Mod-10 check digit.",
        },
        { status: 400 }
      );
    }

    const passport = buildPassport({
      gtin,
      serialNumber,
      name,
      category,
      manufacturerName,
      manufacturerAccountId,
      dateOfManufacture,
      placeOfManufacture: { country, city },
      materialComposition: materials,
      carbonFootprint,
      repairabilityScore: requireNumber(
        body.repairabilityScore ?? 7,
        "repairabilityScore"
      ),
      expectedLifetimeYears: requireNumber(
        body.expectedLifetimeYears ?? 10,
        "expectedLifetimeYears"
      ),
      imageUrl: body.imageUrl,
    });

    // We know the GTIN but not the on-chain serial yet; HTS assigns it.
    // Use a placeholder serial in the metadata pointer; the finalized passport
    // carries the correct URL in its @id + integrity fields.
    const metadata = buildNftMetadata(
      buildDlPath(gtin, 0),
      passport.integrity.contentHash
    );
    const mint = await mintPassportNft(metadata);

    const finalized = finalizePassport(passport, mint.tokenId, mint.serial, mint.txId);

    const passportRow = await prisma.passport.create({
      data: {
        tokenId: mint.tokenId,
        serialNumber: mint.serial,
        gtin,
        ownerAccountId: manufacturerAccountId,
        manufacturerAccountId,
        currentContentHash: finalized.integrity.contentHash,
        passportJson: finalized as unknown as Prisma.InputJsonValue,
        mintTxId: mint.txId,
      },
    });

    const mintEvent = await submitEvent({
      type: "mint",
      tokenId: mint.tokenId,
      serial: mint.serial,
      actor: manufacturerAccountId,
      timestamp: new Date().toISOString(),
      contentHash: finalized.integrity.contentHash,
    });

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

    const appUrl = optionalEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
    const publicUrl = `${appUrl}/01/${gtin}/21/${mint.serial}`;
    const qrDataUrl = await QRCode.toDataURL(publicUrl, {
      margin: 1,
      width: 512,
      color: { dark: "#1a1a1a", light: "#f4f1eaff" },
    });

    return NextResponse.json({
      tokenId: mint.tokenId,
      serial: mint.serial,
      gtin,
      txId: mint.txId,
      publicUrl,
      qrDataUrl,
      contentHash: finalized.integrity.contentHash,
      network: optionalEnv("HEDERA_NETWORK") ?? "testnet",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/mint failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
