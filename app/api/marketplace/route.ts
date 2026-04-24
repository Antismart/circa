import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { submitEvent, type ResaleEvent } from "@/lib/hcs";
import { settleResale } from "@/lib/hts";
import { getRoleFromCookie, keyForAccountId, roleAccountId } from "@/lib/role";
import {
  readListing,
  submitCancel,
  submitList,
  submitMarkSold,
} from "@/lib/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ListAction {
  action: "list";
  tokenId: string;
  serial: number;
  priceHbar: number;
}

interface BuyAction {
  action: "buy";
  listingId: number;
}

interface CancelAction {
  action: "cancel";
  listingId: number;
}

type Body = ListAction | BuyAction | CancelAction;

function hbarToTinybars(h: number): bigint {
  const rounded = Math.round(h * 1e8);
  return BigInt(rounded);
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const role = await getRoleFromCookie();
    const body = (await req.json()) as Body;

    if (body.action === "list") {
      if (role !== "manufacturer") {
        return NextResponse.json(
          { error: "only the Manufacturer role may list for Tier 0" },
          { status: 403 }
        );
      }
      const sellerAccountId = roleAccountId("manufacturer");
      const passportRow = await prisma.passport.findUnique({
        where: {
          tokenId_serialNumber: {
            tokenId: body.tokenId,
            serialNumber: Number(body.serial),
          },
        },
      });
      if (!passportRow) {
        return NextResponse.json(
          { error: `unknown passport ${body.tokenId}/${body.serial}` },
          { status: 404 }
        );
      }
      if (passportRow.ownerAccountId !== sellerAccountId) {
        return NextResponse.json(
          {
            error: `seller ${sellerAccountId} is not the current owner (${passportRow.ownerAccountId})`,
          },
          { status: 409 }
        );
      }

      const priceTinybars = hbarToTinybars(Number(body.priceHbar));
      if (priceTinybars <= 0n) {
        return NextResponse.json({ error: "price must be > 0 HBAR" }, { status: 400 });
      }

      const { listingId, txHash } = await submitList(
        Number(body.serial),
        priceTinybars,
        sellerAccountId
      );

      await prisma.listing.create({
        data: {
          passportId: passportRow.id,
          priceTinybars,
          sellerAccountId,
          status: "active",
          marketplaceListingId: listingId.toString(),
        },
      });

      return NextResponse.json({
        listingId: listingId.toString(),
        priceTinybars: priceTinybars.toString(),
        priceHbar: Number(body.priceHbar),
        sellerAccountId,
        contractTxHash: txHash,
      });
    }

    if (body.action === "buy") {
      if (role !== "consumer") {
        return NextResponse.json(
          { error: "only the Consumer role may buy for Tier 0" },
          { status: 403 }
        );
      }
      const buyerAccountId = roleAccountId("consumer");
      const buyerKey = keyForAccountId(buyerAccountId);

      const listing = await prisma.listing.findUnique({
        where: { marketplaceListingId: String(body.listingId) },
        include: { passport: true },
      });
      if (!listing) {
        return NextResponse.json(
          { error: `unknown listing #${body.listingId}` },
          { status: 404 }
        );
      }
      if (listing.status !== "active") {
        return NextResponse.json(
          { error: `listing is ${listing.status}` },
          { status: 409 }
        );
      }

      const chain = await readListing(BigInt(listing.marketplaceListingId));
      if (!chain.active) {
        return NextResponse.json(
          { error: "contract marks this listing inactive" },
          { status: 409 }
        );
      }

      const sellerAccountId = listing.sellerAccountId;
      const sellerKey = keyForAccountId(sellerAccountId);

      const settle = await settleResale({
        serial: listing.passport.serialNumber,
        sellerAccountId,
        sellerKey,
        buyerAccountId,
        buyerKey,
        priceTinybars: BigInt(listing.priceTinybars.toString()),
      });

      const contractTxHash = await submitMarkSold(
        BigInt(listing.marketplaceListingId),
        buyerAccountId,
        settle.txId
      );

      const resaleEvent: ResaleEvent = {
        type: "resale",
        tokenId: listing.passport.tokenId,
        serial: listing.passport.serialNumber,
        actor: buyerAccountId,
        timestamp: new Date().toISOString(),
        from: sellerAccountId,
        to: buyerAccountId,
        priceTinybars: listing.priceTinybars.toString(),
        evmTxHash: contractTxHash,
      };
      const hcs = await submitEvent(resaleEvent);
      const payloadHash = `sha256:${createHash("sha256")
        .update(JSON.stringify(resaleEvent), "utf8")
        .digest("hex")}`;

      await prisma.$transaction([
        prisma.listing.update({
          where: { id: listing.id },
          data: { status: "sold" },
        }),
        prisma.passport.update({
          where: { id: listing.passport.id },
          data: { ownerAccountId: buyerAccountId },
        }),
        prisma.event.create({
          data: {
            passportId: listing.passport.id,
            type: "resale",
            actorAccountId: buyerAccountId,
            payloadHash,
            hcsSequenceNumber: hcs.sequenceNumber,
            hcsConsensusTimestamp: hcs.consensusTimestamp,
            evmTxHash: contractTxHash,
          },
        }),
      ]);

      const priceHbar = Number(listing.priceTinybars) / 1e8;
      const royaltyHbar = priceHbar * 0.025;
      return NextResponse.json({
        listingId: listing.marketplaceListingId,
        settlementTxId: settle.txId,
        contractTxHash,
        sellerAccountId,
        buyerAccountId,
        priceHbar,
        royaltyHbar,
        resaleEventSeqNum: hcs.sequenceNumber,
        tokenId: listing.passport.tokenId,
        serial: listing.passport.serialNumber,
        gtin: listing.passport.gtin,
      });
    }

    if (body.action === "cancel") {
      const listing = await prisma.listing.findUnique({
        where: { marketplaceListingId: String(body.listingId) },
      });
      if (!listing) {
        return NextResponse.json(
          { error: `unknown listing #${body.listingId}` },
          { status: 404 }
        );
      }
      if (listing.status !== "active") {
        return NextResponse.json(
          { error: `listing is already ${listing.status}` },
          { status: 409 }
        );
      }
      const currentActorId = roleAccountId(role);
      if (listing.sellerAccountId !== currentActorId) {
        return NextResponse.json(
          { error: "only the seller may cancel their listing" },
          { status: 403 }
        );
      }

      const contractTxHash = await submitCancel(BigInt(listing.marketplaceListingId));
      await prisma.listing.update({
        where: { id: listing.id },
        data: { status: "cancelled" },
      });

      return NextResponse.json({
        listingId: listing.marketplaceListingId,
        contractTxHash,
      });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("/api/marketplace failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
