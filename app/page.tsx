import Link from "next/link";
import { prisma } from "../lib/db";
import { getPassport } from "../lib/passport";
import { SectionHeading } from "./_components/SectionHeading";

export const dynamic = "force-dynamic";

interface CatalogItem {
  tokenId: string;
  serial: number;
  name: string;
  category: string;
  manufacturer: string;
  country: string;
  total_kgCO2e: number;
  expectedLifetimeYears: number;
}

async function fetchCatalog(): Promise<CatalogItem[]> {
  const rows = await prisma.passport.findMany({
    orderBy: { createdAt: "asc" },
  });
  const items: CatalogItem[] = [];
  for (const row of rows) {
    const passport = await getPassport(row.tokenId, row.serialNumber);
    if (!passport) continue;
    items.push({
      tokenId: row.tokenId,
      serial: row.serialNumber,
      name: passport.name,
      category: passport.category,
      manufacturer: passport.manufacturer.name,
      country: passport.placeOfManufacture.country,
      total_kgCO2e: passport.public.carbonFootprint.total_kgCO2e,
      expectedLifetimeYears: passport.public.expectedLifetimeYears,
    });
  }
  return items;
}

function CatalogCard({ item, index }: { item: CatalogItem; index: number }) {
  const display = String(index + 1).padStart(3, "0");
  return (
    <Link
      href={`/p/${item.tokenId}-${item.serial}`}
      className="group block relative bg-paper-dim/40 hover:bg-paper-dim/80 border border-rule hover:border-ink transition-colors p-6 pb-7"
    >
      <div className="flex items-baseline justify-between mb-5">
        <span className="font-mono text-[11px] text-ink-faint tracking-[0.08em] numeral">
          N° {display}
        </span>
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-faint">
          {item.category.split("/")[0]}
        </span>
      </div>
      <h3
        className="font-display text-[28px] md:text-[32px] leading-[1.02] tracking-[-0.015em] mb-4 text-ink"
        style={{ fontWeight: 500 }}
      >
        {item.name}
      </h3>
      <div className="space-y-1 mb-6">
        <div className="text-[12px] text-ink-soft">
          <span className="italic">by</span> {item.manufacturer}
        </div>
        <div className="text-[11px] text-ink-faint tracking-[0.08em] uppercase">
          Made in {item.country}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-rule">
        <div>
          <div className="label mb-1">CO₂e</div>
          <div className="font-display text-[22px] text-accent numeral">
            {item.total_kgCO2e.toFixed(1)}
            <span className="font-mono text-[10px] text-ink-faint ml-1">kg</span>
          </div>
        </div>
        <div>
          <div className="label mb-1">Lifetime</div>
          <div className="font-display text-[22px] text-ink numeral">
            {item.expectedLifetimeYears}
            <span className="font-mono text-[10px] text-ink-faint ml-1">yr</span>
          </div>
        </div>
      </div>
      <div className="mt-5 pt-3 border-t border-rule flex items-center justify-between text-[10px] tracking-[0.12em] uppercase text-ink-faint font-mono">
        <span>
          {item.tokenId}/{item.serial}
        </span>
        <span className="text-accent group-hover:translate-x-1 transition-transform">
          Inspect →
        </span>
      </div>
    </Link>
  );
}

function Lede({ hasItems }: { hasItems: boolean }) {
  return (
    <section className="max-w-3xl mb-16">
      <div className="label mb-3">Editorial</div>
      <h2
        className="font-display text-[42px] md:text-[56px] leading-[1.02] tracking-[-0.02em] mb-6 text-ink"
        style={{ fontWeight: 500 }}
      >
        A passport for every{" "}
        <em className="font-display italic" style={{ fontWeight: 500 }}>
          durable thing
        </em>
        .
      </h2>
      <div className="grid md:grid-cols-2 gap-6 text-[14px] leading-[1.65] text-ink-soft">
        <p>
          Each object that passes through this registry receives an NFT on Hedera,
          a content-hashed dossier of its materials and carbon, and an append-only
          ledger of every repair, transfer, and resale it will undergo.
        </p>
        <p>
          The manufacturer earns a royalty — enforced at the consensus layer, not
          honoured on trust — on every secondary sale. Planned obsolescence becomes
          a bad business decision.
          {hasItems ? " Inspect the specimens below." : ""}
        </p>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const items = await fetchCatalog();
  return (
    <div className="rise">
      <Lede hasItems={items.length > 0} />

      {items.length === 0 ? (
        <section className="border-t border-b border-rule-strong py-16 text-center">
          <div className="label mb-3">Registry empty</div>
          <p className="font-display italic text-[22px] text-ink-soft mb-6">
            No specimens on record.
          </p>
          <p className="text-[13px] text-ink-faint mb-5 max-w-md mx-auto">
            Run <span className="font-mono">pnpm seed</span> to populate the registry
            with three reference products, or mint your first passport below.
          </p>
          <Link href="/mint" className="btn-primary inline-flex">
            Begin a new passport
          </Link>
        </section>
      ) : (
        <section>
          <SectionHeading
            number="§ I"
            title="The Registry"
            subtitle={`${items.length} specimens of record`}
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((item, i) => (
              <CatalogCard key={`${item.tokenId}-${item.serial}`} item={item} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
