import { NextResponse } from "next/server";
import { getEventsForToken, type PersistedEvent } from "@/lib/hcs";
import { prisma } from "@/lib/db";
import { optionalEnv } from "@/lib/hedera";
import { isValidGtin14 } from "@/lib/gtin";
import type { Passport } from "@/lib/passport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Accepts two forms for back-compat:
 *   - Legacy: "0.0.8747375-8"           (tokenId-serial)
 *   - New GS1 DL flat: "01234567890128-8" (14-digit-GTIN-serial)
 *
 * Returns the resolved Passport row regardless of which form was supplied.
 */
async function resolveById(
  id: string
): Promise<{ tokenId: string; serial: number; gtin: string } | null> {
  const lastDash = id.lastIndexOf("-");
  if (lastDash === -1) return null;
  const prefix = id.slice(0, lastDash);
  const serial = Number(id.slice(lastDash + 1));
  if (!Number.isFinite(serial) || serial <= 0) return null;

  // New GS1-DL style: prefix is a 14-digit GTIN
  if (isValidGtin14(prefix)) {
    const row = await prisma.passport.findUnique({
      where: { gtin_serialNumber: { gtin: prefix, serialNumber: serial } },
      select: { tokenId: true, serialNumber: true, gtin: true },
    });
    if (!row) return null;
    return { tokenId: row.tokenId, serial: row.serialNumber, gtin: row.gtin };
  }

  // Legacy: prefix is a Hedera token id like 0.0.8747375
  const row = await prisma.passport.findUnique({
    where: { tokenId_serialNumber: { tokenId: prefix, serialNumber: serial } },
    select: { tokenId: true, serialNumber: true, gtin: true },
  });
  if (!row) return null;
  return { tokenId: row.tokenId, serial: row.serialNumber, gtin: row.gtin };
}

interface RenderEvent {
  type: string;
  actor: string;
  timestamp: string;
  sequenceNumber: number | null;
  payload: Record<string, unknown>;
  pending: boolean;
}

function toRenderEvent(persisted: PersistedEvent): RenderEvent {
  const { type, actor, timestamp, ...rest } = persisted.event as unknown as {
    type: string;
    actor: string;
    timestamp: string;
    [k: string]: unknown;
  };
  return {
    type,
    actor,
    timestamp: persisted.consensusTimestamp || timestamp,
    sequenceNumber: persisted.sequenceNumber,
    payload: rest,
    pending: false,
  };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const resolved = await resolveById(id);
  if (!resolved) {
    return NextResponse.json({ error: "passport not found" }, { status: 404 });
  }
  const { tokenId, serial, gtin } = resolved;

  const row = await prisma.passport.findUnique({
    where: { tokenId_serialNumber: { tokenId, serialNumber: serial } },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) {
    return NextResponse.json({ error: "passport row missing" }, { status: 404 });
  }
  const passport = row.passportJson as unknown as Passport;

  let mirrorEvents: PersistedEvent[] = [];
  let mirrorStatus: "ok" | "degraded" = "ok";
  try {
    mirrorEvents = await getEventsForToken(tokenId, serial);
  } catch (err) {
    console.warn("mirror fetch failed:", err);
    mirrorStatus = "degraded";
  }

  const renderEvents: RenderEvent[] = mirrorEvents.map(toRenderEvent);

  if (row) {
    const mirrorSeqs = new Set(mirrorEvents.map((e) => e.sequenceNumber));
    for (const dbEvent of row.events) {
      if (!mirrorSeqs.has(dbEvent.hcsSequenceNumber)) {
        renderEvents.push({
          type: dbEvent.type,
          actor: dbEvent.actorAccountId,
          timestamp: dbEvent.hcsConsensusTimestamp,
          sequenceNumber: dbEvent.hcsSequenceNumber,
          payload: {},
          pending: true,
        });
      }
    }
  }

  renderEvents.sort((a, b) => {
    const s = (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0);
    if (s !== 0) return s;
    return a.timestamp.localeCompare(b.timestamp);
  });

  const network = optionalEnv("HEDERA_NETWORK") ?? "testnet";
  return NextResponse.json({
    passport,
    events: renderEvents,
    tokenId,
    serial,
    gtin,
    network,
    mirrorStatus,
    hashScan: {
      token: `https://hashscan.io/${network}/token/${tokenId}`,
      nft: `https://hashscan.io/${network}/token/${tokenId}/${serial}`,
      mintTx: row.mintTxId
        ? `https://hashscan.io/${network}/transaction/${row.mintTxId}`
        : null,
    },
    gs1Path: `/01/${gtin}/21/${serial}`,
  });
}
