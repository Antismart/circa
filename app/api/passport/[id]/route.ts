import { NextResponse } from "next/server";
import { loadPassport } from "@/lib/passport";
import { getEventsForToken, type PersistedEvent } from "@/lib/hcs";
import { prisma } from "@/lib/db";
import { optionalEnv } from "@/lib/hedera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string): { tokenId: string; serial: number } | null {
  const lastDash = id.lastIndexOf("-");
  if (lastDash === -1) return null;
  const tokenId = id.slice(0, lastDash);
  const serial = Number(id.slice(lastDash + 1));
  if (!Number.isFinite(serial) || serial <= 0) return null;
  return { tokenId, serial };
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
  const parsed = parseId(id);
  if (!parsed) {
    return NextResponse.json({ error: "invalid passport id" }, { status: 400 });
  }
  const { tokenId, serial } = parsed;

  const passport = loadPassport(tokenId, serial);
  if (!passport) {
    return NextResponse.json(
      { error: "passport not found on disk; may need re-seed" },
      { status: 404 }
    );
  }

  const row = await prisma.passport.findUnique({
    where: { tokenId_serialNumber: { tokenId, serialNumber: serial } },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });

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
    network,
    mirrorStatus,
    hashScan: {
      token: `https://hashscan.io/${network}/token/${tokenId}`,
      nft: `https://hashscan.io/${network}/token/${tokenId}/${serial}`,
      mintTx: row?.mintTxId
        ? `https://hashscan.io/${network}/transaction/${row.mintTxId}`
        : null,
    },
    gs1Path: `/p/${tokenId}-${serial}`,
  });
}
