import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { submitEvent, type DppEvent } from "@/lib/hcs";
import { getRoleFromCookie, roleAccountId, roleSigningKey } from "@/lib/role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EventPayload {
  tokenId: string;
  serial: number;
  type: "repair";
  partsReplaced?: Array<{ part: string; count: number }>;
  notes?: string;
  embodiedCarbon_kgCO2e?: number;
}

const ALLOW_LIST: Record<string, ("manufacturer" | "consumer" | "repairer")[]> = {
  repair: ["repairer"],
};

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const role = await getRoleFromCookie();
    const body = (await req.json()) as EventPayload;
    const allowed = ALLOW_LIST[body.type];
    if (!allowed) {
      return NextResponse.json(
        { error: `unsupported event type: ${body.type}` },
        { status: 400 }
      );
    }
    if (!allowed.includes(role)) {
      return NextResponse.json(
        {
          error: `role ${role} cannot write ${body.type} events; expected one of ${allowed.join(", ")}`,
        },
        { status: 403 }
      );
    }

    const actor = roleAccountId(role);
    const signerKey = roleSigningKey(role);

    const passportRow = await prisma.passport.findUnique({
      where: {
        tokenId_serialNumber: { tokenId: body.tokenId, serialNumber: Number(body.serial) },
      },
    });
    if (!passportRow) {
      return NextResponse.json(
        { error: `no passport for ${body.tokenId}/${body.serial}` },
        { status: 404 }
      );
    }

    const event: DppEvent = {
      type: "repair",
      tokenId: body.tokenId,
      serial: Number(body.serial),
      actor,
      timestamp: new Date().toISOString(),
      partsReplaced: body.partsReplaced ?? [],
      notes: body.notes,
      embodiedCarbon_kgCO2e: body.embodiedCarbon_kgCO2e,
    };

    const submit = await submitEvent(event, signerKey);

    const payloadHash = `sha256:${createHash("sha256")
      .update(JSON.stringify(event), "utf8")
      .digest("hex")}`;

    await prisma.event.create({
      data: {
        passportId: passportRow.id,
        type: "repair",
        actorAccountId: actor,
        payloadHash,
        hcsSequenceNumber: submit.sequenceNumber,
        hcsConsensusTimestamp: submit.consensusTimestamp,
      },
    });

    return NextResponse.json({
      sequenceNumber: submit.sequenceNumber,
      consensusTimestamp: submit.consensusTimestamp,
      txId: submit.txId,
      actor,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/event failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
