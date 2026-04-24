import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Legacy resolver path. This is what QR codes printed before the GS1 Digital
 * Link migration point at. We look up the row by (tokenId, serial) and 308
 * redirect to the canonical /01/{GTIN}/21/{serial} URL so old scanners still
 * land on the right passport.
 */
function parseParam(id: string): { tokenId: string; serial: number } | null {
  const lastDash = id.lastIndexOf("-");
  if (lastDash === -1) return null;
  const tokenId = id.slice(0, lastDash);
  const serial = Number(id.slice(lastDash + 1));
  if (!Number.isFinite(serial) || serial <= 0) return null;
  return { tokenId, serial };
}

export default async function LegacyPassportRedirect({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId: raw } = await params;
  const parsed = parseParam(raw);
  if (!parsed) notFound();

  const row = await prisma.passport.findUnique({
    where: {
      tokenId_serialNumber: {
        tokenId: parsed.tokenId,
        serialNumber: parsed.serial,
      },
    },
    select: { gtin: true, serialNumber: true },
  });
  if (!row) notFound();

  permanentRedirect(`/01/${row.gtin}/21/${row.serialNumber}`);
}
