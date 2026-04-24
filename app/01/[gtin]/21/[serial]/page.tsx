import { notFound } from "next/navigation";
import Link from "next/link";
import { type Passport } from "@/lib/passport";
import { getEventsForToken, type PersistedEvent } from "@/lib/hcs";
import { prisma } from "@/lib/db";
import { optionalEnv } from "@/lib/hedera";
import { isValidGtin14 } from "@/lib/gtin";
import { SectionHeading } from "../../../../_components/SectionHeading";
import { DataRow } from "../../../../_components/DataRow";
import { Stamp } from "../../../../_components/Stamp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface EventRow {
  type: string;
  actor: string;
  timestamp: string;
  sequenceNumber: number;
  pending: boolean;
  payload: Record<string, unknown>;
}

async function loadEventsForPassport(
  tokenId: string,
  serial: number
): Promise<EventRow[]> {
  let mirror: PersistedEvent[] = [];
  try {
    mirror = await getEventsForToken(tokenId, serial);
  } catch {
    // mirror outage — fall through to DB only
  }

  const row = await prisma.passport.findUnique({
    where: { tokenId_serialNumber: { tokenId, serialNumber: serial } },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });

  const rows: EventRow[] = mirror.map((e) => ({
    type: e.event.type,
    actor: e.event.actor,
    timestamp: e.consensusTimestamp,
    sequenceNumber: e.sequenceNumber,
    pending: false,
    payload: { ...(e.event as unknown as Record<string, unknown>) },
  }));
  const knownSeqs = new Set(rows.map((r) => r.sequenceNumber));
  if (row) {
    for (const ev of row.events) {
      if (!knownSeqs.has(ev.hcsSequenceNumber)) {
        rows.push({
          type: ev.type,
          actor: ev.actorAccountId,
          timestamp: ev.hcsConsensusTimestamp,
          sequenceNumber: ev.hcsSequenceNumber,
          pending: true,
          payload: {},
        });
      }
    }
  }
  rows.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return rows;
}

function fmtConsensus(ts: string): string {
  const secs = Number(ts.split(".")[0]);
  if (!Number.isFinite(secs)) return ts;
  const d = new Date(secs * 1000);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EVENT_LABEL(type: string): string {
  switch (type) {
    case "mint":
      return "Issued";
    case "repair":
      return "Repaired";
    case "resale":
      return "Sold onwards";
    case "transfer":
      return "Transferred";
    default:
      return type;
  }
}

function EVENT_MARK(type: string): string {
  switch (type) {
    case "mint":
      return "◆";
    case "repair":
      return "✶";
    case "resale":
      return "§";
    case "transfer":
      return "→";
    default:
      return "·";
  }
}

function CarbonBar({ passport }: { passport: Passport }) {
  const { materials, manufacturing, transport } = passport.public.carbonFootprint.breakdown;
  const total = materials + manufacturing + transport || 1;
  const pm = (materials / total) * 100;
  const pf = (manufacturing / total) * 100;
  const pt = (transport / total) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="label mb-1">Lifecycle CO₂e</div>
          <div className="font-display text-[56px] md:text-[72px] leading-none text-accent numeral">
            {passport.public.carbonFootprint.total_kgCO2e.toFixed(1)}
            <span className="font-mono text-[14px] text-ink-faint ml-2">kg</span>
          </div>
        </div>
      </div>
      <div className="flex h-3 w-full mt-5 border border-rule-strong">
        <div style={{ width: `${pm}%` }} className="bg-accent" />
        <div style={{ width: `${pf}%` }} className="bg-accent/60" />
        <div style={{ width: `${pt}%` }} className="bg-accent/30" />
      </div>
      <div className="grid grid-cols-3 mt-3 text-[11px] font-mono numeral">
        <div>
          <span className="inline-block w-2 h-2 bg-accent mr-2 align-middle" />
          <span className="text-ink-soft">Materials</span>{" "}
          <span className="text-ink">{materials.toFixed(1)}</span>
        </div>
        <div>
          <span className="inline-block w-2 h-2 bg-accent/60 mr-2 align-middle" />
          <span className="text-ink-soft">Making</span>{" "}
          <span className="text-ink">{manufacturing.toFixed(1)}</span>
        </div>
        <div>
          <span className="inline-block w-2 h-2 bg-accent/30 mr-2 align-middle" />
          <span className="text-ink-soft">Transport</span>{" "}
          <span className="text-ink">{transport.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

function MaterialsLedger({ passport }: { passport: Passport }) {
  const totalMass = passport.public.materialComposition.reduce(
    (s, m) => s + m.mass_g,
    0
  );
  return (
    <div>
      <table className="w-full numeral">
        <thead>
          <tr className="border-b border-rule-strong">
            <th className="label text-left py-2 pr-3">Material</th>
            <th className="label text-right py-2 px-3">Mass · g</th>
            <th className="label text-right py-2 pl-3">Recycled</th>
          </tr>
        </thead>
        <tbody>
          {passport.public.materialComposition.map((m, i) => (
            <tr key={`${m.material}-${i}`} className="border-b border-rule">
              <td className="py-3 pr-3 font-mono text-[13px]">{m.material}</td>
              <td className="py-3 px-3 text-right font-mono text-[13px]">
                {m.mass_g.toLocaleString("en-US")}
              </td>
              <td className="py-3 pl-3 text-right">
                <span className="inline-flex items-center gap-2">
                  <span className="relative inline-block w-16 h-1.5 bg-rule">
                    <span
                      className="absolute inset-y-0 left-0 bg-accent"
                      style={{ width: `${m.recycledPercent}%` }}
                    />
                  </span>
                  <span className="font-mono text-[12px] w-8 text-right">
                    {m.recycledPercent}%
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-3 label">Total</td>
            <td className="pt-3 text-right font-mono text-[13px]">
              {totalMass.toLocaleString("en-US")}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Timeline({ events }: { events: EventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="border border-rule bg-paper-dim/40 p-8 text-center">
        <div className="label mb-2">Lifecycle</div>
        <p className="font-display italic text-[20px] text-ink-soft">
          No events on record yet.
        </p>
      </div>
    );
  }
  return (
    <ol className="border-t border-b border-rule-strong">
      {events.map((e, i) => (
        <li
          key={`${e.sequenceNumber}-${i}`}
          className="grid grid-cols-[auto_1fr] md:grid-cols-[140px_auto_1fr_auto] gap-x-6 gap-y-1 py-4 border-t border-rule first:border-t-0 items-baseline"
        >
          <span className="font-mono text-[11px] tracking-[0.05em] text-ink-faint numeral">
            {fmtConsensus(e.timestamp)}
          </span>
          <span className="font-display text-[22px] text-accent" aria-hidden>
            {EVENT_MARK(e.type)}
          </span>
          <div>
            <div
              className="font-display text-[22px] leading-none text-ink"
              style={{ fontWeight: 500 }}
            >
              {EVENT_LABEL(e.type)}
              {e.pending && (
                <span className="ml-2 align-middle label text-ink-faint italic">
                  propagating…
                </span>
              )}
            </div>
            <div className="mt-1 text-[12px] text-ink-soft">
              by <span className="font-mono">{e.actor}</span>
              {typeof e.payload.notes === "string" && e.payload.notes && (
                <span className="text-ink-faint"> · {e.payload.notes}</span>
              )}
            </div>
          </div>
          <span className="font-mono text-[10px] text-ink-faint text-right numeral">
            SEQ {String(e.sequenceNumber).padStart(4, "0")}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function GS1Passport({
  params,
}: {
  params: Promise<{ gtin: string; serial: string }>;
}) {
  const { gtin, serial: serialRaw } = await params;

  if (!isValidGtin14(gtin)) notFound();
  const serial = Number(serialRaw);
  if (!Number.isFinite(serial) || serial <= 0) notFound();

  const row = await prisma.passport.findUnique({
    where: { gtin_serialNumber: { gtin, serialNumber: serial } },
  });
  if (!row) notFound();
  const passport = row.passportJson as unknown as Passport;
  const tokenId = row.tokenId;

  const events = await loadEventsForPassport(tokenId, serial);
  const network = optionalEnv("HEDERA_NETWORK") ?? "testnet";
  const hashScanNft = `https://hashscan.io/${network}/token/${tokenId}/${serial}`;
  const hashScanTx = passport.integrity.hederaAnchorTx
    ? `https://hashscan.io/${network}/transaction/${passport.integrity.hederaAnchorTx}`
    : null;

  return (
    <article className="rise">
      <div className="mb-8 flex items-center justify-between text-[10px] tracking-[0.22em] uppercase text-ink-faint">
        <span>Digital Product Passport</span>
        <span className="font-mono numeral">
          GTIN {gtin} · N° {String(serial).padStart(3, "0")}
        </span>
      </div>

      <div className="pb-10 mb-10 border-b-2 border-rule-strong">
        <div className="grid md:grid-cols-[1fr_auto] gap-8 items-end">
          <div>
            <div className="label mb-3">{passport.category}</div>
            <h1
              className="font-display text-[52px] md:text-[82px] leading-[0.92] tracking-[-0.025em] text-ink"
              style={{ fontWeight: 500 }}
            >
              {passport.name}
            </h1>
            <div className="mt-5 text-[15px] text-ink-soft">
              <span className="italic">Issued by</span>{" "}
              <span className="text-ink">{passport.manufacturer.name}</span>
              <span className="text-ink-faint">
                {" "}
                · {passport.placeOfManufacture.city}, {passport.placeOfManufacture.country}
              </span>
            </div>
          </div>
          <Stamp sublabel={passport.integrity.contentHash.slice(0, 14) + "…"} />
        </div>
      </div>

      <div className="grid md:grid-cols-[1.1fr_1fr] gap-x-12 gap-y-12 mb-16">
        <section>
          <SectionHeading number="§ I" title="Identity" />
          <dl className="space-y-0">
            <DataRow
              label="GTIN"
              mono
              value={<span className="break-all">{gtin}</span>}
            />
            <DataRow label="Serial" mono value={passport.serialNumber} />
            <DataRow
              label="Token"
              mono
              value={
                <a
                  href={hashScanNft}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-rule-strong underline-offset-4 hover:decoration-accent hover:text-accent break-all"
                >
                  {tokenId}/{serial}
                </a>
              }
            />
            <DataRow
              label="Manufactured"
              value={new Date(passport.dateOfManufacture).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            />
            <DataRow
              label="Origin"
              value={`${passport.placeOfManufacture.city}, ${passport.placeOfManufacture.country}`}
            />
            <DataRow
              label="Manufacturer"
              mono
              value={passport.manufacturer.accountId}
            />
            <DataRow
              label="Lifetime"
              value={
                <span>
                  {passport.public.expectedLifetimeYears}{" "}
                  <span className="text-ink-faint">years expected</span>
                </span>
              }
            />
            <DataRow
              label="Repair index"
              value={
                <span>
                  {passport.public.repairabilityScore.toFixed(1)}
                  <span className="text-ink-faint"> / 10</span>
                </span>
              }
            />
          </dl>
        </section>

        <section>
          <SectionHeading number="§ II" title="Carbon" />
          <CarbonBar passport={passport} />
        </section>
      </div>

      <section className="mb-16">
        <SectionHeading
          number="§ III"
          title="Bill of materials"
          subtitle="by mass · recycled content"
        />
        <MaterialsLedger passport={passport} />
      </section>

      <section className="mb-16">
        <SectionHeading
          number="§ IV"
          title="Lifecycle ledger"
          subtitle={`${events.length} event${events.length === 1 ? "" : "s"} on record`}
        />
        <Timeline events={events} />
      </section>

      <section className="pt-8 border-t-2 border-rule-strong">
        <div className="grid md:grid-cols-3 gap-6 text-[11px] font-mono text-ink-faint numeral">
          <div>
            <div className="label mb-2 font-body">Content hash</div>
            <div className="break-all text-ink">{passport.integrity.contentHash}</div>
          </div>
          <div>
            <div className="label mb-2 font-body">Anchor transaction</div>
            <div className="break-all text-ink">
              {passport.integrity.hederaAnchorTx ?? "—"}
            </div>
            {hashScanTx && (
              <a
                href={hashScanTx}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block underline text-accent decoration-rule-strong underline-offset-4 hover:decoration-accent"
              >
                View on HashScan ↗
              </a>
            )}
          </div>
          <div>
            <div className="label mb-2 font-body">Passport version</div>
            <div className="text-ink">v{passport.integrity.version}</div>
            <Link
              href="/repair"
              className="mt-2 inline-block underline text-accent decoration-rule-strong underline-offset-4 hover:decoration-accent"
            >
              Log a repair ↗
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
